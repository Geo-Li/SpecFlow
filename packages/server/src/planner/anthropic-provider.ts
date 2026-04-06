import Anthropic from "@anthropic-ai/sdk";
import type { Message, ProviderConfig } from "@specflow/shared";
import type { PlanningAgent } from "./planner.js";

export function createAnthropicProvider(config: ProviderConfig): PlanningAgent {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    async chat(history: Message[], systemPrompt: string): Promise<string> {
      const messages = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await client.messages.create({
        model: config.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Anthropic");
      }
      return textBlock.text;
    },
  };
}
