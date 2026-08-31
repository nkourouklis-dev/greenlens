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
      `/ingredients-photo?barcode=${encodeURIComponent(
        cleanBarcode,
      )}`,
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
      <main className="min-h-screen bg-slate-950 px-4 pb-28 pt-5 text-white">
        <section className="mx-auto max-w-md">
          <button
            type="button"
            onClick={() => {
              setExistingItem(null);
              setBarcode("");
              startScanner();
            }}
            className="mb-4 inline-flex min-h-10 items-center text-sm font-semibold text-emerald-400"
          >
            ← Πίσω στη σάρωση
          </button>

          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">
            Υπάρχουσα καταχώρηση
          </p>

          <h1 className="mt-1 text-2xl font-bold">
            Το προϊόν υπάρχει ήδη
          </h1>

          <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-300">
                  Σαρώθηκε ξανά
                </p>

                <p className="mt-1 truncate text-lg font-bold">
                  {existingItem.productName ||
                    "Νέο προϊόν"}
                </p>
              </div>

              {scoreValue !== null && (
                <div className="shrink-0 rounded-xl bg-emerald-500/15 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-300">
                    Score
                  </p>

                  <p className="text-lg font-bold text-emerald-100">
                    {scoreValue}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-3 border-t border-slate-700/70 pt-3">
              <p className="break-all font-mono text-sm text-slate-300">
                {existingItem.barcode}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {scanDate}
              </p>
            </div>

            {existingItem.analysis &&
              scoreValue === null && (
                <p className="mt-3 rounded-xl bg-slate-900/60 p-3 text-sm leading-5 text-slate-300">
                  Η προηγούμενη ανάλυση δεν είχε
                  επαρκή στοιχεία.
                </p>
              )}

            {!existingItem.analysis && (
              <p className="mt-3 rounded-xl bg-slate-900/60 p-3 text-sm leading-5 text-slate-300">
                Δεν έχει γίνει ακόμη ανάλυση.
              </p>
            )}
          </div>

          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/product/${existingItem.id}`,
                )
              }
              className="h-14 w-full rounded-2xl bg-emerald-500 px-5 text-base font-bold text-slate-950 transition active:scale-[0.98]"
            >
              Προβολή καταχώρησης
            </button>

            <button
              type="button"
              onClick={() => {
                const value =
                  existingItem.barcode;

                setExistingItem(null);
                continueWithBarcode(value);
              }}
              className="h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 transition active:scale-[0.98]"
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
              className="h-12 w-full rounded-xl px-4 text-sm font-semibold text-slate-300 transition active:bg-slate-900"
            >
              Σάρωση άλλου προϊόντος
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-28 pt-4 text-white">
      <section className="mx-auto max-w-md">
        <header className="mb-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex min-h-10 items-center text-sm font-semibold text-emerald-400"
          >
            ← Επιστροφή
          </button>

          <div className="mt-1">
            <h1 className="text-2xl font-bold">
              Σάρωση προϊόντος
            </h1>

            <p className="mt-1 text-sm leading-5 text-slate-300">
              Βάλε το barcode μέσα στο πλαίσιο και
              κράτησε την κάμερα σταθερή.
            </p>
          </div>
        </header>

        <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-black shadow-lg shadow-black/20">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-[4/5] max-h-[50vh] w-full object-cover"
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-32 w-[82%] rounded-xl border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,0.42)]">
              <div className="absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.75)]" />
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
            {isScanning
              ? "Αναζήτηση barcode..."
              : "Η κάμερα είναι κλειστή"}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm leading-5 text-red-100"
          >
            {error}
          </div>
        )}

        {barcode && (
          <div className="mt-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
              Το barcode αναγνωρίστηκε
            </p>

            <p className="mt-1 break-all font-mono text-xl font-bold">
              {barcode}
            </p>

            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() =>
                  handleBarcode(barcode)
                }
                className="h-12 w-full rounded-xl bg-emerald-500 px-4 font-bold text-slate-950 transition active:scale-[0.98]"
              >
                Συνέχεια
              </button>

              <button
                type="button"
                onClick={startScanner}
                className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100"
              >
                Νέα σάρωση
              </button>
            </div>
          </div>
        )}

        {!isScanning && !barcode && (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <label
              htmlFor="manual-barcode"
              className="text-sm font-semibold text-slate-200"
            >
              Χειροκίνητη εισαγωγή
            </label>

            <p className="mt-1 text-xs leading-5 text-slate-400">
              Χρησιμοποίησέ την αν η κάμερα δεν
              αναγνωρίζει το barcode.
            </p>

            <div className="mt-3 flex gap-2">
              <input
                id="manual-barcode"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={barcode}
                onChange={(event) =>
                  setBarcode(event.target.value)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    barcode.trim()
                  ) {
                    handleBarcode(barcode);
                  }
                }}
                placeholder="π.χ. 0000000000000"
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />

              <button
                type="button"
                onClick={() =>
                  handleBarcode(barcode)
                }
                disabled={!barcode.trim()}
                aria-label="Συνέχεια με barcode"
                className="h-12 shrink-0 rounded-xl bg-emerald-500 px-4 font-bold text-slate-950 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                Συνέχεια
              </button>
            </div>
          </div>
        )}
      </section>

      {!barcode && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
          <div className="mx-auto max-w-md">
            {isScanning ? (
              <button
                type="button"
                onClick={stopScanner}
                className="h-12 w-full rounded-xl border border-slate-600 bg-slate-800 px-5 font-semibold text-white transition active:scale-[0.98]"
              >
                Διακοπή σάρωσης
              </button>
            ) : (
              <button
                type="button"
                onClick={startScanner}
                className="h-14 w-full rounded-xl bg-emerald-500 px-5 text-base font-bold text-slate-950 transition active:scale-[0.98]"
              >
                {error
                  ? "Δοκιμή ξανά"
                  : "Άνοιγμα κάμερας"}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}