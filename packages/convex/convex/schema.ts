import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const contributionSource = v.union(
  v.literal("slack"),
  v.literal("browser"),
  v.literal("github"),
  v.literal("linear"),
  v.literal("dashboard"),
  v.literal("email")
);

export const contributionType = v.union(
  v.literal("product_idea"),
  v.literal("market_research"),
  v.literal("code_change"),
  v.literal("bug_report"),
  v.literal("design_review"),
  v.literal("growth_experiment"),
  v.literal("engineering_task")
);

export const contributionStatus = v.union(
  v.literal("intake"),
  v.literal("clarifying"),
  v.literal("intent_ready"),
  v.literal("intent_approved"),
  v.literal("planning"),
  v.literal("plan_ready"),
  v.literal("plan_approved"),
  v.literal("executing"),
  v.literal("preview_ready"),
  v.literal("agent_reviewing"),
  v.literal("human_review"),
  v.literal("revision_requested"),
  v.literal("ship_approved"),
  v.literal("pr_created"),
  v.literal("done"),
  v.literal("blocked"),
  v.literal("cancelled"),
  v.literal("failed")
);

export const artifactType = v.union(
  v.literal("intent_contract"),
  v.literal("research_memo"),
  v.literal("competitor_comparison"),
  v.literal("product_spec"),
  v.literal("coding_plan"),
  v.literal("execution_log"),
  v.literal("diff_summary"),
  v.literal("preview_bundle"),
  v.literal("review_notes"),
  v.literal("pr_summary")
);

export const approvalGateType = v.union(
  v.literal("intent_approval"),
  v.literal("plan_approval"),
  v.literal("preview_approval"),
  v.literal("ship_approval"),
  v.literal("engineering_escalation")
);

export const approverRole = v.union(
  v.literal("requester"),
  v.literal("designer"),
  v.literal("marketer"),
  v.literal("engineer"),
  v.literal("admin")
);

export const approvalStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("changes_requested")
);

export const jobType = v.union(
  v.literal("claude_code_execution"),
  v.literal("git_push"),
  v.literal("pr_creation"),
  v.literal("preview_generation")
);

export const jobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed")
);

export const artifactCreatedBy = v.union(
  v.literal("human"),
  v.literal("agent"),
  v.literal("system")
);

export default defineSchema({
  contributionRequests: defineTable({
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
    status: contributionStatus,
    title: v.string(),
    rawRequest: v.string(),
    threadId: v.optional(v.string()),
    intentContractId: v.optional(v.id("artifacts")),
    currentPlanId: v.optional(v.id("artifacts")),
    currentExecutionId: v.optional(v.id("jobs")),
    repoPath: v.optional(v.string()),
    repoId: v.optional(v.string()),
    executionMode: v.optional(v.union(v.literal("worktree"), v.literal("branch"))),
    baseBranch: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_source_thread", ["sourceRef.channelId", "sourceRef.threadTs"])
    .index("by_requester", ["requesterId"]),

  artifacts: defineTable({
    requestId: v.id("contributionRequests"),
    type: artifactType,
    title: v.string(),
    body: v.string(),
    metadata: v.optional(v.record(v.string(), v.any())),
    createdBy: artifactCreatedBy,
  })
    .index("by_request", ["requestId"])
    .index("by_request_and_type", ["requestId", "type"]),

  approvalGates: defineTable({
    requestId: v.id("contributionRequests"),
    type: approvalGateType,
    requiredApproverRole: approverRole,
    status: approvalStatus,
    decisionBy: v.optional(v.string()),
    decisionMessage: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
  })
    .index("by_request", ["requestId"])
    .index("by_status", ["status"]),

  jobs: defineTable({
    requestId: v.id("contributionRequests"),
    type: jobType,
    status: jobStatus,
    workDir: v.optional(v.string()),
    branchName: v.optional(v.string()),
    output: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_request", ["requestId"])
    .index("by_status", ["status"]),

  providerConfig: defineTable({
    providerId: v.string(),
    name: v.string(),
    type: v.union(v.literal("anthropic"), v.literal("openai_compatible")),
    apiKey: v.string(),
    baseUrl: v.optional(v.string()),
    model: v.string(),
    isDefault: v.boolean(),
  }),
});
