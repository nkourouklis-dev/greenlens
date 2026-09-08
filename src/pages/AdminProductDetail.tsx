import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2, X } from "lucide-react";
import AdminGate from "../components/AdminGate";
import AdminPhotoThumbnail from "../components/AdminPhotoThumbnail";
import EditableStringList from "../components/EditableStringList";
import {
  analyzeAdminProduct,
  deleteAdminProduct,
  fetchAdminPhotoBlob,
  getAdminProduct,
  updateAdminProduct,
  type AdminProductDetail as AdminProductDetailType,
} from "../services/adminProductsClient";

const SEVERITY_OPTIONS = [
  "positive",
  "info",
  "attention",
  "high_attention",
  "unknown",
];

const BAND_OPTIONS = [
  "excellent",
  "good",
  "moderate",
  "attention",
  "high_attention",
  "insufficient_data",
];

interface EditableFinding {
  ingredientName: string;
  normalizedName: string;
  severity: string;
  title: string;
  explanation: string;
  // Carried through untouched — this form has no fields for them, but a
  // save must not silently drop or invent evidence-related data.
  evidenceType: string;
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: number;
}

interface FormState {
  summary: string;
  scoreValue: string;
  band: string;
  positives: string[];
  attentionItems: string[];
  potentialAllergens: string[];
  ingredientFindings: EditableFinding[];
  overallVerdict: string;
  highlights: string[];
  watchOutFor: string[];
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string",
      )
    : [];
}

function buildFormState(analysisResult: unknown): FormState {
  const raw = isRecord(analysisResult) ? analysisResult : {};
  const score = isRecord(raw.score) ? raw.score : {};
  const executiveSummary = isRecord(raw.executiveSummary)
    ? raw.executiveSummary
    : {};

  const findings = Array.isArray(raw.ingredientFindings)
    ? raw.ingredientFindings
    : [];

  return {
    summary: typeof raw.summary === "string" ? raw.summary : "",
    scoreValue:
      typeof score.score === "number" ? String(score.score) : "",
    band:
      typeof score.band === "string"
        ? score.band
        : "insufficient_data",
    positives: asStringArray(raw.positives),
    attentionItems: asStringArray(raw.attentionItems),
    potentialAllergens: asStringArray(raw.potentialAllergens),
    ingredientFindings: findings.map((finding): EditableFinding => {
      const item = isRecord(finding) ? finding : {};

      return {
        ingredientName:
          typeof item.ingredientName === "string"
            ? item.ingredientName
            : "",
        normalizedName:
          typeof item.normalizedName === "string"
            ? item.normalizedName
            : "",
        severity:
          typeof item.severity === "string"
            ? item.severity
            : "unknown",
        title: typeof item.title === "string" ? item.title : "",
        explanation:
          typeof item.explanation === "string"
            ? item.explanation
            : "",
        evidenceType:
          typeof item.evidenceType === "string"
            ? item.evidenceType
            : "none",
        sourceName:
          typeof item.sourceName === "string"
            ? item.sourceName
            : null,
        sourceUrl:
          typeof item.sourceUrl === "string"
            ? item.sourceUrl
            : null,
        confidence:
          typeof item.confidence === "number"
            ? item.confidence
            : 0.5,
      };
    }),
    overallVerdict:
      typeof executiveSummary.overallVerdict === "string"
        ? executiveSummary.overallVerdict
        : "",
    highlights: asStringArray(executiveSummary.highlights),
    watchOutFor: asStringArray(executiveSummary.watchOutFor),
  };
}

/**
 * Rebuilds the complete analysis_result object to PUT: everything from
 * the originally loaded object, with only the fields this form actually
 * edits overridden. Fields the form never exposes (productType,
 * confidence, insufficientDataReasons, ingredientInsights, allergenNotice,
 * contentCategory, score.confidence/deductions/bonuses/scoringVersion,
 * per-finding evidenceType/sourceName/sourceUrl/confidence) pass through
 * unchanged — see the note on the form component about ingredientInsights
 * potentially going stale relative to hand-edited ingredientFindings.
 */
function applyFormState(
  original: unknown,
  form: FormState,
): Record<string, unknown> {
  const base = isRecord(original) ? original : {};
  const score = isRecord(base.score) ? base.score : {};
  const executiveSummary = isRecord(base.executiveSummary)
    ? base.executiveSummary
    : {};

  return {
    ...base,
    summary: form.summary,
    positives: form.positives,
    attentionItems: form.attentionItems,
    potentialAllergens: form.potentialAllergens,
    ingredientFindings: form.ingredientFindings,
    score: {
      ...score,
      score:
        form.scoreValue.trim() === ""
          ? null
          : Number(form.scoreValue),
      band: form.band,
    },
    executiveSummary: {
      ...executiveSummary,
      overallVerdict: form.overallVerdict,
      highlights: form.highlights,
      watchOutFor: form.watchOutFor,
    },
  };
}

function AdminProductDetailContent() {
  const { barcode = "" } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] =
    useState<AdminProductDetailType | null>(null);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [form, setForm] = useState<FormState | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] =
    useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setLoadError("");

    getAdminProduct(barcode)
      .then((loaded) => {
        setProduct(loaded);
        setForm(buildFormState(loaded.analysisResult));
      })
      .catch((caughtError) => {
        setLoadError(
          caughtError instanceof Error
            ? caughtError.message
            : "Το προϊόν δεν φορτώθηκε.",
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(load, [barcode]);

  async function handleAnalyze() {
    if (isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setAnalyzeError("");

    try {
      const updated = await analyzeAdminProduct(barcode);
      setProduct(updated);
      setForm(buildFormState(updated.analysisResult));
    } catch (caughtError) {
      setAnalyzeError(
        caughtError instanceof Error
          ? caughtError.message
          : "Η ανάλυση δεν ολοκληρώθηκε.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!form || !product || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const analysisResult = applyFormState(
        product.analysisResult,
        form,
      );

      const updated = await updateAdminProduct(barcode, {
        analysisResult,
      });

      setProduct(updated);
      setForm(buildFormState(updated.analysisResult));
      setSaveSuccess(true);
    } catch (caughtError) {
      setSaveError(
        caughtError instanceof Error
          ? caughtError.message
          : "Η αποθήκευση απέτυχε.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteAdminProduct(barcode);
      navigate("/admin/products", { replace: true });
    } catch (caughtError) {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteError(
        caughtError instanceof Error
          ? caughtError.message
          : "Η διαγραφή απέτυχε.",
      );
    }
  }

  async function openPhoto(r2Key: string) {
    const blob = await fetchAdminPhotoBlob(r2Key);

    if (blob) {
      setViewerUrl(URL.createObjectURL(blob));
    }
  }

  function closeViewer() {
    if (viewerUrl) {
      URL.revokeObjectURL(viewerUrl);
    }

    setViewerUrl(null);
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-canvas px-4 pt-5 text-ink">
        <p className="text-sm text-ink-faint">Φόρτωση...</p>
      </main>
    );
  }

  if (loadError || !product || !form) {
    return (
      <main className="min-h-screen bg-canvas px-4 pt-5 text-ink">
        <p
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm leading-5 text-red-100"
        >
          {loadError || "Το προϊόν δεν βρέθηκε."}
        </p>

        <button
          type="button"
          onClick={() => navigate("/admin/products")}
          className="mt-4 text-sm font-semibold text-accent-strong"
        >
          ← Πίσω στη λίστα
        </button>
      </main>
    );
  }

  const analysisCategory = isRecord(product.analysisResult)
    ? product.analysisResult.contentCategory
    : null;

  const canEdit =
    product.analysisResult !== null &&
    (analysisCategory === "ingredients" ||
      analysisCategory === undefined);

  return (
    <main className="min-h-screen bg-canvas px-4 pb-28 pt-5 text-ink">
      <section className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => navigate("/admin/products")}
          className="text-sm font-semibold text-accent-strong"
        >
          ← Πίσω στη λίστα
        </button>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xl font-bold">
              {product.barcode}
            </p>

            <p className="mt-1 text-sm text-ink-faint">
              {product.status} · {product.category ?? "χωρίς κατηγορία"} ·{" "}
              {product.scanCount} σαρώσεις
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-red-500/40 px-3 text-sm font-semibold text-red-400"
          >
            <Trash2 size={16} />
            Διαγραφή
          </button>
        </div>

        {product.photos.length > 0 && (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
            {product.photos.map((photo) => (
              <div key={photo.id} className="shrink-0 text-center">
                <AdminPhotoThumbnail
                  r2Key={photo.r2Key}
                  alt={photo.photoType}
                  className="h-24 w-24 rounded-xl object-cover"
                  onClick={() => openPhoto(photo.r2Key)}
                />

                <p className="mt-1 text-[11px] text-ink-faint">
                  {photo.photoType}
                </p>
              </div>
            ))}
          </div>
        )}

        {product.status === "draft" && (
          <div className="mt-5 rounded-2xl border border-accent/40 bg-accent/10 p-4">
            <p className="text-sm leading-6 text-ink-muted">
              Αυτό το προϊόν έχει μόνο φωτογραφίες — δεν έχει
              αναλυθεί ακόμα.
            </p>

            {analyzeError && (
              <p
                role="alert"
                className="mt-2 text-sm font-semibold text-red-400"
              >
                {analyzeError}
              </p>
            )}

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="mt-3 h-14 w-full rounded-xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
            >
              {isAnalyzing ? "Ανάλυση..." : "Ανάλυση τώρα"}
            </button>
          </div>
        )}

        {product.status !== "draft" && !canEdit && (
          <p className="mt-5 rounded-xl border border-line-subtle bg-surface/70 p-3 text-sm leading-6 text-ink-muted">
            Η επεξεργασία υποστηρίζεται προς το παρόν μόνο για
            αναλύσεις συστατικών (κατηγορία: {String(analysisCategory)}
            ).
          </p>
        )}

        {canEdit && (
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Περίληψη
              </p>

              <textarea
                value={form.summary}
                onChange={(event) =>
                  setForm({ ...form, summary: event.target.value })
                }
                rows={3}
                className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Βαθμολογία
                </p>

                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.scoreValue}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      scoreValue: event.target.value,
                    })
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>

              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Κατηγορία βαθμολογίας
                </p>

                <select
                  value={form.band}
                  onChange={(event) =>
                    setForm({ ...form, band: event.target.value })
                  }
                  className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                >
                  {BAND_OPTIONS.map((band) => (
                    <option key={band} value={band}>
                      {band}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <EditableStringList
              label="Θετικά"
              values={form.positives}
              onChange={(positives) =>
                setForm({ ...form, positives })
              }
            />

            <EditableStringList
              label="Σημεία προσοχής"
              values={form.attentionItems}
              onChange={(attentionItems) =>
                setForm({ ...form, attentionItems })
              }
            />

            <EditableStringList
              label="Πιθανά αλλεργιογόνα"
              values={form.potentialAllergens}
              onChange={(potentialAllergens) =>
                setForm({ ...form, potentialAllergens })
              }
            />

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Ευρήματα συστατικών
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      ingredientFindings: [
                        ...form.ingredientFindings,
                        {
                          ingredientName: "",
                          normalizedName: "",
                          severity: "info",
                          title: "",
                          explanation: "",
                          evidenceType: "none",
                          sourceName: null,
                          sourceUrl: null,
                          confidence: 0.5,
                        },
                      ],
                    })
                  }
                  className="flex h-9 items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold text-ink-muted"
                >
                  <Plus size={14} />
                  Προσθήκη
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {form.ingredientFindings.map((finding, index) => (
                  <div
                    key={index}
                    className="space-y-2 rounded-xl border border-line-subtle bg-surface/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={finding.ingredientName}
                          onChange={(event) => {
                            const next = [
                              ...form.ingredientFindings,
                            ];
                            next[index] = {
                              ...finding,
                              ingredientName: event.target.value,
                            };
                            setForm({
                              ...form,
                              ingredientFindings: next,
                            });
                          }}
                          placeholder="Όνομα συστατικού"
                          className="h-10 rounded-lg border border-line bg-canvas px-2 text-sm text-ink outline-none"
                        />

                        <input
                          type="text"
                          value={finding.normalizedName}
                          onChange={(event) => {
                            const next = [
                              ...form.ingredientFindings,
                            ];
                            next[index] = {
                              ...finding,
                              normalizedName: event.target.value,
                            };
                            setForm({
                              ...form,
                              ingredientFindings: next,
                            });
                          }}
                          placeholder="Κανονικοποιημένο όνομα"
                          className="h-10 rounded-lg border border-line bg-canvas px-2 text-sm text-ink outline-none"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            ingredientFindings:
                              form.ingredientFindings.filter(
                                (_, findingIndex) =>
                                  findingIndex !== index,
                              ),
                          })
                        }
                        aria-label="Αφαίρεση εύρεσης"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-red-400"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <select
                      value={finding.severity}
                      onChange={(event) => {
                        const next = [...form.ingredientFindings];
                        next[index] = {
                          ...finding,
                          severity: event.target.value,
                        };
                        setForm({
                          ...form,
                          ingredientFindings: next,
                        });
                      }}
                      className="h-10 w-full rounded-lg border border-line bg-canvas px-2 text-sm text-ink outline-none"
                    >
                      {SEVERITY_OPTIONS.map((severity) => (
                        <option key={severity} value={severity}>
                          {severity}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={finding.title}
                      onChange={(event) => {
                        const next = [...form.ingredientFindings];
                        next[index] = {
                          ...finding,
                          title: event.target.value,
                        };
                        setForm({
                          ...form,
                          ingredientFindings: next,
                        });
                      }}
                      placeholder="Τίτλος"
                      className="h-10 w-full rounded-lg border border-line bg-canvas px-2 text-sm text-ink outline-none"
                    />

                    <textarea
                      value={finding.explanation}
                      onChange={(event) => {
                        const next = [...form.ingredientFindings];
                        next[index] = {
                          ...finding,
                          explanation: event.target.value,
                        };
                        setForm({
                          ...form,
                          ingredientFindings: next,
                        });
                      }}
                      rows={2}
                      placeholder="Επεξήγηση"
                      className="w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-sm text-ink outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Συνολική αξιολόγηση
              </p>

              <input
                type="text"
                value={form.overallVerdict}
                onChange={(event) =>
                  setForm({
                    ...form,
                    overallVerdict: event.target.value,
                  })
                }
                className="mt-2 h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>

            <EditableStringList
              label="Highlights"
              values={form.highlights}
              onChange={(highlights) =>
                setForm({ ...form, highlights })
              }
            />

            <EditableStringList
              label="Προσοχή σε"
              values={form.watchOutFor}
              onChange={(watchOutFor) =>
                setForm({ ...form, watchOutFor })
              }
            />
          </div>
        )}
      </section>

      {canEdit && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10">
          <div
            aria-hidden
            className="h-6 bg-gradient-to-t from-transparent to-canvas"
          />
          <div className="border-t border-line-subtle bg-canvas px-4 pb-3 pt-2">
            <div className="mx-auto max-w-2xl">
              {saveError && (
                <p
                  role="alert"
                  className="mb-2 rounded-xl border border-red-400/40 bg-red-950/40 p-2.5 text-xs text-red-100"
                >
                  {saveError}
                </p>
              )}

              {saveSuccess && (
                <p className="mb-2 rounded-xl border border-emerald-400/40 bg-emerald-950/40 p-2.5 text-xs text-emerald-100">
                  Αποθηκεύτηκε.
                </p>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="h-14 w-full rounded-xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
              >
                {isSaving ? "Αποθήκευση..." : "Αποθήκευση"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            onClick={closeViewer}
            aria-label="Κλείσιμο"
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X size={22} />
          </button>

          <img
            src={viewerUrl}
            alt="Φωτογραφία προϊόντος"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}

      {showDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-lg font-bold text-ink">
              Διαγραφή προϊόντος;
            </h2>

            <p className="mt-2 text-sm leading-6 text-ink-muted">
              Θα διαγραφούν το barcode {product.barcode}, οι
              φωτογραφίες του και η ανάλυσή του. Δεν αναιρείται.
            </p>

            {deleteError && (
              <p
                role="alert"
                className="mt-2 text-sm font-semibold text-red-400"
              >
                {deleteError}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="h-12 flex-1 rounded-xl border border-line text-sm font-semibold text-ink-muted"
              >
                Άκυρο
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="h-12 flex-1 rounded-xl bg-red-500 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "Διαγραφή..." : "Διαγραφή"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function AdminProductDetail() {
  return (
    <AdminGate>
      <AdminProductDetailContent />
    </AdminGate>
  );
}
