# SpecFlow MVP Design Spec

## Overview

SpecFlow is a Slack-driven development automation tool. Users trigger it from Slack (DM or channel mention), a planning agent converses with the user to produce an implementation plan, the user confirms the plan, Claude Code CLI executes the implementation on a local repo, a PR is raised, and the result is broadcast back to Slack.

## Core Flow

```
User (Slack)                    SpecFlow Server                     Claude Code CLI
    |                                |                                    |
    |--- @bot "add auth to app" --->|                                    |
    |                                |--- Create Slack thread             |
    |                                |--- Call planning LLM               |
    |<-- "What auth method?" --------|                                    |
    |--- "OAuth with Google" ------>|                                    |
    |<-- "Here's the plan:..." -----|                                    |
    |                                |   (user reviews/edits in thread)   |
    |--- "Confirmed" -------------->|                                    |
    |                                |--- Spawn claude CLI -------------->|
    |                                |    with confirmed plan              |-- implements
    |                                |                                    |-- git commit
    |                                |<-- exit 0 -------------------------|
    |                                |--- gh pr create                    |
    |<-- "PR raised: [link]" -------|                                    |
```

## Architecture

### Approach: Monorepo, Single Process

One Express server handles Slack events, the admin dashboard (Next.js), and Claude Code CLI execution. All in a TypeScript monorepo using npm workspaces + Turborepo.

### Monorepo Structure

```
specflow/
├── packages/
│   ├── server/                 <- Express app
│   │   ├── src/
│   │   │   ├── slack/          <- Bolt event handlers (message, mention, reaction)
│   │   │   ├── planner/        <- Planning agent wrapper (Anthropic + OpenAI-compat)
│   │   │   ├── executor/       <- Claude Code CLI spawner + monitor
│   │   │   ├── sessions/       <- Session state machine
│   │   │   ├── api/            <- REST API for the admin dashboard
│   │   │   └── index.ts        <- App entrypoint
│   │   └── package.json
│   ├── web/                    <- Next.js admin dashboard
│   │   ├── src/
│   │   │   ├── app/            <- App router pages
│   │   │   ├── components/     <- UI components (Headless UI + Tailwind)
│   │   │   └── lib/            <- API client, hooks
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   └── shared/                 <- Shared across packages
│       ├── src/
│       │   ├── types.ts        <- Session, Config, Plan types
│       │   ├── config.ts       <- Config schema (Zod)
│       │   └── design-tokens.ts<- Colors, spacing, fonts as constants
│       └── package.json
├── docs/
├── turbo.json
├── package.json
└── tsconfig.base.json
```

### Package Boundaries

- `server` never imports from `web`; `web` never imports from `server`
- Both import from `shared` only
- `shared` has zero runtime dependencies (Zod is the only dep, for config validation)

### Runtime Composition

Express and Next.js run as **separate processes** on different ports:
- Express (`packages/server`): port 3001 — handles Slack events (via Bolt Socket Mode, which manages its own WebSocket and does NOT use Express), REST API for the dashboard, and Claude Code execution.
- Next.js (`packages/web`): port 3000 — the admin dashboard, calls Express REST API.

Bolt's Socket Mode uses its own receiver (not Express). Express is only used for the REST API. They coexist in the same process but are independent: Bolt manages its WebSocket connection to Slack, Express listens on a port for HTTP.

Turborepo orchestrates starting both with `turbo dev`.

## Key Entities

### Session

A single task lifecycle from Slack message to PR.

Fields:
- `id` — unique session ID (nanoid)
- `channelId` — Slack channel
- `threadTs` — Slack thread timestamp (thread identity)
- `userId` — Slack user who initiated
- `conversationHistory` — array of `{role, content}` messages between user and planning LLM
- `plan` — the current plan text (null until generated)
- `status` — current state in the state machine
- `prUrl` — PR URL once created (null until then)
- `repoPath` — local repo path for this session
- `providerConfig` — which LLM provider + model was used
- `createdAt` / `updatedAt` — timestamps
- `error` — error message if execution failed

### Session State Machine

```
idle -> planning -> awaiting_confirmation -> executing -> done
                        ^       |
                        |       v
                      editing (user requests changes to plan)

Any state can transition to -> done (with error) on unrecoverable failure or timeout.
```

Transitions:
- `idle -> planning`: Slack message received, thread created
- `planning -> awaiting_confirmation`: Planning LLM produces a plan, posted to thread
- `planning -> done`: Planning LLM fails after retry, session ends with error
- `awaiting_confirmation -> editing`: User requests changes
- `editing -> awaiting_confirmation`: Revised plan posted
- `editing -> done`: Planning LLM fails during revision after retry
- `awaiting_confirmation -> executing`: User confirms (see Confirmation Detection below)
- `executing -> done`: Claude Code exits 0, PR created, link posted (success). OR Claude Code fails (error).
- `* -> done`: Session timeout after 30 minutes of inactivity (no user messages). Server posts a timeout notice to the Slack thread.

Note: `pr_created` was collapsed into `done` with `prUrl` populated. The `done` state carries either a `prUrl` (success) or `error` (failure).

### Session Cleanup

Sessions in any non-terminal state are checked every 5 minutes. If `updatedAt` is older than 30 minutes, the session transitions to `done` with a timeout error. The Slack thread receives a message: "This session timed out due to inactivity. Start a new request to try again."

### Storage

In-memory for MVP: `Map<sessionId, Session>`. No database dependency. Sessions are lost on server restart. Sufficient for single-admin local use.

## Planning Agent

### Interface

```typescript
interface PlanningAgent {
  chat(history: Message[], systemPrompt: string): Promise<string>;
}
```

The planner is stateless. The session manager owns the conversation loop and history. The planner just takes history in, returns the next message.

### Provider Support

Two modes, configured via admin dashboard:

**Anthropic (native):**
- Uses `@anthropic-ai/sdk`
- Supports Claude models (claude-sonnet, claude-opus, etc.)
- Config: API key, model name

**OpenAI-compatible:**
- Uses `openai` SDK with custom `baseURL`
- Covers: OpenAI, Azure OpenAI, OpenRouter, local models (Ollama, vLLM), any OpenAI-compatible endpoint
- Config: base URL, API key, model name

### System Prompt

A default system prompt instructs the planning LLM to:
1. Understand the user's request by asking clarifying questions
2. Produce a structured implementation plan with clear steps
3. Format the plan in markdown for readability in Slack

Admin can override the system prompt via the dashboard.

## Executor (Claude Code CLI)

### Execution Modes

Users can choose how the executor manages git for their session. This can be specified during the planning conversation or at confirmation time. Two modes:

**Branch mode:**
- Forks a new branch (`specflow/<session-id>`) from a user-specified base branch (e.g., `main`, `develop`, `feature/auth`).
- Executes in the **main repo checkout** directory.
- **Constraint:** Only one branch-mode execution can run per repo at a time, since they share the working directory. If another branch-mode execution is running on the same repo, the session queues with a position notification.
- Best for: simple tasks, users who want changes based on a specific feature branch.

**Worktree mode (default):**
- Creates an isolated git worktree at `/tmp/specflow-wt-<session-id>`, branching from a user-specified base (defaults to the repo's default branch).
- Executes in the worktree directory — fully isolated from the main checkout and other worktrees.
- **Parallel-safe:** Multiple worktree-mode executions can run simultaneously on the same repo with zero collisions.
- Clean up: worktree is removed after PR creation or on failure.
- Best for: team use, parallel tasks, safety.

If the user doesn't specify a mode, **worktree mode** is used (safest). If the user doesn't specify a base branch, the repo's configured default branch is used.

**Resource limits:** Admin can configure `maxConcurrentExecutions` in the dashboard (default: 3). When the limit is reached, new confirmations enter a FIFO queue and the user is notified: "Your task is queued (position #N). You'll be notified when execution starts." This limit applies across both modes.

### Repo Selection

When a user triggers a task from Slack:
- If only **one repo** is configured, it is used automatically.
- If **multiple repos** are configured, the bot asks the user to pick one (posting a numbered list in the thread). The user replies with the number.
- Admin can set a **default repo** in the dashboard. If set, the default is used unless the user specifies otherwise.

### Execution Flow

**Setup phase (both modes):**
1. Validate the configured repo path exists and is a git repo.
2. `git fetch origin` on the main repo to get latest remote state.
3. Determine working directory based on mode:
   - **Worktree mode:** `git worktree add /tmp/specflow-wt-<session-id> -b specflow/<session-id> origin/<base-branch>`. If branch exists, append numeric suffix.
   - **Branch mode:** Acquire per-repo lock (wait if another branch-mode session is active). `git checkout <base-branch> && git pull origin <base-branch>`, then `git checkout -b specflow/<session-id>`. Working directory is the main repo path.
4. Write the confirmed plan to a temp file (to avoid shell argument length limits).

**Execution phase:**
5. Spawn `claude` CLI as a child process:
   - Working directory: worktree path or main repo path (depending on mode).
   - Command: `claude --print -p "$(cat /tmp/specflow-<session-id>.txt)"` — uses `--print` for non-interactive single-pass execution. The `-p` flag passes the prompt.
   - The plan prompt instructs Claude Code to make changes and commit them.
6. Post an "execution started" message to Slack. Post progress updates every 30 seconds if stdout has new content (max 1 update per 30s to avoid flooding).

**Completion phase:**
7. On exit code 0:
   - Verify there are new commits on the branch (if not, post "no changes were made" and end).
   - `git push origin specflow/<session-id>`.
   - Run `gh pr create --title "<title>" --body "<body>" --base <base-branch>` where:
     - `<title>` is extracted from the first line of the plan (truncated to 72 chars), or falls back to the original Slack message (first 72 chars).
     - `<body>` is the full plan text.
     - `<base-branch>` is the user-specified base branch (so PRs target the right branch).
   - Capture the PR URL.
   - Post PR link to Slack thread.
8. On non-zero exit:
   - Capture last 50 lines of stderr.
   - Post truncated error to Slack thread.
   - Set session status to done with error.

**Cleanup phase:**
9. Delete the temp plan file.
10. **Worktree mode:** `git worktree remove /tmp/specflow-wt-<session-id>`.
11. **Branch mode:** Release per-repo lock. Checkout default branch: `git checkout <default-branch>`.

### Git Ownership

The **executor** owns all git operations (fetch, branch, push, PR creation). Claude Code CLI is responsible only for making code changes and committing them. The executor handles branch management and PR creation.

### Requirements

- `claude` CLI must be installed and authenticated on the host machine
- `gh` CLI must be installed and authenticated for PR creation
- Git must be configured with push access to the remote

## Admin Dashboard

### Tech Stack

- Next.js 14+ (App Router)
- Tailwind CSS
- Headless UI (for accessible interactive components: modals, dropdowns, toggles)
- Auth: simple token-based auth for MVP (see Auth section below)

### Pages

| Route | Purpose |
|---|---|
| `/` | Dashboard overview: active sessions count, recent PRs, system status |
| `/settings` | Global settings: Slack app tokens (bot token, signing secret), default LLM provider |
| `/providers` | LLM provider config: add/edit/delete provider entries (Anthropic key, OpenAI-compat endpoints) |
| `/repos` | Repository config: local paths, default branch name, PR title template |
| `/sessions` | Session history: view past conversations, plans, statuses, PR links |

### API (served by Express)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/config` | Get current config |
| PUT | `/api/config` | Update config |
| GET | `/api/providers` | List LLM providers |
| POST | `/api/providers` | Add provider |
| PUT | `/api/providers/:id` | Update provider |
| DELETE | `/api/providers/:id` | Delete provider |
| GET | `/api/repos` | List configured repos |
| POST | `/api/repos` | Add repo |
| PUT | `/api/repos/:id` | Update repo |
| DELETE | `/api/repos/:id` | Delete repo |
| GET | `/api/sessions` | List sessions (with filters) |
| GET | `/api/sessions/:id` | Get session detail |

### Dashboard Auth

Single-admin password auth for MVP:
- Admin password is set via environment variable `SPECFLOW_ADMIN_PASSWORD` (required at startup).
- Login page at `/login`: admin enters password.
- On success, server issues a JWT (signed with a random secret generated at startup, or `SPECFLOW_JWT_SECRET` env var if set). Token is stored in an httpOnly cookie.
- All `/api/*` routes check for the cookie. 401 if missing/invalid.
- Token expires after 24 hours. No refresh — admin logs in again.
- No user management, no roles. Single admin only.

### Config Persistence

Config is stored as a JSON file on disk (`~/.specflow/config.json`). Loaded on startup, written on save from the dashboard. Validated with Zod schema from `shared`.

## UI Design System

All values are codified in `tailwind.config.ts` and `shared/design-tokens.ts`.

### Colors

| Token | Value | Usage |
|---|---|---|
| `primary` | `#6366F1` (Indigo 500) | Buttons, links, active states |
| `primary-dark` | `#4F46E5` (Indigo 600) | Hover/active on primary elements |
| `primary-light` | `#EEF2FF` (Indigo 50) | Subtle primary backgrounds |
| `surface` | `#FFFFFF` | Card/panel backgrounds |
| `background` | `#F9FAFB` (Gray 50) | Page background |
| `text-primary` | `#111827` (Gray 900) | Body text |
| `text-secondary` | `#6B7280` (Gray 500) | Labels, hints, secondary info |
| `text-tertiary` | `#9CA3AF` (Gray 400) | Disabled text, placeholders |
| `success` | `#10B981` (Emerald 500) | PR created, execution complete |
| `success-light` | `#ECFDF5` (Emerald 50) | Success backgrounds |
| `warning` | `#F59E0B` (Amber 500) | Awaiting confirmation |
| `warning-light` | `#FFFBEB` (Amber 50) | Warning backgrounds |
| `error` | `#EF4444` (Red 500) | Failed executions |
| `error-light` | `#FEF2F2` (Red 50) | Error backgrounds |
| `border` | `#E5E7EB` (Gray 200) | Card borders, dividers |
| `border-dark` | `#D1D5DB` (Gray 300) | Input borders on focus |

### Typography

- **Font family:** Inter (with system fallbacks: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- **Scale:**
  - `text-xs` (12px): Badges, timestamps
  - `text-sm` (14px): Body text, table cells
  - `text-base` (16px): Emphasized body, input text
  - `text-lg` (18px): Section headings
  - `text-xl` (20px): Page titles
  - `text-2xl` (24px): Dashboard hero numbers
- **Weights:** `font-normal` (400) body, `font-medium` (500) labels/buttons, `font-semibold` (600) headings

### Spacing

- Base unit: 4px (Tailwind default)
- Card padding: `p-6` (24px)
- Page margins: `px-8 py-6` (32px horizontal, 24px vertical)
- Section gaps: `gap-6` (24px) between cards, `gap-4` (16px) within cards
- Form field gaps: `space-y-4` (16px)

### Borders & Radius

- Cards: `rounded-lg` (8px), `border border-border`
- Buttons: `rounded-md` (6px)
- Inputs: `rounded-md` (6px), `border border-border`, `focus:border-primary focus:ring-1 focus:ring-primary`
- Badges/pills: `rounded-full`

### Shadows

- Cards: `shadow-sm`
- Dropdowns/modals: `shadow-lg`
- Hover elevation: `hover:shadow-md` on interactive cards

### Component Patterns

- **Buttons:** Primary (`bg-primary text-white hover:bg-primary-dark`), Secondary (`bg-white border text-text-primary hover:bg-gray-50`), Danger (`bg-error text-white`)
- **Cards:** `bg-surface rounded-lg border border-border shadow-sm p-6`
- **Status badges:** Colored pills using status-specific `bg-{status}-light text-{status}` pairs
- **Tables:** Alternating row backgrounds (`even:bg-gray-50`), sticky headers
- **Sidebar nav:** Fixed left, 256px width, `bg-gray-900 text-white` with indigo active indicator

## Slack Integration

### Slack App Setup (prerequisites)

The admin must create a Slack app with:
- **Bot Token Scopes:** `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`, `channels:history`
- **Event Subscriptions:** `app_mention`, `message.im`
- **Socket Mode** enabled (avoids needing a public URL for MVP)

### Event Handling

Using `@slack/bolt` in Socket Mode:

- `app_mention` event: User mentions bot in a channel. Extract text, create session, start thread.
- `message.im` event: User DMs the bot. Extract text, create session, reply in DM.
- Thread replies: When `threadTs` matches an active session, route the message to the planning agent.
- Confirmation detection: See "Confirmation Detection" section below.

### Confirmation Detection

When the planning agent produces a final plan, the bot posts it as a Slack message with **Block Kit interactive buttons**:

```
[Plan text in markdown blocks]

───────────────────
[ ✅ Confirm ]  [ ✏️ Edit ]  [ ❌ Cancel ]
```

**Button actions:**
- **Confirm:** Transitions session to `executing`. Only the initiating user can confirm (checked via `user_id` on the action payload). Buttons are replaced with "Confirmed by @user — execution started."
- **Edit:** Bot replies in the thread: "What would you like to change?" and transitions to `editing` state. Thread replies are routed back to the planning agent. When a revised plan is ready, a new message with buttons is posted.
- **Cancel:** Transitions session to `done` with no error, no PR. Buttons are replaced with "Cancelled by @user." Bot posts a confirmation: "Session cancelled. Start a new request anytime."

**Slack requirements:** The app needs the `interactivity` feature enabled (Request URL for Socket Mode is handled automatically by Bolt). No additional OAuth scopes needed — button interactions are sent via the existing Socket Mode WebSocket.

**Thread replies during `awaiting_confirmation`:** Any text reply in the thread (not a button click) is treated as an edit request and routed to the planning agent. This provides a natural fallback if the user prefers typing over buttons.

### Startup Validation

On startup, the server runs health checks and logs warnings/errors:
- **Required:** `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` env vars are set (fatal if missing).
- **Required:** `SPECFLOW_ADMIN_PASSWORD` env var is set (fatal if missing).
- **Warning:** `claude` CLI is on PATH and responds to `claude --version`.
- **Warning:** `gh` CLI is on PATH and `gh auth status` succeeds.
- **Warning:** All configured repo paths exist and are git repos.

Fatal checks prevent startup. Warnings allow startup but are logged prominently and shown on the dashboard overview page.

## Error Handling

- **Planning LLM failures:** Retry once, then post error to Slack thread with "try again" suggestion.
- **Claude Code CLI failures:** Capture stderr, post truncated error to Slack thread, set session to error state.
- **PR creation failures:** Post error with manual instructions to Slack thread.
- **Config validation:** Zod schemas reject invalid config at save time with clear error messages in the dashboard.

## Future Considerations (NOT in MVP)

- GitHub Issues as trigger source
- Hosted server mode (clone repos from GitHub, no local repo needed)
- Multi-user auth and RBAC on the dashboard
- Persistent database (SQLite/Postgres) for sessions
- Webhook mode for Slack (instead of Socket Mode)
- MCP server configuration per repo
- Execution sandboxing
