import { ArrowLeft, History, Home, ScanLine } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

export default function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const canGoBack = location.pathname !== "/";
  const tabs = [{ path: "/", label: "Αρχική", icon: Home }, { path: "/scan", label: "Σάρωση", icon: ScanLine }, { path: "/history", label: "Ιστορικό", icon: History }];
  return <><header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur"><div className="mx-auto flex h-12 max-w-md items-center justify-between">{canGoBack ? <button type="button" onClick={() => navigate(-1)} className="flex h-11 items-center gap-1 text-sm font-semibold text-slate-100"><ArrowLeft size={18} />Πίσω</button> : <span className="text-sm font-bold text-emerald-400">GreenLens</span>}<button type="button" onClick={() => navigate("/")} className="flex h-11 items-center gap-1 text-sm font-semibold text-slate-100"><Home size={18} />Αρχική</button></div></header><nav aria-label="Κύρια πλοήγηση" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"><div className="mx-auto flex max-w-md justify-around">{tabs.map(({ path, label, icon: Icon }) => <button key={path} type="button" onClick={() => navigate(path)} aria-current={location.pathname === path ? "page" : undefined} className={`flex min-h-14 min-w-20 flex-col items-center justify-center gap-1 text-xs font-semibold ${location.pathname === path ? "text-emerald-400" : "text-slate-400"}`}><Icon size={19} />{label}</button>)}</div></nav></>;
}