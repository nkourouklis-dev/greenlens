import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { clearOcrDraft, getOcrDraft, updateOcrDraftText } from "../services/captureDraftService";

export default function IngredientsReview() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const draft = getOcrDraft(id);
  const [text, setText] = useState(draft?.result.rawText ?? "");

  if (!draft) return <main className="min-h-screen bg-slate-950 px-5 py-6 text-white"><section className="mx-auto max-w-md"><h1 className="text-3xl font-bold">Έλεγχος ετικέτας</h1><p className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-5 leading-7 text-slate-300">Δεν βρέθηκε ανάγνωση ετικέτας. Φωτογράφισε ξανά την ετικέτα για να συνεχίσεις.</p><button type="button" onClick={() => navigate("/scan")} className="mt-5 h-14 w-full rounded-xl bg-emerald-500 font-bold text-slate-950">Νέα σάρωση</button></section></main>;
  const ocrDraft = draft;

  function retakePhoto() {
    clearOcrDraft(id);
    navigate(`/ingredients-photo?barcode=${encodeURIComponent(ocrDraft.barcode)}`);
  }

  function confirmText() {
    if (!text.trim()) return;
    updateOcrDraftText(id, text.trim());
    navigate(`/product-photo?barcode=${encodeURIComponent(ocrDraft.barcode)}&productId=${encodeURIComponent(id)}`);
  }

  return <main className="min-h-screen bg-slate-950 px-5 py-6 text-white"><section className="mx-auto max-w-md"><p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-400">Ανάγνωση ετικέτας</p><h1 className="mt-2 text-3xl font-bold">Έλεγχος OCR κειμένου</h1><p className="mt-2 text-sm leading-6 text-slate-300">Διόρθωσε το κείμενο πριν συνεχίσεις στη φωτογραφία προϊόντος.</p><img src={draft.image} alt="Ετικέτα συστατικών" className="mt-6 aspect-[3/4] w-full rounded-2xl border border-slate-700 object-cover" /><div className="mt-5 flex items-center justify-between rounded-xl bg-slate-900 p-4"><span className="font-semibold">Εμπιστοσύνη OCR</span><span className="font-bold text-emerald-300">{Math.round(draft.result.confidence * 100)}%</span></div><label htmlFor="ocr-text" className="mt-6 block font-bold">Εξαγμένο κείμενο</label><textarea id="ocr-text" value={text} onChange={(event) => setText(event.target.value)} className="mt-3 min-h-40 w-full rounded-xl border border-slate-700 bg-slate-900 p-4 leading-6" /><button type="button" onClick={confirmText} disabled={!text.trim()} className="mt-6 h-14 w-full rounded-xl bg-emerald-500 font-bold text-slate-950 disabled:bg-slate-700">Επιβεβαίωση κειμένου</button><button type="button" onClick={retakePhoto} className="mt-3 h-12 w-full rounded-xl border border-slate-600 font-semibold">Λήψη φωτογραφίας ξανά</button></section></main>;
}