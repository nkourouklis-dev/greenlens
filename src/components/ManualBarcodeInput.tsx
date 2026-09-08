interface ManualBarcodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  label?: string;
  hint?: string;
}

/**
 * Extracted from Scan.tsx so the admin bulk-capture flow (AdminCapture.tsx)
 * can reuse the exact same validated barcode entry instead of rebuilding
 * it — same digit-only filter, same length cap (matches the backend's
 * 8-14 digit barcode validation range), same Enter-to-submit behaviour.
 * Layout-agnostic on purpose (no outer margin) so each caller controls its
 * own spacing.
 */
export default function ManualBarcodeInput({
  value,
  onChange,
  onSubmit,
  label = "Χειροκίνητη εισαγωγή",
  hint = "Χρησιμοποίησέ την αν η κάμερα δεν αναγνωρίζει το barcode.",
}: ManualBarcodeInputProps) {
  return (
    <div className="rounded-2xl border border-line-subtle bg-surface/70 p-4">
      <label
        htmlFor="manual-barcode"
        className="text-sm font-semibold text-ink-muted"
      >
        {label}
      </label>

      {hint && (
        <p className="mt-1 text-xs leading-5 text-ink-faint">
          {hint}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <input
          id="manual-barcode"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value.replace(/\D/g, ""),
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim()) {
              onSubmit(value);
            }
          }}
          placeholder="π.χ. 0000000000000"
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-base text-ink outline-none transition placeholder:text-ink-faintest focus:border-accent focus:ring-2 focus:ring-accent/20"
        />

        <button
          type="button"
          onClick={() => onSubmit(value)}
          disabled={!value.trim()}
          aria-label="Συνέχεια με barcode"
          className="h-12 shrink-0 rounded-xl bg-accent px-4 font-bold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
        >
          Συνέχεια
        </button>
      </div>
    </div>
  );
}
