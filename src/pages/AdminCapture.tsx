import { useEffect, useState } from "react";
import { Camera, RotateCcw, Trash2, X } from "lucide-react";
import ManualBarcodeInput from "../components/ManualBarcodeInput";
import { useCameraViewport } from "../contexts/CameraContext";
import {
  clearStoredAdminPassword,
  getStoredAdminPassword,
  setStoredAdminPassword,
} from "../services/adminAuth";
import {
  uploadAdminPhoto,
  verifyAdminPassword,
  type PhotoType,
} from "../services/adminClient";

interface PhotoSlot {
  type: PhotoType;
  label: string;
}

// "other" exists at the storage layer (migrations/0005_add_capture_flow.sql)
// for future flexibility, but this screen only ever offers the three named
// shots the in-store workflow actually asks for.
const PHOTO_SLOTS: PhotoSlot[] = [
  { type: "front", label: "Μπροστινή ετικέτα" },
  { type: "ingredients", label: "Συστατικά" },
  { type: "nutrition", label: "Διατροφικός πίνακας" },
];

interface CapturedSlotPhoto {
  file: File;
  previewUrl: string;
}

function revokeAll(photos: Partial<Record<PhotoType, CapturedSlotPhoto>>) {
  for (const photo of Object.values(photos)) {
    if (photo) {
      URL.revokeObjectURL(photo.previewUrl);
    }
  }
}

export default function AdminCapture() {
  const [password, setPassword] = useState(() =>
    getStoredAdminPassword(),
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const [barcode, setBarcode] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");

  const [photos, setPhotos] = useState<
    Partial<Record<PhotoType, CapturedSlotPhoto>>
  >({});
  const [activeSlot, setActiveSlot] =
    useState<PhotoType | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [toast, setToast] = useState("");

  // Always called (hooks can't be conditional), and its viewport <div>
  // below is always rendered too — useCameraViewport() registers whatever
  // that ref points to exactly once, on this component's first render, so
  // the div has to exist from the start even while it's visually hidden
  // during the password/barcode screens (same pattern PhotoCapture.tsx
  // uses: toggle visibility, never conditionally mount/unmount it).
  const {
    containerRef,
    error: cameraError,
    captureFrame,
  } = useCameraViewport();

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setToast(""),
      2500,
    );

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  // Release every object URL still held when the whole page unmounts
  // (navigating away mid-capture) — the per-photo revokes on replace/
  // delete/submit below only cover the normal in-flow cases.
  useEffect(() => {
    return () => revokeAll(photos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePasswordSubmit() {
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
    setPasswordInput("");
  }

  function handleLogout() {
    clearStoredAdminPassword();
    setPassword("");
  }

  function resetForNextProduct() {
    setBarcode("");
    setManualBarcode("");
    revokeAll(photos);
    setPhotos({});
    setSubmitError("");
  }

  async function handleCapture() {
    const slot = activeSlot;

    if (!slot) {
      return;
    }

    const captured = await captureFrame();

    if (!captured) {
      return;
    }

    const previewUrl = URL.createObjectURL(captured.file);

    setPhotos((current) => {
      const existing = current[slot];

      if (existing) {
        URL.revokeObjectURL(existing.previewUrl);
      }

      return {
        ...current,
        [slot]: { file: captured.file, previewUrl },
      };
    });

    setActiveSlot(null);
  }

  function handleDeletePhoto(type: PhotoType) {
    setPhotos((current) => {
      const existing = current[type];

      if (existing) {
        URL.revokeObjectURL(existing.previewUrl);
      }

      const next = { ...current };
      delete next[type];
      return next;
    });
  }

  async function handleSubmit() {
    const taken = Object.entries(photos) as Array<
      [PhotoType, CapturedSlotPhoto]
    >;

    if (taken.length === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      // Sequential on purpose: on a poor in-store connection, a partial
      // failure should stop immediately with a clear "this many left"
      // state rather than firing every upload in parallel and losing
      // track of which ones actually landed.
      for (const [photoType, photo] of taken) {
        await uploadAdminPhoto(barcode, photoType, photo.file);
      }

      setToast(
        `Αποθηκεύτηκαν ${taken.length} φωτογραφί${taken.length === 1 ? "α" : "ες"} για ${barcode}`,
      );
      resetForNextProduct();
    } catch (caughtError) {
      setSubmitError(
        caughtError instanceof Error
          ? caughtError.message
          : "Η καταχώρηση απέτυχε. Δοκιμάστε ξανά.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const takenCount = Object.keys(photos).length;
  const activeSlotLabel = PHOTO_SLOTS.find(
    (slot) => slot.type === activeSlot,
  )?.label;

  return (
    <main className="min-h-screen bg-canvas px-4 pb-28 pt-5 text-ink">
      {/* Always mounted (see the comment on useCameraViewport() above) —
          just a fullscreen overlay while a slot is active, otherwise
          invisible and out of the way. */}
      <div
        ref={containerRef}
        className={
          activeSlot
            ? "fixed inset-0 z-40 bg-black [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
            : "hidden"
        }
      >
        {activeSlot && (
          <>
            <button
              type="button"
              onClick={() => setActiveSlot(null)}
              aria-label="Ακύρωση"
              className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X size={22} />
            </button>

            <div className="pointer-events-none absolute inset-x-0 top-[max(1rem,env(safe-area-inset-top))] flex justify-center">
              <span className="rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white">
                {activeSlotLabel}
              </span>
            </div>

            <div className="absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] flex justify-center">
              <button
                type="button"
                onClick={handleCapture}
                aria-label="Λήψη φωτογραφίας"
                className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 active:scale-95"
              >
                <span className="h-16 w-16 rounded-full bg-white" />
              </button>
            </div>
          </>
        )}
      </div>

      {!password && (
        <section className="mx-auto max-w-md">
          <h1 className="text-2xl font-bold">
            Λειτουργία λήψης (PIM)
          </h1>

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
                  handlePasswordSubmit();
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
              onClick={handlePasswordSubmit}
              disabled={!passwordInput.trim() || isVerifying}
              className="h-14 w-full rounded-xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
            >
              {isVerifying ? "Έλεγχος..." : "Είσοδος"}
            </button>
          </div>
        </section>
      )}

      {password && !barcode && (
        <section className="mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">
              Λήψη φωτογραφιών
            </h1>

            <button
              type="button"
              onClick={handleLogout}
              className="text-sm font-semibold text-ink-faint"
            >
              Αποσύνδεση
            </button>
          </div>

          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Σάρωσε ή πληκτρολόγησε το barcode του προϊόντος για να
            ξεκινήσεις τη λήψη.
          </p>

          <div className="mt-6">
            <ManualBarcodeInput
              value={manualBarcode}
              onChange={setManualBarcode}
              onSubmit={(value) => setBarcode(value.trim())}
              label="Barcode προϊόντος"
              hint=""
            />
          </div>
        </section>
      )}

      {password && barcode && (
        <section className="mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-strong">
                {takenCount} από {PHOTO_SLOTS.length} φωτογραφίες
              </p>

              <p className="mt-0.5 truncate font-mono text-lg font-bold">
                {barcode}
              </p>
            </div>

            <button
              type="button"
              onClick={resetForNextProduct}
              className="shrink-0 text-sm font-semibold text-ink-faint"
            >
              Αλλαγή barcode
            </button>
          </div>

          {cameraError && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm leading-5 text-red-100"
            >
              {cameraError}
            </p>
          )}

          <div className="mt-4 space-y-3">
            {PHOTO_SLOTS.map((slot) => {
              const photo = photos[slot.type];

              return (
                <div
                  key={slot.type}
                  className="flex items-center gap-3 rounded-2xl border border-line-subtle bg-surface/70 p-3"
                >
                  {photo ? (
                    <img
                      src={photo.previewUrl}
                      alt={slot.label}
                      className="h-20 w-20 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveSlot(slot.type)}
                      aria-label={`Λήψη: ${slot.label}`}
                      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas text-ink-faint active:scale-95"
                    >
                      <Camera size={28} />
                    </button>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-ink">
                      {slot.label}
                    </p>

                    <p className="mt-0.5 text-xs text-ink-faint">
                      {photo ? "Έτοιμη" : "Δεν έχει ληφθεί ακόμα"}
                    </p>
                  </div>

                  {photo && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSlot(slot.type)}
                        aria-label={`Νέα λήψη: ${slot.label}`}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink-muted active:scale-95"
                      >
                        <RotateCcw size={18} />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleDeletePhoto(slot.type)
                        }
                        aria-label={`Διαγραφή: ${slot.label}`}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-red-400 active:scale-95"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Spacer reserving room for the fixed CTA bar below. */}
          <div aria-hidden className="h-24" />

          <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10">
            <div
              aria-hidden
              className="h-6 bg-gradient-to-t from-transparent to-canvas"
            />
            <div className="border-t border-line-subtle bg-canvas px-4 pb-3 pt-2">
              <div className="mx-auto max-w-md">
                {submitError && (
                  <p
                    role="alert"
                    className="mb-2 rounded-xl border border-red-400/40 bg-red-950/40 p-2.5 text-xs text-red-100"
                  >
                    {submitError}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={takenCount === 0 || isSubmitting}
                  className="h-14 w-full rounded-xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
                >
                  {isSubmitting
                    ? "Αποθήκευση..."
                    : "Καταχώρηση & επόμενο προϊόν"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-50 flex justify-center px-4"
        >
          <p className="rounded-full border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </main>
  );
}
