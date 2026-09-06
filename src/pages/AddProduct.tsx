import { useNavigate, useSearchParams } from "react-router-dom";

export default function AddProduct() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const barcode = searchParams.get("barcode") ?? "";

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 pb-20 text-ink">
      <section className="mx-auto max-w-md rounded-3xl border border-line bg-surface p-6">

        <button
          type="button"
          onClick={() => navigate("/scan")}
          className="text-sm font-medium text-accent-strong"
        >
          ← Πίσω στη σάρωση
        </button>

        <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-accent-strong">
          Βήμα 1 ολοκληρώθηκε
        </p>

        <h1 className="mt-2 text-3xl font-bold text-ink">
          Νέο προϊόν
        </h1>

        <div className="mt-6 rounded-2xl bg-surface-muted p-4">
          <p className="text-sm text-ink-faint">Barcode</p>

          <p className="mt-1 break-all text-xl font-bold text-ink">
            {barcode || "Δεν έχει δοθεί barcode"}
          </p>
        </div>

        <p className="mt-6 text-ink-muted">
          Επόμενο βήμα: φωτογραφία της λίστας συστατικών.
        </p>

        <button
          type="button"
          onClick={() =>
            navigate(
              `/ingredients-photo?barcode=${encodeURIComponent(barcode)}`,
            )
          }
          className="mt-6 w-full rounded-2xl bg-accent py-4 font-semibold text-on-accent"
        >
          Συνέχεια στη φωτογράφιση
        </button>

      </section>
    </main>
  );
}