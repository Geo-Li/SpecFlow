import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { approvalGateType, approverRole } from "./schema";

export const create = mutation({
  args: {
    requestId: v.id("contributionRequests"),
    type: approvalGateType,
    requiredApproverRole: approverRole,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("approvalGates", {
      ...args,
      status: "pending",
    });
  },
});

export const decide = mutation({
  args: {
    id: v.id("approvalGates"),
    status: v.union(
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("changes_requested")
    ),
    decisionBy: v.string(),
    decisionMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      decisionBy: args.decisionBy,
      decisionMessage: args.decisionMessage,
      decidedAt: Date.now(),
    });
  },
});

export const listByRequest = query({
  args: { requestId: v.id("contributionRequests") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("approvalGates")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
  },
});

export const listPending = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("approvalGates")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});
