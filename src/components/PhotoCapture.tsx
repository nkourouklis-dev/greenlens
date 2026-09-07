import { useEffect, useRef, useState } from "react";
import { estimateSharpness, useCameraViewport } from "../contexts/CameraContext";

interface PhotoCaptureProps {
  title: string;
  description: string;
  actionLabel: string;
  onContinue: (file: File) => void;
  isSaving?: boolean;
  error?: string;
  /**
   * Which frame overlay to show: "list" hints at lines of text (the
   * ingredients list — usually on the back of the pack), "pack" hints at a
   * whole product silhouette (the front-of-pack identification photo).
   * Omitted when a step has no specific visual to show.
   */
  icon?: "list" | "pack";
}

// Lines-of-text glyph shown inside the frame for the ingredients step, so
// the shape being asked for reads at a glance instead of only through text.
function ListFrameIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-14 w-14 text-ink-faint"
      fill="none"
      aria-hidden
    >
      <rect
        x="8"
        y="10"
        width="48"
        height="44"
        rx="4"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <line x1="16" y1="22" x2="48" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="30" x2="48" y2="30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="38" x2="40" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="46" x2="44" y2="46" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// Product-pack silhouette shown for the front-of-pack identification step.
function PackFrameIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-14 w-14 text-ink-faint"
      fill="none"
      aria-hidden
    >
      <path
        d="M20 12 L44 12 L48 22 L48 52 L16 52 L16 22 Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <line x1="16" y1="22" x2="48" y2="22" stroke="currentColor" strokeWidth="2.5" />
      <line x1="24" y1="30" x2="40" y2="30" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="24" y1="37" x2="40" y2="37" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// Below this, the live frame is treated as too flat/empty to contain
// readable text at this distance — most likely the label isn't filling the
// frame yet. Deliberately conservative (only flags a clearly sparse frame)
// since, like BLUR_VARIANCE_THRESHOLD in CameraContext.tsx, it isn't
// calibrated against real device cameras — tune if it proves noisy.
const LIVE_FAR_VARIANCE_THRESHOLD = 4;
const LIVE_FRAMING_SAMPLE_INTERVAL_MS = 400;
const LIVE_FRAMING_SAMPLE_SIZE = 96;

export default function PhotoCapture({
  title,
  description,
  actionLabel,
  onContinue,
  isSaving = false,
  error,
  icon,
}: PhotoCaptureProps) {
  const {
    containerRef,
    isActive: isCameraActive,
    error: cameraError,
    captureFrame,
    videoRef,
  } = useCameraViewport();

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
  // text-heavy shot (the ingredients list) — only a nudge, never a gate.
  // Samples the live video at low resolution on an interval and reuses the
  // same edge-density metric CameraContext.tsx computes once at capture
  // time for blur, just applied continuously and more cheaply here.
  useEffect(() => {
    if (icon !== "list" || !isCameraActive || previewUrl) {
      setSeemsTooFar(false);
      return;
    }

    const intervalId = window.setInterval(() => {
      const video = videoRef.current;

      if (!video || video.videoWidth === 0 || video.readyState < 2) {
        return;
      }

      if (!sampleCanvasRef.current) {
        sampleCanvasRef.current = document.createElement("canvas");
      }

      const canvas = sampleCanvasRef.current;
      const aspect = video.videoWidth / video.videoHeight;

      canvas.width = LIVE_FRAMING_SAMPLE_SIZE;
      canvas.height = Math.max(
        1,
        Math.round(LIVE_FRAMING_SAMPLE_SIZE / aspect),
      );

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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
      const captured = await captureFrame();
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

  function retake() {
    setFile(null);
    setIsBlurry(false);
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
      return null;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* aspect-[3/4] only fills in the axis CSS leaves "auto" — with a
          definite w-full and a max-height, the browser clamps height but
          never shrinks width back down to match, so on short viewports the
          box silently renders wider/shorter than the 3:4 it claims. That
          matters here because captureFrame() (CameraContext.tsx) crops the
          photo to mirror this exact box: a wrong-shaped box means the
          photo is cropped from a different, shorter vertical slice than
          what the dashed outline promised the user they were framing.
          Driving the cap through max-width instead (38vh * 3/4) keeps the
          rendered box — and so the capture — genuinely 3:4 at any height. */}
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[28.5vh] overflow-hidden rounded-2xl border-2 border-dashed border-accent/70 bg-surface">
        {/* The shared live camera is portaled into this container. It stays
            mounted (and the stream keeps running) even while a captured
            frame is shown on top of it — no stream stop/restart needed to
            "freeze" the picture between steps. */}
        <div
          ref={containerRef}
          className={`h-full w-full [&>video]:h-full [&>video]:w-full [&>video]:object-cover ${previewUrl ? "invisible" : ""}`}
        />

        {previewUrl && (
          <img
            src={previewUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {!previewUrl && !isCameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            {icon === "list" && <ListFrameIcon />}
            {icon === "pack" && <PackFrameIcon />}
            <span className="mt-2 text-lg font-semibold text-ink">{title}</span>
            <span className="mt-2 text-xs leading-5 text-ink-faint">{description}</span>
          </div>
        )}

        {/* Faint framing guide overlaid on the live feed, showing what
            shape the shot should be (a text list vs. a whole pack) — a
            picture the user can match, not just a caption to read. */}
        {!previewUrl && isCameraActive && icon && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-25">
            {icon === "list" && <ListFrameIcon />}
            {icon === "pack" && <PackFrameIcon />}
          </div>
        )}

        {/* Shown while framing, before the shot is taken — the whole point
            is to guide what gets photographed, not to explain it after the
            fact once it's too late to reframe. */}
        {!previewUrl && isCameraActive && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8">
            <p className="text-center text-xs font-semibold leading-5 text-white drop-shadow">
              {description}
            </p>
          </div>
        )}

        {/* Live, best-effort distance nudge — see the effect above for how
            it's computed. Placed at the top since the bottom is already the
            description banner. */}
        {!previewUrl && isCameraActive && seemsTooFar && (
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-3">
            <p className="text-center text-xs font-semibold leading-5 text-white drop-shadow">
              Πλησίασε περισσότερο ώστε το κείμενο να γεμίζει το πλαίσιο
            </p>
          </div>
        )}
      </div>

      {cameraError && (
        <p className="rounded-xl border border-red-400/40 bg-red-950/40 p-2.5 text-xs text-red-100">
          {cameraError}
        </p>
      )}

      {captureError && (
        <p className="rounded-xl border border-red-400/40 bg-red-950/40 p-2.5 text-xs text-red-100">
          Η λήψη απέτυχε. Δοκιμάστε ξανά.
        </p>
      )}

      {previewUrl && isBlurry && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-50">
          Η φωτογραφία μοιάζει θολή. Δοκιμάστε "Λήψη ξανά" κρατώντας το
          κινητό σταθερό, ή συνεχίστε αν το κείμενο διαβάζεται καθαρά.
        </p>
      )}

      {previewUrl && (
        <p className="text-center text-xs font-semibold text-ink-muted">
          Αυτή ακριβώς η φωτογραφία θα σταλεί για ανάλυση. Ελέγξτε την πριν
          συνεχίσετε.
        </p>
      )}

      {previewUrl ? (
        <button
          type="button"
          onClick={retake}
          className="flex h-10 items-center justify-center rounded-xl border border-line text-sm font-semibold text-ink-muted"
        >
          Λήψη ξανά
        </button>
      ) : (
        <button
          type="button"
          onClick={takePhoto}
          disabled={!isCameraActive || isCapturing}
          className="h-12 w-full rounded-xl bg-accent px-5 text-sm font-bold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
        >
          {isCapturing ? "Λήψη..." : "Λήψη φωτογραφίας"}
        </button>
      )}

      {/* Spacer reserving room for the fixed CTA bar below, so normal-flow
          content never ends up hidden underneath it. */}
      <div aria-hidden className="h-24" />

      {/* Sticky CTA: always fixed just above the bottom nav so the primary
          action is never lost to scroll. The gradient strip signals that
          content can continue above it even when nothing is currently cut off. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10">
        <div aria-hidden className="h-6 bg-gradient-to-b from-transparent to-canvas" />
        <div className="border-t border-line-subtle bg-canvas px-4 pb-3 pt-2">
          <div className="mx-auto flex max-w-md flex-col gap-2">
            {error && <p className="rounded-xl border border-red-400/40 bg-red-950/40 p-2.5 text-xs text-red-100">{error}</p>}
            <button type="button" disabled={!file || isSaving} onClick={() => file && onContinue(file)} className="h-12 w-full rounded-xl bg-accent px-5 text-sm font-bold text-on-accent disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint">
              {isSaving ? "Αποθήκευση..." : actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
