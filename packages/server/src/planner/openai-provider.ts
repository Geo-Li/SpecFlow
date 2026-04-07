import OpenAI from "openai";
import type { Message, ProviderConfig } from "@specflow/shared";
import { PROVIDER_BASE_URLS } from "@specflow/shared";
import type { PlanningAgent } from "./planner.js";

export function createOpenAIProvider(config: ProviderConfig): PlanningAgent {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || PROVIDER_BASE_URLS.openai,
  });

  return {
    async chat(history: Message[], systemPrompt: string): Promise<string> {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: 4096,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI-compatible provider");
      }
      return content;
    },
  };
}
