import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  contributionSource,
  contributionType,
  contributionStatus,
} from "./schema";

export const create = internalMutation({
  args: {
    orgId: v.string(),
    requesterId: v.string(),
    source: contributionSource,
    sourceRef: v.object({
      channelId: v.optional(v.string()),
      threadTs: v.optional(v.string()),
      messageTs: v.optional(v.string()),
      url: v.optional(v.string()),
    }),
    type: contributionType,
    title: v.string(),
    rawRequest: v.string(),
    repoId: v.optional(v.string()),
    executionMode: v.optional(v.union(v.literal("worktree"), v.literal("branch"))),
    baseBranch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("contributionRequests", {
      ...args,
      status: "intake",
    });
  },
});

export const updateStatus = internalMutation({
  args: {
    id: v.id("contributionRequests"),
    status: v.optional(contributionStatus),
    error: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    threadId: v.optional(v.string()),
    currentPlanId: v.optional(v.id("artifacts")),
    currentExecutionId: v.optional(v.id("jobs")),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) filtered[key] = value;
    }
    await ctx.db.patch(id, filtered);
  },
});

export const get = internalQuery({
  args: { id: v.id("contributionRequests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getBySourceThread = internalQuery({
  args: {
    channelId: v.string(),
    threadTs: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contributionRequests")
      .withIndex("by_source_thread", (q) =>
        q.eq("sourceRef.channelId", args.channelId).eq("sourceRef.threadTs", args.threadTs)
      )
      .first();
  },
});

export const list = internalQuery({
  args: {
    status: v.optional(contributionStatus),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const effectiveLimit = Math.min(Math.max(1, args.limit ?? 100), 500);

    const ordered = args.status
      ? ctx.db
          .query("contributionRequests")
          .withIndex("by_status", (idx) => idx.eq("status", args.status!))
          .order("desc")
      : ctx.db.query("contributionRequests").order("desc");

    return await ordered.take(effectiveLimit);
  },
});

export const setCurrentPlan = internalMutation({
  args: {
    requestId: v.id("contributionRequests"),
    body: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const artifactId = await ctx.db.insert("artifacts", {
      requestId: args.requestId,
      type: "coding_plan",
      title: args.title,
      body: args.body,
      createdBy: "agent",
    });
    await ctx.db.patch(args.requestId, {
      currentPlanId: artifactId,
      status: "plan_ready",
    });
    return artifactId;
  },
});

export const getDetail = internalQuery({
  args: { id: v.id("contributionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.id);
    if (!request) return null;

    let currentPlan = request.currentPlanId
      ? await ctx.db.get(request.currentPlanId)
      : null;

    if (!currentPlan) {
      currentPlan = (
        await ctx.db
          .query("artifacts")
          .withIndex("by_request_and_type", (q) =>
            q.eq("requestId", args.id).eq("type", "coding_plan")
          )
          .order("desc")
          .take(1)
      )[0] ?? null;
    }

    return {
      ...request,
      currentPlan,
    };
  },
});
