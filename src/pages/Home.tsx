import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-slate-950 px-5 text-white">
      <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center py-8">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            AI Ingredient Scanner
          </p>

          <h1 className="mt-2 text-4xl font-bold text-white">
            GreenLens
          </h1>

          <p className="mt-3 text-base leading-7 text-slate-300">
            Σκάναρε συστατικά τροφίμων και καλλυντικών,
            δες αλλεργιογόνα και έλεγξε σημεία
            προσοχής πριν αγοράσεις.
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="h-14 w-full rounded-2xl bg-emerald-500 px-6 text-base font-bold text-slate-950 transition active:scale-[0.98]"
          >
            Σάρωση προϊόντος
          </button>

          <button
            type="button"
            onClick={() => navigate("/history")}
            className="h-14 w-full rounded-2xl border border-slate-700 bg-slate-900 px-6 text-base font-semibold text-slate-100 transition active:scale-[0.98]"
          >
            Ιστορικό σαρώσεων
          </button>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-xs text-slate-400">
              OCR
            </p>
            <p className="mt-1 text-sm font-semibold">
              Συστατικά
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-xs text-slate-400">
              AI
            </p>
            <p className="mt-1 text-sm font-semibold">
              Ανάλυση
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-xs text-slate-400">
              Safety
            </p>
            <p className="mt-1 text-sm font-semibold">
              Αλλεργιογόνα
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}