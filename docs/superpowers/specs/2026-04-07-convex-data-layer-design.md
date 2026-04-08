# Convex Data Layer Design

## Overview

Replace the in-memory session store with a Convex backend that owns durable collaboration state: contribution requests, threads/messages, artifacts, approval gates, and workflow status. Introduce a Convex-hosted planning agent that handles the brainstorm/clarify/plan conversation loop, reading provider config from the admin dashboard.

## Package Structure

New workspace package: `packages/convex/`

```
packages/convex/
├── convex/
│   ├── _generated/         <- Convex codegen
│   ├── schema.ts           <- Table definitions
│   ├── agent.ts            <- Planning agent definition
│   ├── contributionRequests.ts  <- Queries/mutations for requests
│   ├── artifacts.ts        <- Queries/mutations for artifacts
│   ├── approvalGates.ts    <- Queries/mutations for approval gates
│   ├── jobs.ts             <- Execution job tracking
│   ├── tools/              <- Agent tools
│   │   ├── requestTools.ts <- Tools for updating requests, creating artifacts
│   │   └── approvalTools.ts <- Tools for creating/managing approval gates
│   └── http.ts             <- HTTP endpoints for Express server
├── package.json
└── tsconfig.json
```

## Schema

### contributionRequests

The top-level unit of work, replacing the current `Session` type.

```ts
contributionRequests: defineTable({
  orgId: v.string(),
  requesterId: v.string(),
  source: v.union(
    v.literal("slack"),
    v.literal("browser"),
    v.literal("github"),
    v.literal("linear"),
    v.literal("dashboard"),
    v.literal("email")
  ),
  sourceRef: v.object({
    channelId: v.optional(v.string()),
    threadTs: v.optional(v.string()),
    messageTs: v.optional(v.string()),
    url: v.optional(v.string()),
  }),
  type: v.union(
    v.literal("product_idea"),
    v.literal("market_research"),
    v.literal("code_change"),
    v.literal("bug_report"),
    v.literal("design_review"),
    v.literal("growth_experiment"),
    v.literal("engineering_task")
  ),
  status: v.union(
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
  ),
  title: v.string(),
  rawRequest: v.string(),
  threadId: v.optional(v.string()), // Convex agent thread ID
  intentContractId: v.optional(v.id("artifacts")),
  currentPlanId: v.optional(v.id("artifacts")),
  currentExecutionId: v.optional(v.id("jobs")),
  repoPath: v.optional(v.string()),
  executionMode: v.optional(v.union(v.literal("worktree"), v.literal("branch"))),
  baseBranch: v.optional(v.string()),
  prUrl: v.optional(v.string()),
  error: v.optional(v.string()),
})
  .index("by_status", ["status"])
  .index("by_source_ref", ["source", "sourceRef.channelId", "sourceRef.threadTs"])
  .index("by_requester", ["requesterId"])
```

### artifacts

Durable outputs created by humans, agents, or tools.

```ts
artifacts: defineTable({
  requestId: v.id("contributionRequests"),
  type: v.union(
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
  ),
  title: v.string(),
  body: v.string(),
  metadata: v.any(),
  createdBy: v.union(
    v.literal("human"),
    v.literal("agent"),
    v.literal("system")
  ),
})
  .index("by_request", ["requestId"])
  .index("by_request_and_type", ["requestId", "type"])
```

### approvalGates

Human approval checkpoints in the workflow.

```ts
approvalGates: defineTable({
  requestId: v.id("contributionRequests"),
  type: v.union(
    v.literal("intent_approval"),
    v.literal("plan_approval"),
    v.literal("preview_approval"),
    v.literal("ship_approval"),
    v.literal("engineering_escalation")
  ),
  requiredApproverRole: v.union(
    v.literal("requester"),
    v.literal("designer"),
    v.literal("marketer"),
    v.literal("engineer"),
    v.literal("admin")
  ),
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("changes_requested")
  ),
  decisionBy: v.optional(v.string()),
  decisionMessage: v.optional(v.string()),
  decidedAt: v.optional(v.number()),
})
  .index("by_request", ["requestId"])
  .index("by_status", ["status"])
```

### jobs

Tracks execution worker runs (Claude Code CLI, git ops, PR creation).

```ts
jobs: defineTable({
  requestId: v.id("contributionRequests"),
  type: v.union(
    v.literal("claude_code_execution"),
    v.literal("git_push"),
    v.literal("pr_creation"),
    v.literal("preview_generation")
  ),
  status: v.union(
    v.literal("queued"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed")
  ),
  workDir: v.optional(v.string()),
  branchName: v.optional(v.string()),
  output: v.optional(v.string()),
  error: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
})
  .index("by_request", ["requestId"])
  .index("by_status", ["status"])
```

### providerConfig

Stores the admin-configured LLM provider settings so the Convex agent can read them.

```ts
providerConfig: defineTable({
  providerId: v.string(),
  name: v.string(),
  type: v.union(v.literal("anthropic"), v.literal("openai_compatible")),
  apiKey: v.string(),
  baseUrl: v.optional(v.string()),
  model: v.string(),
  isDefault: v.boolean(),
})
```

## Planning Agent

Defined in `convex/agent.ts` using `@convex-dev/agents`:

```ts
const planningAgent = new Agent(components.agents, {
  name: "SpecFlow Planner",
  chat: anthropic.chat("claude-sonnet-4-20250514"), // default, overridden by config
  instructions: PLANNING_SYSTEM_PROMPT,
  tools: {
    updateRequestStatus,
    createArtifact,
    createApprovalGate,
  },
});
```

The agent:
1. Receives the raw request from a contribution
2. Asks clarifying questions (stored in the thread)
3. Produces an intent contract artifact
4. Generates a coding plan artifact
5. Creates a plan_approval gate and waits for human approval

Provider selection reads from the `providerConfig` table at runtime.

## Express Server Changes

The Express server becomes a thin adapter layer:

### Slack Source Adapter
- Slack events (mentions, DMs, thread replies) normalize into `ContributionRequest` creation via Convex HTTP actions
- Thread replies route to the Convex agent thread (send user message, get agent response, post to Slack)
- Button actions (Confirm/Edit/Cancel) update approval gates in Convex

### Execution Worker
- Polls or subscribes to Convex for requests in `plan_approved` status
- Runs Claude Code CLI locally (unchanged)
- Reports job status back to Convex via HTTP actions
- Handles git push and PR creation (unchanged)

### Dashboard API
- Reads from Convex instead of in-memory Map
- Config management may stay on disk initially or migrate to Convex `providerConfig` table

## Data Flow

```
Slack Event
  → Express Slack handler
  → Convex: createContributionRequest mutation
  → Convex: agent.createThread + generateText
  → Agent response
  → Express: post to Slack thread

User Reply in Thread
  → Express: detect active request by threadTs
  → Convex: send message to agent thread
  → Agent response (may create artifacts, update status)
  → Express: post response to Slack

User Confirms Plan (button click)
  → Express: update approval gate in Convex
  → Convex: transition request to plan_approved
  → Express: execution worker picks up job
  → Claude Code CLI runs locally
  → Express: report results to Convex
  → Express: post PR link to Slack
```

## Dependencies

```json
{
  "dependencies": {
    "convex": "^1.x",
    "@convex-dev/agents": "^0.x",
    "@ai-sdk/anthropic": "^1.x",
    "@ai-sdk/openai": "^1.x"
  }
}
```

## Migration Strategy

Phase 1 (this spec):
- New `packages/convex/` with schema, agent, mutations, queries
- Express server calls Convex for request creation and message routing
- In-memory session store removed; Convex is the source of truth
- Dashboard reads from Convex

Phase 2 (future):
- Config management moves fully to Convex
- Additional source adapters (browser extension, GitHub)
- Workflow component for durable multi-step orchestration
