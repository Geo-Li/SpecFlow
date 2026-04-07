# SpecFlow Mission Control Architecture

## Purpose

SpecFlow is not just a Slack bot that creates pull requests. It is a company-wide product contribution layer.

The goal is to let every team member contribute to product building through the tools they already use. Designers can brainstorm product ideas and review visual changes. Marketing can research competitors and propose positioning or funnel improvements. Engineers can operate and improve the orchestration, review high-risk changes, and take over when agents should not proceed alone.

The product should make people more capable contributors. It should not hide decisions inside agents, bypass engineering judgment, or ask non-coders to review raw implementation details they cannot evaluate.

## Product Thesis

Every request should become a traceable contribution artifact:

```text
raw request -> clarified intent -> research/context -> plan -> approval -> execution -> preview -> review -> revision or PR
```

The user contributes intent, examples, feedback, and approval. Agents contribute research, planning, implementation, testing, review, and summarization. Engineers provide the safety rails and final escalation path for high-risk changes.

## Non-Negotiable Principles

- Source-agnostic backend: Slack, browser extensions, GitHub, Linear, dashboard, email, and future apps should all normalize into the same backend request model.
- Artifact-first workflow: every important agent output must become a durable artifact that humans and future agents can inspect.
- Human approval gates: agents can suggest and implement, but plan approval and shipping approval should be explicit.
- Preview-first review: non-coders should review preview URLs, screenshots, summaries, acceptance checklists, and risk notes, not raw diffs.
- Replaceable agent runtime: OpenClaw may power the agent layer, but the product source of truth must stay in SpecFlow and Convex.
- Sandboxed execution: coding work should run in isolated branches/worktrees/containers with scoped credentials.
- Auditability: every decision, artifact, agent action, approval, revision, and PR should be attributable.

## Recommended System Shape

```text
Surfaces
Slack, browser extension, GitHub, Linear, dashboard, email

Core Backend
Identity, org/team permissions, normalized intake, artifacts, approvals, audit trail

Convex Layer
Durable sessions, threads, messages, workflow state, live updates, retries, human-in-loop state

Agent Runtime
OpenClaw adapter or direct LLM adapter for brainstorming, planning, research, tool use, execution, review

Execution Workers
Claude Code, repo worktrees, test runner, visual diff runner, PR publisher

Review Surfaces
Vercel preview, screenshots, before/after diffs, test output, risk notes, approval controls
```

## Core Abstractions

### SourceAdapter

A source adapter receives a request from one surface and converts it into a normalized `ContributionRequest`.

Examples:

- Slack app mentions, DMs, and thread replies
- Browser extension captures from the current page
- GitHub issue comments, PR comments, and issue labels
- Linear tickets
- Dashboard form submissions
- Email or support inbox messages

Interface shape:

```ts
interface SourceAdapter {
  source: "slack" | "browser" | "github" | "linear" | "dashboard" | "email";
  normalize(input: unknown): Promise<ContributionRequestInput>;
  reply(target: NotificationTarget, message: OutboundMessage): Promise<void>;
}
```

Source adapters must not own orchestration. They only normalize inbound events and send outbound notifications.

### ContributionRequest

This is the top-level unit of work.

```ts
type ContributionType =
  | "product_idea"
  | "market_research"
  | "code_change"
  | "bug_report"
  | "design_review"
  | "growth_experiment"
  | "engineering_task";

interface ContributionRequest {
  id: string;
  orgId: string;
  requesterId: string;
  source: string;
  sourceRef: SourceReference;
  type: ContributionType;
  status: ContributionStatus;
  title: string;
  rawRequest: string;
  intentContractId?: string;
  currentPlanId?: string;
  currentExecutionId?: string;
  createdAt: number;
  updatedAt: number;
}
```

### IntentContract

The intent contract is the first human-readable agreement between the requester and the system.

It should include:

- Goal
- Non-goals
- Target audience or user segment
- Acceptance criteria
- Constraints
- Required evidence or references
- Risk level
- Escalation rule

Agents should not implement before the intent contract is either approved or confidently inferred for a low-risk request.

### Artifact

Artifacts are durable outputs created by humans, agents, or tools.

```ts
type ArtifactType =
  | "intent_contract"
  | "research_memo"
  | "competitor_comparison"
  | "product_spec"
  | "coding_plan"
  | "execution_log"
  | "diff_summary"
  | "preview_bundle"
  | "review_notes"
  | "pr_summary";

interface Artifact {
  id: string;
  requestId: string;
  type: ArtifactType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  createdBy: "human" | "agent" | "system";
  createdAt: number;
}
```

Artifacts are the shared language between non-coders, agents, and engineers.

### AgentRuntime

The agent runtime should be a replaceable adapter, not the product brain.

```ts
interface AgentRuntime {
  brainstorm(input: BrainstormInput): Promise<Artifact>;
  createPlan(input: PlanInput): Promise<PlanArtifact>;
  executePlan(input: ExecutePlanInput): Promise<ExecutionArtifact>;
  reviewChange(input: ReviewInput): Promise<ReviewArtifact>;
}
```

Initial implementations:

- `DirectLLMAgentRuntime`: simple first-party implementation for planning and review using configured model providers.
- `OpenClawAgentRuntime`: adapter around OpenClaw for skills, subagents, tool execution, research, and review.

Do not make OpenClaw the source of truth for sessions, approvals, or request state. Keep those in SpecFlow/Convex.

### ApprovalGate

Approval gates make the system safe for non-coders and accountable for engineers.

```ts
type ApprovalGateType =
  | "intent_approval"
  | "plan_approval"
  | "preview_approval"
  | "ship_approval"
  | "engineering_escalation";

interface ApprovalGate {
  id: string;
  requestId: string;
  type: ApprovalGateType;
  requiredApproverRole: "requester" | "designer" | "marketer" | "engineer" | "admin";
  status: "pending" | "approved" | "rejected" | "changes_requested";
  decisionBy?: string;
  decisionMessage?: string;
  decidedAt?: number;
}
```

## Review And Iteration Loop

The core loop should be explicit:

```text
1. Intake request
2. Ask clarifying questions if needed
3. Create intent contract
4. Human approves or edits intent
5. Create plan
6. Human approves or edits plan
7. Execute in isolated worktree/branch
8. Generate review bundle
9. Agent reviews against acceptance criteria
10. Human reviews preview and requests revisions or approves
11. Iterate on same branch until approved or escalated
12. Create PR with artifacts attached
```

The review bundle is the main surface for non-coders.

Required fields:

- Preview URL, usually Vercel for web changes
- Before/after screenshots when UI changed
- Plain-English summary
- "What changed relative to your goal" section
- Acceptance checklist
- Tests and checks run
- Known risks
- Agent reviewer notes
- Buttons: Approve, Request changes, Ask question, Escalate to engineer

For backend-only work, replace visual previews with API examples, behavior traces, logs, and test output.

For marketing work, use comparison tables, landing page copy diffs, competitor notes, and screenshots.

For design work, use side-by-side visual diffs, interaction walkthroughs, and accessibility notes.

## Suggested Status Model

```ts
type ContributionStatus =
  | "intake"
  | "clarifying"
  | "intent_ready"
  | "intent_approved"
  | "planning"
  | "plan_ready"
  | "plan_approved"
  | "executing"
  | "preview_ready"
  | "agent_reviewing"
  | "human_review"
  | "revision_requested"
  | "ship_approved"
  | "pr_created"
  | "done"
  | "blocked"
  | "cancelled"
  | "failed";
```

Do not collapse all terminal states into one ambiguous `done` state. The dashboard and notifications should show whether a request shipped, was cancelled, failed, or was intentionally blocked.

## Convex Responsibilities

Convex should own durable collaboration state:

- Requests
- Threads and messages
- Artifacts
- Approval gates
- Workflow status
- Job metadata
- Live UI updates
- Human-in-loop assignments
- Retry and resume metadata

Convex should not run unsafe local code directly. Execution jobs that touch repos, browsers, or local credentials should run in dedicated workers and report results back to Convex.

Useful Convex references:

- Agents overview: https://docs.convex.dev/agents
- Threads and messages: https://docs.convex.dev/agents/threads
- Tools: https://docs.convex.dev/agents/tools
- Human agents: https://docs.convex.dev/agents/human-agents
- Workflows: https://docs.convex.dev/agents/workflows

## OpenClaw Responsibilities

OpenClaw can be used as an agent runtime, especially if building the agent layer from scratch is too expensive.

Use it for:

- Brainstorming
- Multi-step planning
- Skill/tool routing
- Web research
- Competitive research
- Plan critique
- Implementation review
- Subagent delegation

Do not use it for:

- Primary request state
- Approval authority
- Org permissions
- Source adapter ownership
- Unreviewed PR shipping
- Running with broad credentials on a normal workstation

Useful OpenClaw references:

- GitHub repo: https://github.com/openclaw/openclaw
- Agent loop: https://docs.openclaw.ai/concepts/agent-loop
- Skills: https://docs.openclaw.ai/tools/skills
- Plugin runtime helpers: https://docs.openclaw.ai/plugins/sdk-runtime

Before integrating OpenClaw, validate the current license, runtime API, security model, and whether the needed pieces can be used as libraries instead of installing the full app.

## Security And Trust Boundaries

This product will touch source code, credentials, customer context, and company strategy. The trust model must be explicit.

Rules:

- Never give agent runtimes broad production credentials.
- Run code execution in isolated worktrees or containers.
- Keep OpenClaw or any third-party runtime behind an adapter and a sandbox.
- Pin skills and plugins. Do not auto-install community skills into production workflows.
- Persist every tool call and result summary as part of the request audit trail.
- Require engineering approval for high-risk areas: auth, billing, data deletion, migrations, permissions, infrastructure, secrets, and production config.
- Default to preview/review before PR.

## Implementation Phases

### Phase 1: Reframe The Core Model

- Add Convex schema for `ContributionRequest`, `Artifact`, `ApprovalGate`, and `Job`.
- Create a `SourceAdapter` interface.
- Move Slack logic behind `SlackSourceAdapter`.
- Add a dashboard view for requests and artifacts.
- Keep the existing direct planner temporarily, but do not let Slack own the orchestration.

Exit criteria:

- A request can be created from Slack or dashboard through the same backend path.
- Conversation history and artifacts survive server restart.
- The request status model is visible in the dashboard.

### Phase 2: Add Plan Approval And Review Bundle

- Add `IntentContract` generation.
- Add `PlanArtifact` generation.
- Add explicit plan approval before execution.
- Add preview bundle generation after execution.
- Add revision request flow that loops back into the same request and branch.

Exit criteria:

- A non-coder can review a preview bundle without opening GitHub.
- "Request changes" creates a new iteration, not a new disconnected task.
- The PR includes links or summaries for all relevant artifacts.

### Phase 3: Agent Runtime Adapter

- Create the `AgentRuntime` interface.
- Implement `DirectLLMAgentRuntime` for simple brainstorming, planning, and review.
- Add prompt contracts for each method.
- Add structured outputs for intent contracts, plans, review notes, and risk classifications.

Exit criteria:

- The backend can switch agent runtime without changing source adapters.
- Planner selection is per request or per team, not only global.
- Review is a separate runtime call from implementation.

### Phase 4: OpenClaw Adapter Experiment

- Audit OpenClaw source, license, and runtime entry points.
- Decide whether to run OpenClaw as a local service, library, or isolated worker.
- Implement `OpenClawAgentRuntime` behind the same interface.
- Allow only approved skills in a sandboxed workspace.
- Compare output quality and operational risk against `DirectLLMAgentRuntime`.

Exit criteria:

- OpenClaw can produce a brainstorm, plan, or review artifact without owning SpecFlow state.
- OpenClaw can be disabled without breaking the product.
- Security and sandbox boundaries are documented and tested.

### Phase 5: Multi-Surface Expansion

- Add browser extension source adapter.
- Add GitHub source adapter.
- Add Linear or issue tracker source adapter.
- Add source-specific reply rendering while preserving the shared request model.

Exit criteria:

- The same request can be created from at least three surfaces.
- All surfaces see the same status and artifact history.
- No source adapter contains business orchestration logic.

## Future Agent Instructions

When developing this system:

- Do not extend the current Slack happy path as the core architecture.
- Start from `ContributionRequest`, artifacts, and approval gates.
- Keep source adapters thin.
- Keep agent runtimes replaceable.
- Keep human-facing review bundles central.
- Do not push or create PRs before preview/review artifacts exist.
- Prefer durable Convex state over in-memory session maps.
- Treat OpenClaw as a runtime adapter, not the product’s source of truth.

## Success Criteria

The system is working when:

- A designer can submit a feature idea, approve a plan, review visual previews, request revisions, and hand off a PR without reading code.
- A marketer can ask for competitor research, receive a sourced research artifact, propose a product or copy change, and review the result in context.
- An engineer can see the full decision trail, inspect the branch, review test output, and intervene only where judgment or safety requires it.
- Every request has a durable timeline of intent, plan, implementation, review, approval, and shipping outcome.
- The backend can add new surfaces without rewriting the core workflow.
