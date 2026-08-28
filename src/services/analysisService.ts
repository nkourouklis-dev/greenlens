import { DEMO_MODE } from "../config";
import type { AnalysisClient } from "./analysisClient";
import type { ComparableProductSummary, ExtractedIngredient, ProductAnalysis, ScoreBreakdown } from "../types";

const demoText = "Water, Oats (10%), Sunflower oil, Sea salt";

function evidence(sourceText: string, confidence: number, source: "label_ocr" | "user_corrected" | "seed_record") {
  return { source, sourceText, confidence };
}

function toIngredients(text: string, source: "label_ocr" | "user_corrected" | "seed_record"): ExtractedIngredient[] {
  return text.split(",").map((value) => ({ name: value.trim(), normalizedName: value.trim().toLowerCase(), confidence: source === "seed_record" ? 1 : 0.92, evidence: evidence(value.trim(), source === "seed_record" ? 1 : 0.92, source) })).filter((ingredient) => ingredient.name.length > 0);
}

function unavailable(productId: string, correctedText = ""): ProductAnalysis {
  return { productId, status: "insufficient_data", correctedText, ingredients: [], flags: [], scoreBreakdown: [], confidence: { overall: 0, labelRead: 0, userReviewed: false, explanation: "Δεν υπάρχουν επαρκή επαληθευμένα δεδομένα για ανάλυση." }, positives: [], attentionItems: [], allergens: [], comparisons: [], notice: "Η ανάλυση AI δεν έχει συνδεθεί ακόμη" };
}

export function scoreIngredients(productId: string, correctedText: string): ProductAnalysis {
  if (!correctedText.trim()) return unavailable(productId, correctedText);
  const ingredients = toIngredients(correctedText, "user_corrected");
  const hasOil = ingredients.some((ingredient) => ingredient.normalizedName.includes("oil"));
  const breakdown: ScoreBreakdown[] = [{ factor: "Επιβεβαιωμένη ετικέτα", weight: 25, deduction: 0, reason: "Το κείμενο ελέγχθηκε από τον χρήστη." }, { factor: "Έλαιο στη λίστα", weight: 10, deduction: hasOil ? 5 : 0, reason: hasOil ? "Το έλαιο εμφανίζεται στη δηλωμένη λίστα συστατικών." : "Δεν εμφανίζεται έλαιο στη δηλωμένη λίστα συστατικών." }];
  const score = Math.max(0, Math.min(100, 100 - breakdown.reduce((total, item) => total + item.deduction, 0)));
  const flags = ingredients.filter((ingredient) => ingredient.normalizedName.includes("oat")).map((ingredient) => ({ ingredient: ingredient.name, tone: "allergen" as const, label: "Περιέχει βρώμη", reason: "Η βρώμη δηλώνεται στην ετικέτα. Ελέγξτε την ετικέτα για τις δικές σας ανάγκες.", evidence: ingredient.evidence }));
  return { productId, status: "completed", correctedText, ingredients, flags, score, scoreBand: score >= 80 ? "green" : "yellow", scoreBreakdown: breakdown, confidence: { overall: 0.92, labelRead: 0.92, userReviewed: true, explanation: "Βασίζεται σε κείμενο ετικέτας που επιβεβαιώθηκε από τον χρήστη." }, positives: ["Η λίστα συστατικών εμφανίζεται συνοπτική στη demo καταχώριση."], attentionItems: breakdown.filter((item) => item.deduction > 0).map((item) => item.reason), allergens: flags.map((flag) => flag.label), comparisons: [] };
}

export const analysisClient: AnalysisClient = {
  async extractIngredients(): Promise<ExtractedIngredient[]> { return DEMO_MODE ? toIngredients(demoText, "label_ocr") : []; },
  async analyzeIngredients(productId, correctedText): Promise<ProductAnalysis> { return DEMO_MODE ? scoreIngredients(productId, correctedText) : unavailable(productId, correctedText); },
  async askProductQuestion(productId, question): Promise<string> { return DEMO_MODE ? `Demo απάντηση για ${productId}: χρησιμοποιούμε μόνο την επιβεβαιωμένη demo ετικέτα. Η ερώτησή σου ήταν: ${question}` : "Η ανάλυση AI δεν έχει συνδεθεί ακόμη"; },
  async getComparableProducts(): Promise<ComparableProductSummary[]> { return DEMO_MODE ? [{ name: "Demo alternative", reason: "Δεν υπάρχουν πραγματικά δεδομένα σύγκρισης για κατάταξη ή ποσοστό." }] : []; },
};