import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

// Routes that make up the barcode -> ingredients -> product-photo capture
// flow. The camera stream is allowed to stay alive while navigating between
// these; leaving all of them (Home, History, Product, analysis...) is what
// "exiting the flow" means, and is the only time we release the hardware.
const SCAN_FLOW_PATHS = [
  "/scan",
  "/add-product",
  "/ingredients-photo",
  "/ingredients-review",
  "/product-photo",
];

function isScanFlowPath(pathname: string): boolean {
  return SCAN_FLOW_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export interface CapturedPhoto {
  file: File;
  /**
   * Cheap, approximate sharpness signal — never a hard gate. A photo
   * flagged blurry is still usable; the caller just gets to nudge the user
   * toward retaking it before spending an OCR/API call on it.
   */
  isBlurry: boolean;
}

interface CameraContextValue {
  isActive: boolean;
  error: string;
  start: () => Promise<void>;
  stop: () => void;
  attachViewport: (node: HTMLDivElement | null) => void;
  captureFrame: () => Promise<CapturedPhoto | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
}

// Below this, a frame is flagged as likely blurry. Measures variance of the
// gradient magnitude on a coarse grid — a sharp, in-focus label has strong
// edges (high variance); an out-of-focus or motion-blurred shot is closer
// to a flat gradient (low variance). Threshold picked conservatively (only
// flags clearly soft frames) since it isn't calibrated against real device
// cameras — tune if it proves noisy in practice.
const BLUR_VARIANCE_THRESHOLD = 15;

// Exported so PhotoCapture.tsx can reuse the same gradient-variance metric
// for its live "too far to read" framing hint — same signal, sampled more
// often and at lower resolution while the user is still aiming.
export function estimateSharpness(
  imageData: ImageData,
): number {
  const { data, width, height } = imageData;
  const stride = Math.max(
    1,
    Math.floor(Math.min(width, height) / 200),
  );

  const gray = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (
      0.299 * data[i] +
      0.587 * data[i + 1] +
      0.114 * data[i + 2]
    );
  };

  let sum = 0;
  let sumSquares = 0;
  let count = 0;

  for (
    let y = stride;
    y < height - stride;
    y += stride
  ) {
    for (
      let x = stride;
      x < width - stride;
      x += stride
    ) {
      const gx = gray(x + 1, y) - gray(x - 1, y);
      const gy = gray(x, y + 1) - gray(x, y - 1);
      const magnitude = Math.sqrt(gx * gx + gy * gy);

      sum += magnitude;
      sumSquares += magnitude * magnitude;
      count += 1;
    }
  }

  if (count === 0) return 0;

  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

// Downscaled thumbnail of exactly what was drawn to the capture canvas,
// logged alongside the geometry that produced it. This is the ground
// truth for "what did the camera actually capture" — independent of what
// OCR reports afterwards, so a bad OCR read can be told apart from a bad
// capture.
const CAPTURE_DEBUG_THUMBNAIL_WIDTH = 240;

function logCaptureDebug(
  sourceCanvas: HTMLCanvasElement,
  geometry: {
    videoWidth: number;
    videoHeight: number;
    displayWidth: number;
    displayHeight: number;
    sourceX: number;
    sourceY: number;
    sourceWidth: number;
    sourceHeight: number;
  },
): void {
  try {
    const thumbnailHeight = Math.round(
      (CAPTURE_DEBUG_THUMBNAIL_WIDTH * sourceCanvas.height) /
        sourceCanvas.width,
    );

    const thumbnailCanvas = document.createElement("canvas");
    thumbnailCanvas.width = CAPTURE_DEBUG_THUMBNAIL_WIDTH;
    thumbnailCanvas.height = thumbnailHeight;

    const thumbnailCtx = thumbnailCanvas.getContext("2d");
    thumbnailCtx?.drawImage(
      sourceCanvas,
      0,
      0,
      CAPTURE_DEBUG_THUMBNAIL_WIDTH,
      thumbnailHeight,
    );

    console.info("camera_capture_debug", {
      ...geometry,
      capturedWidth: sourceCanvas.width,
      capturedHeight: sourceCanvas.height,
      thumbnailDataUrl: thumbnailCanvas.toDataURL("image/jpeg", 0.6),
    });
  } catch (loggingError) {
    console.error("camera_capture_debug_failed", loggingError);
  }
}

// `focusMode` is a real, shipping capability (Chrome/Android; part of the
// Media Capture "Image Capture" extensions) but missing from this TS
// version's DOM lib types. An unsupported entry inside `advanced` is
// simply ignored by the browser per spec — never a rejected constraint —
// so requesting it costs nothing on a browser that doesn't understand it.
interface ExtendedTrackConstraintSet
  extends MediaTrackConstraintSet {
  focusMode?: "continuous" | "single-shot" | "manual" | "none";
}

// Continuous autofocus matters most for this stream: it's shared between
// framing a static photo (where the user consciously holds still) and the
// live barcode decode loop below, which needs the lens to keep adjusting
// on its own while frames are captured in quick succession.
const CONTINUOUS_FOCUS: ExtendedTrackConstraintSet = {
  focusMode: "continuous",
};

// Highest-resolution attempt first, then a widely-supported fallback, then
// no resolution constraint at all (today's behaviour) as a last resort.
// "ideal" constraints don't normally throw even when unmet — the browser
// just picks the closest supported resolution — but a small, defensive
// staircase costs nothing and protects against stricter browsers/devices
// that do reject a constraint they can't satisfy.
const CAMERA_CONSTRAINT_ATTEMPTS: MediaStreamConstraints[] = [
  {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      advanced: [CONTINUOUS_FOCUS],
    },
  },
  {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [CONTINUOUS_FOCUS],
    },
  },
  {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      advanced: [CONTINUOUS_FOCUS],
    },
  },
];

async function requestCameraStream(): Promise<MediaStream> {
  let lastError: unknown = null;

  for (const constraints of CAMERA_CONSTRAINT_ATTEMPTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (caughtError) {
      lastError = caughtError;
    }
  }

  throw (
    lastError ??
    new Error("Δεν ήταν δυνατή η πρόσβαση στην κάμερα.")
  );
}

const CameraContext = createContext<CameraContextValue | null>(null);

export function CameraProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef<Promise<void> | null>(null);

  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [fallbackNode, setFallbackNode] =
    useState<HTMLDivElement | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState("");

  const attachViewport = useCallback(
    (node: HTMLDivElement | null) => {
      setViewport(node);
    },
    [],
  );

  // If the underlying <video> DOM node is ever (re)created, make sure a
  // stream already in progress is reattached to it instead of being lost.
  const setVideoNode = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) {
      setIsActive(true);
      return;
    }
    if (startingRef.current) {
      return startingRef.current;
    }

    const attempt = (async () => {
      setError("");
      try {
        const stream = await requestCameraStream();

        streamRef.current = stream;

        // Diagnostic-only: confirms what resolution the browser actually
        // granted, since "ideal" constraints are a request, not a
        // guarantee — useful to tell "we asked for 4K and got it" apart
        // from "the device capped us lower" when debugging OCR quality.
        const settings = stream.getVideoTracks()[0]?.getSettings();
        console.info("camera_stream_settings", {
          width: settings?.width ?? null,
          height: settings?.height ?? null,
          facingMode: settings?.facingMode ?? null,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        setIsActive(true);
      } catch {
        setError(
          "Δεν ήταν δυνατή η πρόσβαση στην κάμερα. Έλεγξε ότι έχεις δώσει άδεια στον browser.",
        );
        setIsActive(false);
      } finally {
        startingRef.current = null;
      }
    })();

    startingRef.current = attempt;
    return attempt;
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsActive(false);
  }, []);

  const captureFrame = useCallback(async (): Promise<CapturedPhoto | null> => {
    const video = videoRef.current;

    // HAVE_CURRENT_DATA (2): the element has decoded at least one frame at
    // the current playback position. Below that, drawImage() would read a
    // black/blank or stale buffer instead of what's actually on screen.
    if (!video || video.videoWidth === 0 || video.readyState < 2) {
      console.error("camera_capture_not_ready", {
        hasVideo: Boolean(video),
        videoWidth: video?.videoWidth ?? 0,
        videoHeight: video?.videoHeight ?? 0,
        readyState: video?.readyState ?? -1,
      });
      return null;
    }

    // The preview crops the raw camera feed to fit its box (CSS
    // object-cover). Capturing the full, uncropped frame here produced a
    // photo that didn't match what the user framed on screen. Mirror the
    // same "cover" crop — centered, filling the displayed box — so the
    // captured photo is exactly what was visible in the preview.
    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;

    // clientWidth/clientHeight read 0 when the video isn't laid out in the
    // visible viewport yet (e.g. still attached to the off-screen fallback
    // container). Falling back to the raw sensor size here used to
    // silently disable the crop, so the capture no longer matched the
    // on-screen preview at all — better to fail the capture than to
    // produce a mismatched one.
    if (displayWidth === 0 || displayHeight === 0) {
      console.error("camera_capture_no_layout", {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      return null;
    }

    const videoAspect = video.videoWidth / video.videoHeight;
    const displayAspect = displayWidth / displayHeight;

    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;

    if (videoAspect > displayAspect) {
      sourceWidth = video.videoHeight * displayAspect;
      sourceX = (video.videoWidth - sourceWidth) / 2;
    } else if (videoAspect < displayAspect) {
      sourceHeight = video.videoWidth / displayAspect;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }

    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    // Cheap enough to run synchronously on the already-drawn frame — no
    // extra capture or network round trip needed just to flag blur.
    const isBlurry =
      estimateSharpness(
        ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ),
      ) < BLUR_VARIANCE_THRESHOLD;

    // Diagnostic-only: proves what pixels actually reached the canvas,
    // independent of what the OCR step later reports back. Paste
    // thumbnailDataUrl into a browser address bar to view it directly —
    // it's the exact crop drawn above, just downscaled for log size.
    logCaptureDebug(canvas, {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      displayWidth,
      displayHeight,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
    });

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) =>
          resolve(
            blob
              ? {
                  file: new File(
                    [blob],
                    "capture.jpg",
                    { type: "image/jpeg" },
                  ),
                  isBlurry,
                }
              : null,
          ),
        "image/jpeg",
        0.92,
      );
    });
  }, []);

  // Release the camera if the whole app unmounts (teardown/hot reload).
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // The one and only place the stream gets torn down between navigations:
  // once the route is no longer part of the scan flow, the flow is over.
  const location = useLocation();

  useEffect(() => {
    if (!isScanFlowPath(location.pathname)) {
      stop();
    }
  }, [location.pathname, stop]);

  const portalTarget = viewport ?? fallbackNode;

  return (
    <CameraContext.Provider
      value={{
        isActive,
        error,
        start,
        stop,
        attachViewport,
        captureFrame,
        videoRef,
      }}
    >
      {children}

      {/* Always-mounted, off-screen home for the video element so it never
          gets destroyed/recreated between pages registering a viewport. */}
      <div
        ref={setFallbackNode}
        aria-hidden
        style={{
          position: "fixed",
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      />

      {portalTarget &&
        createPortal(
          <video
            ref={setVideoNode}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />,
          portalTarget,
        )}
    </CameraContext.Provider>
  );
}

export function useCamera(): CameraContextValue {
  const ctx = useContext(CameraContext);

  if (!ctx) {
    throw new Error("useCamera must be used within a CameraProvider");
  }

  return ctx;
}

// Convenience hook for pages that show the live camera: registers a
// container as the current video viewport on mount, starts the shared
// stream (a no-op if it is already running), and detaches the viewport
// (without stopping the stream) on unmount.
export function useCameraViewport() {
  const { attachViewport, start, stop, isActive, error, captureFrame, videoRef } =
    useCamera();

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    attachViewport(containerRef.current);
    start();

    return () => {
      attachViewport(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { containerRef, isActive, error, captureFrame, start, stop, videoRef };
}
