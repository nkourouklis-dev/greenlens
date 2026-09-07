import { useEffect, useRef, useState } from "react";
import type {
  BrowserMultiFormatReader,
  IScannerControls,
} from "@zxing/browser";
import { useNavigate } from "react-router-dom";
import { findProductByBarcode } from "../data/productRepository";
import {
  findByBarcode,
  saveHistoryItem,
} from "../services/historyService";
import type { ScanHistoryItem } from "../types";
import { useCameraViewport } from "../contexts/CameraContext";

export default function Scan() {
  const {
    containerRef,
    isActive: isCameraActive,
    error: cameraError,
    start: startCamera,
    stop: stopCamera,
    videoRef,
  } = useCameraViewport();

  const codeReaderRef =
    useRef<BrowserMultiFormatReader | null>(null);

  const controlsRef =
    useRef<IScannerControls | null>(null);

  const decodeStartingRef = useRef(false);
  const detectedRef = useRef(false);
  const scanRunRef = useRef(0);

  const [barcode, setBarcode] = useState("");
  const [decodeError, setDecodeError] = useState("");

  // Whether the decode loop (not the camera hardware) is actively looking
  // for a barcode. The stream itself is owned by CameraContext and keeps
  // running across the whole flow; this only tracks the scanning loop.
  const [isScanning, setIsScanning] =
    useState(false);

  const [existingItem, setExistingItem] =
    useState<ScanHistoryItem | null>(null);

  const navigate = useNavigate();

  const error = cameraError || decodeError;

  async function startDecoding() {
    if (
      !videoRef.current ||
      decodeStartingRef.current ||
      controlsRef.current
    ) {
      return;
    }

    const scanRun = scanRunRef.current + 1;

    scanRunRef.current = scanRun;
    decodeStartingRef.current = true;
    detectedRef.current = false;

    setDecodeError("");
    setBarcode("");
    setExistingItem(null);
    setIsScanning(true);

    try {
      if (!codeReaderRef.current) {
        const { BrowserMultiFormatReader } = await import(
          "@zxing/browser"
        );

        codeReaderRef.current =
          new BrowserMultiFormatReader();
      }

      // decodeFromVideoElement scans an existing, already-playing video
      // element and never touches its MediaStream — unlike
      // decodeFromConstraints/decodeFromStream, controls.stop() here only
      // stops the scan loop, so the shared camera stream survives.
      const controls =
        await codeReaderRef.current.decodeFromVideoElement(
          videoRef.current,
          (result) => {
            if (
              scanRun !== scanRunRef.current ||
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

            stopDecoding();
            handleBarcode(scannedBarcode);
          },
        );

      if (scanRun !== scanRunRef.current) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
    } catch (decodeErr) {
      if (scanRun !== scanRunRef.current) {
        return;
      }

      console.error(decodeErr);

      setDecodeError(
        "Δεν ήταν δυνατή η ανάγνωση από την κάμερα.",
      );

      setIsScanning(false);
    } finally {
      if (scanRun === scanRunRef.current) {
        decodeStartingRef.current = false;
      }
    }
  }

  function stopDecoding() {
    scanRunRef.current += 1;
    decodeStartingRef.current = false;

    controlsRef.current?.stop();
    controlsRef.current = null;

    setIsScanning(false);
  }

  // Explicit in-page toggle ("Διακοπή σάρωσης"): unlike navigating between
  // flow steps, this is a deliberate request to turn the camera off, so it
  // stops the actual hardware, not just the decode loop.
  function pauseScanning() {
    stopDecoding();
    stopCamera();
  }

  async function resumeScanning() {
    setDecodeError("");
    await startCamera();
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
      `/add-product?barcode=${encodeURIComponent(
        cleanBarcode,
      )}`,
    );
  }

  // The shared camera stream is started by useCameraViewport(). Once it is
  // ready (or if it was already running from a previous step), (re)start
  // the decode loop. On unmount, only the decode loop is torn down — the
  // stream itself keeps running for the next step in the flow.
  useEffect(() => {
    if (isCameraActive) {
      startDecoding();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraActive]);

  useEffect(() => {
    return stopDecoding;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (existingItem) {
    const scanDate = new Date(
      existingItem.scannedAt,
    ).toLocaleString("el-GR");

    const scoreValue =
      existingItem.analysis?.score.score ?? null;

    return (
      <main className="min-h-screen bg-canvas px-4 pb-28 pt-5 text-ink">
        <section className="mx-auto max-w-md">
          <button
            type="button"
            onClick={() => {
              setExistingItem(null);
              setBarcode("");
              startDecoding();
            }}
            className="mb-4 inline-flex min-h-10 items-center text-sm font-semibold text-accent-strong"
          >
            ← Πίσω στη σάρωση
          </button>

          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-strong">
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

            <div className="mt-3 border-t border-line/70 pt-3">
              <p className="break-all font-mono text-sm text-ink-muted">
                {existingItem.barcode}
              </p>

              <p className="mt-1 text-xs text-ink-faintest">
                {scanDate}
              </p>
            </div>

            {existingItem.analysis &&
              scoreValue === null && (
                <p className="mt-3 rounded-xl bg-surface/60 p-3 text-sm leading-5 text-ink-muted">
                  Η προηγούμενη ανάλυση δεν είχε
                  επαρκή στοιχεία.
                </p>
              )}

            {!existingItem.analysis && (
              <p className="mt-3 rounded-xl bg-surface/60 p-3 text-sm leading-5 text-ink-muted">
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
              className="h-14 w-full rounded-2xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.98]"
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
              className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink-muted transition active:scale-[0.98]"
            >
              Νέα καταχώρηση ίδιου προϊόντος
            </button>

            <button
              type="button"
              onClick={() => {
                setExistingItem(null);
                setBarcode("");
                startDecoding();
              }}
              className="h-12 w-full rounded-xl px-4 text-sm font-semibold text-ink-muted transition active:bg-surface"
            >
              Σάρωση άλλου προϊόντος
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-4 pb-28 pt-4 text-ink">
      <section className="mx-auto max-w-md">
        <header className="mb-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex min-h-10 items-center text-sm font-semibold text-accent-strong"
          >
            ← Επιστροφή
          </button>

          <div className="mt-1">
            <h1 className="text-2xl font-bold">
              Σάρωση προϊόντος
            </h1>

            <p className="mt-1 text-sm leading-5 text-ink-muted">
              Βάλε το barcode μέσα στο πλαίσιο και
              κράτησε την κάμερα σταθερή.
            </p>
          </div>
        </header>

        {/* Same aspect-ratio/max-height fix as PhotoCapture.tsx: capping
            height directly leaves width at w-full, so the box silently
            renders wider/shorter than 4/5 on short viewports. Capping
            width instead (50vh * 4/5) keeps it genuinely 4/5 at any
            height, matching the border frame the barcode is aimed at. */}
        <div className="relative mx-auto aspect-[4/5] w-full max-w-[40vh] overflow-hidden rounded-2xl border border-line bg-black shadow-lg shadow-black/20">
          <div
            ref={containerRef}
            className="h-full w-full [&>video]:h-full [&>video]:w-full [&>video]:object-cover"
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
                className="h-12 w-full rounded-xl bg-accent px-4 font-bold text-on-accent transition active:scale-[0.98]"
              >
                Συνέχεια
              </button>

              <button
                type="button"
                onClick={startDecoding}
                className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink-muted"
              >
                Νέα σάρωση
              </button>
            </div>
          </div>
        )}

        {!isScanning && !barcode && (
          <div className="mt-4 rounded-2xl border border-line-subtle bg-surface/70 p-4">
            <label
              htmlFor="manual-barcode"
              className="text-sm font-semibold text-ink-muted"
            >
              Χειροκίνητη εισαγωγή
            </label>

            <p className="mt-1 text-xs leading-5 text-ink-faint">
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
                className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-base text-ink outline-none transition placeholder:text-ink-faintest focus:border-accent focus:ring-2 focus:ring-accent/20"
              />

              <button
                type="button"
                onClick={() =>
                  handleBarcode(barcode)
                }
                disabled={!barcode.trim()}
                aria-label="Συνέχεια με barcode"
                className="h-12 shrink-0 rounded-xl bg-accent px-4 font-bold text-on-accent transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint"
              >
                Συνέχεια
              </button>
            </div>
          </div>
        )}
      </section>

      {!barcode && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line-subtle bg-canvas/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
          <div className="mx-auto max-w-md">
            {isScanning ? (
              <button
                type="button"
                onClick={pauseScanning}
                className="h-12 w-full rounded-xl border border-line bg-surface-muted px-5 font-semibold text-ink transition active:scale-[0.98]"
              >
                Διακοπή σάρωσης
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeScanning}
                className="h-14 w-full rounded-xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.98]"
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
