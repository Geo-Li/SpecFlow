import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { PROVIDER_BASE_URLS, type ProviderConfig } from "@specflow/shared";

export interface ProviderModelDiscoveryInput {
  type: ProviderConfig["type"];
  apiKey: string;
  baseUrl?: string;
}

const OPENAI_MODEL_EXCLUDE_PATTERNS = [
  /embedding/i,
  /moderation/i,
  /audio/i,
  /transcribe/i,
  /realtime/i,
  /codex/i,
  /^tts-/i,
  /^whisper/i,
  /^dall-e/i,
  /^gpt-image/i,
];

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hasDateSuffix(modelId: string): boolean {
  return /\d{4}-\d{2}-\d{2}/.test(modelId);
}

function openAIPriority(modelId: string): number {
  const priorities = [
    "gpt-5",
    "gpt-4.1",
    "gpt-4o",
    "o4",
    "o3",
    "o1",
    "chatgpt-4o",
    "gpt-4.5",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5",
  ];
  const index = priorities.findIndex((prefix) => modelId.startsWith(prefix));
  return index === -1 ? priorities.length : index;
}

function sortOpenAIStyleModels(
  models: Array<{ id: string; created?: number }>,
): string[] {
  return uniqueStrings(
    [...models]
      .sort((a, b) => {
        const priorityDiff = openAIPriority(a.id) - openAIPriority(b.id);
        if (priorityDiff !== 0) return priorityDiff;

        const dateSuffixDiff =
          Number(hasDateSuffix(a.id)) - Number(hasDateSuffix(b.id));
        if (dateSuffixDiff !== 0) return dateSuffixDiff;

        const createdDiff = (b.created ?? 0) - (a.created ?? 0);
        if (createdDiff !== 0) return createdDiff;

        return a.id.localeCompare(b.id);
      })
      .map((model) => model.id),
  );
}

function normalizeOpenAIStyleModels(
  models: Array<{ id: string; created?: number }>,
): string[] {
  const filtered = models.filter(
    (model) =>
      !OPENAI_MODEL_EXCLUDE_PATTERNS.some((pattern) => pattern.test(model.id)),
  );
  return sortOpenAIStyleModels(filtered.length > 0 ? filtered : models);
}

async function discoverOpenAIModels(
  apiKey: string,
  baseUrl?: string,
  options?: { filterForPlanner?: boolean },
): Promise<string[]> {
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl || PROVIDER_BASE_URLS.openai,
  });
  const page = await client.models.list();
  if (options?.filterForPlanner === false) {
    return sortOpenAIStyleModels(page.data);
  }
  return normalizeOpenAIStyleModels(page.data);
}

async function discoverAnthropicModels(apiKey: string): Promise<string[]> {
  const client = new Anthropic({ apiKey });
  const page = await client.models.list({ limit: 1000 });
  return uniqueStrings(
    [...page.data]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .map((model) => model.id),
  );
}

async function discoverGoogleModels(apiKey: string): Promise<string[]> {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?key=" +
      encodeURIComponent(apiKey),
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google model discovery failed (${response.status}): ${text}`);
  }

  const body = (await response.json()) as {
    models?: Array<{
      name?: string;
      baseModelId?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  const models = (body.models || []).filter((model) =>
    (model.supportedGenerationMethods || []).includes("generateContent"),
  );

  return uniqueStrings(
    models.map((model) => {
      if (model.baseModelId) return model.baseModelId;
      return (model.name || "").replace(/^models\//, "");
    }),
  );
}

export async function discoverProviderModels(
  input: ProviderModelDiscoveryInput,
): Promise<string[]> {
  switch (input.type) {
    case "anthropic":
      return discoverAnthropicModels(input.apiKey);
    case "openai":
      return discoverOpenAIModels(input.apiKey, input.baseUrl, {
        filterForPlanner: true,
      });
    case "google":
      return discoverGoogleModels(input.apiKey);
    case "openai-compatible":
      if (!input.baseUrl) {
        throw new Error("Base URL is required for OpenAI-compatible providers");
      }
      return discoverOpenAIModels(input.apiKey, input.baseUrl, {
        filterForPlanner: false,
      });
  }
}
