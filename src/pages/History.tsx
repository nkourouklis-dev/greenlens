import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getHistory } from "../services/historyService";
import type { ScanHistoryItem } from "../types";

export default function History() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-6 text-white">
      <section className="mx-auto max-w-md">
        <button type="button" onClick={() => navigate("/")} className="text-sm font-semibold text-emerald-400">Επιστροφή</button>
        <h1 className="mt-6 text-3xl font-bold">Ιστορικό σαρώσεων</h1>
        {history.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5 leading-7 text-slate-300">Δεν υπάρχουν αποθηκευμένες σαρώσεις ακόμη.</p>
        ) : (
          <div className="mt-6 space-y-3">
            {history.map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(`/product/${item.id}`)} className="flex w-full items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-left">
                {item.productPhoto || item.ingredientsPhoto ? <img src={item.productPhoto || item.ingredientsPhoto} alt="Σάρωση προϊόντος" className="h-16 w-16 rounded-xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-500/15 text-sm font-bold text-emerald-300">Demo</div>}
                <span className="min-w-0 flex-1"><span className="block truncate font-bold">{item.productName || "Άγνωστο προϊόν"}</span><span className="mt-1 block text-sm text-slate-400">{new Date(item.scannedAt).toLocaleString("el-GR")}</span></span>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}