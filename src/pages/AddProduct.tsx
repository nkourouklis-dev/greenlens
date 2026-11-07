import { Barcode, Camera, Check } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import FlowHeader from "../components/FlowHeader";

export default function AddProduct() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const barcode = searchParams.get("barcode") ?? "";

  return (
    <main className="min-h-dvh bg-canvas px-4 pb-24 text-ink">
      <FlowHeader
        eyebrow="Νέο προϊόν"
        title="Δεν το ξέρουμε ακόμα"
        subtitle="Θα το προσθέσεις με μία φωτογραφία της ετικέτας."
      />

      <section className="mx-auto flex max-w-md flex-col gap-4">
        <div className="flex items-center gap-4 rounded-3xl border border-line-subtle bg-surface p-4 shadow-sm">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-accent-strong">
            <Barcode size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-strong">
              <Check size={14} strokeWidth={3} />
              Barcode αναγνωρίστηκε
            </p>
            <p className="mt-0.5 break-all text-xl font-bold tabular-nums tracking-wide">
              {barcode || "Δεν έχει δοθεί barcode"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-3xl border border-line-subtle bg-surface p-4 shadow-sm">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-accent-strong">
            <Camera size={22} />
          </span>
          <div>
            <p className="font-bold">Επόμενο βήμα</p>
            <p className="mt-0.5 text-sm leading-5 text-ink-muted">
              Φωτογραφία της λίστας συστατικών. Αν υπάρχει και πίνακας
              διατροφικής αξίας, θα τον ζητήσουμε μετά.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            navigate(
              `/ingredients-photo?barcode=${encodeURIComponent(barcode)}`,
            )
          }
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-bold text-on-accent shadow-lg shadow-emerald-500/25 transition active:scale-[0.98]"
        >
          <Camera size={20} />
          Συνέχεια στη φωτογράφιση
        </button>
      </section>
    </main>
  );
}
