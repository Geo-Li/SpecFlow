# SpecFlow

Slack-driven development automation tool. Users trigger tasks from Slack, a planning agent converses to create implementation plans, Claude Code CLI executes the implementation, and PRs are raised automatically.

## Architecture

TypeScript monorepo (npm workspaces + Turborepo) with three packages:

- **`packages/shared`** — Types, Zod config schemas, design tokens. Zero runtime deps except Zod.
- **`packages/server`** — Express REST API (port 3001) + Slack Bolt (Socket Mode). Handles planning agent conversations, Claude Code CLI execution, session management, and admin API.
- **`packages/web`** — Next.js 14 admin dashboard (port 3000). Tailwind CSS + Headless UI. Calls server REST API.

Package boundaries: `server` and `web` import from `shared` only. Never cross-import.

## Commands

```bash
npm install          # Install all workspace dependencies
npm run dev          # Start both server and web (via Turborepo)
npm run build        # Build all packages

# Individual packages
cd packages/server && npm run dev    # Server only (tsx watch, port 3001)
cd packages/web && npm run dev       # Dashboard only (next dev, port 3000)
```

## Required Environment Variables

```
SLACK_BOT_TOKEN=xoxb-...        # Slack bot token (required)
SLACK_APP_TOKEN=xapp-...        # Slack app token for Socket Mode (required)
SPECFLOW_ADMIN_PASSWORD=...     # Admin dashboard password (required)
SPECFLOW_JWT_SECRET=...         # JWT signing secret (optional, auto-generated)
```

## Key Files

- `packages/server/src/index.ts` — Server entrypoint, wires everything together
- `packages/server/src/slack/handlers.ts` — Slack event handlers (mention, DM, thread replies)
- `packages/server/src/slack/actions.ts` — Block Kit button handlers (Confirm/Edit/Cancel)
- `packages/server/src/planner/` — Planning agent with Anthropic + OpenAI-compatible providers
- `packages/server/src/executor/` — Claude Code CLI execution, git ops, PR creation
- `packages/server/src/sessions/` — In-memory session store + state machine
- `packages/server/src/api/` — REST API routes + JWT auth
- `packages/web/src/app/` — Dashboard pages (overview, settings, providers, repos, sessions)
- `packages/shared/src/types.ts` — All TypeScript interfaces
- `packages/shared/src/design-tokens.ts` — UI design system values

## Config

Stored at `~/.specflow/config.json`. Managed via the admin dashboard or REST API. Validated with Zod.

## Design System

Colors, typography, spacing defined in `packages/shared/src/design-tokens.ts` and enforced via `packages/web/tailwind.config.ts`. See `docs/superpowers/specs/2026-04-05-specflow-mvp-design.md` for the full UI design system spec.

## Conventions

- All git operations use `execFileSync` (not `exec`) to prevent shell injection
- Session state transitions validated by `session-machine.ts`
- Planning LLM calls retry once on failure before giving up
- Claude Code CLI receives plan via stdin (not CLI args) to avoid ARG_MAX limits
- Two execution modes: worktree (default, parallel-safe) and branch (serial per-repo)
