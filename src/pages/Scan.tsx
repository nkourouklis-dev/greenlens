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
import { checkCachedProduct } from "../services/analysisClient";
import { refreshFromCatalogue } from "../services/catalogueRefresh";
import { buildAnalysisRecord } from "../services/analysisRecord";
import ManualBarcodeInput from "../components/ManualBarcodeInput";
import CameraScreen from "../components/CameraScreen";
import { Keyboard, ScanLine } from "lucide-react";
import type { ScanHistoryItem } from "../types";
import { useCameraViewport } from "../contexts/CameraContext";

// How many consecutive frame decodes must agree on the same value before a
// camera-scanned barcode is accepted. A single frame can misread digits
// (e.g. warped/blurred bars) and still land on a value that happens to
// pass EAN-13 checksum validation, so checksum alone can't catch this —
// requiring a short run of identical reads does, at the cost of a few
// extra frames' worth of latency (imperceptible at typical decode rates
// once the barcode is steady in frame).
const REQUIRED_CONSECUTIVE_MATCHES = 3;

export default function Scan() {
  const {
    containerRef,
    isActive: isCameraActive,
    error: cameraError,
    start: startCamera,
    stop: stopCamera,
    videoRef,
    videoElement,
  } = useCameraViewport();

  const codeReaderRef =
    useRef<BrowserMultiFormatReader | null>(null);

  const controlsRef =
    useRef<IScannerControls | null>(null);

  const decodeStartingRef = useRef(false);
  const detectedRef = useRef(false);
  const scanRunRef = useRef(0);

  // Tracks the current run of consecutive successful decodes that all
  // agree on the same value. A live 1D scan attempts many frames a second;
  // a single misread frame can still pass EAN-13 checksum validation (a
  // corrupted-but-checksum-consistent read), so accepting on the very
  // first decode is not reliable — see REQUIRED_CONSECUTIVE_MATCHES below.
  const pendingBarcodeRef =
    useRef<{ value: string; count: number } | null>(
      null,
    );

  const [barcode, setBarcode] = useState("");
  // Separate from `barcode` on purpose: `barcode` means "a camera scan
  // detected/confirmed this value" and controls the green success card
  // below. Wiring the manual <input> to that same state made it flip to
  // the success-card branch (which unmounts the input) after the very
  // first keystroke, so it looked like the field stopped accepting input.
  const [manualBarcode, setManualBarcode] =
    useState("");
  const [decodeError, setDecodeError] = useState("");

  // Whether the decode loop (not the camera hardware) is actively looking
  // for a barcode. The stream itself is owned by CameraContext and keeps
  // running across the whole flow; this only tracks the scanning loop.
  const [isScanning, setIsScanning] =
    useState(false);

  // Set when the person chose to type the barcode (camera turned off), so
  // "camera off" reads as a choice, not as a camera still starting up.
  const [isPaused, setIsPaused] = useState(false);

  const [existingItem, setExistingItem] =
    useState<ScanHistoryItem | null>(null);

  const navigate = useNavigate();

  // A barcode already saved on this phone is shown from the saved copy, which
  // may predate the catalogue's current score; check, and show the current one.
  const existingId = existingItem?.id;

  useEffect(() => {
    if (!existingItem) {
      return;
    }

    let cancelled = false;

    void refreshFromCatalogue(existingItem).then((updated) => {
      if (updated && !cancelled) {
        setExistingItem(updated);
      }
    });

    return () => {
      cancelled = true;
    };
    // Keyed on the item's identity: a refresh replaces the item and must not
    // trigger another one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingId]);

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
    pendingBarcodeRef.current = null;

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

            const pending = pendingBarcodeRef.current;

            if (pending && pending.value === scannedBarcode) {
              pending.count += 1;
            } else {
              pendingBarcodeRef.current = {
                value: scannedBarcode,
                count: 1,
              };
            }

            if (
              (pendingBarcodeRef.current?.count ?? 0) <
              REQUIRED_CONSECUTIVE_MATCHES
            ) {
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
    setIsPaused(true);
    stopDecoding();
    stopCamera();
  }

  async function resumeScanning() {
    setIsPaused(false);
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

  async function continueWithBarcode(value: string) {
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

    // Shared product cache: this barcode may already have a complete
    // analysis on file (from anyone's earlier scan), regardless of whether
    // it got here via the camera or manual entry — both call this same
    // function. A miss (including any network/parsing issue —
    // checkCachedProduct never throws) falls straight through to the
    // normal "photograph the ingredients" flow below, unchanged.
    const cached =
      await checkCachedProduct(cleanBarcode);

    if (
      cached &&
      cached.result.contentCategory !== "unknown"
    ) {
      const id = crypto.randomUUID();

      // Name, photo and ingredient text all come from the catalogue, not
      // from this scan — the point of a cache hit is that nobody has to
      // photograph or retype what someone already contributed.
      const historyItem: ScanHistoryItem = {
        id,
        barcode: cleanBarcode,
        status: "known",
        scannedAt: new Date().toISOString(),
        ...(cached.productName
          ? { productName: cached.productName }
          : {}),
        ...(cached.photoUrl ? { productPhoto: cached.photoUrl } : {}),
        ...(cached.sourceText
          ? {
              ocrRawText: cached.sourceText,
              userCorrectedText: cached.sourceText,
            }
          : {}),
      };

      const analysis = buildAnalysisRecord(
        cached.result,
        id,
        historyItem,
        cached.sourceText,
        [],
        cached.result.score.confidence,
      );

      saveHistoryItem({
        ...historyItem,
        productId: id,
        analysis,
      });

      navigate(`/product/${id}`);
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
  // Re-runs when the <video> node itself changes: the shared element is
  // re-parented into this page's viewport a render after mount, and a
  // decoder bound to the old (detached) node would look at a dead frame.
  useEffect(() => {
    if (isCameraActive && videoElement) {
      stopDecoding();
      startDecoding();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraActive, videoElement]);

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
                setManualBarcode("");
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
    <CameraScreen
      viewportRef={containerRef}
      label="Σάρωση barcode"
      guide="barcode"
      scanning={isScanning && !barcode}
      hint={
        barcode
          ? null
          : isScanning
            ? "Αναζήτηση barcode..."
            : isCameraActive
              ? "Η σάρωση είναι σε παύση"
              : null
      }
      placeholder={
        isCameraActive ? null : (
          <p>
            {cameraError
              ? "Η κάμερα δεν είναι διαθέσιμη. Πληκτρολόγησε το barcode."
              : isPaused
                ? "Η κάμερα είναι κλειστή."
                : "Άνοιγμα κάμερας..."}
          </p>
        )
      }
    >
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-950/40 p-2.5 text-xs leading-5 text-red-100"
        >
          {error}
        </p>
      )}

      {barcode ? (
        <>
          <div>
            <p className="text-xs font-semibold text-accent-strong">
              Το barcode αναγνωρίστηκε
            </p>
            <p className="mt-0.5 break-all text-xl font-bold tabular-nums tracking-wide">
              {barcode}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleBarcode(barcode)}
            className="h-12 w-full rounded-xl bg-accent px-5 text-base font-bold text-on-accent transition active:scale-[0.99]"
          >
            Συνέχεια
          </button>

          <button
            type="button"
            onClick={startDecoding}
            className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink"
          >
            Νέα σάρωση
          </button>
        </>
      ) : !isPaused && !error ? (
        <>
          <div>
            <h1 className="text-lg font-bold leading-tight">
              Σάρωσε το barcode
            </h1>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-muted [@media(max-height:700px)]:hidden">
              Βάλε το barcode μέσα στο πλαίσιο. Η αναγνώριση γίνεται
              αυτόματα.
            </p>
          </div>

          <button
            type="button"
            onClick={pauseScanning}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink"
          >
            <Keyboard size={16} />
            Πληκτρολόγηση barcode
          </button>
        </>
      ) : (
        <>
          <ManualBarcodeInput
            value={manualBarcode}
            onChange={setManualBarcode}
            onSubmit={handleBarcode}
            label="Πληκτρολόγηση barcode"
            hint=""
          />

          <button
            type="button"
            onClick={resumeScanning}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink"
          >
            <ScanLine size={16} />
            {error ? "Δοκιμή ξανά" : "Σάρωση με κάμερα"}
          </button>
        </>
      )}
    </CameraScreen>
  );
}
