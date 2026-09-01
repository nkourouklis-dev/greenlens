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
        <img src={previewUrl} alt={title} className="max-h-[45vh] w-full rounded-2xl border border-slate-700 object-contain" />
      ) : (
        <label htmlFor={inputId} className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-500/70 bg-slate-900 px-6 py-8 text-center">
          <span className="text-lg font-semibold text-white">{title}</span>
          <span className="mt-2 text-xs leading-5 text-slate-400">{description}</span>
          <span className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">Άνοιγμα κάμερας</span>
        </label>
      )}
      <input id={inputId} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0])} />
      {error && <p className="rounded-xl border border-red-400/40 bg-red-950/40 p-2.5 text-xs text-red-100">{error}</p>}
      {previewUrl && <label htmlFor={inputId} className="flex h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-600 text-sm font-semibold text-slate-100">Λήψη ξανά</label>}
      <button type="button" disabled={!file || isSaving} onClick={() => file && onContinue(file)} className="h-12 w-full rounded-xl bg-emerald-500 px-5 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">
        {isSaving ? "Αποθήκευση..." : actionLabel}
      </button>
    </div>
  );
}