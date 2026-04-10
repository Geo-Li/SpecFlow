import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { approvalGateType, approverRole } from "./schema";

export const create = internalMutation({
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

export const decide = internalMutation({
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

export const listByRequest = internalQuery({
  args: { requestId: v.id("contributionRequests") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("approvalGates")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .take(100);
  },
});
