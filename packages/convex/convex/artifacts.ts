import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { artifactType, artifactCreatedBy } from "./schema";

export const create = internalMutation({
  args: {
    requestId: v.id("contributionRequests"),
    type: artifactType,
    title: v.string(),
    body: v.string(),
    metadata: v.optional(v.record(v.string(), v.any())),
    createdBy: artifactCreatedBy,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("artifacts", args);
  },
});

export const listByRequest = internalQuery({
  args: { requestId: v.id("contributionRequests") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .take(100);
  },
});

export const get = internalQuery({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
