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
idle -> planning -> awaiting_confirmation -> executing -> pr_created -> done
                        ^       |
                        |       v
                      editing (user requests changes to plan)
```

Transitions:
- `idle -> planning`: Slack message received, thread created
- `planning -> awaiting_confirmation`: Planning LLM produces a plan, posted to thread
- `awaiting_confirmation -> editing`: User requests changes
- `editing -> awaiting_confirmation`: Revised plan posted
- `awaiting_confirmation -> executing`: User confirms (e.g., reacts with checkmark or says "confirmed")
- `executing -> pr_created`: Claude Code exits 0, PR created successfully
- `executing -> done`: With error, if Claude Code fails
- `pr_created -> done`: PR link posted to Slack

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

### Execution Flow

1. Validate the configured repo path exists and is a git repo
2. Create a new branch: `specflow/<session-id>` from the default branch
3. Spawn `claude` CLI as a child process:
   - Working directory: the repo path
   - Prompt: the confirmed plan text
   - Flags: `--print` for non-interactive output (configurable)
4. Stream stdout/stderr, post periodic status updates to Slack thread
5. On exit code 0:
   - Run `gh pr create --title "<title>" --body "<plan>"`
   - Capture the PR URL
6. On non-zero exit:
   - Post error summary to Slack thread
   - Set session status to done with error

### Requirements

- `claude` CLI must be installed and authenticated on the host machine
- `gh` CLI must be installed and authenticated for PR creation
- Git must be configured with push access to the remote

## Admin Dashboard

### Tech Stack

- Next.js 14+ (App Router)
- Tailwind CSS
- Headless UI (for accessible interactive components: modals, dropdowns, toggles)
- Auth: simple token-based auth for MVP (single admin password)

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
- Confirmation detection: Look for explicit confirmation keywords ("confirm", "approved", "go ahead", "ship it") or a checkmark reaction (`:white_check_mark:`).

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
