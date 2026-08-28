import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { useNavigate } from "react-router-dom";
import { findProductByBarcode } from "../data/productRepository";
import { saveHistoryItem } from "../services/historyService";
import { safariPermissionMessage, stopCameraStream } from "../services/cameraSession";

export default function Scan() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scannerStartingRef = useRef(false);
  const detectedRef = useRef(false);
  const scannerRunRef = useRef(0);

  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  const navigate = useNavigate();

  async function startScanner() {
    if (!videoRef.current || scannerStartingRef.current || controlsRef.current) return;

    const scannerRun = scannerRunRef.current + 1;
    scannerRunRef.current = scannerRun;
    scannerStartingRef.current = true;
    detectedRef.current = false;
    setError("");
    setBarcode("");
    setIsScanning(true);

    try {
      const codeReader = new BrowserMultiFormatReader();

      const controls =
        await codeReader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: {
                ideal: "environment",
              },
            },
          },
          videoRef.current,
          (result) => {
            if (scannerRun !== scannerRunRef.current || !result || detectedRef.current) return;

            const scannedBarcode = result.getText();
            if (!scannedBarcode) return;

            setBarcode(scannedBarcode);
            detectedRef.current = true;
            stopScanner();
            continueWithBarcode(scannedBarcode);
          },
        );
      if (scannerRun !== scannerRunRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
    } catch (scannerError) {
      if (scannerRun !== scannerRunRef.current) return;
      console.error(scannerError);

      setError(
        "Δεν ήταν δυνατή η πρόσβαση στην κάμερα. Έλεγξε ότι έχεις δώσει άδεια στον browser.",
      );

      setIsScanning(false);
    } finally {
      if (scannerRun === scannerRunRef.current) scannerStartingRef.current = false;
    }
  }

  function stopScanner() {
    scannerRunRef.current += 1;
    scannerStartingRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;
    stopCameraStream(videoRef.current);
    setIsScanning(false);
  }

  function continueWithBarcode(value: string) {
    const cleanBarcode = value.trim();
    if (!cleanBarcode) return;

    const knownProduct = findProductByBarcode(cleanBarcode);
    if (knownProduct) {
      saveHistoryItem({
        id: crypto.randomUUID(),
        barcode: cleanBarcode,
        status: "known",
        scannedAt: new Date().toISOString(),
        productId: knownProduct.id,
        productName: knownProduct.name,
      });
      navigate(`/product/${knownProduct.id}`);
      return;
    }

    navigate(`/ingredients-photo?barcode=${encodeURIComponent(cleanBarcode)}`);
  }

  useEffect(() => {
    startScanner();

    return stopScanner;
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <section className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mb-5 text-sm font-medium text-green-400"
        >
          ← Επιστροφή
        </button>

        <h1 className="text-3xl font-bold">Σάρωση προϊόντος</h1>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          Τοποθέτησε το barcode μέσα στο πλαίσιο και κράτησε την
          κάμερα σταθερή.
        </p>

        <div className="relative mt-6 overflow-hidden rounded-3xl border border-slate-700 bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-[3/4] w-full object-cover"
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-[85%] rounded-2xl border-2 border-green-400 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]">
              <div className="mt-1/2 h-0.5 w-full bg-red-500" />
            </div>
          </div>
        </div>

        {!isScanning && !barcode && (
          <button
            type="button"
            onClick={startScanner}
            className="mt-6 w-full rounded-2xl bg-green-600 px-5 py-4 font-semibold text-white transition hover:bg-green-700"
          >
            {error ? "Δοκιμή ξανά" : "Άνοιγμα κάμερας"}
          </button>
        )}

        {isScanning && (
          <button
            type="button"
            onClick={stopScanner}
            className="mt-6 w-full rounded-2xl bg-slate-700 px-5 py-4 font-semibold"
          >
            Διακοπή σάρωσης
          </button>
        )}

        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-slate-500">{safariPermissionMessage}</p>

        {barcode && (
          <div className="mt-5 rounded-2xl border border-green-500/40 bg-green-950/40 p-5">
            <p className="text-sm text-green-300">
              Το barcode αναγνωρίστηκε
            </p>

            <p className="mt-1 break-all text-2xl font-bold">
              {barcode}
            </p>

            <button
              type="button"
              onClick={() => continueWithBarcode(barcode)}
              className="mt-5 w-full rounded-2xl bg-green-600 px-5 py-4 font-semibold"
            >
              Συνέχεια στην καταχώρηση
            </button>

            <button
              type="button"
              onClick={startScanner}
              className="mt-3 w-full rounded-2xl border border-slate-600 px-5 py-3 font-medium"
            >
              Νέα σάρωση
            </button>
          </div>
        )}

        <div className="mt-6">
          <label
            htmlFor="manual-barcode"
            className="text-sm font-medium text-slate-300"
          >
            Ή πληκτρολόγησε το barcode
          </label>

          <input
            id="manual-barcode"
            type="text"
            inputMode="numeric"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder="π.χ. 0000000000000"
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-4 text-white outline-none focus:border-green-500"
          />
          <button
            type="button"
            onClick={() => continueWithBarcode(barcode)}
            disabled={!barcode.trim()}
            className="mt-3 h-12 w-full rounded-xl border border-emerald-500/70 font-semibold text-emerald-300 disabled:border-slate-700 disabled:text-slate-500"
          >
            Συνέχεια με barcode
          </button>
        </div>
      </section>
    </main>
  );
}