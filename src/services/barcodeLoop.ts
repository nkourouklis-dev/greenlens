// Live barcode decoding over an already-playing <video>.
//
// The shared camera stream is requested at up to 4K for label OCR. Feeding
// full 4K frames to ZXing (what decodeFromVideoElement does) blocks the main
// thread for hundreds of ms per frame on Android: the scan never succeeds and
// the UI (the scan-line animation) freezes. So frames are downscaled onto a
// small canvas first, and the browser's native BarcodeDetector is preferred
// where it exists (Chrome on Android), falling back to ZXing otherwise.

export interface BarcodeLoopControls {
  stop: () => void;
}

interface NativeBarcodeDetector {
  detect: (
    source: CanvasImageSource,
  ) => Promise<Array<{ rawValue: string }>>;
}

interface NativeBarcodeDetectorCtor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
}

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "itf",
];

// Longest side of the frame handed to the decoder. 1D barcodes stay readable
// at this size and a decode takes a few ms instead of hundreds.
const MAX_DECODE_SIDE = 1024;

// ~8 attempts a second: plenty for a steady barcode, leaves the main thread
// free for rendering.
const FRAME_INTERVAL_MS = 120;

export async function startBarcodeLoop(
  video: HTMLVideoElement,
  onResult: (text: string) => void,
): Promise<BarcodeLoopControls> {
  const NativeCtor = (
    window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }
  ).BarcodeDetector;

  let native: NativeBarcodeDetector | null = null;

  if (NativeCtor) {
    try {
      native = new NativeCtor({ formats: NATIVE_FORMATS });
    } catch {
      native = null;
    }
  }

  let zxingReader: {
    decodeFromCanvas: (canvas: HTMLCanvasElement) => { getText(): string };
  } | null = null;

  if (!native) {
    const [{ BrowserMultiFormatReader }, core] = await Promise.all([
      import("@zxing/browser"),
      import("@zxing/library"),
    ]);

    const hints = new Map();

    hints.set(core.DecodeHintType.POSSIBLE_FORMATS, [
      core.BarcodeFormat.EAN_13,
      core.BarcodeFormat.EAN_8,
      core.BarcodeFormat.UPC_A,
      core.BarcodeFormat.UPC_E,
      core.BarcodeFormat.CODE_128,
      core.BarcodeFormat.ITF,
    ]);
    hints.set(core.DecodeHintType.TRY_HARDER, true);

    zxingReader = new BrowserMultiFormatReader(hints);
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick() {
    if (stopped) return;

    try {
      if (
        ctx &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        const scale = Math.min(
          1,
          MAX_DECODE_SIDE / Math.max(video.videoWidth, video.videoHeight),
        );

        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        let text = "";

        if (native) {
          const found = await native.detect(canvas);
          text = found[0]?.rawValue ?? "";
        } else if (zxingReader) {
          try {
            text = zxingReader.decodeFromCanvas(canvas).getText();
          } catch {
            // NotFoundException: no barcode in this frame.
          }
        }

        if (!stopped && text) {
          onResult(text);
        }
      }
    } catch (error) {
      console.error("barcode_loop_frame_failed", error);
    }

    if (!stopped) {
      timer = setTimeout(tick, FRAME_INTERVAL_MS);
    }
  }

  timer = setTimeout(tick, 0);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
