import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { jobType, jobStatus } from "./schema";

export const create = mutation({
  args: {
    requestId: v.id("contributionRequests"),
    type: jobType,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("jobs", {
      ...args,
      status: "queued",
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("jobs"),
    status: jobStatus,
    output: v.optional(v.string()),
    error: v.optional(v.string()),
    workDir: v.optional(v.string()),
    branchName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) filtered[key] = value;
    }
    if (updates.status === "running") filtered.startedAt = Date.now();
    if (updates.status === "completed" || updates.status === "failed") {
      filtered.completedAt = Date.now();
    }
    await ctx.db.patch(id, filtered);
  },
});

export const getByRequest = query({
  args: { requestId: v.id("contributionRequests") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
  },
});

export const listQueued = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
  },
});
