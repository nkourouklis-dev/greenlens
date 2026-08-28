import type { NormalizedIngredient } from "../types";

export function normalizeIngredients(text: string, confidence: number): NormalizedIngredient[] {
  return text.split(",").map((value) => value.trim()).filter(Boolean).map((originalName) => {
    const percentageMatch = originalName.match(/(\d+(?:[.,]\d+)?)\s*%/);
    const normalizedName = originalName.toLowerCase().replace(/\([^)]*\)/g, "").replace(/\d+(?:[.,]\d+)?\s*%/g, "").trim();
    return { id: crypto.randomUUID(), originalName, normalizedName, displayName: originalName, percentage: percentageMatch ? Number(percentageMatch[1].replace(",", ".")) : null, category: categoryFor(normalizedName), aliases: [], confidence };
  });
}

function categoryFor(name: string): NormalizedIngredient["category"] {
  if (/\be\d{3,4}\b/.test(name)) return "additive";
  if (/(sugar|syrup|γλυκαντικό)/.test(name)) return "sweetener";
  if (/(fragrance|parfum|άρωμα)/.test(name)) return "fragrance";
  if (/(water|aqua|νερό)/.test(name)) return "base";
  return "unknown";
}