import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="bg-slate-950 px-5 py-6 text-white">
      <section className="mx-auto flex max-w-md flex-col gap-4 pb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            AI Ingredient Scanner
          </p>

          <h1 className="mt-1 text-3xl font-bold text-white">
            GreenLens
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            Σκάναρε συστατικά τροφίμων και καλλυντικών,
            δες αλλεργιογόνα και σημεία προσοχής.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="h-12 w-full rounded-2xl bg-emerald-500 px-6 text-base font-bold text-slate-950 transition active:scale-[0.98]"
          >
            Σάρωση προϊόντος
          </button>

          <button
            type="button"
            onClick={() => navigate("/history")}
            className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-900 px-6 text-sm font-semibold text-slate-100 transition active:scale-[0.98]"
          >
            Ιστορικό σαρώσεων
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-xs text-slate-400">
              OCR
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-tight">
              Συστατικά
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-xs text-slate-400">
              AI
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-tight">
              Ανάλυση
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <p className="text-xs text-slate-400">
              Safety
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-tight">
              Αλλεργιογόνα
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}