export const scoringVersion = "2026.08.1";
export const minimumOcrConfidence = 0.7;
export const scoreRules = {
  attention: { points: 8, cap: 3 },
  highAttention: { points: 15, cap: 2 },
} as const;