# Convex Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory session store with a Convex backend that owns durable state (contribution requests, artifacts, approval gates, jobs) and hosts a planning agent for the brainstorm/clarify/plan conversation loop.

**Architecture:** New `packages/convex/` workspace package containing the Convex schema, functions, and agent definition. The Express server becomes a thin Slack adapter that calls Convex HTTP actions for state management. Express still owns Claude Code CLI execution and git ops locally, reporting results back to Convex.

**Tech Stack:** Convex, @convex-dev/agents, @ai-sdk/anthropic, @ai-sdk/openai, TypeScript

---

## File Structure

### New files (packages/convex/)
- `packages/convex/package.json` — workspace package config
- `packages/convex/tsconfig.json` — TypeScript config
- `packages/convex/convex/schema.ts` — table definitions for all entities
- `packages/convex/convex/contributionRequests.ts` — queries/mutations for requests
- `packages/convex/convex/artifacts.ts` — queries/mutations for artifacts
- `packages/convex/convex/approvalGates.ts` — queries/mutations for approval gates
- `packages/convex/convex/jobs.ts` — queries/mutations for execution jobs
- `packages/convex/convex/agent.ts` — planning agent definition with tools
- `packages/convex/convex/http.ts` — HTTP endpoints for Express server to call

### Modified files
- `pnpm-workspace.yaml` — already includes `packages/*`, no change needed
- `packages/server/package.json` — add `convex` dependency for HTTP client
- `packages/server/src/slack/handlers.ts` — replace in-memory session calls with Convex HTTP calls
- `packages/server/src/slack/actions.ts` — replace in-memory session calls with Convex HTTP calls
- `packages/server/src/api/session-routes.ts` — read from Convex instead of in-memory store
- `packages/server/src/index.ts` — initialize Convex client

---

## Task 1: Initialize Convex Package

**Files:**
- Create: `packages/convex/package.json`
- Create: `packages/convex/tsconfig.json`

- [ ] **Step 1: Create packages/convex directory**

```bash
mkdir -p packages/convex
```

- [ ] **Step 2: Create package.json**

Create `packages/convex/package.json`:

```json
{
  "name": "@specflow/convex",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "convex dev",
    "deploy": "convex deploy"
  },
  "dependencies": {
    "convex": "^1.21.0",
    "@convex-dev/agents": "^0.2.0",
    "@ai-sdk/anthropic": "^1.0.0",
    "@ai-sdk/openai": "^1.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `packages/convex/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "."
  },
  "include": ["convex/**/*.ts"]
}
```

- [ ] **Step 4: Install dependencies**

```bash
cd /Users/paradigm.study/Desktop/SpecFlow && pnpm install
```

- [ ] **Step 5: Initialize Convex project**

```bash
cd packages/convex && npx convex dev --once
```

This will prompt for login and project creation. Follow the interactive flow to create the project. It will generate the `convex/_generated/` directory.

- [ ] **Step 6: Commit**

```bash
git add packages/convex/
git commit -m "feat(convex): initialize convex package in monorepo"
```

---

## Task 2: Define Convex Schema

**Files:**
- Create: `packages/convex/convex/schema.ts`

- [ ] **Step 1: Create the schema file**

Create `packages/convex/convex/schema.ts`:

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const contributionSource = v.union(
  v.literal("slack"),
  v.literal("browser"),
  v.literal("github"),
  v.literal("linear"),
  v.literal("dashboard"),
  v.literal("email")
);

const contributionType = v.union(
  v.literal("product_idea"),
  v.literal("market_research"),
  v.literal("code_change"),
  v.literal("bug_report"),
  v.literal("design_review"),
  v.literal("growth_experiment"),
  v.literal("engineering_task")
);

const contributionStatus = v.union(
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

const artifactType = v.union(
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

const approvalGateType = v.union(
  v.literal("intent_approval"),
  v.literal("plan_approval"),
  v.literal("preview_approval"),
  v.literal("ship_approval"),
  v.literal("engineering_escalation")
);

const approverRole = v.union(
  v.literal("requester"),
  v.literal("designer"),
  v.literal("marketer"),
  v.literal("engineer"),
  v.literal("admin")
);

const approvalStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("changes_requested")
);

const jobType = v.union(
  v.literal("claude_code_execution"),
  v.literal("git_push"),
  v.literal("pr_creation"),
  v.literal("preview_generation")
);

const jobStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed")
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
    metadata: v.optional(v.any()),
    createdBy: v.union(
      v.literal("human"),
      v.literal("agent"),
      v.literal("system")
    ),
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
```

- [ ] **Step 2: Push schema to Convex**

```bash
cd packages/convex && npx convex dev --once
```

Expected: Schema is deployed, tables are created. Check the Convex dashboard to verify.

- [ ] **Step 3: Commit**

```bash
git add packages/convex/convex/schema.ts
git commit -m "feat(convex): define schema for contribution requests, artifacts, approval gates, jobs"
```

---

## Task 3: Contribution Request Mutations and Queries

**Files:**
- Create: `packages/convex/convex/contributionRequests.ts`

- [ ] **Step 1: Create contributionRequests.ts**

Create `packages/convex/convex/contributionRequests.ts` with mutations and queries:

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
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
      prUrl: undefined,
      error: undefined,
      threadId: undefined,
      intentContractId: undefined,
      currentPlanId: undefined,
      currentExecutionId: undefined,
      repoPath: undefined,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("contributionRequests"),
    status: v.string(),
    error: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    threadId: v.optional(v.string()),
    currentPlanId: v.optional(v.id("artifacts")),
    currentExecutionId: v.optional(v.id("jobs")),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    // Filter out undefined values
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
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("contributionRequests").order("desc");
    if (args.status) {
      q = ctx.db
        .query("contributionRequests")
        .withIndex("by_status", (idx) => idx.eq("status", args.status as any))
        .order("desc");
    }
    const results = await q.collect();
    return args.limit ? results.slice(0, args.limit) : results;
  },
});

export const listActive = query({
  handler: async (ctx) => {
    const terminalStatuses = ["done", "cancelled", "failed"];
    const all = await ctx.db.query("contributionRequests").order("desc").collect();
    return all.filter((r) => !terminalStatuses.includes(r.status));
  },
});
```

- [ ] **Step 2: Push to Convex and verify**

```bash
cd packages/convex && npx convex dev --once
```

Expected: Functions deployed successfully.

- [ ] **Step 3: Commit**

```bash
git add packages/convex/convex/contributionRequests.ts
git commit -m "feat(convex): add contribution request queries and mutations"
```

---

## Task 4: Artifacts, Approval Gates, and Jobs Functions

**Files:**
- Create: `packages/convex/convex/artifacts.ts`
- Create: `packages/convex/convex/approvalGates.ts`
- Create: `packages/convex/convex/jobs.ts`

- [ ] **Step 1: Create artifacts.ts**

Create `packages/convex/convex/artifacts.ts`:

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
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
    metadata: v.optional(v.any()),
    createdBy: v.union(v.literal("human"), v.literal("agent"), v.literal("system")),
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
```

- [ ] **Step 2: Create approvalGates.ts**

Create `packages/convex/convex/approvalGates.ts`:

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
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
```

- [ ] **Step 3: Create jobs.ts**

Create `packages/convex/convex/jobs.ts`:

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    requestId: v.id("contributionRequests"),
    type: v.union(
      v.literal("claude_code_execution"),
      v.literal("git_push"),
      v.literal("pr_creation"),
      v.literal("preview_generation")
    ),
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
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed")
    ),
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
```

- [ ] **Step 4: Push to Convex and verify**

```bash
cd packages/convex && npx convex dev --once
```

Expected: All functions deploy successfully.

- [ ] **Step 5: Commit**

```bash
git add packages/convex/convex/artifacts.ts packages/convex/convex/approvalGates.ts packages/convex/convex/jobs.ts
git commit -m "feat(convex): add artifacts, approval gates, and jobs functions"
```

---

## Task 5: Planning Agent Definition

**Files:**
- Create: `packages/convex/convex/agent.ts`

This task defines the Convex-hosted planning agent using `@convex-dev/agents`. The agent reads provider config and handles the brainstorm/clarify/plan conversation loop.

- [ ] **Step 1: Create agent.ts**

Create `packages/convex/convex/agent.ts`:

```ts
import { components } from "./_generated/api";
import { Agent, createTool } from "@convex-dev/agents";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";

const PLANNING_SYSTEM_PROMPT = `You are a planning agent for SpecFlow, a development automation tool.

Your job is to understand the user's request and produce a clear, structured implementation plan.

Follow this process:
1. Ask clarifying questions to understand the request fully. Ask one question at a time.
2. Once you understand the request, produce a structured implementation plan.
3. Format the plan in markdown with clear steps.
4. When you have produced a final plan, include the marker "---PLAN---" at the start of the plan section.

Be concise and practical. Focus on what needs to be built, not theory.`;

// Tools the agent can use to interact with Convex data
const updateRequestStatusTool = createTool({
  description: "Update the status of a contribution request",
  args: {
    requestId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(api.contributionRequests.updateStatus, {
      id: args.requestId as any,
      status: args.status as any,
    });
    return `Status updated to ${args.status}`;
  },
});

const createArtifactTool = createTool({
  description: "Create a durable artifact (plan, intent contract, etc.) for a contribution request",
  args: {
    requestId: v.string(),
    type: v.string(),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
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

// The planning agent — uses Anthropic by default, can be overridden per-call
export const planningAgent = new Agent(components.agents, {
  name: "SpecFlow Planner",
  chat: anthropic.chat("claude-sonnet-4-20250514"),
  instructions: PLANNING_SYSTEM_PROMPT,
  tools: {
    updateRequestStatus: updateRequestStatusTool,
    createArtifact: createArtifactTool,
  },
});

// Action to start a new planning conversation
export const startPlanning = action({
  args: {
    requestId: v.string(),
    rawRequest: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const { thread, response } = await planningAgent.createThread(ctx, {
      userId: args.userId,
    });

    // Store thread ID on the request
    await ctx.runMutation(api.contributionRequests.updateStatus, {
      id: args.requestId as any,
      status: "clarifying",
      threadId: thread.id,
    });

    // Send the initial message
    const result = await thread.generateText({
      prompt: args.rawRequest,
    });

    return {
      threadId: thread.id,
      response: result.text,
    };
  },
});

// Action to continue a planning conversation with a user reply
export const continueThread = action({
  args: {
    threadId: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const { thread } = await planningAgent.continueThread(ctx, {
      threadId: args.threadId,
    });

    const result = await thread.generateText({
      prompt: args.message,
    });

    return {
      response: result.text,
    };
  },
});
```

- [ ] **Step 2: Configure the agents component**

Check if `convex/convex.config.ts` exists (it should have been created by `convex dev`). If not, create it. Ensure the agents component is registered:

Create or update `packages/convex/convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import agents from "@convex-dev/agents/convex.config";

const app = defineApp();
app.use(agents);
export default app;
```

- [ ] **Step 3: Push to Convex and verify**

```bash
cd packages/convex && npx convex dev --once
```

Expected: Agent component installed, functions deployed.

- [ ] **Step 4: Commit**

```bash
git add packages/convex/convex/agent.ts packages/convex/convex/convex.config.ts
git commit -m "feat(convex): add planning agent with tools for status updates and artifact creation"
```

---

## Task 6: HTTP Endpoints for Express Server

**Files:**
- Create: `packages/convex/convex/http.ts`

These HTTP endpoints let the Express server call Convex from outside the Convex runtime (since Express can't use the Convex client directly in Node.js actions — it uses HTTP instead).

- [ ] **Step 1: Create http.ts**

Create `packages/convex/convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// Create a new contribution request
http.route({
  path: "/requests",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const id = await ctx.runMutation(api.contributionRequests.create, body);
    return new Response(JSON.stringify({ id }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Get a contribution request by source thread (Slack channel:threadTs)
http.route({
  path: "/requests/by-thread",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId");
    const threadTs = url.searchParams.get("threadTs");
    if (!channelId || !threadTs) {
      return new Response(JSON.stringify({ error: "channelId and threadTs required" }), { status: 400 });
    }
    const result = await ctx.runQuery(api.contributionRequests.getBySourceThread, { channelId, threadTs });
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// List contribution requests
http.route({
  path: "/requests",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const limit = url.searchParams.get("limit");
    const results = await ctx.runQuery(api.contributionRequests.list, {
      status,
      limit: limit ? parseInt(limit) : undefined,
    });
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Update contribution request status
http.route({
  path: "/requests/status",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    await ctx.runMutation(api.contributionRequests.updateStatus, body);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Start a planning conversation
http.route({
  path: "/agent/start",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const result = await ctx.runAction(api.agent.startPlanning, body);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Continue a planning conversation
http.route({
  path: "/agent/continue",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const result = await ctx.runAction(api.agent.continueThread, body);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Update approval gate decision
http.route({
  path: "/approval-gates/decide",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    await ctx.runMutation(api.approvalGates.decide, body);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Create a job
http.route({
  path: "/jobs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const id = await ctx.runMutation(api.jobs.create, body);
    return new Response(JSON.stringify({ id }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Update job status
http.route({
  path: "/jobs/status",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    await ctx.runMutation(api.jobs.updateStatus, body);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
```

- [ ] **Step 2: Push to Convex and verify**

```bash
cd packages/convex && npx convex dev --once
```

Expected: HTTP routes deployed. Note the deployment URL (e.g., `https://<project>.convex.site`).

- [ ] **Step 3: Commit**

```bash
git add packages/convex/convex/http.ts
git commit -m "feat(convex): add HTTP endpoints for Express server integration"
```

---

## Task 7: Convex Client in Express Server

**Files:**
- Create: `packages/server/src/convex-client.ts`
- Modify: `packages/server/src/index.ts`

Create a thin HTTP client in the Express server that calls the Convex HTTP endpoints.

- [ ] **Step 1: Add environment variable for Convex URL**

Add `CONVEX_SITE_URL` to the `.env` file (the user will set this after Convex deploys):

```
CONVEX_SITE_URL=https://<project>.convex.site
```

- [ ] **Step 2: Create convex-client.ts**

Create `packages/server/src/convex-client.ts`:

```ts
const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL;

if (!CONVEX_SITE_URL) {
  console.warn("WARNING: CONVEX_SITE_URL not set. Convex integration disabled.");
}

async function convexFetch(path: string, options: RequestInit = {}): Promise<any> {
  if (!CONVEX_SITE_URL) throw new Error("CONVEX_SITE_URL not configured");
  const url = `${CONVEX_SITE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex HTTP error ${res.status}: ${text}`);
  }
  return res.json();
}

export const convex = {
  requests: {
    create: (data: Record<string, unknown>) =>
      convexFetch("/requests", { method: "POST", body: JSON.stringify(data) }),

    getByThread: (channelId: string, threadTs: string) =>
      convexFetch(`/requests/by-thread?channelId=${encodeURIComponent(channelId)}&threadTs=${encodeURIComponent(threadTs)}`),

    list: (params?: { status?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set("status", params.status);
      if (params?.limit) query.set("limit", String(params.limit));
      return convexFetch(`/requests?${query}`);
    },

    updateStatus: (data: Record<string, unknown>) =>
      convexFetch("/requests/status", { method: "PATCH", body: JSON.stringify(data) }),
  },

  agent: {
    startPlanning: (data: { requestId: string; rawRequest: string; userId: string }) =>
      convexFetch("/agent/start", { method: "POST", body: JSON.stringify(data) }),

    continueThread: (data: { threadId: string; message: string }) =>
      convexFetch("/agent/continue", { method: "POST", body: JSON.stringify(data) }),
  },

  approvalGates: {
    decide: (data: Record<string, unknown>) =>
      convexFetch("/approval-gates/decide", { method: "POST", body: JSON.stringify(data) }),
  },

  jobs: {
    create: (data: Record<string, unknown>) =>
      convexFetch("/jobs", { method: "POST", body: JSON.stringify(data) }),

    updateStatus: (data: Record<string, unknown>) =>
      convexFetch("/jobs/status", { method: "PATCH", body: JSON.stringify(data) }),
  },
};
```

- [ ] **Step 3: Verify CONVEX_SITE_URL on startup**

Modify `packages/server/src/env.ts` (or wherever `validateEnv` lives) to add a warning for missing `CONVEX_SITE_URL`. Check the file first to see the current validation pattern, then add:

```ts
if (!process.env.CONVEX_SITE_URL) {
  warnings.push("CONVEX_SITE_URL not set — Convex integration is disabled, using in-memory sessions");
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/convex-client.ts
git commit -m "feat(server): add Convex HTTP client for calling Convex backend"
```

---

## Task 8: Wire Slack Handlers to Convex

**Files:**
- Modify: `packages/server/src/slack/handlers.ts`
- Modify: `packages/server/src/slack/actions.ts`

Replace in-memory session store calls with Convex HTTP client calls. Keep the in-memory store as a fallback when `CONVEX_SITE_URL` is not set.

- [ ] **Step 1: Update handlers.ts**

Modify `packages/server/src/slack/handlers.ts`:

Replace the imports at the top:
```ts
import { convex } from "../convex-client.js";
```

Update `handleNewTask` to:
1. Call `convex.requests.create()` to create a contribution request in Convex
2. Call `convex.agent.startPlanning()` to start the planning conversation
3. Post the agent's response to Slack

Update `handleThreadReply` to:
1. Call `convex.requests.getByThread()` to find the active request
2. Call `convex.agent.continueThread()` with the request's threadId
3. Post the agent's response to Slack
4. Check for the `---PLAN---` marker and post buttons if present

The key change: the planning LLM is now called inside Convex (via the agent), not directly from Express. Express just relays messages between Slack and Convex.

- [ ] **Step 2: Update actions.ts**

Modify `packages/server/src/slack/actions.ts`:

Update `confirm_plan` handler to:
1. Call `convex.requests.updateStatus()` to set status to `plan_approved`
2. Call `convex.jobs.create()` to queue a `claude_code_execution` job
3. Keep the existing local execution flow (Claude Code CLI still runs in Express)
4. Report results back via `convex.jobs.updateStatus()` and `convex.requests.updateStatus()`

Update `cancel_plan` to call `convex.requests.updateStatus({ status: "cancelled" })`

- [ ] **Step 3: Verify Slack flow works end-to-end**

Start both Convex dev and server dev:
```bash
# Terminal 1
cd packages/convex && npx convex dev

# Terminal 2
cd packages/server && pnpm dev
```

Test by messaging the Slack bot. Verify:
- Request is created in Convex dashboard
- Agent thread is created
- Conversation flows through Convex
- Plan is posted with buttons

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/slack/handlers.ts packages/server/src/slack/actions.ts
git commit -m "feat(server): wire Slack handlers to Convex backend for durable sessions"
```

---

## Task 9: Update Dashboard API to Read from Convex

**Files:**
- Modify: `packages/server/src/api/session-routes.ts`

- [ ] **Step 1: Read the current session-routes.ts**

Read the file to understand the current API shape.

- [ ] **Step 2: Update session routes to use Convex**

Update the `GET /api/sessions` and `GET /api/sessions/:id` endpoints to call `convex.requests.list()` and `convex.requests.get()` respectively.

Map the Convex `contributionRequests` response format to what the dashboard expects (the `SessionSummary` type from shared). This may require a small mapping function.

- [ ] **Step 3: Verify dashboard loads sessions from Convex**

Start all services and check the dashboard sessions page shows data from Convex.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/api/session-routes.ts
git commit -m "feat(server): update dashboard API to read sessions from Convex"
```

---

## Task 10: Update Turbo Config and Dev Scripts

**Files:**
- Modify: `turbo.json`
- Modify: `packages/convex/package.json`

- [ ] **Step 1: Add convex dev to turbo**

The `pnpm dev` command should start Convex dev alongside server and web. Update `packages/convex/package.json` to ensure `dev` script runs `convex dev`.

- [ ] **Step 2: Verify pnpm dev starts all three**

```bash
pnpm dev
```

Expected: Server (port 3001), Web (port 3000), and Convex dev all start.

- [ ] **Step 3: Commit**

```bash
git add turbo.json packages/convex/package.json
git commit -m "chore: add convex package to turbo dev pipeline"
```

---

## Task 11: Add CONVEX_SITE_URL to .env.example and Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md environment variables section**

Add `CONVEX_SITE_URL` to the Required Environment Variables section:

```
CONVEX_SITE_URL=https://...    # Convex deployment URL (required for durable sessions)
```

Add `packages/convex` to the Architecture section.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Convex package and env vars"
```
