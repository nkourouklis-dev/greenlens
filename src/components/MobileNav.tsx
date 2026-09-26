import { ArrowLeft, History, Home, ScanLine } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppChromeHidden } from "../hooks/useAppChrome";

const tabs = [
  { path: "/", label: "Αρχική", icon: Home },
  { path: "/scan", label: "Σάρωση", icon: ScanLine },
  { path: "/history", label: "Ιστορικό", icon: History },
];

export default function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.pathname !== "/";
  const chromeHidden = useAppChromeHidden();

  // The camera screens (CameraScreen.tsx) are full-screen with their own
  // back button and controls; the floating nav would sit on the shutter.
  if (chromeHidden) {
    return null;
  }

  return (
    <>
      {canGoBack && <div aria-hidden className="h-[calc(3.75rem+env(safe-area-inset-top))]" />}
      {canGoBack && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Πίσω"
          className="fixed left-4 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full border border-line-subtle bg-surface/90 text-ink shadow-md backdrop-blur transition active:scale-95"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <nav
        aria-label="Κύρια πλοήγηση"
        className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-md rounded-full border border-line-subtle bg-surface/90 p-1.5 shadow-xl shadow-black/10 backdrop-blur"
      >
        <div className="flex items-center justify-around">
          {tabs.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <button
                key={path}
                type="button"
                onClick={() => navigate(path)}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className="flex h-14 w-24 flex-col items-center justify-center gap-0.5 transition active:scale-95"
              >
                {active ? (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg shadow-emerald-500/30">
                    <Icon size={24} />
                  </span>
                ) : (
                  <>
                    <Icon size={22} className="text-ink" />
                    <span className="text-[11px] font-semibold text-ink-faint">{label}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
