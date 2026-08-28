import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-green-50 px-4">
      <section className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center text-center">
        <div className="rounded-3xl bg-green-600 px-5 py-3 text-3xl">
          🌿
        </div>

        <h1 className="mt-6 text-5xl font-bold text-green-700">
          GreenLens
        </h1>

        <p className="mt-4 text-lg text-slate-600">
          Know what you consume.
        </p>

        <button
          type="button"
          onClick={() => navigate("/scan")}
          className="mt-10 w-full rounded-2xl bg-green-600 px-6 py-4 text-lg font-semibold text-white shadow-lg shadow-green-600/20 transition hover:bg-green-700"
        >
          Scan Product
        </button>
      </section>
    </main>
  );
}