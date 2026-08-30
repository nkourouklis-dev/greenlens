import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { useNavigate } from "react-router-dom";
import { findProductByBarcode } from "../data/productRepository";
import {
  findByBarcode,
  saveHistoryItem,
} from "../services/historyService";
import type { ScanHistoryItem } from "../types";

export default function Scan() {
  const videoRef = useRef<HTMLVideoElement | null>(
    null,
  );
  const controlsRef =
    useRef<IScannerControls | null>(null);
  const scannerStartingRef = useRef(false);
  const detectedRef = useRef(false);
  const scannerRunRef = useRef(0);

  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState("");
  const [isScanning, setIsScanning] =
    useState(false);

  const [existingItem, setExistingItem] =
    useState<ScanHistoryItem | null>(null);

  const navigate = useNavigate();

  async function startScanner() {
    if (
      !videoRef.current ||
      scannerStartingRef.current ||
      controlsRef.current
    ) {
      return;
    }

    const scannerRun =
      scannerRunRef.current + 1;

    scannerRunRef.current = scannerRun;
    scannerStartingRef.current = true;
    detectedRef.current = false;

    setError("");
    setBarcode("");
    setExistingItem(null);
    setIsScanning(true);

    try {
      const codeReader =
        new BrowserMultiFormatReader();

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
            if (
              scannerRun !==
                scannerRunRef.current ||
              !result ||
              detectedRef.current
            ) {
              return;
            }

            const scannedBarcode =
              result.getText();

            if (!scannedBarcode) {
              return;
            }

            setBarcode(scannedBarcode);
            detectedRef.current = true;
            stopScanner();
            handleBarcode(scannedBarcode);
          },
        );

      if (
        scannerRun !== scannerRunRef.current
      ) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
    } catch (scannerError) {
      if (
        scannerRun !== scannerRunRef.current
      ) {
        return;
      }

      console.error(scannerError);

      setError(
        "Δεν ήταν δυνατή η πρόσβαση στην κάμερα. Έλεγξε ότι έχεις δώσει άδεια στον browser.",
      );

      setIsScanning(false);
    } finally {
      if (
        scannerRun === scannerRunRef.current
      ) {
        scannerStartingRef.current = false;
      }
    }
  }

  function stopScanner() {
    scannerRunRef.current += 1;
    scannerStartingRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;

    const stream = videoRef.current?.srcObject;

    if (stream instanceof MediaStream) {
      stream
        .getTracks()
        .forEach((track) => track.stop());
    }

    setIsScanning(false);
  }

  function handleBarcode(value: string) {
    const cleanBarcode = value.trim();

    if (!cleanBarcode) {
      return;
    }

    const previousScan =
      findByBarcode(cleanBarcode);

    if (previousScan) {
      setExistingItem(previousScan);
      return;
    }

    continueWithBarcode(cleanBarcode);
  }

  function continueWithBarcode(value: string) {
    const cleanBarcode = value.trim();

    if (!cleanBarcode) {
      return;
    }

    const knownProduct =
      findProductByBarcode(cleanBarcode);

    if (knownProduct) {
      saveHistoryItem({
        id: crypto.randomUUID(),
        barcode: cleanBarcode,
        status: "known",
        scannedAt: new Date().toISOString(),
        productId: knownProduct.id,
        productName: knownProduct.name,
        ocrRawText:
          knownProduct.ingredients.join(", "),
        userCorrectedText:
          knownProduct.ingredients.join(", "),
        ocrConfidence: 1,
      });

      navigate(`/product/${knownProduct.id}`);
      return;
    }

    navigate(
      `/ingredients-photo?barcode=${encodeURIComponent(cleanBarcode)}`,
    );
  }

  useEffect(() => {
    startScanner();

    return stopScanner;
  }, []);

  if (existingItem) {
    const scanDate = new Date(
      existingItem.scannedAt,
    ).toLocaleString("el-GR");

    const scoreValue =
      existingItem.analysis?.score.score ?? null;

    return (
      <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
        <section className="mx-auto max-w-md">
          <h1 className="text-2xl font-bold">
            Το προϊόν υπάρχει ήδη
          </h1>

          <div className="mt-5 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-5">
            <p className="text-sm text-emerald-300">
              Σαρώθηκε ξανά
            </p>

            <p className="mt-2 text-lg font-bold">
              {existingItem.productName ||
                "Νέο προϊόν"}
            </p>

            <p className="mt-1 break-all text-sm text-slate-400">
              {existingItem.barcode}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {scanDate}
            </p>

            {scoreValue !== null && (
              <p className="mt-3 inline-block rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-bold text-emerald-200">
                Βαθμολογία {scoreValue}
              </p>
            )}

            {existingItem.analysis &&
              scoreValue === null && (
                <p className="mt-3 text-sm text-slate-400">
                  Η προηγούμενη ανάλυση δεν είχε
                  επαρκή στοιχεία.
                </p>
              )}

            {!existingItem.analysis && (
              <p className="mt-3 text-sm text-slate-400">
                Δεν έχει γίνει ακόμη ανάλυση.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              navigate(
                `/product/${existingItem.id}`,
              )
            }
            className="mt-5 h-14 w-full rounded-xl bg-emerald-500 font-bold text-slate-950"
          >
            Προβολή καταχώρησης
          </button>

          <button
            type="button"
            onClick={() => {
              const value = existingItem.barcode;
              setExistingItem(null);
              continueWithBarcode(value);
            }}
            className="mt-3 h-12 w-full rounded-xl border border-slate-700 font-semibold"
          >
            Νέα καταχώρηση ίδιου προϊόντος
          </button>

          <button
            type="button"
            onClick={() => {
              setExistingItem(null);
              setBarcode("");
              startScanner();
            }}
            className="mt-3 h-12 w-full rounded-xl border border-slate-700 font-semibold"
          >
            Σάρωση άλλου προϊόντος
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <section className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mb-5 text-sm font-medium text-green-400"
        >
          Επιστροφή
        </button>

        <h1 className="text-3xl font-bold">
          Σάρωση προϊόντος
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          Τοποθέτησε το barcode μέσα στο πλαίσιο
          και κράτησε την κάμερα σταθερή.
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
            {error
              ? "Δοκιμή ξανά"
              : "Άνοιγμα κάμερας"}
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
              onClick={() =>
                handleBarcode(barcode)
              }
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
            onChange={(event) =>
              setBarcode(event.target.value)
            }
            placeholder="π.χ. 0000000000000"
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-4 text-white outline-none focus:border-green-500"
          />

          <button
            type="button"
            onClick={() => handleBarcode(barcode)}
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
