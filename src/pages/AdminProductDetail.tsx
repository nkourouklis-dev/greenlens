import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2, X } from "lucide-react";
import AdminGate from "../components/AdminGate";
import AdminProductPhotos from "../components/AdminProductPhotos";
import EditableStringList from "../components/EditableStringList";
import ProductVersionsPanel from "../components/ProductVersionsPanel";
import ScoreBreakdownPanel from "../components/ScoreBreakdownPanel";
import ScoreNoticesCard from "../components/ScoreNoticesCard";
import { AssistantDraftPanel } from "../components/AdminAssistantPanel";
import {
  analyzeAdminProduct,
  deleteAdminProduct,
  fetchAdminPhotoBlob,
  getAdminProduct,
  updateAdminProduct,
  rescoreAdminProduct,
  updateAdminProductName,
  type AdminProductDetail as AdminProductDetailType,
} from "../services/adminProductsClient";
import type { ScoreBreakdown } from "../types";

const SEVERITY_OPTIONS = [
  "positive",
  "info",
  "attention",
  "high_attention",
  "unknown",
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
  sourceText: string;
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

/**
 * Prefill for rows analyzed before the label text was persisted: the
 * findings list, in label order, comma-separated (the separator the
 * server's rule matcher weights positions by). Weaker than the real label
 * text — the model only reports ingredients worth a card — which is exactly
 * why it lands in an editable field the admin can correct rather than being
 * used silently. Mirrors ingredientTextFromFindings in worker/rescore.ts.
 */
function ingredientTextFromFindings(
  findings: EditableFinding[],
): string {
  return findings
    .map((finding) => finding.ingredientName.trim())
    .filter((name) => name.length > 0)
    .join(", ");
}

/**
 * The parts of a stored analysis this screen can show without being able to
 * edit them — nutrition and chemical rows, which the edit form has no fields
 * for yet.
 *
 * Returns null only when there is genuinely nothing scored to show, so the
 * caller renders the panel exactly when there is a result behind it.
 */
function readOnlyAnalysisOf(analysisResult: unknown): {
  score: ScoreBreakdown;
  summary: string;
  sourceText: string;
} | null {
  if (!isRecord(analysisResult) || !isRecord(analysisResult.score)) {
    return null;
  }

  const score = analysisResult.score;

  if (
    typeof score.score !== "number" &&
    score.score !== null
  ) {
    return null;
  }

  return {
    score: score as unknown as ScoreBreakdown,
    summary:
      typeof analysisResult.summary === "string"
        ? analysisResult.summary
        : "",
    sourceText:
      typeof analysisResult.sourceText === "string"
        ? analysisResult.sourceText
        : "",
  };
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

  const ingredientFindings = findings.map((finding): EditableFinding => {
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
  });

  const sourceText =
    typeof raw.sourceText === "string" && raw.sourceText.trim() !== ""
      ? raw.sourceText
      : ingredientTextFromFindings(ingredientFindings);

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
    ingredientFindings,
    sourceText,
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
 * confidence, insufficientDataReasons, allergenNotice, contentCategory,
 * per-finding evidenceType/sourceName/sourceUrl/confidence) pass through
 * unchanged.
 *
 * `score` and `ingredientInsights` are sent as loaded and then discarded:
 * the server recomputes both from `sourceText` on every save, which is why
 * the score fields in this form are read-only.
 */
function applyFormState(
  original: unknown,
  form: FormState,
): Record<string, unknown> {
  const base = isRecord(original) ? original : {};
  const executiveSummary = isRecord(base.executiveSummary)
    ? base.executiveSummary
    : {};

  return {
    ...base,
    summary: form.summary,
    sourceText: form.sourceText,
    positives: form.positives,
    attentionItems: form.attentionItems,
    potentialAllergens: form.potentialAllergens,
    ingredientFindings: form.ingredientFindings,
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
  const [isRescoring, setIsRescoring] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] =
    useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const [nameDraft, setNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSaved, setNameSaved] = useState(false);

  function load() {
    setIsLoading(true);
    setLoadError("");

    getAdminProduct(barcode)
      .then((loaded) => {
        setProduct(loaded);
        setNameDraft(loaded.productName ?? "");
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

  /**
   * Pulls the row again after a photo upload but keeps only its photo list.
   * A full `load()` here would rebuild the form from the server and throw
   * away whatever the admin has typed but not yet saved — adding a photo
   * must not cost them their edits.
   */
  async function refreshPhotos() {
    const loaded = await getAdminProduct(barcode).catch(() => null);

    if (loaded) {
      setProduct((current) =>
        current ? { ...current, photos: loaded.photos } : loaded,
      );
    }
  }

  async function handleAnalyze() {
    if (isAnalyzing || !product) {
      return;
    }

    // Re-analyzing replaces what is on file — worth a confirmation when a
    // human already verified it, since the row goes back to unreviewed.
    if (
      product.status === "verified" &&
      !window.confirm(
        "Το προϊόν είναι Verified. Η νέα ανάλυση θα αντικαταστήσει την τρέχουσα και θα χρειαστεί ξανά έλεγχο. Συνέχεια;",
      )
    ) {
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

  /**
   * Saves the name on its own, without touching the analysis form — so it
   * works for drafts and nutrition rows too, and never costs the admin
   * unsaved analysis edits.
   */
  async function handleSaveName() {
    if (isSavingName) {
      return;
    }

    setIsSavingName(true);
    setNameError("");
    setNameSaved(false);

    try {
      const updated = await updateAdminProductName(barcode, nameDraft);

      setProduct((current) =>
        current
          ? { ...current, productName: updated.productName }
          : updated,
      );
      setNameDraft(updated.productName ?? "");
      setNameSaved(true);
    } catch (caughtError) {
      setNameError(
        caughtError instanceof Error
          ? caughtError.message
          : "Το όνομα δεν αποθηκεύτηκε.",
      );
    } finally {
      setIsSavingName(false);
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

  // Recompute from the stored text: no OCR, no model, so it is cheap enough
  // to press freely and it cannot change anything but the arithmetic.
  async function handleRescore() {
    setIsRescoring(true);
    setAnalyzeError("");

    try {
      const updated = await rescoreAdminProduct(barcode);

      setProduct(updated);
      setForm(buildFormState(updated.analysisResult));
    } catch (caughtError) {
      setAnalyzeError(
        caughtError instanceof Error
          ? caughtError.message
          : "Ο επανυπολογισμός απέτυχε.",
      );
    } finally {
      setIsRescoring(false);
    }
  }

  const analysisCategory = isRecord(product.analysisResult)
    ? product.analysisResult.contentCategory
    : null;

  const canEdit =
    product.analysisResult !== null &&
    (analysisCategory === "ingredients" ||
      analysisCategory === undefined);

  const readOnlyAnalysis = readOnlyAnalysisOf(product.analysisResult);

  const scoreNotices =
    isRecord(product.analysisResult) &&
    isRecord(product.analysisResult.score) &&
    Array.isArray(product.analysisResult.score.notices)
      ? (product.analysisResult.score.notices as ScoreBreakdown["notices"])
      : undefined;

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

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Όνομα προϊόντος
          </p>

          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={nameDraft}
              onChange={(event) => {
                setNameDraft(event.target.value);
                setNameSaved(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleSaveName();
                }
              }}
              maxLength={120}
              placeholder="π.χ. Eubos Dry Skin Children Calm Body Lotion"
              className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />

            <button
              type="button"
              onClick={handleSaveName}
              disabled={
                isSavingName ||
                nameDraft.trim() === (product.productName ?? "")
              }
              className="h-12 shrink-0 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
            >
              {isSavingName ? "..." : "Αποθήκευση"}
            </button>
          </div>

          {nameError && (
            <p
              role="alert"
              className="mt-2 text-sm font-semibold text-red-400"
            >
              {nameError}
            </p>
          )}

          {nameSaved && (
            <p className="mt-2 text-xs text-emerald-300">
              Το όνομα αποθηκεύτηκε.
            </p>
          )}
        </div>

        <AdminProductPhotos
          barcode={barcode}
          photos={product.photos}
          onUploaded={refreshPhotos}
          onOpen={openPhoto}
        />

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
              onClick={() => handleAnalyze()}
              disabled={isAnalyzing}
              className="mt-3 h-14 w-full rounded-xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
            >
              {isAnalyzing ? "Ανάλυση..." : "Ανάλυση τώρα"}
            </button>
          </div>
        )}

        {/* A non-ingredients row is analyzed and scored like any other — it
            just can't be hand-edited yet. It used to render nothing at all
            here, so a perfectly good nutrition analysis looked like no
            analysis, and the notice above it read as though the app had
            declined to do the work. Showing the result read-only says what
            is actually true: this was analyzed, here is the verdict, the
            fields just aren't editable. */}
        {product.status !== "draft" && !canEdit && readOnlyAnalysis && (
          <div className="mt-5 space-y-3">
            <ScoreBreakdownPanel
              score={readOnlyAnalysis.score}
              insights={[]}
            />

            {readOnlyAnalysis.summary && (
              <div className="rounded-xl border border-line-subtle bg-surface/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Περίληψη
                </p>

                <p className="mt-1 text-sm leading-6 text-ink-muted">
                  {readOnlyAnalysis.summary}
                </p>
              </div>
            )}

            {readOnlyAnalysis.sourceText && (
              <div className="rounded-xl border border-line-subtle bg-surface/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Κείμενο που βαθμολογήθηκε
                </p>

                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-ink-muted">
                  {readOnlyAnalysis.sourceText}
                </p>
              </div>
            )}
          </div>
        )}

        {product.status !== "draft" && !canEdit && (
          <p className="mt-3 rounded-xl border border-line-subtle bg-surface/70 p-3 text-sm leading-6 text-ink-muted">
            Κατηγορία: {String(analysisCategory)}. Η ανάλυση έγινε
            κανονικά· η επεξεργασία των πεδίων με το χέρι υποστηρίζεται
            προς το παρόν μόνο για αναλύσεις συστατικών. Αν λείπει η
            φωτογραφία της λίστας συστατικών, πρόσθεσέ την και πάτα
            «Ανάλυση» παρακάτω.
          </p>
        )}

        {product.status !== "draft" && (
          <div className="mt-5 rounded-2xl border border-line-subtle bg-surface/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Ανάλυση ξανά
            </p>

            <div className="mt-3">
              <ScoreNoticesCard notices={scoreNotices} />
            </div>

            <p className="mt-3 text-sm leading-6 text-ink-muted">
              «Ανάλυση» διαβάζει ξανά όλες τις φωτογραφίες ετικέτας
              (συστατικά, διατροφικός πίνακας, άλλη) και βγάζει μία
              βαθμολογία από όλες μαζί. «Επανυπολογισμός» ξαναβγάζει τη
              βαθμολογία από το αποθηκευμένο κείμενο, χωρίς νέα ανάγνωση.
              Η τωρινή ανάλυση μένει στο ιστορικό εκδόσεων.
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
              onClick={() => void handleRescore()}
              disabled={isRescoring || isAnalyzing}
              className="mt-3 h-12 w-full rounded-xl border border-line px-4 text-sm font-semibold text-ink transition active:scale-[0.98] disabled:cursor-not-allowed disabled:text-ink-faint"
            >
              {isRescoring
                ? "Επανυπολογισμός..."
                : "Επανυπολογισμός βαθμολογίας (χωρίς νέα ανάγνωση)"}
            </button>

            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={isAnalyzing || isRescoring}
              className="mt-3 h-12 w-full rounded-xl bg-accent px-4 text-sm font-bold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
            >
              {isAnalyzing ? "Ανάλυση..." : "Ανάλυση (όλες οι φωτογραφίες)"}
            </button>
          </div>
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

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Κείμενο συστατικών
              </p>

              <textarea
                value={form.sourceText}
                onChange={(event) =>
                  setForm({
                    ...form,
                    sourceText: event.target.value,
                  })
                }
                rows={5}
                className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />

              <p className="mt-2 text-xs leading-5 text-ink-muted">
                Η βαθμολογία υπολογίζεται από αυτό το κείμενο κατά την
                αποθήκευση. Κράτα τα συστατικά χωρισμένα με κόμμα και στη
                σειρά της ετικέτας — η σειρά μετράει στον υπολογισμό.
              </p>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Βαθμολογία
                </p>

                <p className="mt-2 flex h-12 w-full items-center rounded-xl border border-line-subtle bg-surface/70 px-3 text-sm text-ink-muted">
                  {form.scoreValue === "" ? "—" : form.scoreValue}
                </p>
              </div>

              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Κατηγορία βαθμολογίας
                </p>

                <p className="mt-2 flex h-12 w-full items-center rounded-xl border border-line-subtle bg-surface/70 px-3 text-sm text-ink-muted">
                  {form.band}
                </p>
              </div>
            </div>

            <p className="rounded-xl border border-line-subtle bg-surface/70 p-3 text-xs leading-5 text-ink-muted">
              Η βαθμολογία δεν επεξεργάζεται χειροκίνητα. Υπολογίζεται στον
              διακομιστή με τους ίδιους κανόνες που χρησιμοποιεί μια κανονική
              σάρωση και ενημερώνεται μόλις αποθηκεύσεις.
            </p>

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

            <AssistantDraftPanel
              barcode={product.barcode}
              onApply={(draft) =>
                setForm({
                  ...form,
                  summary: draft.summary || form.summary,
                  overallVerdict:
                    draft.overallVerdict || form.overallVerdict,
                  highlights:
                    draft.highlights.length > 0
                      ? draft.highlights
                      : form.highlights,
                  watchOutFor:
                    draft.watchOutFor.length > 0
                      ? draft.watchOutFor
                      : form.watchOutFor,
                })
              }
            />
          </div>
        )}

        {product.status !== "draft" && (
          <div className="mt-5">
            <ProductVersionsPanel
              barcode={product.barcode}
              onRestored={(restored) => {
                setProduct(restored);
                setForm(buildFormState(restored.analysisResult));
              }}
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
