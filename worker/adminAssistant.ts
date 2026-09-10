/**
 * The admin/PIM assistant. Two jobs, one endpoint:
 *
 *   - "draft" writes the editorial copy for one product (summary, verdict,
 *     highlights, watch-outs) from its own stored ingredient text and
 *     findings, so the admin edits prose instead of composing it.
 *   - "report" answers a question about the catalogue as a whole.
 *
 * The hard rule for the report mode: every number the answer contains is
 * computed here, in SQL, and handed to the model as facts. The model writes
 * the sentences around them and is told not to invent any others. A
 * assistant that estimates counts from a language model is worse than no
 * assistant, because its mistakes are unfalsifiable at a glance.
 *
 * Neither mode ever writes: the draft is returned for the admin to accept
 * field by field, and the report is text.
 */

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1Like {
  prepare(query: string): D1PreparedStatementLike;
}

export interface AssistantDraft {
  summary: string;
  overallVerdict: string;
  highlights: string[];
  watchOutFor: string[];
}

export interface AssistantReply {
  mode: "draft" | "report";
  /** Present in report mode: the narrative answer. */
  text: string | null;
  /** Present in draft mode: copy the admin can accept per field. */
  draft: AssistantDraft | null;
  /**
   * The aggregates the report was written from, returned alongside it so
   * the admin can check the prose against the actual numbers.
   */
  facts: CatalogueFacts | null;
}

export interface CatalogueFacts {
  totalProducts: number;
  byStatus: Array<{ status: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byBand: Array<{ band: string; count: number }>;
  averageScore: number | null;
  pendingReview: number;
  /** User scans recorded against a verified row without replacing it. */
  unappliedVersions: number;
  recentlyUpdated: Array<{
    barcode: string;
    productName: string | null;
    status: string;
    score: number | null;
    band: string | null;
    updatedAt: string;
  }>;
}

/**
 * `json_extract` rather than reading every blob into the Worker: the score
 * and band live inside analysis_result, and pulling a few hundred JSON
 * documents across the wire to count them would be the expensive way to
 * answer "how many are excellent".
 */
export async function collectCatalogueFacts(
  db: D1Like,
): Promise<CatalogueFacts> {
  const [
    totals,
    statuses,
    categories,
    bands,
    pending,
    unapplied,
    recent,
  ] = await Promise.all([
    db
      .prepare(
        "SELECT COUNT(*) AS count, AVG(json_extract(analysis_result, '$.score.score')) AS average FROM products",
      )
      .first<{ count: number; average: number | null }>(),
    db
      .prepare(
        "SELECT status, COUNT(*) AS count FROM products GROUP BY status ORDER BY count DESC",
      )
      .all<{ status: string; count: number }>(),
    db
      .prepare(
        "SELECT COALESCE(category, 'χωρίς κατηγορία') AS category, COUNT(*) AS count FROM products GROUP BY category ORDER BY count DESC",
      )
      .all<{ category: string; count: number }>(),
    db
      .prepare(
        `SELECT COALESCE(json_extract(analysis_result, '$.score.band'), 'χωρίς βαθμολογία') AS band, COUNT(*) AS count
         FROM products
         GROUP BY band
         ORDER BY count DESC`,
      )
      .all<{ band: string; count: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM products WHERE status IN ('draft','ai_generated','needs_review')",
      )
      .first<{ count: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM product_versions WHERE applied = 0",
      )
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT barcode, product_name, status,
                json_extract(analysis_result, '$.score.score') AS score,
                json_extract(analysis_result, '$.score.band') AS band,
                updated_at
         FROM products
         ORDER BY updated_at DESC
         LIMIT 10`,
      )
      .all<{
        barcode: string;
        product_name: string | null;
        status: string;
        score: number | null;
        band: string | null;
        updated_at: string;
      }>(),
  ]);

  return {
    totalProducts: totals?.count ?? 0,
    byStatus: statuses.results ?? [],
    byCategory: categories.results ?? [],
    byBand: bands.results ?? [],
    averageScore:
      typeof totals?.average === "number"
        ? Math.round(totals.average)
        : null,
    pendingReview: pending?.count ?? 0,
    unappliedVersions: unapplied?.count ?? 0,
    recentlyUpdated: (recent.results ?? []).map((row) => ({
      barcode: row.barcode,
      productName: row.product_name,
      status: row.status,
      score: typeof row.score === "number" ? Math.round(row.score) : null,
      band: row.band,
      updatedAt: row.updated_at,
    })),
  };
}

export function buildReportPrompt(
  facts: CatalogueFacts,
  question: string,
): string {
  return [
    "Είσαι βοηθός ενός καταλόγου προϊόντων (PIM). Απαντάς στα ελληνικά, σύντομα και συγκεκριμένα.",
    "",
    "ΔΕΔΟΜΕΝΑ (JSON) — είναι η μοναδική πηγή αριθμών σου:",
    JSON.stringify(facts),
    "",
    "ΕΡΩΤΗΣΗ:",
    question,
    "",
    "ΚΑΝΟΝΕΣ:",
    "- Χρησιμοποίησε μόνο αριθμούς που υπάρχουν στα δεδομένα. Μην υπολογίζεις ποσοστά που δεν προκύπτουν από αυτά.",
    "- Αν τα δεδομένα δεν αρκούν για την ερώτηση, πες το ρητά σε μία πρόταση.",
    "- Καθαρό κείμενο, χωρίς markdown. Το πολύ 8 προτάσεις.",
  ].join("\n");
}

export function buildDraftPrompt(params: {
  productName: string | null;
  sourceText: string;
  findings: Array<{
    ingredientName: string;
    severity: string;
    title: string;
  }>;
  score: number | null;
  band: string | null;
}): string {
  return [
    "Γράφεις το κείμενο παρουσίασης ενός προϊόντος για καταναλωτές, στα ελληνικά.",
    "",
    `ΟΝΟΜΑ: ${params.productName ?? "άγνωστο"}`,
    `ΒΑΘΜΟΛΟΓΙΑ: ${params.score ?? "χωρίς βαθμολογία"} (${params.band ?? "-"})`,
    "",
    "ΣΥΣΤΑΤΙΚΑ:",
    params.sourceText.slice(0, 2000) || "(δεν υπάρχει κείμενο συστατικών)",
    "",
    "ΕΥΡΗΜΑΤΑ:",
    params.findings
      .slice(0, 25)
      .map(
        (finding) =>
          `- ${finding.ingredientName} [${finding.severity}]: ${finding.title}`,
      )
      .join("\n") || "(κανένα)",
    "",
    "Επέστρεψε ΜΟΝΟ ένα JSON object με αυτά τα κλειδιά:",
    '{"summary": string, "overallVerdict": string, "highlights": string[], "watchOutFor": string[]}',
    "",
    "ΚΑΝΟΝΕΣ:",
    "- summary: μία με δύο προτάσεις για το τι είναι το προϊόν.",
    "- overallVerdict: μία πρόταση που δικαιολογεί τη βαθμολογία.",
    "- highlights: 2 έως 4 θετικά, το καθένα το πολύ 8 λέξεις.",
    "- watchOutFor: 0 έως 3 σημεία προσοχής, μόνο όσα προκύπτουν από τα ευρήματα.",
    "- Μην αναφέρεις συστατικό που δεν υπάρχει παραπάνω. Χωρίς διατροφικούς ισχυρισμούς υγείας.",
  ].join("\n");
}

/**
 * Tolerant on purpose: a small model wraps JSON in prose or code fences
 * often enough that failing the whole draft over it would make the feature
 * feel broken. Anything that still isn't a usable object comes back null
 * and the caller reports that plainly.
 */
export function parseAssistantDraft(
  value: string,
): AssistantDraft | null {
  const trimmed = value.trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end <= start) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as Record<string, unknown>;

  const summary =
    typeof record.summary === "string" ? record.summary.trim() : "";

  const overallVerdict =
    typeof record.overallVerdict === "string"
      ? record.overallVerdict.trim()
      : "";

  if (!summary && !overallVerdict) {
    return null;
  }

  return {
    summary,
    overallVerdict,
    highlights: toStringList(record.highlights),
    watchOutFor: toStringList(record.watchOutFor),
  };
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 6);
}
