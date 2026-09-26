import type { ReactNode, RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { useHideAppChrome } from "../hooks/useAppChrome";

interface CameraScreenProps {
  /** containerRef from useCameraViewport(): the live video is portaled here. */
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Hides the live video (e.g. while a captured photo is shown instead). */
  hideVideo?: boolean;
  /** Centre of the top bar: "Βήμα 1 από 2" with a progress row, or a label. */
  step?: { current: number; total: number };
  label?: string;
  /** Shown as a confirmed chip under the top bar. */
  barcode?: string;
  /**
   * "document" is a tall guide filling the camera area (an ingredients list,
   * a pack front); "barcode" is a short, wide one centred in it.
   */
  guide: "document" | "barcode";
  guideRef?: RefObject<HTMLDivElement | null>;
  /** Animated sweep inside the guide — only while the camera is live. */
  scanning?: boolean;
  /** Short line over the lower edge of the guide; null hides it. */
  hint?: string | null;
  /** Shown inside the guide when there is no live picture (no camera yet). */
  placeholder?: ReactNode;
  /** Drawn over the camera area, above the guide (a captured photo). */
  overlay?: ReactNode;
  /** The bottom sheet's content. */
  children: ReactNode;
}

// Where the guide area starts: below the top bar, and below the barcode
// chip when there is one.
const TOP_WITH_CHIP = "top-[calc(max(0.75rem,env(safe-area-inset-top))+6.25rem)]";
const TOP_WITHOUT_CHIP = "top-[calc(max(0.75rem,env(safe-area-inset-top))+4rem)]";

function GuideCorners() {
  const corner = "absolute h-9 w-9 border-accent";
  return (
    <>
      <span className={`${corner} left-0 top-0 rounded-tl-2xl border-l-4 border-t-4`} />
      <span className={`${corner} right-0 top-0 rounded-tr-2xl border-r-4 border-t-4`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-2xl border-b-4 border-l-4`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-2xl border-b-4 border-r-4`} />
    </>
  );
}

/**
 * The one layout every camera step shares (barcode scan, ingredients photo,
 * front-of-pack photo): the live camera filling the screen, a top bar with
 * back and progress, a framing guide, and a compact bottom sheet. Keeping it
 * in one place is what keeps the three screens looking like one flow.
 *
 * Hides the app's tab bar while mounted — it would sit on the controls.
 */
export default function CameraScreen({
  viewportRef,
  hideVideo = false,
  step,
  label,
  barcode,
  guide,
  guideRef,
  scanning = false,
  hint,
  placeholder,
  overlay,
  children,
}: CameraScreenProps) {
  const navigate = useNavigate();
  useHideAppChrome();

  function goBack() {
    // Opened directly (a shared link, a reload): there is no in-app page to
    // go back to, and navigate(-1) would leave the app.
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }

  const areaTop = barcode ? TOP_WITH_CHIP : TOP_WITHOUT_CHIP;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#0e1411] text-white">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={viewportRef}
          className={`absolute inset-0 [&>video]:h-full [&>video]:w-full [&>video]:object-cover ${hideVideo ? "invisible" : ""}`}
        />

        {/* Darkening behind the top controls so they read on any scene. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent"
        />

        <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              aria-label="Πίσω"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition active:scale-95"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="flex flex-col items-center gap-1.5">
              {step ? (
                <>
                  <p className="text-[13px] font-semibold">
                    Βήμα {step.current} από {step.total}
                  </p>
                  <div className="flex gap-1" aria-hidden>
                    {Array.from({ length: step.total }, (_, index) => (
                      <span
                        key={index}
                        className={`h-1 w-7 rounded-full ${index < step.current ? "bg-accent" : "bg-white/30"}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                label && <p className="text-[15px] font-semibold">{label}</p>
              )}
            </div>

            {/* Keeps the centre text centred against the back button. */}
            <span aria-hidden className="h-11 w-11" />
          </div>

          {barcode && (
            <div className="flex items-center gap-2 self-center rounded-full bg-black/35 py-1 pl-1 pr-3 backdrop-blur">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-on-accent">
                <Check size={12} strokeWidth={3} />
              </span>
              <span className="text-xs text-white/75">Barcode</span>
              <span className="text-xs font-semibold tabular-nums tracking-wide">
                {barcode}
              </span>
            </div>
          )}
        </div>

        {/* Guide area: everything between the top bar and the sheet. */}
        <div className={`pointer-events-none absolute inset-x-0 bottom-8 ${areaTop}`}>
          <div
            ref={guideRef}
            className={
              guide === "document"
                ? "absolute inset-x-5 inset-y-0"
                : "absolute inset-x-8 top-1/2 h-36 -translate-y-1/2"
            }
          >
            {!hideVideo && <GuideCorners />}

            {scanning && !hideVideo && (
              <span
                aria-hidden
                className="gl-scan-line absolute inset-x-4 h-0.5 rounded-full bg-accent shadow-[0_0_12px_2px_var(--color-accent)]"
              />
            )}

            {placeholder && !hideVideo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm leading-5 text-white/75">
                {placeholder}
              </div>
            )}
          </div>

          {hint && !hideVideo && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center px-4">
              <p
                aria-live="polite"
                className="rounded-full bg-black/65 px-3 py-1.5 text-center text-xs font-medium"
              >
                {hint}
              </p>
            </div>
          )}
        </div>

        {overlay && (
          <div className={`absolute inset-x-4 bottom-8 ${areaTop}`}>
            {overlay}
          </div>
        )}
      </div>

      {/* Bottom sheet — kept compact so the camera gets the height. */}
      <div className="relative -mt-6 rounded-t-[24px] bg-canvas px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-ink">
        <div className="mx-auto flex max-w-md flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}
