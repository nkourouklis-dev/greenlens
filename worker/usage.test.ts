import assert from "node:assert/strict";
import test from "node:test";
import {
  findBudgetBreach,
  readUsageReport,
  recordUsage,
  resolveBudgets,
  usageLevel,
  utcDay,
  type D1Like,
  type D1PreparedStatementLike,
} from "./usage";

interface Recorded {
  sql: string;
  bound: unknown[];
}

function createFakeD1(options?: { throwOnPrepare?: boolean }): {
  db: D1Like;
  calls: Recorded[];
  rows: Record<string, unknown>[];
} {
  const calls: Recorded[] = [];
  const rows: Record<string, unknown>[] = [];

  const db: D1Like = {
    prepare(sql: string): D1PreparedStatementLike {
      if (options?.throwOnPrepare) {
        throw new Error("D1 is down");
      }

      let bound: unknown[] = [];

      const statement: D1PreparedStatementLike = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async run() {
          calls.push({ sql, bound });
          return undefined;
        },
        async all<T>() {
          calls.push({ sql, bound });
          return { results: rows as T[] };
        },
      };

      return statement;
    },
  };

  return { db, calls, rows };
}

const budgets = { azureOcrMonthly: 100, workersAiDaily: 10 };

test("a billable call is counted against its UTC day", async () => {
  const fake = createFakeD1();

  await recordUsage(fake.db, "azure_ocr", new Date("2026-09-14T22:30:00Z"));

  assert.deepEqual(fake.calls[0].bound, ["2026-09-14", "azure_ocr"]);
});

// The scan has already paid for the OCR and the model call by this point.
// Losing the count is a wrong number on an admin page; throwing would be a
// broken scan the user was already charged for.
test("broken bookkeeping never breaks the scan that paid for it", async () => {
  const fake = createFakeD1({ throwOnPrepare: true });

  await recordUsage(fake.db, "workers_ai_text");
});

test("the day boundary is UTC, not local", () => {
  assert.equal(utcDay(new Date("2026-09-14T23:59:59Z")), "2026-09-14");
  assert.equal(utcDay(new Date("2026-09-15T00:00:01Z")), "2026-09-15");
});

test("the alarm level turns at 80 percent and again at 100", () => {
  assert.equal(usageLevel(79, 100), "ok");
  assert.equal(usageLevel(80, 100), "warning");
  assert.equal(usageLevel(99, 100), "warning");
  assert.equal(usageLevel(100, 100), "over");
  assert.equal(usageLevel(140, 100), "over");
});

test("a budget of zero never raises an alarm", () => {
  assert.equal(usageLevel(5, 0), "ok");
});

test("budgets fall back when the override is missing or nonsense", () => {
  assert.deepEqual(resolveBudgets({}), {
    azureOcrMonthly: 5000,
    workersAiDaily: 300,
  });

  assert.equal(
    resolveBudgets({ AZURE_OCR_MONTHLY_BUDGET: "not a number" })
      .azureOcrMonthly,
    5000,
  );

  assert.equal(
    resolveBudgets({ WORKERS_AI_DAILY_BUDGET: "-5" }).workersAiDaily,
    300,
  );

  assert.equal(
    resolveBudgets({ WORKERS_AI_DAILY_BUDGET: "1200" }).workersAiDaily,
    1200,
  );
});

// Azure resets monthly and Cloudflare daily, so the two budgets must be read
// on their own clocks out of the same rows.
test("Azure counts the month to date, Workers AI counts only today", async () => {
  const fake = createFakeD1();

  fake.rows.push(
    { day: "2026-09-01", service: "azure_ocr", calls: 30 },
    { day: "2026-09-14", service: "azure_ocr", calls: 12 },
    { day: "2026-09-13", service: "workers_ai_text", calls: 40 },
    { day: "2026-09-14", service: "workers_ai_text", calls: 5 },
    { day: "2026-09-14", service: "workers_ai_vision", calls: 3 },
  );

  const report = await readUsageReport(
    fake.db,
    budgets,
    new Date("2026-09-14T10:00:00Z"),
  );

  const azure = report.budgets.find((line) => line.id === "azure_ocr");
  const workersAi = report.budgets.find((line) => line.id === "workers_ai");

  assert.equal(azure?.used, 42);
  assert.equal(workersAi?.used, 8);
});

test("the report's level is the worst of its budgets", async () => {
  const fake = createFakeD1();

  fake.rows.push(
    { day: "2026-09-14", service: "azure_ocr", calls: 1 },
    { day: "2026-09-14", service: "workers_ai_text", calls: 9 },
  );

  const report = await readUsageReport(
    fake.db,
    budgets,
    new Date("2026-09-14T10:00:00Z"),
  );

  assert.equal(report.level, "warning");
});

test("quiet days appear as zero rather than as gaps", async () => {
  const fake = createFakeD1();

  fake.rows.push({ day: "2026-09-14", service: "azure_ocr", calls: 2 });

  const report = await readUsageReport(
    fake.db,
    budgets,
    new Date("2026-09-14T10:00:00Z"),
  );

  assert.equal(report.history.length, 30);
  assert.equal(report.history[report.history.length - 1].day, "2026-09-14");
  assert.equal(report.history[report.history.length - 1].azureOcr, 2);
  assert.equal(report.history[0].day, "2026-08-16");
  assert.equal(report.history[0].azureOcr, 0);
});

// On the last days of a long month the month-to-date total reaches further
// back than the 30-day history does.
test("the read window covers the whole month, not just 30 days", async () => {
  const fake = createFakeD1();

  await readUsageReport(fake.db, budgets, new Date("2026-01-31T10:00:00Z"));

  assert.equal(fake.calls[0].bound[0], "2026-01-01");
});

const noon = new Date("2026-09-14T12:00:00Z");

test("nothing is refused while there is allowance left", async () => {
  const fake = createFakeD1();

  fake.rows.push({ day: "2026-09-14", service: "workers_ai_text", calls: 9 });

  assert.equal(await findBudgetBreach(fake.db, budgets, noon), null);
});

test("an exhausted budget is named, with its clock", async () => {
  const fake = createFakeD1();

  fake.rows.push({ day: "2026-09-14", service: "workers_ai_text", calls: 10 });

  const breach = await findBudgetBreach(fake.db, budgets, noon);

  assert.equal(breach?.id, "workers_ai");
  assert.equal(breach?.period, "day");
  assert.equal(breach?.used, 10);
  assert.equal(breach?.limit, 10);
});

test("a monthly budget is reported on the monthly clock", async () => {
  const fake = createFakeD1();

  fake.rows.push({ day: "2026-09-02", service: "azure_ocr", calls: 100 });

  const breach = await findBudgetBreach(fake.db, budgets, noon);

  assert.equal(breach?.id, "azure_ocr");
  assert.equal(breach?.period, "month");
});

// The alternative to a few euros of unplanned spend would be every scan
// failing for everyone, which is the worse failure.
test("a broken counter lets the app carry on rather than taking it down", async () => {
  const fake = createFakeD1({ throwOnPrepare: true });

  assert.equal(await findBudgetBreach(fake.db, budgets, noon), null);
});
