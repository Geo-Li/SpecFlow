import type { Message, ProviderConfig } from "@specflow/shared";
import { PROVIDER_BASE_URLS } from "@specflow/shared";
import { createAnthropicProvider } from "./anthropic-provider.js";
import { createOpenAIProvider } from "./openai-provider.js";

export interface PlanningAgent {
  chat(history: Message[], systemPrompt: string): Promise<string>;
}

export function createPlanningAgent(config: ProviderConfig): PlanningAgent {
  switch (config.type) {
    case "anthropic":
      return createAnthropicProvider(config);
    case "openai":
    case "google":
      return createOpenAIProvider({
        ...config,
        baseUrl: config.baseUrl || PROVIDER_BASE_URLS[config.type],
      });
    case "openai-compatible":
      return createOpenAIProvider(config);
    default:
      throw new Error(`Unknown provider type: ${(config as any).type}`);
  }
}
