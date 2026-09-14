/**
 * The app's own count of what it spends, so an alarm can fire while there
 * is still free allowance left to protect.
 *
 * The provider dashboards bill the account and report after the fact. This
 * counts per feature, at the three places money is actually committed:
 *
 *   azure_ocr          one Azure Read transaction, reading a label photo
 *   workers_ai_vision  one Workers AI call, identifying the product
 *   workers_ai_text    one Workers AI call, analysing the label text
 *
 * A scan of a barcode already in the catalogue spends none of these — it is
 * answered from D1 before a photo is requested — so these counters measure
 * new products, not traffic.
 *
 * Two different clocks, because the two providers reset on different ones:
 * Azure's Read free tier is a monthly transaction allowance, Cloudflare's
 * Workers AI free allowance is daily. Both reset in UTC, and so does this.
 */

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1Like {
  prepare(query: string): D1PreparedStatementLike;
}

export type BillableService =
  | "azure_ocr"
  | "workers_ai_vision"
  | "workers_ai_text";

export const billableServices: BillableService[] = [
  "azure_ocr",
  "workers_ai_vision",
  "workers_ai_text",
];

/**
 * Azure AI Vision's free (F0) tier allows 5,000 Read transactions a month.
 * One photo is one transaction.
 */
const DEFAULT_AZURE_OCR_MONTHLY_BUDGET = 5000;

/**
 * A deliberately conservative proxy, not a published limit.
 *
 * Cloudflare bills Workers AI in Neurons, not calls, and how many Neurons a
 * call costs depends on the model and the size of the prompt — so no honest
 * constant here converts one to the other. What this number does is bound
 * the *call* rate well below anything that could quietly consume a daily
 * allowance: 300 calls is roughly 100 new-product scans in a day, far past
 * what this round of testing will produce.
 *
 * Calibrate it once there is real traffic: compare a week of the figures on
 * this page against Neurons in the Cloudflare dashboard, which remains the
 * only authority on what is actually owed, then set WORKERS_AI_DAILY_BUDGET.
 */
const DEFAULT_WORKERS_AI_DAILY_BUDGET = 300;

/** At this share of a budget the page stops being informational. */
export const WARNING_RATIO = 0.8;

export type UsageLevel = "ok" | "warning" | "over";

export interface BudgetLimits {
  azureOcrMonthly: number;
  workersAiDaily: number;
}

export interface UsageBudgetEnv {
  AZURE_OCR_MONTHLY_BUDGET?: string;
  WORKERS_AI_DAILY_BUDGET?: string;
}

function positiveIntegerOr(value: string | undefined, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Budgets are overridable without a code change, because the Workers AI one
 * above is a guess that real traffic is expected to correct.
 */
export function resolveBudgets(env: UsageBudgetEnv): BudgetLimits {
  return {
    azureOcrMonthly: positiveIntegerOr(
      env.AZURE_OCR_MONTHLY_BUDGET,
      DEFAULT_AZURE_OCR_MONTHLY_BUDGET,
    ),
    workersAiDaily: positiveIntegerOr(
      env.WORKERS_AI_DAILY_BUDGET,
      DEFAULT_WORKERS_AI_DAILY_BUDGET,
    ),
  };
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function shiftDays(day: string, delta: number): string {
  const shifted = new Date(`${day}T00:00:00.000Z`);

  shifted.setUTCDate(shifted.getUTCDate() + delta);

  return utcDay(shifted);
}

function firstOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function usageLevel(used: number, limit: number): UsageLevel {
  if (limit <= 0) {
    return "ok";
  }

  const ratio = used / limit;

  if (ratio >= 1) {
    return "over";
  }

  return ratio >= WARNING_RATIO ? "warning" : "ok";
}

/**
 * Best-effort by design, exactly like recordScanFailure: a scan that has
 * already paid for its OCR and its model call must not then fail because
 * the bookkeeping did. A lost count is a wrong number on an admin page; a
 * thrown error here would be a broken scan the user already paid for.
 */
export async function recordUsage(
  db: D1Like,
  service: BillableService,
  now: Date = new Date(),
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO usage_counters (day, service, calls)
         VALUES (?, ?, 1)
         ON CONFLICT (day, service)
         DO UPDATE SET calls = calls + 1`,
      )
      .bind(utcDay(now), service)
      .run();
  } catch (error) {
    console.error("usage_record_failed", {
      service,
      message:
        error instanceof Error ? error.message : String(error).slice(0, 200),
    });
  }
}

export interface UsageBudgetReport {
  id: "azure_ocr" | "workers_ai";
  label: string;
  period: "day" | "month";
  used: number;
  limit: number;
  ratio: number;
  level: UsageLevel;
  note: string;
}

export interface UsageDayRow {
  day: string;
  azureOcr: number;
  workersAiVision: number;
  workersAiText: number;
}

export interface UsageReport {
  day: string;
  month: string;
  budgets: UsageBudgetReport[];
  level: UsageLevel;
  history: UsageDayRow[];
}

export interface BudgetBreach {
  id: string;
  label: string;
  period: "day" | "month";
  used: number;
  limit: number;
}

/**
 * The budget that is already spent, if any — the check a paid path makes
 * before it commits to spending more.
 *
 * Fails open on purpose. If this read throws, the answer is "carry on":
 * a database hiccup must not take the app down, and the alternative to a
 * few euros of unplanned spend is every scan failing for everyone.
 */
export async function findBudgetBreach(
  db: D1Like,
  budgets: BudgetLimits,
  now: Date = new Date(),
): Promise<BudgetBreach | null> {
  let report: UsageReport;

  try {
    report = await readUsageReport(db, budgets, now);
  } catch (error) {
    console.error("usage_breach_check_failed", {
      message:
        error instanceof Error ? error.message : String(error).slice(0, 200),
    });

    return null;
  }

  const breached = report.budgets.find((budget) => budget.level === "over");

  return breached
    ? {
        id: breached.id,
        label: breached.label,
        period: breached.period,
        used: breached.used,
        limit: breached.limit,
      }
    : null;
}

interface RawUsageRow {
  day: string;
  service: string;
  calls: number;
}

const HISTORY_DAYS = 30;

function ratioOf(used: number, limit: number): number {
  return limit > 0 ? used / limit : 0;
}

function worstLevel(levels: UsageLevel[]): UsageLevel {
  if (levels.includes("over")) {
    return "over";
  }

  return levels.includes("warning") ? "warning" : "ok";
}

/**
 * One read covering both clocks: the window starts at whichever is earlier,
 * the first of this month or thirty days back, so the monthly total and the
 * daily history both come out of the same rows.
 */
export async function readUsageReport(
  db: D1Like,
  budgets: BudgetLimits,
  now: Date = new Date(),
): Promise<UsageReport> {
  const today = utcDay(now);
  const month = today.slice(0, 7);

  const historyStart = shiftDays(today, -(HISTORY_DAYS - 1));
  const monthStart = firstOfMonth(today);
  const windowStart = historyStart < monthStart ? historyStart : monthStart;

  const { results } = await db
    .prepare(
      `SELECT day, service, calls
       FROM usage_counters
       WHERE day >= ?
       ORDER BY day ASC`,
    )
    .bind(windowStart)
    .all<RawUsageRow>();

  const rows = results ?? [];

  const byDay = new Map<string, UsageDayRow>();

  for (const row of rows) {
    const existing = byDay.get(row.day) ?? {
      day: row.day,
      azureOcr: 0,
      workersAiVision: 0,
      workersAiText: 0,
    };

    if (row.service === "azure_ocr") {
      existing.azureOcr += row.calls;
    } else if (row.service === "workers_ai_vision") {
      existing.workersAiVision += row.calls;
    } else if (row.service === "workers_ai_text") {
      existing.workersAiText += row.calls;
    }

    byDay.set(row.day, existing);
  }

  const azureThisMonth = rows
    .filter((row) => row.service === "azure_ocr" && row.day >= monthStart)
    .reduce((sum, row) => sum + row.calls, 0);

  const workersAiToday = rows
    .filter(
      (row) =>
        row.day === today &&
        (row.service === "workers_ai_vision" ||
          row.service === "workers_ai_text"),
    )
    .reduce((sum, row) => sum + row.calls, 0);

  const budgetReports: UsageBudgetReport[] = [
    {
      id: "azure_ocr",
      label: "Azure OCR",
      period: "month",
      used: azureThisMonth,
      limit: budgets.azureOcrMonthly,
      ratio: ratioOf(azureThisMonth, budgets.azureOcrMonthly),
      level: usageLevel(azureThisMonth, budgets.azureOcrMonthly),
      note: "Μία συναλλαγή ανά φωτογραφία. Το δωρεάν όριο F0 ανανεώνεται κάθε μήνα.",
    },
    {
      id: "workers_ai",
      label: "Workers AI",
      period: "day",
      used: workersAiToday,
      limit: budgets.workersAiDaily,
      ratio: ratioOf(workersAiToday, budgets.workersAiDaily),
      level: usageLevel(workersAiToday, budgets.workersAiDaily),
      note: "Κλήσεις, όχι Neurons. Το Cloudflare χρεώνει Neurons — το dashboard είναι η πηγή αλήθειας.",
    },
  ];

  // Zero-filled so a quiet day reads as a quiet day rather than a gap.
  const history: UsageDayRow[] = [];

  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    const day = shiftDays(today, -offset);

    history.push(
      byDay.get(day) ?? {
        day,
        azureOcr: 0,
        workersAiVision: 0,
        workersAiText: 0,
      },
    );
  }

  return {
    day: today,
    month,
    budgets: budgetReports,
    level: worstLevel(budgetReports.map((budget) => budget.level)),
    history,
  };
}
