import { AnalysisContext, PEST_DISEASE_CUES } from "./schema";

const CUES_LIST = PEST_DISEASE_CUES.join(" | ");

const CONTEXT_HINTS: Record<AnalysisContext, string> = {
  general_tree_review:
    "This is a general visit photo. Treat the tree as the subject; ignore background workers/buildings.",
  harvest_pre_tree:
    "This photo was taken just before harvesting. Focus on fruit maturity, fruit damage, and any visible pest/disease cues.",
  harvest_box:
    "This is a photo of a single harvest box of fruit. Comment only on what is visible in the box (maturity, damage, foreign matter).",
  pest_or_disease_check:
    "The worker suspects pest or disease. Be specific about which cues you see and which you do not see.",
  pruning_assessment:
    "Comment on canopy density, dead wood, and whether pruning appears needed or recently performed.",
  damage_or_anomaly:
    "The worker reported damage. Describe any visible damage, but do not speculate about cause.",
};

export function buildSystemPrompt(): string {
  return `You are a careful agronomy assistant reviewing field photos of olive trees in southern Lebanon for the Khalaf Olive Groves estate.

You MUST follow these strict rules:
1. NEVER state a confirmed diagnosis. Use cautious phrases like "possible signal of", "appears consistent with", "may indicate", "cannot be confirmed from a single photo".
2. If the image is blurry, dark, occluded, or shows something other than an olive tree (or fruit box), say so plainly in "limitations" and set most signal fields to "unclear" or null.
3. Never invent details that you cannot see. If you are unsure, say "unclear".
4. Always set "needsFieldVerification": "yes" when you report any non-trivial signal, or when the image quality is poor.
5. Output ONLY a single JSON object matching the requested schema. No markdown, no prose before or after.
6. Pest/disease cues must come from this fixed list: ${CUES_LIST}. If you see something outside this list, use "other_unknown" with a brief note.
7. Severity uses: none | trace | low | moderate | high | severe | unknown.
8. Keep "summary" to 1-3 sentences in cautious language. Keep "limitations" to 1-2 sentences explaining what the photo cannot show.`;
}

export function buildUserPrompt(context: AnalysisContext, hints?: { treeCode?: string; groveName?: string; purpose?: string }): string {
  const ctx = CONTEXT_HINTS[context];
  const hintsLine = hints
    ? [
        hints.treeCode ? `Tree code: ${hints.treeCode}` : null,
        hints.groveName ? `Grove: ${hints.groveName}` : null,
        hints.purpose ? `Photo purpose tag: ${hints.purpose}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const schemaShape = `{
  "imageQuality": "excellent" | "good" | "fair" | "poor" | "unusable",
  "canopyDensity": "sparse" | "moderate" | "dense" | "unclear" | null,
  "canopyGreennessScore": number 0-1 | null,
  "yellowingSignal": "none" | "low" | "moderate" | "high" | "unclear" | null,
  "droughtStressVisualSignal": "none" | "low" | "moderate" | "high" | "unclear" | null,
  "pruningNeedSignal": "none" | "low" | "moderate" | "high" | "unclear" | null,
  "fruitMaturityVisualEstimate": "green" | "veraison" | "ripe" | "overripe" | "mixed" | "no_fruit_visible" | "unclear" | null,
  "fruitDamageSignal": "none" | "low" | "moderate" | "high" | "unclear" | null,
  "understoryVisualSignal": "bare" | "sparse_grass" | "dense_grass" | "weedy" | "unclear" | null,
  "trunkConditionSignal": "healthy_looking" | "possible_damage" | "possible_cavity" | "lichen_present" | "unclear" | null,
  "rootExposureSignal": "yes" | "no" | "unclear" | null,
  "terraceConditionSignal": "intact" | "minor_erosion" | "major_erosion" | "collapsed" | "unclear" | "not_visible" | null,
  "possiblePestOrDiseaseCues": [{"cue": "<from the fixed list>", "severity": "<severity>", "notes": "<optional short note>"}],
  "summary": "1-3 cautious sentences",
  "limitations": "what this single photo cannot show",
  "recommendedFollowUp": "1 short sentence, or null",
  "recommendedTaskType": "field_verification" | "pest_inspection" | "disease_inspection" | "pruning_review" | "irrigation_check" | "no_action_needed" | "unclear" | null,
  "confidenceScore": number 0-1 | null,
  "needsFieldVerification": "yes" | "no" | "unclear"
}`;

  return `Context: ${ctx}
${hintsLine ? `\nMetadata: ${hintsLine}\n` : ""}
Analyze the attached photo and return ONLY a JSON object with this exact shape:

${schemaShape}

Remember: cautious language, no confirmed diagnoses, "unclear" when you cannot tell.`;
}
