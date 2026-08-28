import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-slate-950 px-5 text-white">
      <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-400">Καθημερινές επιλογές</p>
        <h1 className="mt-4 text-5xl font-bold text-white">
          GreenLens
        </h1>

        <p className="mt-5 max-w-sm text-lg leading-8 text-slate-300">
          Σκάναρε ένα προϊόν και κράτησε τις πληροφορίες του οργανωμένες στη συσκευή σου.
        </p>

        <button
          type="button"
          onClick={() => navigate("/scan")}
          className="mt-10 h-15 w-full rounded-xl bg-emerald-500 px-6 text-lg font-bold text-slate-950"
        >
          Σάρωση προϊόντος
        </button>
        <button type="button" onClick={() => navigate("/history")} className="mt-4 h-14 w-full rounded-xl border border-slate-700 px-6 text-base font-semibold text-slate-100">
          Ιστορικό σαρώσεων
        </button>
      </section>
    </main>
  );
}