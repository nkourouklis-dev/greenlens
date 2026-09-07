/**
 * Ingredient Intelligence Layer — D1-backed knowledge lookup.
 *
 * This used to be a static, hand-typed TS object; the same data now lives
 * in the `ingredient_knowledge` / `ingredient_aliases` tables in the
 * `greenlens-db` D1 database (see migrations/0001_create_ingredient_knowledge.sql),
 * so it can grow by adding rows instead of editing code.
 *
 * This is still purely an explanation-quality layer: a lookup miss, or a
 * D1 failure of any kind, degrades to "no curated match" — the same as an
 * unknown ingredient always has — and never blocks or changes the score,
 * because scoreImpact always comes from the Worker's own
 * `scoreInterpretation` deductions, never from here.
 */

export type IngredientCategory =
  | "preservative"
  | "fragrance"
  | "colorant"
  | "humectant"
  | "surfactant"
  | "emollient"
  | "antioxidant"
  | "active"
  | "other";

export type EvidenceLevel = "high" | "medium" | "low";

export interface IngredientKnowledgeEntry {
  category: IngredientCategory;
  shortDescription: string;
  benefits: string[];
  concerns: string[];
  aliases: string[];
  evidenceLevel: EvidenceLevel;
}

// Minimal shape actually used from a D1Database — narrow enough that a
// plain object can stand in for it in tests, which run under plain Node
// (tsx --test) rather than the Workers runtime, so a real D1Database
// can't be constructed there at all.
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1Like {
  prepare(query: string): D1PreparedStatementLike;
}

const CATEGORIES = new Set<string>([
  "preservative",
  "fragrance",
  "colorant",
  "humectant",
  "surfactant",
  "emollient",
  "antioxidant",
  "active",
  "other",
]);

const EVIDENCE_LEVELS = new Set<string>(["high", "medium", "low"]);

function isCategory(value: unknown): value is IngredientCategory {
  return typeof value === "string" && CATEGORIES.has(value);
}

function isEvidenceLevel(value: unknown): value is EvidenceLevel {
  return typeof value === "string" && EVIDENCE_LEVELS.has(value);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

interface KnowledgeJoinRow {
  alias: string;
  normalized_name: string;
  category: string;
  short_description: string;
  benefits: string;
  concerns: string;
  evidence_level: string;
}

interface AliasRow {
  alias: string;
  normalized_name: string;
}

/**
 * Looks up curated knowledge for every name in `names` in a single pair of
 * batched queries (never one query per ingredient), returning a map keyed
 * by the exact strings passed in so callers don't need to know about the
 * internal normalization. Names with no match — including every name, if
 * the D1 query itself fails — are simply absent from the returned map.
 */
export async function lookupIngredientKnowledgeBatch(
  db: D1Like,
  names: string[],
): Promise<Map<string, IngredientKnowledgeEntry>> {
  const result = new Map<string, IngredientKnowledgeEntry>();

  const originalByKey = new Map<string, string>();

  for (const name of names) {
    originalByKey.set(normalizeKey(name), name);
  }

  const keys = Array.from(originalByKey.keys());

  if (keys.length === 0) {
    return result;
  }

  try {
    const joinRows = await db
      .prepare(
        `SELECT ia.alias, ik.normalized_name, ik.category, ik.short_description, ik.benefits, ik.concerns, ik.evidence_level
         FROM ingredient_aliases ia
         JOIN ingredient_knowledge ik ON ik.normalized_name = ia.normalized_name
         WHERE ia.alias IN (${keys.map(() => "?").join(", ")})`,
      )
      .bind(...keys)
      .all<KnowledgeJoinRow>();

    const matches = joinRows.results ?? [];

    if (matches.length === 0) {
      return result;
    }

    // A second query for the full alias list per matched canonical name —
    // the join above only proves *that* an alias matched, not every other
    // alias the same ingredient is also known by (needed for display,
    // e.g. IngredientCard shows "Parfum · fragrance, aroma, άρωμα").
    const canonicalNames = Array.from(
      new Set(matches.map((row) => row.normalized_name)),
    );

    const aliasRows = await db
      .prepare(
        `SELECT alias, normalized_name FROM ingredient_aliases WHERE normalized_name IN (${canonicalNames.map(() => "?").join(", ")})`,
      )
      .bind(...canonicalNames)
      .all<AliasRow>();

    const aliasesByCanonical = new Map<string, string[]>();

    for (const row of aliasRows.results ?? []) {
      // Every ingredient's own canonical name is also stored as a
      // self-referencing alias row (for the lookup above to match on it
      // directly) — excluded here since the original registry's
      // `aliases` list never included the ingredient's own name either.
      if (row.alias === row.normalized_name) {
        continue;
      }

      const list = aliasesByCanonical.get(row.normalized_name) ?? [];
      list.push(row.alias);
      aliasesByCanonical.set(row.normalized_name, list);
    }

    for (const row of matches) {
      const originalName = originalByKey.get(row.alias);

      if (!originalName || !isCategory(row.category) || !isEvidenceLevel(row.evidence_level)) {
        continue;
      }

      result.set(originalName, {
        category: row.category,
        shortDescription: row.short_description,
        benefits: parseJsonStringArray(row.benefits),
        concerns: parseJsonStringArray(row.concerns),
        aliases: aliasesByCanonical.get(row.normalized_name) ?? [],
        evidenceLevel: row.evidence_level,
      });
    }
  } catch (error) {
    console.error("ingredient_knowledge_lookup_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return result;
}
