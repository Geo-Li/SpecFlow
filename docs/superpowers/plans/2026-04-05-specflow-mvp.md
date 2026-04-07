# SpecFlow MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Slack-driven development automation tool that converses with users to create implementation plans, executes them via Claude Code CLI, and raises PRs — with an admin dashboard for configuration.

**Architecture:** TypeScript monorepo (Turborepo + pnpm workspaces) with three packages: `server` (Express + Slack Bolt), `web` (Next.js dashboard), and `shared` (types + config schemas). Server handles Slack events via Socket Mode, planning agent conversations, Claude Code CLI execution, and REST API. Dashboard provides admin config UI.

**Tech Stack:** TypeScript, Turborepo, Express, @slack/bolt, @anthropic-ai/sdk, openai, Next.js 14 (App Router), Tailwind CSS, Headless UI, Zod, nanoid, jsonwebtoken

**Spec:** `docs/superpowers/specs/2026-04-05-specflow-mvp-design.md`

---

## File Structure

```
specflow/
├── package.json                          # Root workspace config
├── turbo.json                            # Turborepo pipeline config
├── tsconfig.base.json                    # Shared TS config
├── .env.example                          # Template for required env vars
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # Barrel export
│   │       ├── types.ts                  # Session, Config, Provider, Repo types
│   │       ├── config.ts                 # Zod schemas for config validation
│   │       └── design-tokens.ts          # Colors, spacing, fonts as constants
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # App entrypoint: start Express + Bolt
│   │       ├── env.ts                    # Env var validation + startup checks
│   │       ├── config-store.ts           # Load/save ~/.specflow/config.json
│   │       ├── sessions/
│   │       │   ├── session-store.ts      # In-memory Map + CRUD
│   │       │   ├── session-machine.ts    # State transitions + validation
│   │       │   └── session-cleanup.ts    # Timeout sweep (30min / 5min interval)
│   │       ├── planner/
│   │       │   ├── planner.ts            # PlanningAgent interface + factory
│   │       │   ├── anthropic-provider.ts # Anthropic SDK wrapper
│   │       │   ├── openai-provider.ts    # OpenAI-compat wrapper
│   │       │   └── system-prompt.ts      # Default planning system prompt
│   │       ├── executor/
│   │       │   ├── executor.ts           # Orchestrates git + claude CLI + PR
│   │       │   ├── git-ops.ts            # Git operations (fetch, branch, worktree, push)
│   │       │   ├── claude-runner.ts      # Spawn claude CLI, stream output
│   │       │   ├── pr-creator.ts         # gh pr create wrapper
│   │       │   └── execution-queue.ts    # Concurrency limiter + FIFO queue
│   │       ├── slack/
│   │       │   ├── app.ts                # Bolt app setup (Socket Mode)
│   │       │   ├── handlers.ts           # Event handlers (mention, DM, thread)
│   │       │   ├── actions.ts            # Block Kit button action handlers
│   │       │   ├── blocks.ts             # Block Kit message builders (plan, buttons)
│   │       │   └── thread-router.ts      # Route thread messages to correct session
│   │       └── api/
│   │           ├── router.ts             # Express router: mount all routes
│   │           ├── auth.ts               # JWT middleware + login endpoint
│   │           ├── config-routes.ts      # GET/PUT /api/config
│   │           ├── provider-routes.ts    # CRUD /api/providers
│   │           ├── repo-routes.ts        # CRUD /api/repos
│   │           └── session-routes.ts     # GET /api/sessions, GET /api/sessions/:id
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── tailwind.config.ts            # Design system tokens
│       ├── postcss.config.mjs
│       └── src/
│           ├── app/
│           │   ├── layout.tsx            # Root layout with sidebar nav
│           │   ├── page.tsx              # Dashboard overview
│           │   ├── login/page.tsx        # Login page
│           │   ├── settings/page.tsx     # Global settings
│           │   ├── providers/page.tsx    # LLM provider config
│           │   ├── repos/page.tsx        # Repository config
│           │   └── sessions/
│           │       ├── page.tsx          # Session list
│           │       └── [id]/page.tsx     # Session detail
│           ├── components/
│           │   ├── sidebar.tsx           # Navigation sidebar
│           │   ├── status-badge.tsx      # Session status pills
│           │   ├── card.tsx              # Reusable card component
│           │   ├── button.tsx            # Primary/Secondary/Danger buttons
│           │   ├── input.tsx             # Form input with label
│           │   ├── modal.tsx             # Headless UI modal wrapper
│           │   └── page-header.tsx       # Page title + description
│           └── lib/
│               ├── api.ts               # Fetch wrapper for Express API
│               └── auth.ts              # Auth state, login/logout helpers
```

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json` (root)
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/postcss.config.mjs`
- Create: `packages/web/tailwind.config.ts`

- [ ] **Step 1: Create root package.json with workspaces**

```json
{
  "name": "specflow",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5.5"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 4: Create packages/shared/package.json and tsconfig.json**

`packages/shared/package.json`:
```json
{
  "name": "@specflow/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "zod": "^3.23"
  },
  "devDependencies": {
    "typescript": "^5.5"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 5: Create packages/server/package.json and tsconfig.json**

`packages/server/package.json`:
```json
{
  "name": "@specflow/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@specflow/shared": "workspace:*",
    "@slack/bolt": "^4",
    "@anthropic-ai/sdk": "^0.39",
    "openai": "^4",
    "express": "^4.21",
    "jsonwebtoken": "^9",
    "nanoid": "^5",
    "cors": "^2.8",
    "cookie-parser": "^1.4"
  },
  "devDependencies": {
    "@types/express": "^5",
    "@types/jsonwebtoken": "^9",
    "@types/cors": "^2",
    "@types/cookie-parser": "^1",
    "tsx": "^4",
    "typescript": "^5.5"
  }
}
```

`packages/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 6: Create packages/web scaffold**

`packages/web/package.json`:
```json
{
  "name": "@specflow/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "clean": "rm -rf .next"
  },
  "dependencies": {
    "@specflow/shared": "workspace:*",
    "next": "^14",
    "react": "^18",
    "react-dom": "^18",
    "@headlessui/react": "^2",
    "@heroicons/react": "^2"
  },
  "devDependencies": {
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "tailwindcss": "^3.4",
    "postcss": "^8",
    "autoprefixer": "^10",
    "typescript": "^5.5"
  }
}
```

`packages/web/postcss.config.mjs`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

`packages/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 7: Create .env.example and .gitignore**

`.env.example`:
```
# Required - Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# Required - Admin
SPECFLOW_ADMIN_PASSWORD=changeme

# Optional
SPECFLOW_JWT_SECRET=random-secret-here
```

`.gitignore`:
```
node_modules/
dist/
.next/
.turbo/
.env
*.tsbuildinfo
```

- [ ] **Step 8: Install dependencies and verify build**

Run: `pnpm install`
Expected: Successful install with workspace links.

Run: `npx turbo build`
Expected: All packages compile (will have empty outputs since no source yet — that's fine).

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: scaffold monorepo with Turborepo, shared/server/web packages"
```

---

### Task 2: Shared Package — Types, Config Schema, Design Tokens

**Files:**
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/config.ts`
- Create: `packages/shared/src/design-tokens.ts`

- [ ] **Step 1: Create types.ts with all entity types**

```typescript
// packages/shared/src/types.ts

export type SessionStatus =
  | "idle"
  | "planning"
  | "awaiting_confirmation"
  | "editing"
  | "executing"
  | "done";

export type ExecutionMode = "worktree" | "branch";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: "anthropic" | "openai-compatible";
  apiKey: string;
  model: string;
  baseUrl?: string; // Only for openai-compatible
}

export interface RepoConfig {
  id: string;
  name: string;
  localPath: string;
  defaultBranch: string;
  isDefault: boolean;
}

export interface Session {
  id: string;
  channelId: string;
  threadTs: string;
  userId: string;
  conversationHistory: Message[];
  plan: string | null;
  planMessageTs: string | null; // Slack ts of the plan message (for button updates)
  status: SessionStatus;
  executionMode: ExecutionMode;
  baseBranch: string;
  prUrl: string | null;
  repoId: string;
  providerId: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  originalMessage: string; // The first message that triggered the session
}

export interface AppConfig {
  defaultProviderId: string | null;
  defaultRepoId: string | null;
  maxConcurrentExecutions: number;
  systemPromptOverride: string | null;
  providers: ProviderConfig[];
  repos: RepoConfig[];
}
```

- [ ] **Step 2: Create config.ts with Zod schemas**

```typescript
// packages/shared/src/config.ts
import { z } from "zod";

export const providerConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Provider name is required"),
  type: z.enum(["anthropic", "openai-compatible"]),
  apiKey: z.string().min(1, "API key is required"),
  model: z.string().min(1, "Model name is required"),
  baseUrl: z.string().url().optional(),
});

export const repoConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Repo name is required"),
  localPath: z.string().min(1, "Local path is required"),
  defaultBranch: z.string().default("main"),
  isDefault: z.boolean().default(false),
});

export const appConfigSchema = z.object({
  defaultProviderId: z.string().nullable().default(null),
  defaultRepoId: z.string().nullable().default(null),
  maxConcurrentExecutions: z.number().int().min(1).max(10).default(3),
  systemPromptOverride: z.string().nullable().default(null),
  providers: z.array(providerConfigSchema).default([]),
  repos: z.array(repoConfigSchema).default([]),
});

export type AppConfigInput = z.input<typeof appConfigSchema>;
```

- [ ] **Step 3: Create design-tokens.ts**

```typescript
// packages/shared/src/design-tokens.ts

export const colors = {
  primary: "#6366F1",
  "primary-dark": "#4F46E5",
  "primary-light": "#EEF2FF",
  surface: "#FFFFFF",
  background: "#F9FAFB",
  "text-primary": "#111827",
  "text-secondary": "#6B7280",
  "text-tertiary": "#9CA3AF",
  success: "#10B981",
  "success-light": "#ECFDF5",
  warning: "#F59E0B",
  "warning-light": "#FFFBEB",
  error: "#EF4444",
  "error-light": "#FEF2F2",
  border: "#E5E7EB",
  "border-dark": "#D1D5DB",
} as const;

export const fonts = {
  sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
} as const;

export const sidebar = {
  width: "256px",
  bg: "#111827", // gray-900
} as const;
```

- [ ] **Step 4: Create barrel export index.ts**

```typescript
// packages/shared/src/index.ts
export * from "./types.js";
export * from "./config.js";
export * from "./design-tokens.js";
```

- [ ] **Step 5: Verify shared package compiles**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add types, Zod config schemas, and design tokens"
```

---

### Task 3: Server — Env Validation + Config Store

**Files:**
- Create: `packages/server/src/env.ts`
- Create: `packages/server/src/config-store.ts`

- [ ] **Step 1: Create env.ts — startup validation**

Validate required env vars (`SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SPECFLOW_ADMIN_PASSWORD`) and throw on missing. Generate JWT secret from env or random. Run non-fatal checks for `claude` and `gh` CLI availability using `execFileSync` (not `exec` — avoid shell injection). Collect warnings as string array.

```typescript
// packages/server/src/env.ts
import { execFileSync } from "node:child_process";

interface EnvResult {
  slackBotToken: string;
  slackAppToken: string;
  adminPassword: string;
  jwtSecret: string;
  warnings: string[];
}

export function validateEnv(): EnvResult {
  const warnings: string[] = [];
  const missing: string[] = [];

  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  const slackAppToken = process.env.SLACK_APP_TOKEN;
  const adminPassword = process.env.SPECFLOW_ADMIN_PASSWORD;

  if (!slackBotToken) missing.push("SLACK_BOT_TOKEN");
  if (!slackAppToken) missing.push("SLACK_APP_TOKEN");
  if (!adminPassword) missing.push("SPECFLOW_ADMIN_PASSWORD");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  const jwtSecret =
    process.env.SPECFLOW_JWT_SECRET ||
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  try {
    execFileSync("claude", ["--version"], { stdio: "pipe" });
  } catch {
    warnings.push("claude CLI not found on PATH — execution will fail");
  }

  try {
    execFileSync("gh", ["auth", "status"], { stdio: "pipe" });
  } catch {
    warnings.push("gh CLI not authenticated — PR creation will fail");
  }

  return {
    slackBotToken: slackBotToken!,
    slackAppToken: slackAppToken!,
    adminPassword: adminPassword!,
    jwtSecret,
    warnings,
  };
}
```

- [ ] **Step 2: Create config-store.ts — file-based config persistence**

Load/save `~/.specflow/config.json`. Parse with Zod on load. Create default if missing. Export `loadConfig`, `getConfig`, `saveConfig`.

```typescript
// packages/server/src/config-store.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { appConfigSchema, type AppConfig } from "@specflow/shared";

const CONFIG_DIR = join(homedir(), ".specflow");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: AppConfig = {
  defaultProviderId: null,
  defaultRepoId: null,
  maxConcurrentExecutions: 3,
  systemPromptOverride: null,
  providers: [],
  repos: [],
};

let currentConfig: AppConfig = DEFAULT_CONFIG;

export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_PATH)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    currentConfig = appConfigSchema.parse(raw);
    return currentConfig;
  } catch (err) {
    console.error("Failed to load config, using defaults:", err);
    currentConfig = DEFAULT_CONFIG;
    return DEFAULT_CONFIG;
  }
}

export function getConfig(): AppConfig {
  return currentConfig;
}

export function saveConfig(config: AppConfig): void {
  const validated = appConfigSchema.parse(config);
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(validated, null, 2));
  currentConfig = validated;
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/env.ts packages/server/src/config-store.ts
git commit -m "feat(server): add env validation and file-based config store"
```

---

### Task 4: Server — Session Store + State Machine

**Files:**
- Create: `packages/server/src/sessions/session-store.ts`
- Create: `packages/server/src/sessions/session-machine.ts`
- Create: `packages/server/src/sessions/session-cleanup.ts`

- [ ] **Step 1: Create session-store.ts — in-memory CRUD**

In-memory `Map<string, Session>` with a thread index (`Map<string, string>` mapping `channelId:threadTs` to `sessionId`). Export `createSession`, `getSession`, `getSessionByThread`, `updateSession`, `getAllSessions`, `getActiveSessions`.

```typescript
// packages/server/src/sessions/session-store.ts
import { nanoid } from "nanoid";
import type { Session, SessionStatus, ExecutionMode } from "@specflow/shared";

const sessions = new Map<string, Session>();
const threadIndex = new Map<string, string>();

export interface CreateSessionParams {
  channelId: string;
  threadTs: string;
  userId: string;
  repoId: string;
  providerId: string;
  originalMessage: string;
  executionMode?: ExecutionMode;
  baseBranch?: string;
}

export function createSession(params: CreateSessionParams): Session {
  const session: Session = {
    id: nanoid(),
    channelId: params.channelId,
    threadTs: params.threadTs,
    userId: params.userId,
    conversationHistory: [],
    plan: null,
    planMessageTs: null,
    status: "idle",
    executionMode: params.executionMode || "worktree",
    baseBranch: params.baseBranch || "main",
    prUrl: null,
    repoId: params.repoId,
    providerId: params.providerId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: null,
    originalMessage: params.originalMessage,
  };
  sessions.set(session.id, session);
  threadIndex.set(`${params.channelId}:${params.threadTs}`, session.id);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getSessionByThread(channelId: string, threadTs: string): Session | undefined {
  const id = threadIndex.get(`${channelId}:${threadTs}`);
  return id ? sessions.get(id) : undefined;
}

export function updateSession(id: string, updates: Partial<Session>): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  const updated = { ...session, ...updates, updatedAt: new Date().toISOString() };
  sessions.set(id, updated);
  return updated;
}

export function getAllSessions(): Session[] {
  return Array.from(sessions.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getActiveSessions(): Session[] {
  return getAllSessions().filter((s) => s.status !== "done");
}
```

- [ ] **Step 2: Create session-machine.ts — state transition logic**

Map of valid transitions per state. Export `canTransition` and `assertTransition`.

```typescript
// packages/server/src/sessions/session-machine.ts
import type { SessionStatus } from "@specflow/shared";

const validTransitions: Record<SessionStatus, SessionStatus[]> = {
  idle: ["planning", "done"],
  planning: ["awaiting_confirmation", "done"],
  awaiting_confirmation: ["editing", "executing", "done"],
  editing: ["awaiting_confirmation", "done"],
  executing: ["done"],
  done: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid session transition: ${from} -> ${to}`);
  }
}
```

- [ ] **Step 3: Create session-cleanup.ts — timeout sweep**

Check every 5 minutes. Sessions with `updatedAt` > 30 minutes old transition to `done` with timeout error. Callback notifies Slack.

```typescript
// packages/server/src/sessions/session-cleanup.ts
import { getActiveSessions, updateSession } from "./session-store.js";

const TIMEOUT_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export type TimeoutCallback = (sessionId: string, channelId: string, threadTs: string) => void;

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startCleanupLoop(onTimeout: TimeoutCallback): void {
  intervalId = setInterval(() => {
    const now = Date.now();
    for (const session of getActiveSessions()) {
      const lastUpdate = new Date(session.updatedAt).getTime();
      if (now - lastUpdate > TIMEOUT_MS) {
        updateSession(session.id, { status: "done", error: "Session timed out due to inactivity." });
        onTimeout(session.id, session.channelId, session.threadTs);
      }
    }
  }, CHECK_INTERVAL_MS);
}

export function stopCleanupLoop(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/sessions/
git commit -m "feat(server): add session store, state machine, and cleanup loop"
```

---

### Task 5: Server — Planning Agent (Anthropic + OpenAI-compat)

**Files:**
- Create: `packages/server/src/planner/planner.ts`
- Create: `packages/server/src/planner/anthropic-provider.ts`
- Create: `packages/server/src/planner/openai-provider.ts`
- Create: `packages/server/src/planner/system-prompt.ts`

- [ ] **Step 1: Create system-prompt.ts — default planning prompt**

```typescript
// packages/server/src/planner/system-prompt.ts

export const DEFAULT_SYSTEM_PROMPT = `You are a software development planning assistant. Your job is to help users create clear, actionable implementation plans.

Your process:
1. Understand the user's request. Ask clarifying questions if the request is ambiguous.
2. Once you have enough context, produce a structured implementation plan.
3. Format the plan in markdown with clear numbered steps.

When creating a plan:
- Break the work into concrete, ordered steps
- Specify which files to create or modify
- Include key implementation details (not just "add validation" — say what kind)
- Note any dependencies or prerequisites
- Keep the plan focused and achievable

When you are ready to present the final plan, start your message with "## Implementation Plan" so the system can detect it.

Be concise. Ask one question at a time. Don't over-explain.`;
```

- [ ] **Step 2: Create planner.ts — interface + factory**

```typescript
// packages/server/src/planner/planner.ts
import type { Message, ProviderConfig } from "@specflow/shared";
import { createAnthropicProvider } from "./anthropic-provider.js";
import { createOpenAIProvider } from "./openai-provider.js";

export interface PlanningAgent {
  chat(history: Message[], systemPrompt: string): Promise<string>;
}

export function createPlanningAgent(config: ProviderConfig): PlanningAgent {
  switch (config.type) {
    case "anthropic":
      return createAnthropicProvider(config);
    case "openai-compatible":
      return createOpenAIProvider(config);
    default:
      throw new Error(`Unknown provider type: ${(config as any).type}`);
  }
}
```

- [ ] **Step 3: Create anthropic-provider.ts**

```typescript
// packages/server/src/planner/anthropic-provider.ts
import Anthropic from "@anthropic-ai/sdk";
import type { Message, ProviderConfig } from "@specflow/shared";
import type { PlanningAgent } from "./planner.js";

export function createAnthropicProvider(config: ProviderConfig): PlanningAgent {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    async chat(history: Message[], systemPrompt: string): Promise<string> {
      const messages = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await client.messages.create({
        model: config.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Anthropic");
      }
      return textBlock.text;
    },
  };
}
```

- [ ] **Step 4: Create openai-provider.ts**

```typescript
// packages/server/src/planner/openai-provider.ts
import OpenAI from "openai";
import type { Message, ProviderConfig } from "@specflow/shared";
import type { PlanningAgent } from "./planner.js";

export function createOpenAIProvider(config: ProviderConfig): PlanningAgent {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || "https://api.openai.com/v1",
  });

  return {
    async chat(history: Message[], systemPrompt: string): Promise<string> {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: 4096,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI-compatible provider");
      }
      return content;
    },
  };
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/planner/
git commit -m "feat(server): add planning agent with Anthropic and OpenAI-compat providers"
```

---

### Task 6: Server — Executor (Git Ops, Claude Runner, PR Creator, Queue)

**Files:**
- Create: `packages/server/src/executor/git-ops.ts`
- Create: `packages/server/src/executor/claude-runner.ts`
- Create: `packages/server/src/executor/pr-creator.ts`
- Create: `packages/server/src/executor/execution-queue.ts`
- Create: `packages/server/src/executor/executor.ts`

- [ ] **Step 1: Create git-ops.ts — git operations**

Use `execFileSync` (not `exec`) for all git commands to avoid shell injection. Functions: `validateRepo`, `fetchOrigin`, `setupWorktree`, `setupBranch`, `hasNewCommits`, `pushBranch`, `cleanupWorktree`, `checkoutDefault`.

```typescript
// packages/server/src/executor/git-ops.ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
}

export function validateRepo(repoPath: string): void {
  if (!existsSync(repoPath)) throw new Error(`Repo path does not exist: ${repoPath}`);
  try { git(["rev-parse", "--git-dir"], repoPath); }
  catch { throw new Error(`Not a git repo: ${repoPath}`); }
}

export function fetchOrigin(repoPath: string): void {
  git(["fetch", "origin"], repoPath);
}

export function setupWorktree(repoPath: string, sessionId: string, baseBranch: string): { worktreePath: string; branchName: string } {
  const branchName = `specflow/${sessionId}`;
  const worktreePath = `/tmp/specflow-wt-${sessionId}`;
  git(["worktree", "add", worktreePath, "-b", branchName, `origin/${baseBranch}`], repoPath);
  return { worktreePath, branchName };
}

export function setupBranch(repoPath: string, sessionId: string, baseBranch: string): { branchName: string } {
  const branchName = `specflow/${sessionId}`;
  git(["checkout", baseBranch], repoPath);
  git(["pull", "origin", baseBranch], repoPath);
  git(["checkout", "-b", branchName], repoPath);
  return { branchName };
}

export function hasNewCommits(workDir: string, baseBranch: string): boolean {
  try {
    const result = git(["log", `origin/${baseBranch}..HEAD`, "--oneline"], workDir);
    return result.length > 0;
  } catch { return false; }
}

export function pushBranch(workDir: string, branchName: string): void {
  git(["push", "origin", branchName], workDir);
}

export function cleanupWorktree(repoPath: string, worktreePath: string): void {
  try { git(["worktree", "remove", worktreePath, "--force"], repoPath); }
  catch (err) { console.error(`Failed to cleanup worktree ${worktreePath}:`, err); }
}

export function checkoutDefault(repoPath: string, defaultBranch: string): void {
  try { git(["checkout", defaultBranch], repoPath); }
  catch (err) { console.error(`Failed to checkout ${defaultBranch}:`, err); }
}
```

- [ ] **Step 2: Create claude-runner.ts — spawn CLI**

Spawn `claude` as child process. Pass the plan via **stdin** (not as a CLI argument) to avoid `ARG_MAX` limits on long plans. Stream stdout/stderr. Throttle progress callbacks to 30s intervals. Return exit code + output.

```typescript
// packages/server/src/executor/claude-runner.ts
import { spawn } from "node:child_process";

export interface ClaudeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ProgressCallback = (output: string) => void;

export async function runClaude(
  workDir: string,
  plan: string,
  onProgress?: ProgressCallback
): Promise<ClaudeRunResult> {
  return new Promise((resolve) => {
    // Pass plan via stdin to avoid ARG_MAX limits on long plans
    const child = spawn("claude", ["--print", "-p", "-"], {
      cwd: workDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Write plan to stdin and close it
    child.stdin.write(plan);
    child.stdin.end();

    let stdout = "";
    let stderr = "";
    let lastProgressTime = 0;

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      const now = Date.now();
      if (onProgress && now - lastProgressTime > 30_000) {
        lastProgressTime = now;
        onProgress(stdout.slice(-500));
      }
    });

    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: stderr + "\n" + err.message });
    });
  });
}
```

- [ ] **Step 3: Create pr-creator.ts — gh CLI wrapper**

Use `execFileSync` with `gh` to create PR. Pass title, body, and base branch as separate arguments (not shell-interpolated).

```typescript
// packages/server/src/executor/pr-creator.ts
import { execFileSync } from "node:child_process";

export interface PRResult { url: string; }

export function createPR(workDir: string, title: string, body: string, baseBranch: string): PRResult {
  const truncatedTitle = title.length > 72 ? title.slice(0, 69) + "..." : title;
  const url = execFileSync(
    "gh", ["pr", "create", "--title", truncatedTitle, "--body", body, "--base", baseBranch],
    { cwd: workDir, encoding: "utf-8", stdio: "pipe" }
  ).trim();
  return { url };
}
```

- [ ] **Step 4: Create execution-queue.ts — concurrency limiter**

Generic async task queue with configurable max concurrency. Per-repo locks for branch mode.

```typescript
// packages/server/src/executor/execution-queue.ts
type Task<T> = () => Promise<T>;

interface QueueItem<T> {
  task: Task<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export class ExecutionQueue {
  private maxConcurrent: number;
  private running = 0;
  private queue: QueueItem<any>[] = [];
  private repoLocks = new Map<string, boolean>();

  constructor(maxConcurrent: number) { this.maxConcurrent = maxConcurrent; }

  setMaxConcurrent(n: number): void { this.maxConcurrent = n; }
  getQueuePosition(): number { return this.queue.length + 1; }

  async enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  acquireRepoLock(repoId: string): boolean {
    if (this.repoLocks.get(repoId)) return false;
    this.repoLocks.set(repoId, true);
    return true;
  }

  releaseRepoLock(repoId: string): void { this.repoLocks.delete(repoId); }

  private processNext(): void {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;
    const item = this.queue.shift()!;
    this.running++;
    item.task().then(item.resolve).catch(item.reject).finally(() => {
      this.running--;
      this.processNext();
    });
  }
}
```

- [ ] **Step 5: Create executor.ts — orchestrator**

Wire together git-ops, claude-runner, pr-creator, and queue. Handle both worktree and branch modes. Cleanup on success and failure.

```typescript
// packages/server/src/executor/executor.ts
import type { Session, RepoConfig } from "@specflow/shared";
import { validateRepo, fetchOrigin, setupWorktree, setupBranch, hasNewCommits, pushBranch, cleanupWorktree, checkoutDefault } from "./git-ops.js";
import { runClaude } from "./claude-runner.js";
import { createPR } from "./pr-creator.js";
import { ExecutionQueue } from "./execution-queue.js";

export interface ExecutionResult { success: boolean; prUrl?: string; error?: string; }
export type StatusCallback = (message: string) => void;

let queue: ExecutionQueue | null = null;

export function initExecutor(maxConcurrent: number): void { queue = new ExecutionQueue(maxConcurrent); }
export function getQueue(): ExecutionQueue { if (!queue) throw new Error("Executor not initialized"); return queue; }

export async function executeSession(session: Session, repo: RepoConfig, onStatus: StatusCallback): Promise<ExecutionResult> {
  const q = getQueue();
  return q.enqueue(async () => {
    let workDir = repo.localPath;
    let branchName = "";
    const isWorktree = session.executionMode === "worktree";

    try {
      validateRepo(repo.localPath);
      fetchOrigin(repo.localPath);

      if (isWorktree) {
        const result = setupWorktree(repo.localPath, session.id, session.baseBranch);
        workDir = result.worktreePath;
        branchName = result.branchName;
      } else {
        if (!q.acquireRepoLock(repo.id)) {
          return { success: false, error: "Repo is locked by another branch-mode execution. Please try again shortly." };
        }
        const result = setupBranch(repo.localPath, session.id, session.baseBranch);
        branchName = result.branchName;
      }

      onStatus("Execution started. Claude Code is working on the implementation...");

      const claudeResult = await runClaude(workDir, session.plan!, (progress) => {
        onStatus(`In progress...\n\`\`\`\n${progress}\n\`\`\``);
      });

      if (claudeResult.exitCode !== 0) {
        const errTail = claudeResult.stderr.split("\n").slice(-50).join("\n");
        return { success: false, error: `Claude Code failed (exit ${claudeResult.exitCode}):\n${errTail}` };
      }

      if (!hasNewCommits(workDir, session.baseBranch)) {
        return { success: false, error: "Claude Code completed but made no changes." };
      }

      pushBranch(workDir, branchName);
      const planFirstLine = session.plan!.split("\n").find((l) => l.trim().length > 0) || session.originalMessage;
      const title = planFirstLine.replace(/^#+\s*/, "").slice(0, 72);
      const pr = createPR(workDir, title, session.plan!, session.baseBranch);

      return { success: true, prUrl: pr.url };
    } catch (err) {
      return { success: false, error: `Execution failed: ${(err as Error).message}` };
    } finally {
      if (isWorktree) { cleanupWorktree(repo.localPath, workDir); }
      else { q.releaseRepoLock(repo.id); checkoutDefault(repo.localPath, repo.defaultBranch); }
    }
  });
}
```

- [ ] **Step 6: Verify compilation**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/executor/
git commit -m "feat(server): add executor with git ops, Claude runner, PR creator, and queue"
```

---

### Task 7: Server — Slack Bot (Bolt + Event Handlers + Block Kit)

**Files:**
- Create: `packages/server/src/slack/app.ts`
- Create: `packages/server/src/slack/blocks.ts`
- Create: `packages/server/src/slack/thread-router.ts`
- Create: `packages/server/src/slack/handlers.ts`
- Create: `packages/server/src/slack/actions.ts`

- [ ] **Step 1: Create app.ts — Bolt setup (Socket Mode)**

```typescript
// packages/server/src/slack/app.ts
import { App } from "@slack/bolt";

let app: App | null = null;

export function createSlackApp(botToken: string, appToken: string): App {
  app = new App({ token: botToken, appToken, socketMode: true });
  return app;
}

export function getSlackApp(): App {
  if (!app) throw new Error("Slack app not initialized");
  return app;
}
```

- [ ] **Step 2: Create blocks.ts — Block Kit message builders**

Build plan message with Confirm/Edit/Cancel buttons. Build confirmed/cancelled replacement messages. Split long text at newlines to stay within Slack's 3000-char block limit.

```typescript
// packages/server/src/slack/blocks.ts
import type { KnownBlock } from "@slack/bolt";

export function buildPlanMessage(plan: string, sessionId: string): KnownBlock[] {
  const chunks = splitText(plan, 2900);
  const blocks: KnownBlock[] = chunks.map((chunk) => ({
    type: "section" as const,
    text: { type: "mrkdwn" as const, text: chunk },
  }));
  blocks.push({ type: "divider" as const });
  blocks.push({
    type: "actions" as const,
    block_id: `plan_actions_${sessionId}`,
    elements: [
      { type: "button" as const, text: { type: "plain_text" as const, text: "Confirm", emoji: true }, style: "primary" as const, action_id: "confirm_plan", value: sessionId },
      { type: "button" as const, text: { type: "plain_text" as const, text: "Edit", emoji: true }, action_id: "edit_plan", value: sessionId },
      { type: "button" as const, text: { type: "plain_text" as const, text: "Cancel", emoji: true }, style: "danger" as const, action_id: "cancel_plan", value: sessionId },
    ],
  });
  return blocks;
}

export function buildConfirmedMessage(userId: string): KnownBlock[] {
  return [{ type: "section", text: { type: "mrkdwn", text: `Confirmed by <@${userId}> — execution started.` } }];
}

export function buildCancelledMessage(userId: string): KnownBlock[] {
  return [{ type: "section", text: { type: "mrkdwn", text: `Cancelled by <@${userId}>.` } }];
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}
```

- [ ] **Step 3: Create thread-router.ts**

```typescript
// packages/server/src/slack/thread-router.ts
import { getSessionByThread } from "../sessions/session-store.js";
import type { Session } from "@specflow/shared";

export function findSessionForThread(channelId: string, threadTs: string | undefined): Session | undefined {
  if (!threadTs) return undefined;
  return getSessionByThread(channelId, threadTs);
}
```

- [ ] **Step 4: Create handlers.ts — event handlers for app_mention and DM**

Handle new task creation (create session, call planning agent, post response or plan with buttons). Handle thread replies (route to planning agent, detect plan output).

**Important patterns:**
- After calling `updateSession`, always re-read from the store (avoid stale local references).
- Planning LLM calls retry once on failure before giving up (per spec).
- Multi-repo interactive selection is deferred to post-MVP. For now, if no default repo and multiple exist, the bot posts an error asking the admin to set a default.

```typescript
// packages/server/src/slack/handlers.ts
import type { App } from "@slack/bolt";
import { createSession, updateSession, getSession, getSessionByThread } from "../sessions/session-store.js";
import { assertTransition } from "../sessions/session-machine.js";
import { createPlanningAgent } from "../planner/planner.js";
import { DEFAULT_SYSTEM_PROMPT } from "../planner/system-prompt.js";
import { getConfig } from "../config-store.js";
import { buildPlanMessage } from "./blocks.js";
import { findSessionForThread } from "./thread-router.js";
import type { ProviderConfig, Message } from "@specflow/shared";

function getProvider(): ProviderConfig {
  const config = getConfig();
  const providerId = config.defaultProviderId;
  if (!providerId) throw new Error("No default LLM provider configured. Please set one in the admin dashboard.");
  const provider = config.providers.find((p) => p.id === providerId);
  if (!provider) throw new Error(`Provider ${providerId} not found`);
  return provider;
}

function getDefaultRepoId(): string {
  const config = getConfig();
  if (config.defaultRepoId) return config.defaultRepoId;
  if (config.repos.length === 1) return config.repos[0].id;
  if (config.repos.length === 0) throw new Error("No repositories configured. Please add one in the admin dashboard.");
  throw new Error("Multiple repos configured but no default set. Please set a default in the admin dashboard.");
}

/** Call the planning agent with one retry on failure */
async function callPlannerWithRetry(
  agent: ReturnType<typeof createPlanningAgent>,
  history: Message[],
  systemPrompt: string
): Promise<string> {
  try {
    return await agent.chat(history, systemPrompt);
  } catch (firstErr) {
    console.warn("Planning agent failed, retrying once:", (firstErr as Error).message);
    // Single retry
    return await agent.chat(history, systemPrompt);
  }
}

async function handlePlannerResponse(
  app: App, sessionId: string, channelId: string, threadTs: string, response: string
): Promise<void> {
  const current = getSession(sessionId)!;

  if (response.includes("## Implementation Plan")) {
    assertTransition(current.status, "awaiting_confirmation");
    updateSession(sessionId, {
      status: "awaiting_confirmation",
      plan: response,
      conversationHistory: [...current.conversationHistory, { role: "assistant", content: response }],
    });
    const result = await app.client.chat.postMessage({
      channel: channelId, thread_ts: threadTs,
      blocks: buildPlanMessage(response, sessionId),
      text: "Implementation plan ready for review.",
    });
    updateSession(sessionId, { planMessageTs: result.ts });
  } else {
    updateSession(sessionId, {
      conversationHistory: [...current.conversationHistory, { role: "assistant", content: response }],
    });
    await app.client.chat.postMessage({ channel: channelId, thread_ts: threadTs, text: response });
  }
}

async function handleNewTask(app: App, channelId: string, threadTs: string, userId: string, text: string): Promise<void> {
  const provider = getProvider();
  const repoId = getDefaultRepoId();
  const config = getConfig();

  const session = createSession({ channelId, threadTs, userId, repoId, providerId: provider.id, originalMessage: text });
  assertTransition(session.status, "planning");
  updateSession(session.id, {
    status: "planning",
    conversationHistory: [{ role: "user", content: text }],
  });

  const agent = createPlanningAgent(provider);
  const systemPrompt = config.systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
  const current = getSession(session.id)!;

  try {
    const response = await callPlannerWithRetry(agent, current.conversationHistory, systemPrompt);
    await handlePlannerResponse(app, session.id, channelId, threadTs, response);
  } catch (err) {
    updateSession(session.id, { status: "done", error: (err as Error).message });
    await app.client.chat.postMessage({
      channel: channelId, thread_ts: threadTs,
      text: `Planning agent failed after retry: ${(err as Error).message}\nPlease try again.`,
    });
  }
}

async function handleThreadReply(app: App, channelId: string, threadTs: string, text: string): Promise<void> {
  let session = getSessionByThread(channelId, threadTs);
  if (!session) return;
  if (!["planning", "awaiting_confirmation", "editing"].includes(session.status)) return;

  if (session.status === "awaiting_confirmation") {
    assertTransition("awaiting_confirmation", "editing");
    updateSession(session.id, { status: "editing" });
  }

  // Re-read after update to avoid stale reference
  session = getSession(session.id)!;

  const provider = getProvider();
  const config = getConfig();
  const agent = createPlanningAgent(provider);
  const systemPrompt = config.systemPromptOverride || DEFAULT_SYSTEM_PROMPT;

  updateSession(session.id, {
    conversationHistory: [...session.conversationHistory, { role: "user", content: text }],
  });
  const current = getSession(session.id)!;

  try {
    const response = await callPlannerWithRetry(agent, current.conversationHistory, systemPrompt);
    await handlePlannerResponse(app, session.id, channelId, threadTs, response);
  } catch (err) {
    // Transition to done on exhausted retries during editing
    updateSession(session.id, { status: "done", error: `Planning agent failed: ${(err as Error).message}` });
    await app.client.chat.postMessage({
      channel: channelId, thread_ts: threadTs,
      text: `Planning agent failed after retry: ${(err as Error).message}. Session ended. Start a new request to try again.`,
    });
  }
}

export function registerHandlers(app: App): void {
  app.event("app_mention", async ({ event }) => {
    const threadTs = event.ts;
    const channelId = event.channel;
    const userId = event.user;
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

    if (event.thread_ts) {
      const existing = findSessionForThread(channelId, event.thread_ts);
      if (existing) { await handleThreadReply(app, channelId, event.thread_ts, text); return; }
    }
    await handleNewTask(app, channelId, threadTs, userId, text);
  });

  app.event("message", async ({ event }) => {
    if ((event as any).channel_type !== "im") return;
    if ((event as any).subtype) return;
    const channelId = (event as any).channel;
    const threadTs = (event as any).thread_ts || (event as any).ts;
    const userId = (event as any).user;
    const text = (event as any).text || "";

    if ((event as any).thread_ts) {
      const existing = findSessionForThread(channelId, (event as any).thread_ts);
      if (existing) { await handleThreadReply(app, channelId, (event as any).thread_ts, text); return; }
    }
    await handleNewTask(app, channelId, threadTs, userId, text);
  });
}
```

- [ ] **Step 5: Create actions.ts — Block Kit button handlers (Confirm, Edit, Cancel)**

```typescript
// packages/server/src/slack/actions.ts
import type { App } from "@slack/bolt";
import { getSession, updateSession } from "../sessions/session-store.js";
import { assertTransition } from "../sessions/session-machine.js";
import { executeSession } from "../executor/executor.js";
import { getConfig } from "../config-store.js";
import { buildConfirmedMessage, buildCancelledMessage } from "./blocks.js";

export function registerActions(app: App): void {
  app.action("confirm_plan", async ({ ack, body, client }) => {
    await ack();
    const sessionId = (body as any).actions?.[0]?.value;
    const userId = body.user.id;
    const session = getSession(sessionId);
    if (!session) return;

    if (session.userId !== userId) {
      await client.chat.postEphemeral({ channel: session.channelId, user: userId, text: "Only the person who started this task can confirm the plan." });
      return;
    }

    assertTransition(session.status, "executing");
    updateSession(session.id, { status: "executing" });

    if (session.planMessageTs) {
      await client.chat.update({ channel: session.channelId, ts: session.planMessageTs, blocks: buildConfirmedMessage(userId), text: "Plan confirmed." });
    }

    const config = getConfig();
    const repo = config.repos.find((r) => r.id === session.repoId);
    if (!repo) {
      updateSession(session.id, { status: "done", error: "Repo not found in config" });
      await client.chat.postMessage({ channel: session.channelId, thread_ts: session.threadTs, text: "Error: configured repository not found." });
      return;
    }

    const onStatus = async (message: string) => {
      await client.chat.postMessage({ channel: session.channelId, thread_ts: session.threadTs, text: message });
    };

    try {
      const result = await executeSession(session, repo, onStatus);
      if (result.success && result.prUrl) {
        updateSession(session.id, { status: "done", prUrl: result.prUrl });
        await client.chat.postMessage({ channel: session.channelId, thread_ts: session.threadTs, text: `PR created: ${result.prUrl}` });
      } else {
        updateSession(session.id, { status: "done", error: result.error || "Unknown error" });
        await client.chat.postMessage({ channel: session.channelId, thread_ts: session.threadTs, text: `Execution failed: ${result.error}` });
      }
    } catch (err) {
      updateSession(session.id, { status: "done", error: (err as Error).message });
      await client.chat.postMessage({ channel: session.channelId, thread_ts: session.threadTs, text: `Execution error: ${(err as Error).message}` });
    }
  });

  app.action("edit_plan", async ({ ack, body, client }) => {
    await ack();
    const sessionId = (body as any).actions?.[0]?.value;
    const session = getSession(sessionId);
    if (!session) return;
    assertTransition(session.status, "editing");
    updateSession(session.id, { status: "editing" });
    await client.chat.postMessage({ channel: session.channelId, thread_ts: session.threadTs, text: "What would you like to change? Reply in this thread with your feedback." });
  });

  app.action("cancel_plan", async ({ ack, body, client }) => {
    await ack();
    const sessionId = (body as any).actions?.[0]?.value;
    const userId = body.user.id;
    const session = getSession(sessionId);
    if (!session) return;
    updateSession(session.id, { status: "done" });
    if (session.planMessageTs) {
      await client.chat.update({ channel: session.channelId, ts: session.planMessageTs, blocks: buildCancelledMessage(userId), text: "Session cancelled." });
    }
    await client.chat.postMessage({ channel: session.channelId, thread_ts: session.threadTs, text: "Session cancelled. Start a new request anytime." });
  });
}
```

- [ ] **Step 6: Verify compilation**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/slack/
git commit -m "feat(server): add Slack bot with event handlers, Block Kit buttons, and thread routing"
```

---

### Task 8: Server — REST API + Auth

**Files:**
- Create: `packages/server/src/api/auth.ts`
- Create: `packages/server/src/api/config-routes.ts`
- Create: `packages/server/src/api/provider-routes.ts`
- Create: `packages/server/src/api/repo-routes.ts`
- Create: `packages/server/src/api/session-routes.ts`
- Create: `packages/server/src/api/router.ts`

- [ ] **Step 1: Create auth.ts — JWT middleware + login endpoint**

POST `/api/auth/login` verifies password, issues JWT in httpOnly cookie (24h expiry). Middleware checks cookie on protected routes.

```typescript
// packages/server/src/api/auth.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

let jwtSecret = "";
let adminPassword = "";

export function initAuth(secret: string, password: string): void { jwtSecret = secret; adminPassword = password; }

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.specflow_token;
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  try { jwt.verify(token, jwtSecret); next(); }
  catch { res.status(401).json({ error: "Invalid or expired token" }); }
}

export function createAuthRouter(): Router {
  const router = Router();
  router.post("/api/auth/login", (req: Request, res: Response) => {
    const { password } = req.body;
    if (password !== adminPassword) { res.status(401).json({ error: "Invalid password" }); return; }
    const token = jwt.sign({ admin: true }, jwtSecret, { expiresIn: "24h" });
    res.cookie("specflow_token", token, { httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 });
    res.json({ ok: true });
  });
  router.post("/api/auth/logout", (_req: Request, res: Response) => { res.clearCookie("specflow_token"); res.json({ ok: true }); });
  router.get("/api/auth/check", (req: Request, res: Response) => {
    const token = req.cookies?.specflow_token;
    if (!token) { res.json({ authenticated: false }); return; }
    try { jwt.verify(token, jwtSecret); res.json({ authenticated: true }); }
    catch { res.json({ authenticated: false }); }
  });
  return router;
}
```

- [ ] **Step 2: Create config-routes.ts, provider-routes.ts, repo-routes.ts, session-routes.ts**

Standard CRUD routes. Config masks API keys in GET responses. Providers and repos use nanoid for IDs. Sessions return summary for list, full detail for single.

See file structure section for full route mapping. Each route file exports a `createXRouter(): Router` function.

- [ ] **Step 3: Create router.ts — mount all routes with auth middleware**

```typescript
// packages/server/src/api/router.ts
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createAuthRouter, authMiddleware, initAuth } from "./auth.js";
import { createConfigRouter } from "./config-routes.js";
import { createProviderRouter } from "./provider-routes.js";
import { createRepoRouter } from "./repo-routes.js";
import { createSessionRouter } from "./session-routes.js";

export function setupApi(app: Express, jwtSecret: string, adminPassword: string): void {
  initAuth(jwtSecret, adminPassword);
  app.use(cors({ origin: "http://localhost:3000", credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(createAuthRouter()); // Public
  app.use("/api/config", authMiddleware);
  app.use("/api/providers", authMiddleware);
  app.use("/api/repos", authMiddleware);
  app.use("/api/sessions", authMiddleware);
  app.use(createConfigRouter());
  app.use(createProviderRouter());
  app.use(createRepoRouter());
  app.use(createSessionRouter());
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/
git commit -m "feat(server): add REST API with auth, config, provider, repo, and session routes"
```

---

### Task 9: Server — Entrypoint (Wire Everything Together)

**Files:**
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: Create index.ts — app entrypoint**

Wire: validateEnv -> loadConfig -> initExecutor -> setupApi (Express on 3001) -> createSlackApp + registerHandlers + registerActions -> startCleanupLoop.

```typescript
// packages/server/src/index.ts
import express from "express";
import { validateEnv } from "./env.js";
import { loadConfig } from "./config-store.js";
import { createSlackApp } from "./slack/app.js";
import { registerHandlers } from "./slack/handlers.js";
import { registerActions } from "./slack/actions.js";
import { startCleanupLoop } from "./sessions/session-cleanup.js";
import { initExecutor } from "./executor/executor.js";
import { setupApi } from "./api/router.js";

async function main(): Promise<void> {
  console.log("Starting SpecFlow server...");
  const env = validateEnv();
  for (const warning of env.warnings) console.warn(`WARNING: ${warning}`);

  const config = loadConfig();
  console.log(`Config loaded: ${config.providers.length} providers, ${config.repos.length} repos`);

  initExecutor(config.maxConcurrentExecutions);

  const expressApp = express();
  setupApi(expressApp, env.jwtSecret, env.adminPassword);
  expressApp.listen(3001, () => console.log("Express API listening on http://localhost:3001"));

  const slackApp = createSlackApp(env.slackBotToken, env.slackAppToken);
  registerHandlers(slackApp);
  registerActions(slackApp);
  await slackApp.start();
  console.log("Slack bot connected (Socket Mode)");

  startCleanupLoop(async (sessionId, channelId, threadTs) => {
    try {
      await slackApp.client.chat.postMessage({ channel: channelId, thread_ts: threadTs, text: "This session timed out due to inactivity. Start a new request to try again." });
    } catch (err) { console.error("Failed to post timeout message:", err); }
  });

  console.log("SpecFlow server is running.");
}

main().catch((err) => { console.error("Fatal error:", err); process.exit(1); });
```

- [ ] **Step 2: Verify full server compilation**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): add entrypoint wiring Express API, Slack bot, executor, and cleanup"
```

---

### Task 10: Web — Tailwind Config + Design System + Layout + Components

**Files:**
- Create: `packages/web/tailwind.config.ts` (with design tokens)
- Create: `packages/web/src/app/globals.css`
- Create: `packages/web/src/app/layout.tsx`
- Create: `packages/web/src/components/sidebar.tsx`
- Create: `packages/web/src/components/page-header.tsx`
- Create: `packages/web/src/components/button.tsx`
- Create: `packages/web/src/components/card.tsx`
- Create: `packages/web/src/components/input.tsx`
- Create: `packages/web/src/components/status-badge.tsx`
- Create: `packages/web/src/components/modal.tsx`

- [ ] **Step 1: Create tailwind.config.ts with design tokens from shared package**

Import `colors` and `fonts` from `@specflow/shared` and map them into Tailwind's `extend` config with semantic names (primary, success, warning, error, surface, background, border, text-primary, etc.).

- [ ] **Step 2: Create globals.css with Tailwind directives**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
body { @apply bg-background text-text-primary font-sans; }
```

- [ ] **Step 3: Create layout.tsx — root layout with sidebar**

Full-height flex layout: 256px sidebar on left, `main` content area with `px-8 py-6` padding.

- [ ] **Step 4: Create sidebar.tsx — dark navigation sidebar**

Client component using `usePathname` for active state. Links to: Dashboard, Sessions, Providers, Repositories, Settings. Gray-900 background, indigo active indicator.

- [ ] **Step 5: Create reusable components**

- `button.tsx`: Primary/Secondary/Danger variants using design tokens
- `card.tsx`: Surface background, border, shadow-sm, p-6, rounded-lg
- `input.tsx`: Label + input with focus ring
- `status-badge.tsx`: Colored pills per session status
- `page-header.tsx`: Title + optional description
- `modal.tsx`: Headless UI Dialog wrapper

- [ ] **Step 6: Commit**

```bash
git add packages/web/
git commit -m "feat(web): add Tailwind config, design system, layout, sidebar, and reusable components"
```

---

### Task 11: Web — API Client + Auth + Login Page

**Files:**
- Create: `packages/web/src/lib/api.ts`
- Create: `packages/web/src/lib/auth.ts`
- Create: `packages/web/src/app/login/page.tsx`

- [ ] **Step 1: Create api.ts — fetch wrapper**

Prefixes API base URL, includes credentials, handles 401 redirect to `/login`, parses JSON responses.

- [ ] **Step 2: Create auth.ts — login/logout/check helpers**

- [ ] **Step 3: Create login page**

Centered card with password input and submit button. Redirects to `/` on success. Shows error on invalid password.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/lib/ packages/web/src/app/login/
git commit -m "feat(web): add API client, auth helpers, and login page"
```

---

### Task 12: Web — Dashboard Pages

**Files:**
- Create: `packages/web/src/app/page.tsx` (overview)
- Create: `packages/web/src/app/settings/page.tsx`
- Create: `packages/web/src/app/providers/page.tsx`
- Create: `packages/web/src/app/repos/page.tsx`
- Create: `packages/web/src/app/sessions/page.tsx`
- Create: `packages/web/src/app/sessions/[id]/page.tsx`

- [ ] **Step 1: Dashboard overview** — 3 stat cards (active sessions, total, PRs created) + recent sessions table
- [ ] **Step 2: Settings page** — max concurrent executions, system prompt override, save button
- [ ] **Step 3: Providers page** — list providers, add modal (name, type, key, model, baseUrl), delete
- [ ] **Step 4: Repos page** — list repos, add modal (name, path, default branch), delete
- [ ] **Step 5: Sessions list page** — table with message, status badge, PR link, created date, link to detail
- [ ] **Step 6: Session detail page** — status card, plan display, conversation history

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/app/
git commit -m "feat(web): add dashboard pages (overview, settings, providers, repos, sessions)"
```

---

### Task 13: Final Wiring — Install, Build, and Smoke Test

- [ ] **Step 1: Run npm install at root**

Run: `pnpm install`
Expected: All workspace dependencies resolve.

- [ ] **Step 2: Run TypeScript compilation for all packages**

Run: `npx turbo build`
Expected: All three packages compile. Fix any type errors.

- [ ] **Step 3: Smoke test server startup**

Run: `cd packages/server && SLACK_BOT_TOKEN=test SLACK_APP_TOKEN=test SPECFLOW_ADMIN_PASSWORD=test npx tsx src/index.ts`
Expected: Server starts, prints warnings about CLI tools, Express listens on 3001.

- [ ] **Step 4: Smoke test dashboard startup**

Run: `cd packages/web && npx next dev --port 3000`
Expected: Dashboard starts, login page renders at http://localhost:3000/login.

- [ ] **Step 5: Create CLAUDE.md with project context**

Document: project overview, monorepo structure, key commands, required env vars, architecture.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete SpecFlow MVP scaffold — server, dashboard, and shared types"
```
