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

interface CameraContextValue {
  isActive: boolean;
  error: string;
  start: () => Promise<void>;
  stop: () => void;
  attachViewport: (node: HTMLDivElement | null) => void;
  captureFrame: () => Promise<File | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
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
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });

        streamRef.current = stream;

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

  const captureFrame = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) =>
          resolve(
            blob
              ? new File([blob], "capture.jpg", { type: "image/jpeg" })
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
