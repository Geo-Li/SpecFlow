import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  contributionSource,
  contributionType,
  contributionStatus,
} from "./schema";

export const create = mutation({
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

export const updateStatus = mutation({
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

export const get = query({
  args: { id: v.id("contributionRequests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getBySourceThread = query({
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

export const list = query({
  args: {
    status: v.optional(contributionStatus),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const effectiveLimit = args.limit
      ? Math.min(Math.max(1, args.limit), 500)
      : undefined;

    const ordered = args.status
      ? ctx.db
          .query("contributionRequests")
          .withIndex("by_status", (idx) => idx.eq("status", args.status!))
          .order("desc")
      : ctx.db.query("contributionRequests").order("desc");

    if (effectiveLimit) {
      return await ordered.take(effectiveLimit);
    }
    return await ordered.collect();
  },
});

export const listActive = query({
  handler: async (ctx) => {
    const terminalStatuses = ["done", "cancelled", "failed"];
    const all = await ctx.db.query("contributionRequests").order("desc").collect();
    return all.filter((r) => !terminalStatuses.includes(r.status));
  },
});
