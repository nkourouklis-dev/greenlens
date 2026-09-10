import { useEffect, useState } from "react";
import {
  getProductVersion,
  listProductVersions,
  restoreProductVersion,
  type AdminProductDetail,
  type AdminProductVersion,
} from "../services/adminProductsClient";

const SOURCE_LABELS: Record<string, string> = {
  user_scan: "Σάρωση χρήστη",
  admin_analyze: "Ανάλυση από admin",
  admin_edit: "Διόρθωση admin",
  restore: "Επαναφορά",
};

function formatDate(value: string): string {
  const parsed = new Date(
    // D1 stores datetime('now') as "YYYY-MM-DD HH:MM:SS" (UTC, no zone),
    // which Safari refuses to parse as-is.
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  );

  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("el-GR", {
        dateStyle: "short",
        timeStyle: "short",
      });
}

function readSourceText(analysisResult: unknown): string {
  return typeof analysisResult === "object" &&
    analysisResult !== null &&
    typeof (analysisResult as Record<string, unknown>).sourceText ===
      "string"
    ? ((analysisResult as Record<string, unknown>).sourceText as string)
    : "";
}

function readSummary(analysisResult: unknown): string {
  return typeof analysisResult === "object" &&
    analysisResult !== null &&
    typeof (analysisResult as Record<string, unknown>).summary === "string"
    ? ((analysisResult as Record<string, unknown>).summary as string)
    : "";
}

/**
 * The version log for one product (see worker/productVersions.ts).
 *
 * A row marked "δεν εφαρμόστηκε" is a scan that arrived after the product
 * was verified: the live entry was left alone, and this panel is the only
 * place that result can be seen or promoted. That is the whole point of
 * keeping it — restoring is a deliberate act, never automatic.
 */
export default function ProductVersionsPanel(props: {
  barcode: string;
  onRestored: (product: AdminProductDetail) => void;
}) {
  const [versions, setVersions] = useState<AdminProductVersion[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [openId, setOpenId] = useState<number | null>(null);
  const [openVersion, setOpenVersion] =
    useState<AdminProductVersion | null>(null);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  function load() {
    setIsLoading(true);
    setLoadError("");

    listProductVersions(props.barcode)
      .then(setVersions)
      .catch((caughtError) => {
        setLoadError(
          caughtError instanceof Error
            ? caughtError.message
            : "Το ιστορικό εκδόσεων δεν φορτώθηκε.",
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(load, [props.barcode]);

  async function toggle(version: AdminProductVersion) {
    if (openId === version.id) {
      setOpenId(null);
      setOpenVersion(null);
      return;
    }

    setOpenId(version.id);
    setOpenVersion(null);
    setActionError("");

    try {
      setOpenVersion(
        await getProductVersion(props.barcode, version.id),
      );
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "Η έκδοση δεν φορτώθηκε.",
      );
    }
  }

  async function restore(version: AdminProductVersion) {
    setBusyId(version.id);
    setActionError("");

    try {
      props.onRestored(
        await restoreProductVersion(props.barcode, version.id),
      );

      load();
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "Η επαναφορά απέτυχε.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-line-subtle bg-surface/70 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Ιστορικό εκδόσεων
        </p>

        <button
          type="button"
          onClick={load}
          className="text-xs text-accent underline"
        >
          Ανανέωση
        </button>
      </div>

      {isLoading && (
        <p className="mt-3 text-sm text-ink-muted">Φόρτωση...</p>
      )}

      {loadError && (
        <p className="mt-3 text-sm text-red-400">{loadError}</p>
      )}

      {!isLoading && !loadError && versions.length === 0 && (
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          Δεν υπάρχουν καταγεγραμμένες εκδόσεις ακόμη. Κάθε ανάλυση και
          κάθε αποθήκευση από εδώ και πέρα καταγράφεται εδώ.
        </p>
      )}

      {actionError && (
        <p className="mt-3 text-sm text-red-400">{actionError}</p>
      )}

      <ul className="mt-3 space-y-2">
        {versions.map((version) => (
          <li
            key={version.id}
            className="rounded-lg border border-line bg-surface p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink">
                {SOURCE_LABELS[version.source] ?? version.source}
              </span>

              <span className="text-xs text-ink-faint">
                {formatDate(version.createdAt)}
              </span>

              <span className="text-xs text-ink-muted">
                {version.score === null
                  ? "χωρίς βαθμολογία"
                  : `${version.score} · ${version.band ?? "-"}`}
              </span>

              {!version.applied && (
                <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
                  δεν εφαρμόστηκε
                </span>
              )}
            </div>

            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => toggle(version)}
                className="text-xs text-accent underline"
              >
                {openId === version.id ? "Απόκρυψη" : "Προβολή"}
              </button>

              <button
                type="button"
                disabled={busyId === version.id}
                onClick={() => restore(version)}
                className="text-xs text-accent underline disabled:opacity-50"
              >
                {busyId === version.id
                  ? "Επαναφορά..."
                  : "Επαναφορά αυτής"}
              </button>
            </div>

            {openId === version.id && (
              <div className="mt-3 space-y-2 border-t border-line-subtle pt-3">
                {!openVersion && (
                  <p className="text-sm text-ink-muted">Φόρτωση...</p>
                )}

                {openVersion && (
                  <>
                    <p className="text-sm leading-6 text-ink">
                      {readSummary(openVersion.analysisResult) ||
                        "Χωρίς περίληψη."}
                    </p>

                    <p className="whitespace-pre-wrap break-words text-xs leading-5 text-ink-muted">
                      {readSourceText(openVersion.analysisResult) ||
                        "Χωρίς αποθηκευμένο κείμενο συστατικών."}
                    </p>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
