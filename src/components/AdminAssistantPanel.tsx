import { useState } from "react";
import {
  assistDraft,
  assistReport,
  type AssistantDraft,
  type AssistantFacts,
} from "../services/adminProductsClient";

const SUGGESTED_QUESTIONS = [
  "Τι περιμένει έλεγχο αυτή τη στιγμή;",
  "Πώς κατανέμονται οι βαθμολογίες;",
  "Τι άλλαξε πρόσφατα;",
];

/**
 * Draft mode: writes the editorial copy for the product being edited and
 * hands it back for the admin to accept field by field. Nothing is applied
 * automatically — the point is a starting draft, not an authority.
 */
export function AssistantDraftPanel(props: {
  barcode: string;
  onApply: (draft: AssistantDraft) => void;
}) {
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [assistError, setAssistError] = useState("");

  async function run() {
    setIsRunning(true);
    setAssistError("");

    try {
      const reply = await assistDraft(props.barcode);
      setDraft(reply.draft);
    } catch (caughtError) {
      setAssistError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ο βοηθός δεν απάντησε.",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="rounded-xl border border-line-subtle bg-surface/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Βοηθός σύνταξης
        </p>

        <button
          type="button"
          onClick={run}
          disabled={isRunning}
          className="h-9 rounded-lg border border-line px-3 text-xs font-semibold text-ink disabled:opacity-50"
        >
          {isRunning ? "Γράφει..." : "Πρόταση κειμένου"}
        </button>
      </div>

      <p className="mt-2 text-xs leading-5 text-ink-muted">
        Γράφει από το κείμενο συστατικών και τα ευρήματα αυτού του
        προϊόντος. Δεν αλλάζει τη βαθμολογία.
      </p>

      {assistError && (
        <p className="mt-3 text-sm text-red-400">{assistError}</p>
      )}

      {draft && (
        <div className="mt-3 space-y-3 border-t border-line-subtle pt-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-faint">
              Περίληψη
            </p>
            <p className="mt-1 text-sm leading-6 text-ink">
              {draft.summary || "—"}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-ink-faint">
              Συνολική αξιολόγηση
            </p>
            <p className="mt-1 text-sm leading-6 text-ink">
              {draft.overallVerdict || "—"}
            </p>
          </div>

          {draft.highlights.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-faint">
                Highlights
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-ink">
                {draft.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {draft.watchOutFor.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-faint">
                Σημεία προσοχής
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-ink">
                {draft.watchOutFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => props.onApply(draft)}
            className="h-10 w-full rounded-xl bg-accent text-sm font-semibold text-on-accent"
          >
            Εφαρμογή στα πεδία
          </button>
        </div>
      )}
    </div>
  );
}

function FactsTable(props: { facts: AssistantFacts }) {
  return (
    <dl className="mt-3 space-y-1 border-t border-line-subtle pt-3 text-xs text-ink-muted">
      <div className="flex justify-between gap-3">
        <dt>Σύνολο προϊόντων</dt>
        <dd className="text-ink">{props.facts.totalProducts}</dd>
      </div>

      <div className="flex justify-between gap-3">
        <dt>Περιμένουν έλεγχο</dt>
        <dd className="text-ink">{props.facts.pendingReview}</dd>
      </div>

      <div className="flex justify-between gap-3">
        <dt>Εκδόσεις που δεν εφαρμόστηκαν</dt>
        <dd className="text-ink">{props.facts.unappliedVersions}</dd>
      </div>

      <div className="flex justify-between gap-3">
        <dt>Μέση βαθμολογία</dt>
        <dd className="text-ink">
          {props.facts.averageScore ?? "—"}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Report mode. The numbers in `facts` are computed in SQL and shown next to
 * the answer on purpose: the model writes the sentences, and the admin can
 * check them against the same figures it was given.
 */
export function AssistantReportPanel() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [facts, setFacts] = useState<AssistantFacts | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [assistError, setAssistError] = useState("");

  async function ask(value: string) {
    const asked = value.trim();

    if (!asked || isRunning) {
      return;
    }

    setIsRunning(true);
    setAssistError("");
    setAnswer("");

    try {
      const reply = await assistReport(asked);
      setAnswer(reply.text ?? "");
      setFacts(reply.facts);
    } catch (caughtError) {
      setAssistError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ο βοηθός δεν απάντησε.",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="rounded-xl border border-line-subtle bg-surface/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Βοηθός αναφορών
      </p>

      <div className="mt-2 flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              ask(question);
            }
          }}
          placeholder="Ρώτησε για τον κατάλογο..."
          className="h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent"
        />

        <button
          type="button"
          onClick={() => ask(question)}
          disabled={isRunning}
          className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          {isRunning ? "..." : "Ρώτα"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              setQuestion(suggestion);
              ask(suggestion);
            }}
            className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {assistError && (
        <p className="mt-3 text-sm text-red-400">{assistError}</p>
      )}

      {answer && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink">
          {answer}
        </p>
      )}

      {facts && <FactsTable facts={facts} />}
    </div>
  );
}
