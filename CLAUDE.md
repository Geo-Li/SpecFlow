# SpecFlow

Slack-driven development automation tool. Users trigger tasks from Slack, a planning agent converses to create implementation plans, Claude Code CLI executes the implementation, and PRs are raised automatically.

## Architecture

TypeScript monorepo (pnpm workspaces + Turborepo) with four packages:

- **`packages/shared`** — Types, Zod config schemas, design tokens. Zero runtime deps except Zod.
- **`packages/convex`** — Convex backend for durable state: contribution requests, artifacts, approval gates, jobs, and the planning agent. Uses `@convex-dev/agent` for the conversation loop.
- **`packages/server`** — Express REST API (port 3001) + Slack Bolt (Socket Mode). Thin Slack adapter + execution worker. Calls Convex HTTP endpoints for state management.
- **`packages/web`** — Next.js 14 admin dashboard (port 3000). Tailwind CSS + Headless UI. Calls server REST API.

Package boundaries: `server` and `web` import from `shared` only. Never cross-import.

## Commands

```bash
pnpm install         # Install all workspace dependencies
pnpm dev             # Start both server and web (via Turborepo)
pnpm build           # Build all packages

# Individual packages
cd packages/server && pnpm dev       # Server only (tsx watch, port 3001)
cd packages/web && pnpm dev          # Dashboard only (next dev, port 3000)
cd packages/convex && pnpm dev       # Convex dev server (syncs schema + functions)
```

## Required Environment Variables

```
SLACK_BOT_TOKEN=xoxb-...        # Slack bot token (required)
SLACK_APP_TOKEN=xapp-...        # Slack app token for Socket Mode (required)
SPECFLOW_ADMIN_PASSWORD=...     # Admin dashboard password (required)
SPECFLOW_JWT_SECRET=...         # JWT signing secret (optional, auto-generated)
CONVEX_SITE_URL=https://...     # Convex deployment URL (required)
CONVEX_AUTH_TOKEN=...           # Shared secret for Convex HTTP auth (recommended)
```

## Key Files

- `packages/server/src/index.ts` — Server entrypoint, wires everything together
- `packages/server/src/slack/handlers.ts` — Slack event handlers (mention, DM, thread replies)
- `packages/server/src/slack/actions.ts` — Block Kit button handlers (Confirm/Edit/Cancel)
- `packages/server/src/planner/` — Planning agent with Anthropic + OpenAI-compatible providers
- `packages/server/src/executor/` — Claude Code CLI execution, git ops, PR creation
- `packages/server/src/convex-client.ts` — HTTP client for calling Convex backend
- `packages/server/src/utils.ts` — Shared utilities (sanitizeError, getDefaultRepoId, buildLegacySession, status constants)
- `packages/convex/convex/schema.ts` — Convex table definitions
- `packages/convex/convex/agent.ts` — Planning agent definition with tools
- `packages/convex/convex/http.ts` — HTTP endpoints for Express server integration
- `packages/server/src/api/` — REST API routes + JWT auth
- `packages/web/src/app/` — Dashboard pages (overview, settings, providers, repos, sessions)
- `packages/shared/src/types.ts` — All TypeScript interfaces
- `packages/shared/src/design-tokens.ts` — UI design system values

## Config

Stored at `~/.specflow/config.json`. Managed via the admin dashboard or REST API. Validated with Zod.

## Design System

Colors, typography, spacing defined in `packages/shared/src/design-tokens.ts` and enforced via `packages/web/tailwind.config.ts`. See `docs/superpowers/specs/2026-04-05-specflow-mvp-design.md` for the full UI design system spec.

## Conventions

- When adding packages, changing env vars, altering architecture, or modifying commands, update `README.md` to match
- All git operations use `execFileSync` (not `exec`) to prevent shell injection
- Session state transitions validated by `session-machine.ts`
- Planning LLM calls retry once on failure before giving up
- Claude Code CLI receives plan via stdin (not CLI args) to avoid ARG_MAX limits
- Two execution modes: worktree (default, parallel-safe) and branch (serial per-repo)
