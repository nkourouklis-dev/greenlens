import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, RotateCcw } from "lucide-react";
import CameraScreen from "./CameraScreen";
import {
  estimateSharpness,
  getVisibleSourceRect,
  useCameraViewport,
} from "../contexts/CameraContext";
import { usePhotoFilePicker } from "../hooks/usePhotoFilePicker";

interface PhotoCaptureProps {
  /** Heading of the bottom sheet while framing, e.g. "Φωτογράφισε τα συστατικά". */
  title: string;
  /** One short line under the heading; dropped on short screens. */
  description: string;
  /** Short hint over the lower edge of the guide on the live feed. */
  hint: string;
  actionLabel: string;
  onContinue: (file: File) => void;
  isSaving?: boolean;
  error?: string;
  /**
   * Which kind of shot this is: "list" is the ingredients list (lines of
   * text, usually on the back of the pack), "pack" is the front-of-pack
   * identification photo. Picks the no-camera glyph and turns on the live
   * "too far to read" hint for text.
   */
  icon?: "list" | "pack";
  step?: number;
  stepCount?: number;
  barcode?: string;
}

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

const secondaryButton =
  "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold text-ink disabled:opacity-50";

/**
 * A photo step (ingredients list, front of pack) on the shared full-screen
 * camera layout (CameraScreen). After a shot the sheet turns into the check
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

  const placeholder = isCameraActive ? null : (
    <>
      {icon === "list" && <ListFrameIcon />}
      {icon === "pack" && <PackFrameIcon />}
      <p>
        {cameraError
          ? "Η κάμερα δεν είναι διαθέσιμη. Διάλεξε μια φωτογραφία από τη συσκευή."
          : "Άνοιγμα κάμερας..."}
      </p>
    </>
  );

  return (
    <CameraScreen
      viewportRef={containerRef}
      hideVideo={Boolean(previewUrl)}
      step={
        step !== undefined && stepCount !== undefined
          ? { current: step, total: stepCount }
          : undefined
      }
      barcode={barcode}
      guide="document"
      guideRef={guideRef}
      scanning={isCameraActive}
      hint={
        isCameraActive
          ? seemsTooFar
            ? "Πλησίασε, ώστε το κείμενο να γεμίζει το πλαίσιο"
            : hint
          : null
      }
      placeholder={placeholder}
      overlay={
        previewUrl ? (
          <img
            src={previewUrl}
            alt={title}
            className="h-full w-full rounded-2xl object-contain"
          />
        ) : null
      }
    >
      {filePicker.input}

      {previewUrl ? (
        <>
          <div>
            <h1 className="text-lg font-bold leading-tight">Διαβάζεται καθαρά;</h1>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-muted">
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

          <button
            type="button"
            disabled={!file || isSaving}
            onClick={() => file && onContinue(file)}
            className="h-12 w-full rounded-xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
          >
            {isSaving ? "Αποθήκευση..." : actionLabel}
          </button>

          <div className="flex gap-2">
            <button type="button" onClick={retake} disabled={isSaving} className={secondaryButton}>
              <RotateCcw size={16} />
              Νέα λήψη
            </button>
            <button type="button" onClick={filePicker.open} disabled={isSaving} className={secondaryButton}>
              <ImageIcon size={16} />
              Από συλλογή
            </button>
          </div>
        </>
      ) : (
        <>
          <div>
            <h1 className="text-lg font-bold leading-tight">{title}</h1>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-muted [@media(max-height:700px)]:hidden">
              {description}
            </p>
          </div>

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
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface text-ink transition active:scale-95"
              >
                <ImageIcon size={20} />
              </button>

              <button
                type="button"
                onClick={takePhoto}
                disabled={isCapturing}
                aria-label={isCapturing ? "Λήψη..." : "Λήψη φωτογραφίας"}
                className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-4 border-accent p-1.5 transition active:scale-95 disabled:opacity-60"
              >
                <span className="h-full w-full rounded-full bg-accent" />
              </button>

              {/* Keeps the shutter centred against the gallery button. */}
              <span aria-hidden className="h-12 w-12" />
            </div>
          ) : (
            /* No live camera — a computer without a webcam, or permission
               refused. Choosing a file is the only way forward here, so it
               is the primary action. */
            <button
              type="button"
              onClick={filePicker.open}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-base font-bold text-on-accent"
            >
              <ImageIcon size={20} />
              Επιλογή φωτογραφίας από τη συσκευή
            </button>
          )}
        </>
      )}
    </CameraScreen>
  );
}
