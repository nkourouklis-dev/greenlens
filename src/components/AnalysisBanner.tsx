import { useEffect } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  dismissAnalysisNotice,
  useAnalysisJobs,
} from "../services/analysisJobs";

const NOTICE_MS = 8000;

// Sits in the header row next to the back button. Shows what the background
// analyses are doing so the user can keep scanning: how many are running,
// then "ready" / "failed" for each one as it finishes.
export default function AnalysisBanner() {
  const jobs = useAnalysisJobs();
  const navigate = useNavigate();
  const location = useLocation();

  // The product page you are looking at already shows its own loading state
  // and result, so the banner only speaks about the others.
  const viewing = (itemId: string) =>
    location.pathname === `/product/${itemId}`;
  const running = jobs.running.filter((itemId) => !viewing(itemId));
  const notices = jobs.notices.filter((entry) => !viewing(entry.itemId));

  const notice = notices[0];

  useEffect(() => {
    for (const entry of jobs.notices) {
      if (viewing(entry.itemId)) dismissAnalysisNotice(entry.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.notices, location.pathname]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(
      () => dismissAnalysisNotice(notice.key),
      NOTICE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [notice]);

  // The waiting page and the admin screens have their own feedback.
  if (
    location.pathname.endsWith("/analysis") ||
    location.pathname.startsWith("/admin")
  ) {
    return null;
  }

  const base =
    "fixed right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-11 items-center gap-2 rounded-full border border-line-subtle bg-surface/95 px-4 text-sm font-semibold text-ink shadow-md backdrop-blur transition active:scale-95";
  const position =
    location.pathname === "/" ? "left-4" : "left-[4.25rem]";

  if (notice) {
    const failed = notice.kind === "failed";
    return (
      <button
        type="button"
        role="status"
        onClick={() => {
          dismissAnalysisNotice(notice.key);
          navigate(`/product/${notice.itemId}`);
        }}
        className={`${base} ${position}`}
      >
        {failed ? (
          <TriangleAlert size={18} className="shrink-0 text-amber-500" />
        ) : (
          <Check size={18} className="shrink-0 text-emerald-600" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">
          {failed
            ? `Η ανάλυση απέτυχε · ${notice.title}`
            : `Έτοιμο · ${notice.title}`}
        </span>
        {!failed && notice.score != null && (
          <span className="shrink-0 font-extrabold text-emerald-600">
            {notice.score}
          </span>
        )}
      </button>
    );
  }

  if (running.length === 0) return null;

  return (
    <button
      type="button"
      role="status"
      onClick={() => navigate("/history")}
      className={`${base} ${position}`}
    >
      <Loader2 size={18} className="shrink-0 animate-spin text-accent-strong" />
      <span className="truncate">
        {running.length === 1
          ? "Αναλύεται 1 προϊόν…"
          : `Αναλύονται ${running.length} προϊόντα…`}
      </span>
    </button>
  );
}
