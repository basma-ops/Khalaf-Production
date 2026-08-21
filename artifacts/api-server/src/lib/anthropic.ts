import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
export function getAnthropic(): Anthropic | null {
  const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];
  if (!baseURL || !apiKey) return null;
  if (!client) client = new Anthropic({ baseURL, apiKey });
  return client;
}

export const DEFAULT_MODEL = "claude-sonnet-4-6";
