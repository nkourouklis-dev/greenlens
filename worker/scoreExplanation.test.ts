import assert from "node:assert/strict";
import test from "node:test";
import { buildDraftPrompt } from "./adminAssistant";
import { resolveNutritionEvidence, scoreFood } from "./foodScore";
import { explainFoodScore, withScoreExplanation } from "./scoreExplanation";
import { scoreInterpretation } from "./scoring";
import type { WorkerAnalysisResult } from "./analysis";

/**
 * The copy beside a score must say what decided it. Lurpak Soft at 64 was
 * "explained" by "Περιέχει βούτυρο" and "ισορροπία συστατικών και ευκολία
 * χρήσης" — nothing that costs 36 points — because the text was written from
 * the ingredient list alone while the score was mostly nutrition.
 */

const analysis: WorkerAnalysisResult = {
  productType: "food",
  summary: "Βούτυρο με ελαιόλαδο.",
  positives: [],
  attentionItems: ["Περιέχει βούτυρο"],
  potentialAllergens: ["γάλα"],
  ingredientFindings: [
    {
      ingredientName: "Βούτυρο",
      normalizedName: "butter",
      severity: "info",
      title: "Βούτυρο",
      explanation: "Γαλακτοκομικό λίπος.",
      evidenceType: "label",
      sourceName: null,
      sourceUrl: null,
      confidence: 0.9,
    },
  ],
  insufficientDataReasons: [],
  confidence: 0.9,
};

const LURPAK_FACTS = {
  energyKj: 2232,
  fat: 60,
  saturates: 23,
  carbohydrate: 0.4,
  sugars: null,
  fibre: null,
  protein: 0.3,
  salt: 0.01,
  fruitVegLegumesPct: 0,
  isBeverage: false,
  abv: null,
};

function lurpak(withNutrition: boolean) {
  return scoreFood({
    ingredientScore: scoreInterpretation("Βούτυρο (γάλα), ελαιόλαδο, αλάτι", 0.95, analysis, {
      ruleMatches: [],
      nutritionCoversSugarSalt: withNutrition,
    }),
    nutrition: withNutrition
      ? resolveNutritionEvidence({
          panel: null,
          offFacts: LURPAK_FACTS,
          categoryTags: ["en:fats", "en:butters"],
        })
      : null,
    nonNutritiveSweetener: null,
    alcohol: null,
    notices: [],
  });
}

test("Lurpak's 64 is explained by its saturated fat, with the measured numbers", () => {
  const explanation = explainFoodScore(lurpak(true));

  assert(explanation);
  assert.match(explanation.overallVerdict, /64\/100/);
  assert.match(explanation.overallVerdict, /Nutri-Score D \(40\/100, βάρος 60%\)/);
  assert.match(explanation.overallVerdict, /συστατικά 100\/100 \(βάρος 40%\)/);
  assert.match(explanation.overallVerdict, /Κύριος λόγος: υψηλά κορεσμένα λιπαρά: 23 g ανά 100 g/);

  assert.equal(
    explanation.watchOutFor[0],
    "Υψηλά κορεσμένα λιπαρά: 23 g ανά 100 g (38,3% των λιπαρών)",
  );
  assert.doesNotMatch(explanation.overallVerdict, /βούτυρο|ευκολία/);
});

test("the executive summary keeps the model's own cautions, after the measured ones", () => {
  const summary = withScoreExplanation(
    {
      overallVerdict: "Βαθμολογείται με 64 λόγω της ισορροπίας συστατικών.",
      safeIngredients: 1,
      cautionIngredients: 0,
      highImpactIngredients: 0,
      highlights: [],
      watchOutFor: ["Περιέχει βούτυρο"],
    },
    lurpak(true),
  );

  assert.deepEqual(summary.watchOutFor, [
    "Υψηλά κορεσμένα λιπαρά: 23 g ανά 100 g (38,3% των λιπαρών)",
    "Περιέχει βούτυρο",
  ]);
  assert.doesNotMatch(summary.overallVerdict, /ισορροπίας/);
});

test("without nutrition the explanation says so, and names the cap", () => {
  const explanation = explainFoodScore(lurpak(false));

  assert(explanation);
  assert.match(explanation.overallVerdict, /65\/100: Μόνο τα συστατικά \(100\/100\)· χωρίς διατροφικά στοιχεία η βαθμολογία δεν μπορεί να ξεπεράσει το 65\./);
  assert.deepEqual(explanation.watchOutFor, []);
});

test("a score not built by scoreFood keeps its old text", () => {
  const old = scoreInterpretation("Νερό, αλάτι", 0.95, analysis, { ruleMatches: [] });

  assert.equal(explainFoodScore(old), null);
});

test("the draft prompt hands the model the measured facts", () => {
  const explanation = explainFoodScore(lurpak(true));

  const prompt = buildDraftPrompt({
    productName: "LURPAK",
    sourceText: "Βούτυρο",
    findings: [],
    score: 64,
    band: "moderate",
    scoreFacts: explanation?.facts ?? [],
  });

  assert.match(prompt, /ΤΙ ΕΠΗΡΕΑΣΕ ΤΗ ΒΑΘΜΟΛΟΓΙΑ/);
  assert.match(prompt, /Υψηλά κορεσμένα λιπαρά: 23 g ανά 100 g/);
});
