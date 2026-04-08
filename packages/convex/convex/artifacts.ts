import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { artifactType, artifactCreatedBy } from "./schema";

export const create = mutation({
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

export const listByRequest = query({
  args: { requestId: v.id("contributionRequests") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("artifacts")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("artifacts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
