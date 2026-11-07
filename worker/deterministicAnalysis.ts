import type { WorkerAnalysisResult } from "./analysis";
import { matchAllergenGroup } from "./allergens";
import {
  lookupIngredientKnowledgeBatch,
  type D1Like,
} from "./ingredientKnowledge";
import type { RuleMatch } from "./ingredientRules";

/**
 * The ingredient analysis without a language model.
 *
 * Everything the model used to contribute to a scan was either discarded
 * afterwards (names and descriptions are re-grounded in the knowledge base, the
 * score comes from curated rules) or cosmetic (a one-sentence summary). It also
 * cost 10-20 s per scan and sometimes returned unparseable JSON, which lost the
 * whole analysis. This builds the same structure from the label text itself:
 * works for food and cosmetic (INCI) lists alike.
 */

const MAX_FINDINGS = 12;

/** D1 allows 100 bound parameters per statement. */
const MAX_LOOKUP_NAMES = 80;

const MAX_ATTENTION_ITEMS = 5;

export function normalizeIngredientKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Splits an ingredient list into individual names. Nested groups
 * ("πανάρισμα [αλεύρι, αλάτι]", "Aqua (Water)") are flattened, quantities and
 * "may contain" markers are dropped, and a "class: name" prefix keeps the name.
 */
export function splitIngredientNames(text: string): string[] {
  const prepared = text
    .replace(/\s+/g, " ")
    // 0,7 % is one number, not a list separator.
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\d+(?:\.\d+)?\s*%/g, "")
    .replace(/\+\s*\/\s*-|±/g, ",")
    .replace(
      /\b(?:may contain|peut contenir|μπορεί να περιέχει|ίχνη)\b/giu,
      ",",
    )
    .replace(/[\[\](){}]/g, ",");

  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of prepared.split(/[,;·•]/)) {
    const afterColon = part.includes(":")
      ? part.slice(part.lastIndexOf(":") + 1)
      : part;

    const name = afterColon
      .replace(/^[\s\-–—*.]+|[\s\-–—*.]+$/g, "")
      .replace(/^(?:και|and|et|und)\s+/iu, "")
      .trim();

    if (name.length < 2 || name.length > 60 || !/\p{L}/u.test(name)) {
      continue;
    }

    const key = normalizeIngredientKey(name);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(name);
  }

  return names;
}

const E_NUMBER = /(?:^|\s)e[\s-]?\d{3,4}[a-z]?\b/i;

function summaryFor(
  total: number,
  flagged: number,
): string {
  if (flagged === 0) {
    return `Η λίστα περιέχει ${total} συστατικά και κανένα δεν χρειάζεται ιδιαίτερη προσοχή.`;
  }

  return `Η λίστα περιέχει ${total} συστατικά και ${flagged} από αυτά χρειάζονται προσοχή.`;
}

export async function buildDeterministicAnalysis(input: {
  ingredientText: string;
  ruleMatches: RuleMatch[];
  productType: WorkerAnalysisResult["productType"];
  confidence: number;
  db: D1Like;
}): Promise<WorkerAnalysisResult> {
  const names = splitIngredientNames(input.ingredientText);

  const matchedNames = new Map<
    string,
    { match: RuleMatch; name: string }
  >();

  // The name as printed on the label that carries each rule's matched alias.
  for (const match of input.ruleMatches) {
    const name =
      names.find((candidate) =>
        candidate.toLowerCase().includes(match.matchedAlias),
      ) ?? match.matchedAlias;

    matchedNames.set(normalizeIngredientKey(name), { match, name });
  }

  const allNames = [
    ...names,
    ...Array.from(matchedNames.values())
      .map((entry) => entry.name)
      .filter((name) => !names.includes(name)),
  ];

  const knowledge = await lookupIngredientKnowledgeBatch(
    input.db,
    allNames.slice(0, MAX_LOOKUP_NAMES).map(normalizeIngredientKey),
  );

  const rank = (name: string): number => {
    const key = normalizeIngredientKey(name);
    const entry = knowledge.get(key);

    if (matchedNames.has(key)) {
      return matchedNames.get(key)?.match.rule.severity === "high_concern"
        ? 0
        : 1;
    }

    if (entry && entry.concerns.length > 0) return 2;
    if (E_NUMBER.test(name)) return 3;
    if (entry) return 4;

    return 5;
  };

  const ordered = allNames
    .map((name, index) => ({ name, index, rank: rank(name) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, MAX_FINDINGS);

  const ingredientFindings: WorkerAnalysisResult["ingredientFindings"] =
    ordered.map(({ name }) => {
      const key = normalizeIngredientKey(name);
      const flagged = matchedNames.get(key);

      const severity: WorkerAnalysisResult["ingredientFindings"][number]["severity"] =
        flagged
          ? flagged.match.rule.severity === "high_concern"
            ? "high_attention"
            : flagged.match.rule.severity === "caution"
              ? "attention"
              : "info"
          : "info";

      return {
        ingredientName: name,
        normalizedName: key,
        severity,
        // Replaced by groundIngredientFindings with the label's own name and
        // the curated description, so nothing written here reaches a user.
        title: name,
        explanation: name,
        evidenceType: "none",
        sourceName: null,
        sourceUrl: null,
        confidence: 0.5,
      };
    });

  const flaggedFindings = Array.from(matchedNames.values()).filter(
    ({ match }) => match.rule.severity !== "neutral",
  );

  const attentionItems = flaggedFindings
    .slice(0, MAX_ATTENTION_ITEMS)
    .map(({ name, match }) => {
      const reason = match.rule.concerns[0] ?? match.rule.shortDescription;

      return reason ? `${name}: ${reason}` : name;
    });

  const potentialAllergens = names.filter(
    (name) => matchAllergenGroup(name) !== null,
  );

  return {
    productType: input.productType,
    summary: summaryFor(names.length, flaggedFindings.length),
    positives: [],
    attentionItems,
    potentialAllergens,
    ingredientFindings,
    insufficientDataReasons: [],
    confidence: Math.max(0, Math.min(1, input.confidence)),
  };
}
