import { useEffect, useState } from "react";
import { useCameraViewport } from "../contexts/CameraContext";

interface PhotoCaptureProps {
  title: string;
  description: string;
  actionLabel: string;
  onContinue: (file: File) => void;
  isSaving?: boolean;
  error?: string;
}

export default function PhotoCapture({
  title,
  description,
  actionLabel,
  onContinue,
  isSaving = false,
  error,
}: PhotoCaptureProps) {
  const {
    containerRef,
    isActive: isCameraActive,
    error: cameraError,
    captureFrame,
  } = useCameraViewport();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isBlurry, setIsBlurry] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function takePhoto() {
    setIsCapturing(true);

    try {
      const captured = await captureFrame();
      if (!captured) return;

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
      <div className="relative aspect-[3/4] max-h-[38vh] w-full overflow-hidden rounded-2xl border-2 border-dashed border-accent/70 bg-surface">
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
            <span className="text-lg font-semibold text-ink">{title}</span>
            <span className="mt-2 text-xs leading-5 text-ink-faint">{description}</span>
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
      </div>

      {cameraError && (
        <p className="rounded-xl border border-red-400/40 bg-red-950/40 p-2.5 text-xs text-red-100">
          {cameraError}
        </p>
      )}

      {previewUrl && isBlurry && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2.5 text-xs text-amber-50">
          Η φωτογραφία μοιάζει θολή. Δοκιμάστε "Λήψη ξανά" κρατώντας το
          κινητό σταθερό, ή συνεχίστε αν το κείμενο διαβάζεται καθαρά.
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
