export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-green-50">
      <h1 className="text-5xl font-bold text-green-600">
        GreenLens
      </h1>

      <p className="mt-4 text-gray-600">
        Know what you consume.
      </p>

      <button className="mt-8 px-6 py-3 rounded-xl bg-green-600 text-white">
        Scan Product
      </button>
    </div>
  );
}