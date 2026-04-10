import { components } from "./_generated/api";
import { Agent, createTool } from "@convex-dev/agent";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { z } from "zod";
import { createThread } from "@convex-dev/agent";
import { VALID_STATUSES, VALID_ARTIFACT_TYPES, type RuntimeProvider } from "./constants";

/** Must match PLAN_MARKER in packages/server/src/planner/system-prompt.ts */
const PLAN_MARKER = "## Implementation Plan";

const PLANNING_SYSTEM_PROMPT = `You are a planning agent for SpecFlow, a development automation tool.

Your job is to understand the user's request and produce a clear, structured implementation plan.

Follow this process:
1. Ask clarifying questions to understand the request fully. Ask one question at a time.
2. Once you understand the request, produce a structured implementation plan.
3. Format the plan in markdown with clear steps.

When you are ready to present the final plan, start your message with "${PLAN_MARKER}" so the system can detect it.

Be concise and practical. Focus on what needs to be built, not theory.`;

const runtimeProviderType = v.union(
  v.literal("anthropic"),
  v.literal("openai"),
  v.literal("google"),
  v.literal("openai-compatible")
);

const runtimeProviderConfig = v.object({
  type: runtimeProviderType,
  apiKey: v.string(),
  model: v.string(),
  baseUrl: v.optional(v.string()),
});

function getPlanTitle(response: string): string {
  const firstContentLine = response
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== PLAN_MARKER);
  return firstContentLine?.replace(/^#+\s*/, "").slice(0, 120) || "Implementation Plan";
}

async function persistPlanIfPresent(
  ctx: Parameters<typeof planningAgent.generateText>[0],
  requestId: string,
  response: string,
): Promise<void> {
  if (!response.includes(PLAN_MARKER)) return;
  await ctx.runMutation(internal.contributionRequests.setCurrentPlan, {
    requestId: requestId as any,
    body: response,
    title: getPlanTitle(response),
  });
}

function resolveLanguageModel(provider?: RuntimeProvider): LanguageModel {
  if (!provider) {
    return anthropic.chat("claude-sonnet-4-20250514");
  }

  switch (provider.type) {
    case "anthropic":
      return createAnthropic({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      }).chat(provider.model);
    case "openai":
      return createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      }).chat(provider.model);
    case "google":
      return createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai/",
        name: "google",
      }).chat(provider.model);
    case "openai-compatible":
      return createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
        name: "openai-compatible",
      }).chat(provider.model);
  }
}

const updateRequestStatusTool = createTool({
  description: "Update the status of a contribution request",
  args: z.object({
    requestId: z.string().describe("The ID of the contribution request"),
    status: z.enum(VALID_STATUSES).describe("The new status to set"),
  }),
  handler: async (ctx, args): Promise<string> => {
    await ctx.runMutation(internal.contributionRequests.updateStatus, {
      id: args.requestId as any,
      status: args.status as any,
    });
    return `Status updated to ${args.status}`;
  },
});

const createArtifactTool = createTool({
  description:
    "Create a durable artifact (plan, intent contract, etc.) for a contribution request",
  args: z.object({
    requestId: z
      .string()
      .describe("The ID of the contribution request this artifact belongs to"),
    type: z
      .enum(VALID_ARTIFACT_TYPES)
      .describe("The artifact type"),
    title: z.string().describe("A short title for the artifact"),
    body: z.string().describe("The full content of the artifact"),
  }),
  handler: async (ctx, args): Promise<string> => {
    const id = await ctx.runMutation(internal.artifacts.create, {
      requestId: args.requestId as any,
      type: args.type as any,
      title: args.title,
      body: args.body,
      createdBy: "agent",
    });
    return `Artifact created: ${id}`;
  },
});

export const planningAgent = new Agent(components.agent, {
  name: "SpecFlow Planner",
  languageModel: anthropic.chat("claude-sonnet-4-20250514"),
  instructions: PLANNING_SYSTEM_PROMPT,
  tools: {
    updateRequestStatus: updateRequestStatusTool,
    createArtifact: createArtifactTool,
  },
});

export const startPlanning = internalAction({
  args: {
    requestId: v.id("contributionRequests"),
    rawRequest: v.string(),
    userId: v.string(),
    provider: runtimeProviderConfig,
    systemPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const threadId = await createThread(ctx, components.agent, {
      userId: args.userId,
    });

    // Store thread ID on the request
    await ctx.runMutation(internal.contributionRequests.updateStatus, {
      id: args.requestId,
      status: "clarifying",
      threadId,
    });

    const result = await planningAgent.generateText(
      ctx,
      { threadId },
      {
        prompt: args.rawRequest,
        model: resolveLanguageModel(args.provider),
        system: args.systemPrompt || PLANNING_SYSTEM_PROMPT,
      }
    );

    await persistPlanIfPresent(ctx, args.requestId, result.text);

    return {
      threadId,
      response: result.text,
    };
  },
});

export const continueThread = internalAction({
  args: {
    requestId: v.id("contributionRequests"),
    threadId: v.string(),
    message: v.string(),
    provider: runtimeProviderConfig,
    systemPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await planningAgent.generateText(
      ctx,
      { threadId: args.threadId },
      {
        prompt: args.message,
        model: resolveLanguageModel(args.provider),
        system: args.systemPrompt || PLANNING_SYSTEM_PROMPT,
      }
    );

    await persistPlanIfPresent(ctx, args.requestId, result.text);

    return {
      response: result.text,
    };
  },
});
