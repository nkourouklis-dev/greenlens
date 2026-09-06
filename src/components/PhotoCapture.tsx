import { useEffect, useState } from "react";

interface PhotoCaptureProps {
  inputId: string;
  title: string;
  description: string;
  actionLabel: string;
  onContinue: (file: File) => void;
  isSaving?: boolean;
  error?: string;
}

export default function PhotoCapture({
  inputId,
  title,
  description,
  actionLabel,
  onContinue,
  isSaving = false,
  error,
}: PhotoCaptureProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function selectFile(selectedFile: File | undefined) {
    if (!selectedFile) return;

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setFile(selectedFile);
    setPreviewUrl((currentPreviewUrl) => {
      if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
      return nextPreviewUrl;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {previewUrl ? (
        <img src={previewUrl} alt={title} className="max-h-[38vh] w-full rounded-2xl border border-line object-contain" />
      ) : (
        <label htmlFor={inputId} className="flex aspect-[3/4] max-h-[38vh] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-accent/70 bg-surface px-6 py-8 text-center">
          <span className="text-lg font-semibold text-ink">{title}</span>
          <span className="mt-2 text-xs leading-5 text-ink-faint">{description}</span>
          <span className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent">Άνοιγμα κάμερας</span>
        </label>
      )}
      <input id={inputId} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0])} />
      {previewUrl && <label htmlFor={inputId} className="flex h-10 cursor-pointer items-center justify-center rounded-xl border border-line text-sm font-semibold text-ink-muted">Λήψη ξανά</label>}

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