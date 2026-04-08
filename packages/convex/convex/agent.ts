import { components } from "./_generated/api";
import { Agent, createTool } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { z } from "zod";
import { createThread } from "@convex-dev/agent";

const PLAN_MARKER = "## Implementation Plan";

const PLANNING_SYSTEM_PROMPT = `You are a planning agent for SpecFlow, a development automation tool.

Your job is to understand the user's request and produce a clear, structured implementation plan.

Follow this process:
1. Ask clarifying questions to understand the request fully. Ask one question at a time.
2. Once you understand the request, produce a structured implementation plan.
3. Format the plan in markdown with clear steps.

When you are ready to present the final plan, start your message with "${PLAN_MARKER}" so the system can detect it.

Be concise and practical. Focus on what needs to be built, not theory.`;

const VALID_STATUSES = [
  "intake", "clarifying", "intent_ready", "intent_approved",
  "planning", "plan_ready", "plan_approved", "executing",
  "preview_ready", "agent_reviewing", "human_review", "revision_requested",
  "ship_approved", "pr_created", "done", "blocked", "cancelled", "failed",
] as const;

const VALID_ARTIFACT_TYPES = [
  "intent_contract", "research_memo", "competitor_comparison", "product_spec",
  "coding_plan", "execution_log", "diff_summary", "preview_bundle",
  "review_notes", "pr_summary",
] as const;

const updateRequestStatusTool = createTool({
  description: "Update the status of a contribution request",
  args: z.object({
    requestId: z.string().describe("The ID of the contribution request"),
    status: z.enum(VALID_STATUSES).describe("The new status to set"),
  }),
  handler: async (ctx, args): Promise<string> => {
    await ctx.runMutation(api.contributionRequests.updateStatus, {
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
    const id = await ctx.runMutation(api.artifacts.create, {
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
  // @ai-sdk/anthropic v1 exports LanguageModelV1; @convex-dev/agent expects LanguageModel (V2).
  // V1 models work at runtime via the ai SDK's compatibility layer.
  languageModel: anthropic.chat("claude-sonnet-4-20250514") as unknown as LanguageModel,
  instructions: PLANNING_SYSTEM_PROMPT,
  tools: {
    updateRequestStatus: updateRequestStatusTool,
    createArtifact: createArtifactTool,
  },
});

export const startPlanning = action({
  args: {
    requestId: v.string(),
    rawRequest: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const threadId = await createThread(ctx, components.agent, {
      userId: args.userId,
    });

    // Store thread ID on the request
    await ctx.runMutation(api.contributionRequests.updateStatus, {
      id: args.requestId as any,
      status: "clarifying",
      threadId,
    });

    const result = await planningAgent.generateText(
      ctx,
      { threadId },
      { prompt: args.rawRequest }
    );

    return {
      threadId,
      response: result.text,
    };
  },
});

export const continueThread = action({
  args: {
    threadId: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await planningAgent.generateText(
      ctx,
      { threadId: args.threadId },
      { prompt: args.message }
    );

    return {
      response: result.text,
    };
  },
});
