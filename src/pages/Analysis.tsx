import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DEMO_MODE } from "../config";
import { analysisClient } from "../services/analysisService";
import { saveProductAnalysis } from "../services/analysisStore";
import { getHistoryItem } from "../services/historyService";
import type { AnalysisStatus } from "../types";

const steps: { status: AnalysisStatus; label: string }[] = [
  { status: "queued", label: "Προετοιμασία" },
  { status: "reading_label", label: "Ανάγνωση ετικέτας" },
  { status: "needs_review", label: "Έλεγχος κειμένου" },
  { status: "analyzing", label: "Επεξήγηση στοιχείων" },
  { status: "completed", label: "Ολοκλήρωση" },
];

export default function Analysis() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const historyItem = getHistoryItem(id);
  const [status, setStatus] = useState<AnalysisStatus>("queued");
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!historyItem?.ingredientsPhoto) {
      setStatus("insufficient_data");
      return;
    }
    setStatus("reading_label");
    analysisClient.extractIngredients(historyItem.ingredientsPhoto).then((ingredients) => {
      if (ingredients.length === 0) {
        setStatus("insufficient_data");
        return;
      }
      setText(ingredients.map((ingredient) => ingredient.name).join(", "));
      setConfidence(Math.round((ingredients.reduce((total, ingredient) => total + ingredient.confidence, 0) / ingredients.length) * 100));
      setStatus("needs_review");
    }).catch(() => setStatus("failed"));
  }, [historyItem?.ingredientsPhoto]);

  async function confirmText() {
    if (!text.trim()) return;
    setStatus("analyzing");
    try {
      const analysis = await analysisClient.analyzeIngredients(id, text);
      if (!saveProductAnalysis(analysis)) {
        setError("Δεν ήταν δυνατή η αποθήκευση της ανάλυσης στη συσκευή.");
        setStatus("failed");
        return;
      }
      setStatus(analysis.status);
      navigate(`/product/${id}`);
    } catch {
      setError("Η ανάλυση δεν ολοκληρώθηκε. Δοκίμασε ξανά.");
      setStatus("failed");
    }
  }

  if (!DEMO_MODE && status === "insufficient_data") {
    return <main className="min-h-screen bg-slate-950 px-5 py-6 text-white"><section className="mx-auto max-w-md"><button type="button" onClick={() => navigate(`/product/${id}`)} className="text-sm font-semibold text-emerald-400">Πίσω στο προϊόν</button><h1 className="mt-6 text-3xl font-bold">Ανάλυση συστατικών</h1><p className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-5 leading-7 text-slate-300">Η ανάλυση AI δεν έχει συνδεθεί ακόμη</p></section></main>;
  }

  return <main className="min-h-screen bg-slate-950 px-5 py-6 text-white"><section className="mx-auto max-w-md"><button type="button" onClick={() => navigate(`/product/${id}`)} className="text-sm font-semibold text-emerald-400">Πίσω στο προϊόν</button>{DEMO_MODE && <p className="mt-5 inline-block rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950">Demo data</p>}<h1 className="mt-4 text-3xl font-bold">Ανάλυση συστατικών</h1><div className="mt-7 space-y-3">{steps.map((step) => <div key={step.status} className={`flex items-center gap-3 rounded-xl border p-3 ${step.status === status ? "border-emerald-400 bg-emerald-500/10" : "border-slate-800 bg-slate-900"}`}><span className={`h-3 w-3 rounded-full ${step.status === status ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`} /><span className="font-semibold">{step.label}</span></div>)}</div>{status === "needs_review" && <section className="mt-7"><div className="flex items-center justify-between"><h2 className="font-bold">Έλεγχος OCR κειμένου</h2><span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950">Εμπιστοσύνη {confidence}%</span></div><p className="mt-3 text-sm leading-6 text-slate-300">Επιβεβαίωσε ή διόρθωσε το κείμενο πριν συνεχίσεις. Η εφαρμογή δεν επιβεβαιώνει αυτόματα OCR χαμηλής εμπιστοσύνης.</p><textarea value={text} onChange={(event) => setText(event.target.value)} className="mt-4 min-h-36 w-full rounded-xl border border-slate-700 bg-slate-900 p-4 leading-6" /><button type="button" onClick={confirmText} className="mt-4 h-14 w-full rounded-xl bg-emerald-500 font-bold text-slate-950">Επιβεβαίωση και ανάλυση</button></section>}{status === "insufficient_data" && <p className="mt-7 rounded-xl border border-slate-700 bg-slate-900 p-4 leading-6 text-slate-300">AI analysis is not connected yet. Δεν υπάρχουν επαρκή δεδομένα για να δημιουργηθεί βαθμολογία.</p>}{status === "failed" && <p className="mt-7 rounded-xl border border-red-400/50 bg-red-950/40 p-4 text-red-100">{error || "Δεν ήταν δυνατή η ανάγνωση της ετικέτας."}</p>}<p className="mt-8 text-xs leading-5 text-slate-400">Οι πληροφορίες είναι ενημερωτικές και δεν αποτελούν ιατρική συμβουλή.</p></section></main>;
}