import { useState } from "react";

type ShareScanButtonProps = {
  productName?: string;
  barcode: string;
  score?: number | null;
  summary?: string;
  positives?: string[];
  attentionItems?: string[];
  allergens?: string[];
};

export default function ShareScanButton({
  productName,
  barcode,
  score,
  summary,
  positives,
  attentionItems,
  allergens,
}: ShareScanButtonProps) {
  const [feedback, setFeedback] = useState("");

  function buildShareText(): string {
    const lines: string[] = [];

    const title = productName?.trim() || "Προϊόν";

    lines.push(
      typeof score === "number"
        ? `${title} — Score ${score}/100`
        : title,
    );

    if (summary?.trim()) {
      lines.push("", summary.trim());
    }

    const bullets = (label: string, items?: string[]) => {
      const clean = (items ?? [])
        .map((item) => item?.trim())
        .filter(Boolean)
        .slice(0, 4);

      if (clean.length === 0) {
        return;
      }

      lines.push("", label);

      for (const item of clean) {
        lines.push(`• ${item}`);
      }
    };

    bullets("Θετικά:", positives);
    bullets("Προσοχή:", attentionItems);
    bullets("Πιθανά αλλεργιογόνα:", allergens);

    if (barcode?.trim()) {
      lines.push("", `Barcode: ${barcode.trim()}`);
    }

    lines.push("", "Σαρώθηκε με GreenLens");

    return lines.join("\n");
  }

  async function share() {
    const text = buildShareText();

    // navigator.share must be called directly from the click handler,
    // otherwise iOS Safari blocks it as a non-user gesture.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: productName?.trim() || "GreenLens",
          text,
        });
        return;
      } catch (error) {
        // The user cancelling the share sheet is not an error.
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Αντιγράφηκε στο πρόχειρο");
    } catch {
      setFeedback("Η κοινοποίηση δεν είναι διαθέσιμη σε αυτή τη συσκευή.");
    }

    setTimeout(() => setFeedback(""), 2500);
  }

  return (
    <div>
      <button
        type="button"
        onClick={share}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 transition active:scale-[0.98]"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M12 3v13" />
          <path d="m8 7 4-4 4 4" />
          <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
        </svg>
        Κοινοποίηση
      </button>

      {feedback && (
        <p
          role="status"
          className="mt-2 text-center text-xs text-slate-400"
        >
          {feedback}
        </p>
      )}
    </div>
  );
}
