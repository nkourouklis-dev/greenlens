import { useNavigate, useSearchParams } from "react-router-dom";

export default function ProductPhoto() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const barcode = searchParams.get("barcode") ?? "";

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">

        <div className="mb-6 flex gap-2">
          <div className="h-2 flex-1 rounded-full bg-green-500" />
          <div className="h-2 flex-1 rounded-full bg-green-500" />
          <div className="h-2 flex-1 rounded-full bg-slate-700" />
          <div className="h-2 flex-1 rounded-full bg-slate-700" />
        </div>

        <p className="text-sm font-semibold text-green-400">
          Step 2 of 5
        </p>

        <h1 className="mt-2 text-4xl font-bold">
          Product Photo
        </h1>

        <p className="mt-3 text-slate-400">
          Barcode detected successfully.
        </p>

        <div className="mt-4 rounded-2xl bg-slate-800 p-4 break-all">
          {barcode}
        </div>

        <div className="mt-8 flex-1 rounded-3xl border-2 border-dashed border-green-500 bg-slate-900 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl">📦</div>

            <h2 className="mt-4 text-xl font-bold">
              Product Photo
            </h2>

            <p className="mt-2 px-6 text-slate-400">
              Camera integration will be added next.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-6 h-14 rounded-2xl bg-green-600 text-lg font-semibold"
        >
          Continue
        </button>

      </section>
    </main>
  );
}