import { useState, type ReactNode } from "react";
import {
  getStoredAdminPassword,
  setStoredAdminPassword,
} from "../services/adminAuth";
import { verifyAdminPassword } from "../services/adminClient";

/**
 * Shared password gate for the PIM list/detail screens — separate from
 * (and not used by) AdminCapture.tsx, which keeps its own inline copy of
 * this same gate. Not consolidated on purpose: retrofitting the capture
 * flow to use this would mean touching AdminCapture.tsx, which this task
 * was explicitly scoped to leave alone.
 */
export default function AdminGate({
  children,
}: {
  children: ReactNode;
}) {
  const [password, setPassword] = useState(() =>
    getStoredAdminPassword(),
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  if (password) {
    return <>{children}</>;
  }

  async function handleSubmit() {
    const trimmed = passwordInput.trim();

    if (!trimmed || isVerifying) {
      return;
    }

    setIsVerifying(true);
    setAuthError("");

    const isValid = await verifyAdminPassword(trimmed);

    setIsVerifying(false);

    if (!isValid) {
      setAuthError("Λάθος κωδικός.");
      return;
    }

    setStoredAdminPassword(trimmed);
    setPassword(trimmed);
  }

  return (
    <main className="min-h-screen bg-canvas px-4 pb-28 pt-5 text-ink">
      <section className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Διαχείριση (PIM)</h1>

        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Απαιτείται κωδικός διαχειριστή.
        </p>

        <div className="mt-6 space-y-3">
          <input
            type="password"
            value={passwordInput}
            onChange={(event) =>
              setPasswordInput(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSubmit();
              }
            }}
            placeholder="Κωδικός διαχειριστή"
            autoComplete="current-password"
            className="h-14 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />

          {authError && (
            <p
              role="alert"
              className="text-sm font-semibold text-red-400"
            >
              {authError}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!passwordInput.trim() || isVerifying}
            className="h-14 w-full rounded-xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
          >
            {isVerifying ? "Έλεγχος..." : "Είσοδος"}
          </button>
        </div>
      </section>
    </main>
  );
}
