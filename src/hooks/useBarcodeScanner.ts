import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  BrowserMultiFormatReader,
  IScannerControls,
} from "@zxing/browser";

// Same rule as Scan.tsx: a single frame can misread digits and still pass
// the EAN-13 checksum, so a value is only accepted once this many
// consecutive decodes agree on it.
const REQUIRED_CONSECUTIVE_MATCHES = 3;

// Same range ManualBarcodeInput and the Worker accept.
const VALID_BARCODE = /^\d{8,14}$/;

/**
 * Camera barcode decoding over the shared CameraContext <video>, for pages
 * that need a scan step without the whole Scan.tsx flow (the admin capture
 * screen). Uses decodeFromVideoElement, which reads an already-playing
 * element and never touches its MediaStream, so stopping the scan leaves
 * the camera running for the photos that follow.
 */
export function useBarcodeScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const runRef = useRef(0);
  const pendingRef = useRef<{ value: string; count: number } | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    runRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    pendingRef.current = null;
    setIsScanning(false);
  }, []);

  const start = useCallback(
    async (onDetected: (barcode: string) => void) => {
      const video = videoRef.current;

      if (!video || controlsRef.current) {
        return;
      }

      const run = runRef.current + 1;
      runRef.current = run;
      pendingRef.current = null;
      setError("");
      setIsScanning(true);

      try {
        if (!readerRef.current) {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          readerRef.current = new BrowserMultiFormatReader();
        }

        const controls = await readerRef.current.decodeFromVideoElement(
          video,
          (result) => {
            if (run !== runRef.current || !result) {
              return;
            }

            const value = result.getText().trim();

            if (!VALID_BARCODE.test(value)) {
              return;
            }

            const pending = pendingRef.current;

            if (pending && pending.value === value) {
              pending.count += 1;
            } else {
              pendingRef.current = { value, count: 1 };
            }

            if ((pendingRef.current?.count ?? 0) < REQUIRED_CONSECUTIVE_MATCHES) {
              return;
            }

            stop();
            onDetected(value);
          },
        );

        if (run !== runRef.current) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
      } catch (caughtError) {
        if (run !== runRef.current) {
          return;
        }

        console.error(caughtError);
        setError("Δεν ήταν δυνατή η ανάγνωση από την κάμερα.");
        setIsScanning(false);
      }
    },
    [stop, videoRef],
  );

  useEffect(() => stop, [stop]);

  return { isScanning, error, start, stop };
}
