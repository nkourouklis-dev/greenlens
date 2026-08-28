import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { findProductById } from "../data/productRepository";
import { getHistoryItem } from "../services/historyService";

const suggestedQuestions = ["Τι περιέχει αυτή η εγγραφή;", "Ποια είναι η πηγή των πληροφοριών;"];

export default function Product() {
	const navigate = useNavigate();
	const { id = "" } = useParams();
	const historyItem = getHistoryItem(id);
	const product = findProductById(historyItem?.productId ?? id);
	const [question, setQuestion] = useState("");
	const [answer, setAnswer] = useState("");

	function respond(value: string) {
		setQuestion(value);
		setAnswer(product ? `Demo απάντηση: η εγγραφή περιέχει μόνο τα αποθηκευμένα στοιχεία για ${product.name}. ${product.description}` : "Η ανάλυση AI θα είναι διαθέσιμη όταν συνδεθεί εξαγωγή συστατικών. Δεν παρέχονται συμπεράσματα για αυτή τη φωτογραφία.");
	}

	if (!historyItem && !product) {
		return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><section className="mx-auto max-w-md"><h1 className="text-2xl font-bold">Η σάρωση δεν βρέθηκε</h1><button type="button" onClick={() => navigate("/")} className="mt-6 text-emerald-400">Αρχική</button></section></main>;
	}

	return (
		<main className="min-h-screen bg-slate-950 px-5 py-6 text-white">
			<section className="mx-auto max-w-md">
				<button type="button" onClick={() => navigate("/history")} className="text-sm font-semibold text-emerald-400">Ιστορικό</button>
				{product?.isDemo && <p className="mt-6 inline-block rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950">Demo data</p>}
				<h1 className="mt-4 text-3xl font-bold">{product?.name || "Άγνωστο προϊόν"}</h1>
				{product && <p className="mt-2 text-slate-300">{product.brand}</p>}
				<p className="mt-4 rounded-xl bg-slate-900 p-4 text-sm leading-6 text-slate-300">{product?.description || "Οι φωτογραφίες αποθηκεύτηκαν τοπικά. Δεν έχει συνδεθεί εξαγωγή ή αξιολόγηση συστατικών."}</p>
				{(historyItem?.productPhoto || historyItem?.ingredientsPhoto) && <div className="mt-5 grid grid-cols-2 gap-3">{historyItem.ingredientsPhoto && <img src={historyItem.ingredientsPhoto} alt="Ετικέτα συστατικών" className="aspect-square w-full rounded-xl object-cover" />}{historyItem.productPhoto && <img src={historyItem.productPhoto} alt="Προϊόν" className="aspect-square w-full rounded-xl object-cover" />}</div>}
				{product && <section className="mt-6 border-t border-slate-800 pt-6"><h2 className="text-lg font-bold">Συστατικά καταχώρισης</h2><ul className="mt-3 space-y-2 text-slate-300">{product.ingredients.map((ingredient) => <li key={ingredient}>{ingredient}</li>)}</ul></section>}
				<section className="mt-8 border-t border-slate-800 pt-6"><p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-400">Demo συνομιλιακός βοηθός</p><div className="mt-4 flex flex-wrap gap-2">{suggestedQuestions.map((suggestedQuestion) => <button key={suggestedQuestion} type="button" onClick={() => respond(suggestedQuestion)} className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200">{suggestedQuestion}</button>)}</div><div className="mt-4 flex gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Γράψε μια ερώτηση" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3" /><button type="button" onClick={() => respond(question)} disabled={!question.trim()} className="rounded-xl bg-emerald-500 px-4 font-bold text-slate-950 disabled:bg-slate-700">Αποστολή</button></div>{answer && <p className="mt-4 rounded-xl bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-50">{answer}</p>}</section>
			</section>
		</main>
	);
}
