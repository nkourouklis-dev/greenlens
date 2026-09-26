import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Maximize,
  RotateCcw,
  Sun,
  SunDim,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import {
  estimateSharpness,
  getVisibleSourceRect,
  useCameraViewport,
} from "../contexts/CameraContext";
import { usePhotoFilePicker } from "../hooks/usePhotoFilePicker";

interface PhotoCaptureProps {
  /** Heading of the bottom sheet while framing, e.g. "Φωτογράφισε τα συστατικά". */
  title: string;
  /** One short line under the heading: what to photograph and where it usually is. */
  description: string;
  /** Short hint shown under the framing guide on the live feed. */
  hint: string;
  actionLabel: string;
  onContinue: (file: File) => void;
  isSaving?: boolean;
  error?: string;
  /**
   * Which kind of shot this is: "list" is the ingredients list (lines of
   * text, usually on the back of the pack), "pack" is the front-of-pack
   * identification photo. Picks the empty-state glyph and the tips row,
   * and turns on the live "too far to read" hint for text.
   */
  icon?: "list" | "pack";
  step?: number;
  stepCount?: number;
  barcode?: string;
}

const TIPS: Record<"list" | "pack", { label: string; Icon: LucideIcon }[]> = {
  list: [
    { label: "Καλό φως", Icon: Sun },
    { label: "Κοντά", Icon: ZoomIn },
    { label: "Χωρίς αντανάκλαση", Icon: SunDim },
  ],
  pack: [
    { label: "Καλό φως", Icon: Sun },
    { label: "Γέμισε το κάδρο", Icon: Maximize },
  ],
};

// Lines-of-text glyph shown in the guide for the ingredients step when
// there is no live camera, so the shape being asked for reads at a glance.
function ListFrameIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14" fill="none" aria-hidden>
      <rect x="8" y="10" width="48" height="44" rx="4" stroke="currentColor" strokeWidth="2.5" />
      <line x1="16" y1="22" x2="48" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="30" x2="48" y2="30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="38" x2="40" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="46" x2="44" y2="46" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// Product-pack silhouette for the front-of-pack identification step.
function PackFrameIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14" fill="none" aria-hidden>
      <path d="M20 12 L44 12 L48 22 L48 52 L16 52 L16 22 Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="16" y1="22" x2="48" y2="22" stroke="currentColor" strokeWidth="2.5" />
      <line x1="24" y1="30" x2="40" y2="30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="24" y1="37" x2="40" y2="37" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// The four rounded corner brackets of the framing guide.
function GuideCorners() {
  const corner = "absolute h-9 w-9 border-accent";
  return (
    <>
      <span className={`${corner} left-0 top-0 rounded-tl-2xl border-l-4 border-t-4`} />
      <span className={`${corner} right-0 top-0 rounded-tr-2xl border-r-4 border-t-4`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-2xl border-b-4 border-r-4`} />
    </>
  );
}

// Below this, the live guide area is treated as too flat/empty to contain
// readable text at this distance — most likely the label isn't filling the
// guide yet. Deliberately conservative (only flags a clearly sparse frame)
// since, like BLUR_VARIANCE_THRESHOLD in CameraContext.tsx, it isn't
// calibrated against real device cameras — tune if it proves noisy.
const LIVE_FAR_VARIANCE_THRESHOLD = 4;
const LIVE_FRAMING_SAMPLE_INTERVAL_MS = 400;
const LIVE_FRAMING_SAMPLE_SIZE = 96;

const errorBox =
  "rounded-xl border border-red-400/40 bg-red-950/40 p-2.5 text-xs text-red-100";

/**
 * Full-screen photo step: the live camera fills the screen, a framing
 * guide marks what will be kept, and a bottom sheet holds the heading,
 * tips and shutter. After a shot the same sheet turns into the check
 * ("Διαβάζεται καθαρά;") with continue / retake.
 *
 * The photo is cropped to the guide (captureFrame(guideRef)), so what the
 * guide shows is exactly what gets sent for OCR.
 */
export default function PhotoCapture({
  title,
  description,
  hint,
  actionLabel,
  onContinue,
  isSaving = false,
  error,
  icon,
  step,
  stepCount,
  barcode,
}: PhotoCaptureProps) {
  const navigate = useNavigate();
  const {
    containerRef,
    isActive: isCameraActive,
    error: cameraError,
    captureFrame,
    videoRef,
  } = useCameraViewport();

  const guideRef = useRef<HTMLDivElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isBlurry, setIsBlurry] = useState(false);
  const [captureError, setCaptureError] = useState(false);
  const [seemsTooFar, setSeemsTooFar] = useState(false);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Live, non-blocking "you're probably too far away" hint while framing a
  // text-heavy shot — only a nudge, never a gate. Samples just the guide
  // area of the live video at low resolution, reusing the edge-density
  // metric CameraContext.tsx computes once at capture time for blur.
  useEffect(() => {
    if (icon !== "list" || !isCameraActive || previewUrl) {
      setSeemsTooFar(false);
      return;
    }

    const intervalId = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const visible = getVisibleSourceRect(video, guideRef.current);
      if (!visible) return;

      if (!sampleCanvasRef.current) {
        sampleCanvasRef.current = document.createElement("canvas");
      }

      const canvas = sampleCanvasRef.current;
      const aspect = visible.sourceWidth / visible.sourceHeight;

      canvas.width = LIVE_FRAMING_SAMPLE_SIZE;
      canvas.height = Math.max(1, Math.round(LIVE_FRAMING_SAMPLE_SIZE / aspect));

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(
        video,
        visible.sourceX,
        visible.sourceY,
        visible.sourceWidth,
        visible.sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const density = estimateSharpness(
        ctx.getImageData(0, 0, canvas.width, canvas.height),
      );

      setSeemsTooFar(density < LIVE_FAR_VARIANCE_THRESHOLD);
    }, LIVE_FRAMING_SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [icon, isCameraActive, previewUrl, videoRef]);

  async function takePhoto() {
    setIsCapturing(true);
    setCaptureError(false);

    try {
      const captured = await captureFrame(guideRef.current);
      if (!captured) {
        setCaptureError(true);
        return;
      }

      const nextPreviewUrl = URL.createObjectURL(captured.file);
      setFile(captured.file);
      setIsBlurry(captured.isBlurry);
      setPreviewUrl((currentPreviewUrl) => {
        if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
        return nextPreviewUrl;
      });
    } finally {
      setIsCapturing(false);
    }
  }

  // A file chosen from disk or the gallery goes through the same state a
  // live shot does, so the check screen and continue button are unchanged.
  // The blur warning is skipped rather than guessed at: it is computed from
  // the live frame, and "looks blurry" about a file the user deliberately
  // chose would be noise, not help.
  function acceptFile(chosen: File) {
    const nextPreviewUrl = URL.createObjectURL(chosen);

    setCaptureError(false);
    setFile(chosen);
    setIsBlurry(false);
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
      return nextPreviewUrl;
    });
  }

  // Declared after acceptFile so the callback is not reading a binding
  // that is still being initialised.
  const filePicker = usePhotoFilePicker(acceptFile);

  function retake() {
    setFile(null);
    setIsBlurry(false);
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
      return null;
    });
  }

  const tips = icon ? TIPS[icon] : [];

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#0e1411] text-white">
      {filePicker.input}

      {/* Camera area: the shared live video is portaled into containerRef
          and fills it. It stays mounted (and the stream keeps running) while
          a captured photo is shown on top, so retaking is instant. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className={`absolute inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover ${previewUrl ? "invisible" : ""}`}
        />

        {/* Darkening behind the top controls so they read on any scene. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-black/45"
        />

        {/* Top controls: back, step, barcode. */}
        <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Πίσω"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-95"
            >
              <ArrowLeft size={20} />
            </button>

            {step !== undefined && stepCount !== undefined && (
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[13px] font-semibold">
                  Βήμα {step} από {stepCount}
                </p>
                <div className="flex gap-1" aria-hidden>
                  {Array.from({ length: stepCount }, (_, index) => (
                    <span
                      key={index}
                      className={`h-1 w-7 rounded-full ${index < step ? "bg-accent" : "bg-white/30"}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Keeps the step label centred against the back button. */}
            <span aria-hidden className="h-11 w-11" />
          </div>

          {barcode && (
            <div className="flex items-center gap-2 self-center rounded-full bg-white/15 py-1.5 pl-1.5 pr-3 backdrop-blur">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-on-accent">
                <Check size={12} strokeWidth={3} />
              </span>
              <span className="text-[13px] text-white/80">Barcode</span>
              <span className="min-w-0 break-all text-[13px] font-semibold tabular-nums tracking-wide">
                {barcode}
              </span>
            </div>
          )}
        </div>

        {/* Framing guide. Everything inside it — and only that — becomes
            the photo (see captureFrame(guideRef) above). */}
        <div
          ref={guideRef}
          className={`absolute inset-x-5 bottom-9 top-[calc(max(0.75rem,env(safe-area-inset-top))+6.5rem)] min-h-40 ${previewUrl ? "invisible" : ""}`}
        >
          <GuideCorners />

          {isCameraActive && (
            <span
              aria-hidden
              className="gl-scan-line absolute inset-x-5 h-0.5 rounded-full bg-accent shadow-[0_0_12px_2px_var(--color-accent)]"
            />
          )}

          {!isCameraActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white/70">
              {icon === "list" && <ListFrameIcon />}
              {icon === "pack" && <PackFrameIcon />}
              <p className="text-sm leading-5">
                {cameraError
                  ? "Η κάμερα δεν είναι διαθέσιμη. Διάλεξε μια φωτογραφία από τη συσκευή."
                  : "Άνοιγμα κάμερας..."}
              </p>
            </div>
          )}
        </div>

        {!previewUrl && isCameraActive && (
          <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-4">
            <p
              aria-live="polite"
              className="rounded-full bg-black/65 px-3 py-1.5 text-center text-xs font-medium"
            >
              {seemsTooFar
                ? "Πλησίασε, ώστε το κείμενο να γεμίζει το πλαίσιο"
                : hint}
            </p>
          </div>
        )}

        {/* The captured (already cropped) photo, shown whole for checking. */}
        {previewUrl && (
          <div className="absolute inset-x-4 bottom-9 top-[calc(max(0.75rem,env(safe-area-inset-top))+6.5rem)]">
            <img
              src={previewUrl}
              alt={title}
              className="h-full w-full rounded-2xl object-contain"
            />
          </div>
        )}
      </div>

      {/* Bottom sheet. */}
      <div className="relative -mt-6 rounded-t-[28px] bg-canvas px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-ink">
        <div className="mx-auto flex max-w-md flex-col gap-3">
          {previewUrl ? (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-bold leading-tight tracking-tight">
                  Διαβάζεται καθαρά;
                </h1>
                <p className="text-sm leading-5 text-ink-muted">
                  Αυτή ακριβώς η φωτογραφία θα σταλεί για ανάλυση.
                </p>
              </div>

              {isBlurry && (
                <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-50">
                  Η φωτογραφία μοιάζει θολή. Κάνε νέα λήψη κρατώντας το κινητό
                  σταθερό, ή συνέχισε αν το κείμενο διαβάζεται καθαρά.
                </p>
              )}

              {error && <p className={errorBox}>{error}</p>}

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  disabled={!file || isSaving}
                  onClick={() => file && onContinue(file)}
                  className="h-13 w-full rounded-2xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
                >
                  {isSaving ? "Αποθήκευση..." : actionLabel}
                </button>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={retake}
                    disabled={isSaving}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    <RotateCcw size={16} />
                    Νέα λήψη
                  </button>
                  <button
                    type="button"
                    onClick={filePicker.open}
                    disabled={isSaving}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-sm font-semibold text-ink disabled:opacity-50"
                  >
                    <ImageIcon size={16} />
                    Από συλλογή
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-bold leading-tight tracking-tight">{title}</h1>
                <p className="text-[13px] leading-5 text-ink-muted [@media(max-height:700px)]:hidden">{description}</p>
              </div>

              {tips.length > 0 && (
                <ul className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none]">
                  {tips.map(({ label, Icon }) => (
                    <li
                      key={label}
                      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-emerald-950 px-2 py-1 text-[11px] font-semibold text-emerald-200"
                    >
                      <Icon size={12} aria-hidden />
                      {label}
                    </li>
                  ))}
                </ul>
              )}

              {cameraError && <p className={errorBox}>{cameraError}</p>}
              {captureError && (
                <p className={errorBox}>Η λήψη απέτυχε. Δοκίμασε ξανά.</p>
              )}
              {error && <p className={errorBox}>{error}</p>}

              {isCameraActive ? (
                <div className="flex items-center justify-between px-2">
                  <button
                    type="button"
                    onClick={filePicker.open}
                    aria-label="Επιλογή από αρχείο ή συλλογή"
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface text-ink transition active:scale-95"
                  >
                    <ImageIcon size={20} />
                  </button>

                  <button
                    type="button"
                    onClick={takePhoto}
                    disabled={isCapturing}
                    aria-label={isCapturing ? "Λήψη..." : "Λήψη φωτογραφίας"}
                    className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-accent p-1.5 transition active:scale-95 disabled:opacity-60"
                  >
                    <span className="h-full w-full rounded-full bg-accent" />
                  </button>

                  {/* Keeps the shutter centred against the gallery button. */}
                  <span aria-hidden className="h-12 w-12" />
                </div>
              ) : (
                /* No live camera — a computer without a webcam, or permission
                   refused. Choosing a file is the only way forward here, so
                   it is the primary action. */
                <button
                  type="button"
                  onClick={filePicker.open}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-base font-bold text-on-accent"
                >
                  <ImageIcon size={20} />
                  Επιλογή φωτογραφίας από τη συσκευή
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
