import { useNavigate, useSearchParams } from "react-router-dom";

export default function AddProduct() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const barcode = searchParams.get("barcode") ?? "";

  return (
    <main className="min-h-screen bg-green-50 px-4 py-8">
      <section className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm">
        <button
          type="button"
          onClick={() => navigate("/scan")}
          className="text-sm font-medium text-green-700"
        >
          ← Πίσω στη σάρωση
        </button>

        <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-green-600">
          Βήμα 1 ολοκληρώθηκε
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Νέο προϊόν
        </h1>

        <div className="mt-6 rounded-2xl bg-slate-100 p-4">
          <p className="text-sm text-slate-500">Barcode</p>
          <p className="mt-1 break-all text-xl font-bold text-slate-900">
            {barcode || "Δεν έχει δοθεί barcode"}
          </p>
        </div>

        <p className="mt-6 text-slate-600">
          Επόμενο βήμα: φωτογραφία μπροστινής όψης προϊόντος.
        </p>
      </section>
    </main>
  );
}