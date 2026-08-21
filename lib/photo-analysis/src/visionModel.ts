import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { AnalysisContext, VisionAnalysis, visionAnalysisSchema } from "./schema";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error(
      "Anthropic AI integration not configured (AI_INTEGRATIONS_ANTHROPIC_BASE_URL/AI_INTEGRATIONS_ANTHROPIC_API_KEY missing).",
    );
  }
  client = new Anthropic({ baseURL, apiKey });
  return client;
}

export function isVisionConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  );
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip ```json ... ``` if present
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : trimmed;
  // Find first { ... last }
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) {
    throw new Error("Vision model did not return JSON");
  }
  return JSON.parse(candidate.slice(first, last + 1));
}

export interface VisionInput {
  imageBuffer: Buffer;
  contentType: string;
  context: AnalysisContext;
  hints?: { treeCode?: string; groveName?: string; purpose?: string };
}

export interface VisionResult {
  analysis: VisionAnalysis;
  raw: unknown;
}

export async function analyzeWithVisionModel(input: VisionInput): Promise<VisionResult> {
  const ai = getClient();
  const mediaType = (
    ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(input.contentType)
      ? input.contentType
      : "image/jpeg"
  ) as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  const userMessage = {
    role: "user" as const,
    content: [
      {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mediaType,
          data: input.imageBuffer.toString("base64"),
        },
      },
      {
        type: "text" as const,
        text: buildUserPrompt(input.context, input.hints),
      },
    ],
  };

  const firstResponse = await ai.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: buildSystemPrompt(),
    messages: [userMessage],
  });

  const firstText = firstResponse.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let raw: unknown;
  try {
    raw = extractJson(firstText);
    return { analysis: visionAnalysisSchema.parse(raw), raw };
  } catch (firstErr) {
    // One retry: feed the validation error back to the model and ask it
    // to return JSON that matches the schema. This is the contract's
    // required behaviour for external_vision_model so a single malformed
    // response doesn't cause the whole analysis to fall back to the
    // local heuristic.
    const errMessage = firstErr instanceof Error ? firstErr.message : String(firstErr);
    const retryResponse = await ai.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: buildSystemPrompt(),
      messages: [
        userMessage,
        { role: "assistant" as const, content: firstText },
        {
          role: "user" as const,
          content:
            "Your previous reply did not validate against the required JSON schema.\n" +
            `Validation error: ${errMessage.slice(0, 500)}\n\n` +
            "Respond again with ONLY a JSON object that conforms to the schema described in the system prompt. No prose, no code fences.",
        },
      ],
    });
    const retryText = retryResponse.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const retryRaw = extractJson(retryText);
    return { analysis: visionAnalysisSchema.parse(retryRaw), raw: retryRaw };
  }
}
