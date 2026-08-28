import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function ProductPhoto() {
  const [searchParams] = useSearchParams();
  const barcode = searchParams.get("barcode") ?? "";

  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState("");

  function handleImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    const imageUrl = URL.createObjectURL(file);

    setImagePreview(imageUrl);
  }

  function openCamera() {
    fileInputRef.current?.click();
  }

  function continueNext() {
    navigate(
      `/ingredients-photo?barcode=${encodeURIComponent(barcode)}`
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">

        <div className="mb-6 flex items-center gap-2">
          <div className="h-2 flex-1 rounded-full bg-green-500" />
          <div className="h-2 flex-1 rounded-full bg-green-500" />
          <div className="h-2 flex-1 rounded-full bg-slate-700" />
          <div className="h-2 flex-1 rounded-full bg-slate-700" />
        </div>

        <p className="text-green-400 text-sm font-semibold">
          Step 2 of 5
        </p>

        <h1 className="mt-2 text-4xl font-bold">
          Product Photo
        </h1>

        <p className="mt-3 text-slate-400 leading-6">
          Take a clear photo of the front of the product.
        </p>

        <div className="mt-8 flex-1">

          {!imagePreview && (
            <div
              onClick={openCamera}
              className="flex h-[420px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-green-500 bg-slate-900"
            >
              <div className="text-6xl">
                📦
              </div>

              <h2 className="mt-5 text-xl font-bold">
                Product Front
              </h2>

              <p className="mt-2 text-center text-slate-400 px-6">
                Tap to take a photo of the front side
                of the product.
              </p>
            </div>
          )}

          {imagePreview && (
            <div className="overflow-hidden rounded-3xl border border-slate-700">
              <img
                src={imagePreview}
                alt="Product"
                className="h-[420px] w         type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handleImage}
        />

        {!imagePreview ? (
          <button
            onClick={openCamera}
            className="mt-6 h-14 rounded-2xl bg-green-600 text-lg font-semibold"
          >
            Take Photo
          </button>
        ) : (
          <>
            <button
              onClick={continueNext}
              className="mt-6 h-14 rounded-2xl bg-green-600 text-lg font-semibold"
            >
              Continue
            </button>

            <button
              onClick={openCamera}
              className="mt-3 h-14 rounded-2xl border border-slate-700"
            >
              Retake Photo
            </button>
          </>
        )}
      </section>
    </main>
  );
}