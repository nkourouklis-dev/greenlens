/**
 * Deterministic scoring rules, resolved against the *label text* rather than
 * against the model's findings.
 *
 * This is the deliberate inversion of how scoring used to work. Previously
 * `scoreInterpretation` read severities out of `ingredientFindings`, so the
 * score measured how many problems the model chose to mention on a given run
 * rather than what the product contains — two Coca-Cola variants scored 96
 * (full sugar) and 92 (zero sugar), the full-sugar one coming out ahead only
 * because that run flagged one fewer item.
 *
 * Scanning the label text instead makes the score reproducible for the same
 * text, and gives ingredient position for free: EU labelling requires
 * descending order by quantity, so where a match lands in the list is real
 * evidence of how much of it is in there.
 *
 * The model still names and explains ingredients for the UI. It just no
 * longer decides what anything costs.
 */

import type { D1Like } from "./ingredientKnowledge";

export type RuleSeverity =
  | "neutral"
  | "caution"
  | "high_concern";

export interface ScoringRule {
  normalizedName: string;
  severity: RuleSeverity;
  penaltyPoints: number;
  bulkWeighted: boolean;
  ruleGroup: string | null;
  /** Curated copy, so a deduction can explain itself without the model. */
  shortDescription: string;
  concerns: string[];
}

export interface RuleSet {
  /** Longest alias first, so "σιρόπι γλυκόζης-φρουκτόζης" wins over "φρουκτόζη". */
  aliases: Array<{ alias: string; rule: ScoringRule }>;
}

export interface RuleMatch {
  rule: ScoringRule;
  matchedAlias: string;
  /** 0-based index of the comma-separated segment the match was found in. */
  position: number;
  /** penaltyPoints after bulk/position weighting, before group dedup. */
  weightedPoints: number;
}

/**
 * Greek nouns decline, so a label reads "σιρόπι γλυκόζης-φρουκτόζης" while
 * the alias is stored nominative. Allowing a short letter tail after an
 * otherwise word-boundaried match covers the case endings without the alias
 * table having to enumerate them. Three is enough for -ης/-ων/-ους and stops
 * well short of letting one ingredient swallow the next.
 */
const MAX_INFLECTION_TAIL = 3;

/**
 * Position multipliers for bulk-weighted ingredients. An EU ingredient list
 * is ordered by descending quantity, so sugar in second place is most of the
 * product while sugar in ninth place is a trace.
 */
const POSITION_WEIGHTS = [1.6, 1.6, 1.2, 1.2];
const TRAILING_POSITION_WEIGHT = 1;

interface RuleRow {
  alias: string;
  normalized_name: string;
  rule_severity: string;
  penalty_points: number;
  bulk_weighted: number;
  rule_group: string | null;
  short_description: string;
  concerns: string;
}

function parseConcerns(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string =>
            typeof item === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function isRuleSeverity(
  value: unknown,
): value is RuleSeverity {
  return (
    value === "neutral" ||
    value === "caution" ||
    value === "high_concern"
  );
}

function isLetterOrDigit(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

/**
 * Loads every alias that carries a penalty. Rules worth zero points are
 * skipped: they can never change a score, and leaving them out keeps this to
 * a couple of hundred rows that comfortably fit one query per analysis.
 */
export async function loadScoringRules(
  db: D1Like,
): Promise<RuleSet> {
  try {
    const rows = await db
      .prepare(
        `SELECT ia.alias, ik.normalized_name, ik.rule_severity, ik.penalty_points, ik.bulk_weighted, ik.rule_group, ik.short_description, ik.concerns
         FROM ingredient_aliases ia
         JOIN ingredient_knowledge ik ON ik.normalized_name = ia.normalized_name
         WHERE ik.penalty_points > 0`,
      )
      .all<RuleRow>();

    const aliases: RuleSet["aliases"] = [];

    for (const row of rows.results ?? []) {
      if (!isRuleSeverity(row.rule_severity)) {
        continue;
      }

      aliases.push({
        alias: row.alias.trim().toLowerCase(),
        rule: {
          normalizedName: row.normalized_name,
          severity: row.rule_severity,
          penaltyPoints: row.penalty_points,
          bulkWeighted: row.bulk_weighted === 1,
          ruleGroup: row.rule_group,
          shortDescription: row.short_description,
          concerns: parseConcerns(row.concerns),
        },
      });
    }

    aliases.sort(
      (left, right) =>
        right.alias.length - left.alias.length,
    );

    return { aliases };
  } catch (error) {
    // Same degradation as the knowledge lookup: no rules means the score
    // falls back to the model's own severities rather than failing the scan.
    console.error("ingredient_rules_load_failed", {
      message:
        error instanceof Error
          ? error.message
          : String(error),
    });

    return { aliases: [] };
  }
}

function positionWeight(position: number): number {
  return (
    POSITION_WEIGHTS[position] ??
    TRAILING_POSITION_WEIGHT
  );
}

/**
 * True when `text` contains `alias` at `index` as a whole word — not as a
 * fragment of a longer one. A short trailing run of letters is tolerated as
 * a Greek case ending (see MAX_INFLECTION_TAIL).
 */
function isWholeWordMatch(
  text: string,
  alias: string,
  index: number,
): boolean {
  const before = text[index - 1];

  if (before !== undefined && isLetterOrDigit(before)) {
    return false;
  }

  let tail = index + alias.length;

  while (
    tail < text.length &&
    isLetterOrDigit(text[tail])
  ) {
    tail += 1;

    if (tail - (index + alias.length) > MAX_INFLECTION_TAIL) {
      return false;
    }
  }

  return true;
}

/**
 * Finds every rule-carrying ingredient present in the label text, keeping
 * only the first (highest-quantity) occurrence of each ingredient and only
 * the costliest member of each rule group — a drink listing three sweeteners
 * was sweetened once, not three times.
 */
export function matchScoringRules(
  ingredientText: string,
  ruleSet: RuleSet,
): RuleMatch[] {
  const text = ingredientText.toLowerCase();

  const segments = text.split(/[,;·]/);

  const segmentStarts: number[] = [];

  let offset = 0;

  for (const segment of segments) {
    segmentStarts.push(offset);
    offset += segment.length + 1;
  }

  const bestByIngredient = new Map<
    string,
    RuleMatch
  >();

  // Regions already claimed by a longer alias, so "φρουκτόζη" cannot also
  // match inside a "σιρόπι γλυκόζης-φρουκτόζης" that already matched.
  const claimed: Array<[number, number]> = [];

  for (const { alias, rule } of ruleSet.aliases) {
    let searchFrom = 0;

    while (searchFrom <= text.length - alias.length) {
      const index = text.indexOf(alias, searchFrom);

      if (index === -1) {
        break;
      }

      searchFrom = index + 1;

      if (!isWholeWordMatch(text, alias, index)) {
        continue;
      }

      const overlaps = claimed.some(
        ([start, end]) =>
          index < end && index + alias.length > start,
      );

      if (overlaps) {
        continue;
      }

      claimed.push([index, index + alias.length]);

      let position = 0;

      for (let i = segmentStarts.length - 1; i >= 0; i -= 1) {
        if (index >= segmentStarts[i]) {
          position = i;
          break;
        }
      }

      const weightedPoints = rule.bulkWeighted
        ? Math.round(
            rule.penaltyPoints * positionWeight(position),
          )
        : rule.penaltyPoints;

      const existing = bestByIngredient.get(
        rule.normalizedName,
      );

      if (
        !existing ||
        weightedPoints > existing.weightedPoints
      ) {
        bestByIngredient.set(rule.normalizedName, {
          rule,
          matchedAlias: alias,
          position,
          weightedPoints,
        });
      }

      break;
    }
  }

  const bestByGroup = new Map<string, RuleMatch>();

  const ungrouped: RuleMatch[] = [];

  for (const match of bestByIngredient.values()) {
    const group = match.rule.ruleGroup;

    if (group === null) {
      ungrouped.push(match);
      continue;
    }

    const existing = bestByGroup.get(group);

    if (
      !existing ||
      match.weightedPoints > existing.weightedPoints
    ) {
      bestByGroup.set(group, match);
    }
  }

  return [...ungrouped, ...bestByGroup.values()].sort(
    (left, right) =>
      right.weightedPoints - left.weightedPoints,
  );
}
