# Chrome Extension Chat Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chrome extension that injects a floating chat bubble onto localhost pages, letting developers chat with the SpecFlow planning agent and trigger code execution — same workflow as the Slack bot.

**Architecture:** The server gets new `/api/chat/*` REST routes that reuse the existing planning agent, executor, and session state machine. The Chrome extension (Manifest V3) is a thin UI client: content script injects bubble + chat panel in a shadow DOM, service worker manages auth and API calls, popup handles login. The shared `Session` type is decoupled from Slack-specific fields.

**Tech Stack:** Express (existing), Chrome Extension Manifest V3 (vanilla JS/CSS), Shadow DOM, existing JWT auth (extended with Bearer token support)

**Spec:** `packages/chrome-extension/docs/2026-04-07-chrome-extension-chat-design.md`

---

## File Structure

### Server changes (`packages/server/src/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `api/auth.ts` | Modify | Add Bearer token support to `authMiddleware`, return token in login response |
| `api/router.ts` | Modify | Mount `/api/chat` routes, extend CORS origins |
| `api/chat-routes.ts` | Create | REST routes for chat sessions — create, list, get, message, confirm, cancel |
| `sessions/session-store.ts` | Modify | Accept optional Slack fields, add `source`/`title` support |

### Shared type changes (`packages/shared/src/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `types.ts` | Modify | Make `channelId`, `threadTs` optional; keep `planMessageTs` as `string \| null`; add `source`, `title` |

### Chrome extension (`packages/chrome-extension/`)

| File | Action | Responsibility |
|------|--------|---------------|
| `manifest.json` | Create | Manifest V3 config |
| `background/service-worker.js` | Create | JWT storage, API proxy via message passing |
| `popup/popup.html` | Create | Login form + server URL config |
| `popup/popup.css` | Create | Popup styling |
| `popup/popup.js` | Create | Login logic, status display |
| `content/content.js` | Create | Injects floating bubble + chat panel (shadow DOM) |
| `content/content.css` | Create | All chat widget styles (injected into shadow root) |
| `icons/icon-16.png` | Create | Extension icon 16px |
| `icons/icon-32.png` | Create | Extension icon 32px |
| `icons/icon-48.png` | Create | Extension icon 48px |
| `icons/icon-128.png` | Create | Extension icon 128px |

---

## Task 1: Extend Shared Session Type

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Update the Session interface**

Make Slack-specific fields optional and add `source` + `title`:

```ts
export interface Session {
  id: string;
  channelId?: string;          // was required
  threadTs?: string;           // was required
  userId: string;
  conversationHistory: Message[];
  plan: string | null;
  planMessageTs: string | null; // unchanged — still nullable, not optional
  status: SessionStatus;
  executionMode: ExecutionMode;
  baseBranch: string;
  prUrl: string | null;
  repoId: string;
  providerId: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  originalMessage: string;
  source: "slack" | "chat";    // new
  title: string | null;        // new
}
```

- [ ] **Step 2: Verify the server still compiles**

Run: `cd packages/server && npx tsc --noEmit`

TypeScript will flag all places that create `Session` objects without `source`/`title` or that assume `channelId`/`threadTs` are always present. Fix them in the next tasks.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): make Session type client-agnostic, add source and title fields"
```

---

## Task 2: Update Session Store for Chat Support

**Files:**
- Modify: `packages/server/src/sessions/session-store.ts`

- [ ] **Step 1: Update CreateSessionParams**

```ts
export interface CreateSessionParams {
  userId: string;
  repoId: string;
  providerId: string;
  originalMessage: string;
  executionMode?: ExecutionMode;
  baseBranch?: string;
  // Slack-specific (optional for chat)
  channelId?: string;
  threadTs?: string;
  // Chat-specific
  source: "slack" | "chat";
  title?: string;
}
```

- [ ] **Step 2: Update createSession function**

```ts
export function createSession(params: CreateSessionParams): Session {
  const session: Session = {
    id: nanoid(),
    userId: params.userId,
    conversationHistory: [],
    plan: null,
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
    source: params.source,
    title: params.title || null,
    planMessageTs: null,
    // Slack fields — only set for Slack sessions
    ...(params.channelId && { channelId: params.channelId }),
    ...(params.threadTs && { threadTs: params.threadTs }),
  };
  sessions.set(session.id, session);
  // Only index Slack sessions by thread
  if (params.channelId && params.threadTs) {
    threadIndex.set(`${params.channelId}:${params.threadTs}`, session.id);
  }
  return session;
}
```

- [ ] **Step 3: Add getChatSessions helper**

```ts
export function getChatSessions(): Session[] {
  return Array.from(sessions.values())
    .filter((s) => s.source === "chat")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
```

- [ ] **Step 4: Update evictDoneSessions to handle missing threadTs**

In the `evictDoneSessions` function, guard the `threadIndex.delete` call:

```ts
if (session.channelId && session.threadTs) {
  threadIndex.delete(`${session.channelId}:${session.threadTs}`);
}
```

- [ ] **Step 5: Fix Slack handler createSession calls**

In `packages/server/src/slack/handlers.ts`, update the `createSession` call at line 109 to include `source: "slack"`:

```ts
const session = createSession({
  channelId, threadTs, userId, repoId,
  providerId: provider.id, originalMessage: text,
  source: "slack",
});
```

- [ ] **Step 6: Fix slack/actions.ts — add non-null assertions for Slack fields**

After making `channelId` and `threadTs` optional on `Session`, TypeScript will flag all accesses in `packages/server/src/slack/actions.ts`. Since Slack actions only operate on Slack sessions, add `!` non-null assertions. Apply to all occurrences of `session.channelId` and `session.threadTs` in this file (lines 22, 30, 37, 42, 48, 49, 58, 70, 76, 86, 89, 92-95):

```ts
// Example: line 22 — change:
await client.chat.postEphemeral({ channel: session.channelId, ...
// to:
await client.chat.postEphemeral({ channel: session.channelId!, ...
```

Apply `!` to every `session.channelId` and `session.threadTs` access in `actions.ts`. These are safe because Slack actions are only triggered from Slack events, so these fields are always present.

- [ ] **Step 7: Fix cleanup callback types**

In `packages/server/src/sessions/session-cleanup.ts`, guard against optional `channelId`/`threadTs` when iterating sessions. The callback should only fire for Slack sessions:

```ts
if (session.channelId && session.threadTs) {
  onTimeout(session.id, session.channelId, session.threadTs);
}
```

- [ ] **Step 8: Verify server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/sessions/session-store.ts packages/server/src/slack/handlers.ts packages/server/src/slack/actions.ts packages/server/src/sessions/session-cleanup.ts
git commit -m "feat(server): update session store to support chat and slack sources"
```

---

## Task 3: Extend Auth — Bearer Token Support

**Files:**
- Modify: `packages/server/src/api/auth.ts`

- [ ] **Step 1: Update authMiddleware to accept Bearer token**

Replace the existing `authMiddleware` function:

```ts
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Try Bearer token first, then fall back to cookie
  let token = "";
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = req.cookies?.specflow_token || "";
  }
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  try { jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }); next(); }
  catch { res.status(401).json({ error: "Invalid or expired token" }); }
}
```

- [ ] **Step 2: Return token in login response body**

Update the login route handler to return the token:

```ts
router.post("/api/auth/login", (req: Request, res: Response) => {
  const { password } = req.body;
  if (!password || !safeCompare(password, adminPassword)) { res.status(401).json({ error: "Invalid password" }); return; }
  const token = jwt.sign({ admin: true }, jwtSecret, { algorithm: "HS256", expiresIn: "24h" });
  res.cookie("specflow_token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 });
  res.json({ ok: true, token });
});
```

- [ ] **Step 3: Also update /api/auth/check to work with Bearer**

The existing `check` route reads from `req.cookies`. It should use the same token resolution as the middleware:

```ts
router.get("/api/auth/check", (req: Request, res: Response) => {
  let token = "";
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else {
    token = req.cookies?.specflow_token || "";
  }
  if (!token) { res.json({ authenticated: false }); return; }
  try { jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }); res.json({ authenticated: true }); }
  catch { res.json({ authenticated: false }); }
});
```

- [ ] **Step 4: Verify server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/auth.ts
git commit -m "feat(server): add Bearer token auth support for non-browser clients"
```

---

## Task 4: Extend CORS for Chrome Extension

**Files:**
- Modify: `packages/server/src/api/router.ts`

- [ ] **Step 1: Update CORS config to accept multiple origins**

Replace the single-origin CORS setup:

```ts
const corsOrigins = (process.env.SPECFLOW_CORS_ORIGIN || "http://localhost:3000").split(",").map((s) => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., curl, server-to-server)
    if (!origin) return callback(null, true);
    // Allow configured origins
    if (corsOrigins.some((allowed) => origin === allowed)) return callback(null, true);
    // Allow Chrome extension origins
    if (origin.startsWith("chrome-extension://")) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
```

- [ ] **Step 2: Verify server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/api/router.ts
git commit -m "feat(server): extend CORS to accept Chrome extension origins"
```

---

## Task 5: Create Chat API Routes

**Files:**
- Create: `packages/server/src/api/chat-routes.ts`
- Modify: `packages/server/src/api/router.ts`

- [ ] **Step 1: Create chat-routes.ts**

```ts
import { Router, type Request, type Response } from "express";
import {
  createSession,
  getSession,
  updateSession,
  getChatSessions,
} from "../sessions/session-store.js";
import { assertTransition } from "../sessions/session-machine.js";
import { createPlanningAgent } from "../planner/planner.js";
import { DEFAULT_SYSTEM_PROMPT, PLAN_MARKER } from "../planner/system-prompt.js";
import { getConfig } from "../config-store.js";
import { executeSession } from "../executor/executor.js";
import type { ProviderConfig, AppConfig } from "@specflow/shared";

function getProvider(config: AppConfig): ProviderConfig {
  const providerId = config.defaultProviderId;
  if (!providerId)
    throw new Error("No default LLM provider configured.");
  const provider = config.providers.find((p) => p.id === providerId);
  if (!provider) throw new Error(`Provider ${providerId} not found`);
  return provider;
}

function getDefaultRepoId(config: AppConfig): string {
  if (config.defaultRepoId) return config.defaultRepoId;
  if (config.repos.length === 1) return config.repos[0].id;
  if (config.repos.length === 0)
    throw new Error("No repositories configured.");
  throw new Error(
    "Multiple repos configured but no default set."
  );
}

export function createChatRouter(): Router {
  const router = Router();

  // List chat sessions
  router.get("/api/chat/sessions", (_req: Request, res: Response) => {
    const sessions = getChatSessions();
    res.json(
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
    );
  });

  // Get session detail
  router.get("/api/chat/sessions/:id", (req: Request, res: Response) => {
    const session = getSession(req.params.id);
    if (!session || session.source !== "chat") {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({
      id: session.id,
      title: session.title,
      status: session.status,
      conversationHistory: session.conversationHistory,
      plan: session.plan,
      prUrl: session.prUrl,
      error: session.error,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  });

  // Create session
  router.post("/api/chat/sessions", (req: Request, res: Response) => {
    const { title } = req.body;
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }

    let config: AppConfig;
    let provider: ProviderConfig;
    let repoId: string;
    try {
      config = getConfig();
      provider = getProvider(config);
      repoId = getDefaultRepoId(config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Config error";
      res.status(400).json({ error: msg });
      return;
    }

    const session = createSession({
      userId: "admin",
      repoId,
      providerId: provider.id,
      originalMessage: title,
      source: "chat",
      title,
    });

    res.status(201).json({
      id: session.id,
      title: session.title,
      status: session.status,
      source: session.source,
      conversationHistory: session.conversationHistory,
      createdAt: session.createdAt,
    });
  });

  // Send message
  router.post(
    "/api/chat/sessions/:id/messages",
    async (req: Request, res: Response) => {
      const session = getSession(req.params.id);
      if (!session || session.source !== "chat") {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const { content } = req.body;
      if (!content || typeof content !== "string") {
        res.status(400).json({ error: "content is required" });
        return;
      }

      // Only allow messages in conversational states
      const allowedStatuses = [
        "idle",
        "planning",
        "awaiting_confirmation",
        "editing",
      ];
      if (!allowedStatuses.includes(session.status)) {
        res.status(400).json({
          error: `Cannot send message: session is ${session.status}`,
        });
        return;
      }

      // If awaiting confirmation, treat as edit feedback
      if (session.status === "awaiting_confirmation") {
        assertTransition("awaiting_confirmation", "editing");
        updateSession(session.id, { status: "editing" });
      }

      // Transition to planning if idle
      if (session.status === "idle") {
        assertTransition("idle", "planning");
        updateSession(session.id, { status: "planning" });
      }

      // Add user message to history
      const current = getSession(session.id)!;
      updateSession(session.id, {
        conversationHistory: [
          ...current.conversationHistory,
          { role: "user", content },
        ],
      });

      // Call planning agent
      let config: AppConfig;
      let provider: ProviderConfig;
      try {
        config = getConfig();
        provider = getProvider(config);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Config error";
        res.status(400).json({ error: msg });
        return;
      }

      const agent = createPlanningAgent(provider);
      const systemPrompt =
        config.systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
      const refreshed = getSession(session.id)!;

      try {
        // Retry once on failure (matches Slack handler pattern)
        let response: string;
        try {
          response = await agent.chat(refreshed.conversationHistory, systemPrompt);
        } catch (firstErr) {
          console.warn("Planning agent failed, retrying once:", firstErr);
          response = await agent.chat(refreshed.conversationHistory, systemPrompt);
        }

        // Check if response contains a plan
        if (response.includes(PLAN_MARKER)) {
          assertTransition(
            refreshed.status === "editing" ? "editing" : "planning",
            "awaiting_confirmation"
          );
          updateSession(session.id, {
            status: "awaiting_confirmation",
            plan: response,
            conversationHistory: [
              ...refreshed.conversationHistory,
              { role: "assistant", content: response },
            ],
          });
          res.json({
            role: "assistant",
            content: response,
            status: "awaiting_confirmation",
          });
        } else {
          updateSession(session.id, {
            conversationHistory: [
              ...refreshed.conversationHistory,
              { role: "assistant", content: response },
            ],
          });
          const updated = getSession(session.id)!;
          res.json({
            role: "assistant",
            content: response,
            status: updated.status,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Planning failed";
        updateSession(session.id, { status: "done", error: msg });
        res.status(500).json({ error: msg });
      }
    }
  );

  // Confirm plan
  router.post(
    "/api/chat/sessions/:id/confirm",
    async (req: Request, res: Response) => {
      const session = getSession(req.params.id);
      if (!session || session.source !== "chat") {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      if (session.status !== "awaiting_confirmation") {
        res.status(400).json({
          error: `Cannot confirm: session is ${session.status}`,
        });
        return;
      }

      assertTransition(session.status, "executing");
      updateSession(session.id, { status: "executing" });

      // Respond immediately, execute in background
      res.json({ status: "executing" });

      // Fire-and-forget execution
      const config = getConfig();
      const repo = config.repos.find((r) => r.id === session.repoId);
      if (!repo) {
        updateSession(session.id, {
          status: "done",
          error: "Repo not found in config",
        });
        return;
      }

      const onStatus = (message: string) => {
        // For MVP, status updates are only visible via polling GET /sessions/:id
        // Future: WebSocket push
        console.log(`[chat][${session.id}] ${message}`);
      };

      try {
        const result = await executeSession(session, repo, onStatus);
        if (result.success && result.prUrl) {
          updateSession(session.id, {
            status: "done",
            prUrl: result.prUrl,
          });
        } else {
          updateSession(session.id, {
            status: "done",
            error: result.error || "Unknown error",
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Execution failed";
        updateSession(session.id, { status: "done", error: msg });
      }
    }
  );

  // Cancel session
  router.post("/api/chat/sessions/:id/cancel", (req: Request, res: Response) => {
    const session = getSession(req.params.id);
    if (!session || session.source !== "chat") {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (session.status === "done") {
      res.status(400).json({ error: "Session is already done" });
      return;
    }

    if (session.status === "executing") {
      res.status(400).json({
        error: "Cannot cancel: session is executing",
      });
      return;
    }

    updateSession(session.id, { status: "done" });
    res.json({ status: "done" });
  });

  return router;
}
```

- [ ] **Step 2: Mount chat routes in router.ts**

In `packages/server/src/api/router.ts`, add the import and mounting:

```ts
import { createChatRouter } from "./chat-routes.js";
```

Add after the existing `app.use("/api/sessions", authMiddleware);` line:

```ts
app.use("/api/chat", authMiddleware);
app.use(createChatRouter());
```

- [ ] **Step 3: Verify server compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/api/chat-routes.ts packages/server/src/api/router.ts
git commit -m "feat(server): add /api/chat REST routes for browser chat client"
```

---

## Task 6: Create Chrome Extension Scaffold

**Files:**
- Create: `packages/chrome-extension/manifest.json`
- Create: `packages/chrome-extension/icons/` (placeholder icons)

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "SpecFlow",
  "description": "Chat with SpecFlow planning agent from any localhost page",
  "version": "0.1.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["http://localhost:*/*"],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["http://localhost:*/*"],
      "js": ["content/content.js"]
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Create placeholder icons**

Generate minimal valid PNG icons (solid indigo pixel, Chrome will scale):

```bash
cd packages/chrome-extension && mkdir -p icons
node -e "
const fs = require('fs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNUYPj/HwAERQJ/XjmLuAAAAABJRU5ErkJggg==', 'base64');
[16,32,48,128].forEach(s => fs.writeFileSync('icons/icon-' + s + '.png', png));
"
```

- [ ] **Step 3: Commit**

```bash
git add packages/chrome-extension/manifest.json packages/chrome-extension/icons/
git commit -m "feat(extension): add Manifest V3 scaffold and placeholder icons"
```

---

## Task 7: Create Service Worker (Background Script)

**Files:**
- Create: `packages/chrome-extension/background/service-worker.js`

- [ ] **Step 1: Create service-worker.js**

```js
// Service worker: manages auth token and proxies API calls to SpecFlow server

const DEFAULT_SERVER_URL = "http://localhost:3001";

async function getConfig() {
  const result = await chrome.storage.local.get(["serverUrl", "token"]);
  return {
    serverUrl: result.serverUrl || DEFAULT_SERVER_URL,
    token: result.token || "",
  };
}

async function apiFetch(path, options = {}) {
  const { serverUrl, token } = await getConfig();
  const url = `${serverUrl}${path}`;
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function handleLogin({ serverUrl, password }) {
  if (serverUrl) {
    await chrome.storage.local.set({ serverUrl });
  }
  const { serverUrl: url } = await getConfig();
  const res = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  await chrome.storage.local.set({ token: data.token });
  return { ok: true };
}

async function handleCheckAuth() {
  try {
    const data = await apiFetch("/api/auth/check");
    return { authenticated: data.authenticated };
  } catch {
    return { authenticated: false };
  }
}

async function handleLogout() {
  await chrome.storage.local.remove("token");
  return { ok: true };
}

// Message handler — content scripts and popup communicate through here
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { type, payload } = message;

  const handlers = {
    login: () => handleLogin(payload),
    logout: () => handleLogout(),
    checkAuth: () => handleCheckAuth(),
    createSession: () =>
      apiFetch("/api/chat/sessions", {
        method: "POST",
        body: JSON.stringify({ title: payload.title }),
      }),
    getSessions: () => apiFetch("/api/chat/sessions"),
    getSession: () => apiFetch(`/api/chat/sessions/${payload.sessionId}`),
    sendMessage: () =>
      apiFetch(`/api/chat/sessions/${payload.sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: payload.content }),
      }),
    confirmPlan: () =>
      apiFetch(`/api/chat/sessions/${payload.sessionId}/confirm`, {
        method: "POST",
      }),
    cancelPlan: () =>
      apiFetch(`/api/chat/sessions/${payload.sessionId}/cancel`, {
        method: "POST",
      }),
  };

  const handler = handlers[type];
  if (!handler) {
    sendResponse({ error: `Unknown message type: ${type}` });
    return false;
  }

  handler()
    .then((data) => sendResponse({ data }))
    .catch((err) => sendResponse({ error: err.message }));

  return true; // Keep channel open for async response
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/chrome-extension/background/service-worker.js
git commit -m "feat(extension): add service worker with auth and API proxy"
```

---

## Task 8: Create Popup (Login UI)

**Files:**
- Create: `packages/chrome-extension/popup/popup.html`
- Create: `packages/chrome-extension/popup/popup.css`
- Create: `packages/chrome-extension/popup/popup.js`

- [ ] **Step 1: Create popup.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <h1 class="logo">SpecFlow</h1>

    <div id="status" class="status"></div>

    <div id="login-form">
      <label for="server-url">Server URL</label>
      <input type="url" id="server-url" placeholder="http://localhost:3001">

      <label for="password">Password</label>
      <input type="password" id="password" placeholder="Enter password">

      <button id="login-btn" class="btn-primary">Login</button>
      <div id="error" class="error"></div>
    </div>

    <div id="logged-in" style="display:none">
      <p class="connected">Connected to SpecFlow</p>
      <button id="logout-btn" class="btn-secondary">Logout</button>
    </div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  width: 300px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #F9FAFB;
  color: #111827;
}

.container { padding: 20px; }

.logo {
  font-size: 18px;
  font-weight: 700;
  color: #6366F1;
  margin-bottom: 16px;
}

label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #6B7280;
  margin-bottom: 4px;
  margin-top: 12px;
}

input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

input:focus { border-color: #6366F1; }

.btn-primary {
  width: 100%;
  margin-top: 16px;
  padding: 8px 16px;
  background: #6366F1;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover { background: #4F46E5; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  width: 100%;
  margin-top: 12px;
  padding: 8px 16px;
  background: white;
  color: #6B7280;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.btn-secondary:hover { background: #F9FAFB; }

.error { color: #EF4444; font-size: 12px; margin-top: 8px; }

.status {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  margin-bottom: 12px;
}

.status.ok { background: #ECFDF5; color: #10B981; }
.status.fail { background: #FEF2F2; color: #EF4444; }

.connected {
  font-size: 13px;
  color: #10B981;
  font-weight: 500;
  text-align: center;
  margin-bottom: 4px;
}
```

- [ ] **Step 3: Create popup.js**

```js
const serverUrlInput = document.getElementById("server-url");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const errorEl = document.getElementById("error");
const statusEl = document.getElementById("status");
const loginForm = document.getElementById("login-form");
const loggedIn = document.getElementById("logged-in");

async function send(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, resolve);
  });
}

async function checkStatus() {
  const stored = await chrome.storage.local.get(["serverUrl"]);
  if (stored.serverUrl) serverUrlInput.value = stored.serverUrl;

  const result = await send("checkAuth");
  if (result && result.data && result.data.authenticated) {
    loginForm.style.display = "none";
    loggedIn.style.display = "block";
    statusEl.textContent = "Authenticated";
    statusEl.className = "status ok";
  } else {
    loginForm.style.display = "block";
    loggedIn.style.display = "none";
    statusEl.textContent = "Not connected";
    statusEl.className = "status fail";
  }
}

loginBtn.addEventListener("click", async () => {
  errorEl.textContent = "";
  loginBtn.disabled = true;
  const serverUrl = serverUrlInput.value.replace(/\/+$/, "") || undefined;
  const password = passwordInput.value;

  if (!password) {
    errorEl.textContent = "Password is required";
    loginBtn.disabled = false;
    return;
  }

  const result = await send("login", { serverUrl, password });
  loginBtn.disabled = false;

  if (result && result.error) {
    errorEl.textContent = result.error;
  } else {
    await checkStatus();
  }
});

logoutBtn.addEventListener("click", async () => {
  await send("logout");
  await checkStatus();
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

checkStatus();
```

- [ ] **Step 4: Commit**

```bash
git add packages/chrome-extension/popup/
git commit -m "feat(extension): add login popup UI"
```

---

## Task 9: Create Content Script — Chat Widget

**Files:**
- Create: `packages/chrome-extension/content/content.css`
- Create: `packages/chrome-extension/content/content.js`

This is the largest task. The content script injects the floating bubble and chat panel into a shadow DOM. All dynamic content uses `textContent` or safe DOM construction — no innerHTML with untrusted data.

- [ ] **Step 1: Create content.css**

Full CSS for the chat widget, loaded into the shadow root:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:host {
  all: initial;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  color: #111827;
}

/* Floating bubble */
.sf-bubble {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366F1, #4F46E5);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483647;
  transition: transform 0.2s, box-shadow 0.2s;
  border: none;
  outline: none;
}
.sf-bubble:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
}
.sf-bubble svg { width: 22px; height: 22px; fill: none; stroke: white; stroke-width: 2; }

/* Chat panel */
.sf-panel {
  position: fixed;
  bottom: 88px;
  right: 24px;
  width: 400px;
  height: 540px;
  background: #FFFFFF;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04);
  z-index: 2147483646;
  display: none;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #E5E7EB;
}
.sf-panel.open { display: flex; }

/* Header */
.sf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #E5E7EB;
  background: #F9FAFB;
}
.sf-header-title { font-size: 14px; font-weight: 600; color: #6366F1; }
.sf-header-actions { display: flex; gap: 8px; }
.sf-header-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid #E5E7EB;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6B7280;
  font-size: 16px;
  transition: background 0.15s;
}
.sf-header-btn:hover { background: #F3F4F6; }

/* Body — split into thread list and conversation */
.sf-body { display: flex; flex: 1; overflow: hidden; }

/* Thread list */
.sf-threads {
  width: 120px;
  border-right: 1px solid #E5E7EB;
  background: #F9FAFB;
  overflow-y: auto;
  flex-shrink: 0;
}
.sf-thread-item {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #F3F4F6;
  transition: background 0.15s;
}
.sf-thread-item:hover { background: #EEF2FF; }
.sf-thread-item.active { background: #EEF2FF; border-left: 3px solid #6366F1; }
.sf-thread-title {
  font-size: 11px;
  font-weight: 500;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sf-thread-status { font-size: 10px; color: #9CA3AF; margin-top: 2px; }

/* Conversation area */
.sf-conversation { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.sf-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sf-message {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.sf-message.user {
  align-self: flex-end;
  background: #6366F1;
  color: white;
  border-bottom-right-radius: 4px;
}
.sf-message.assistant {
  align-self: flex-start;
  background: #F3F4F6;
  color: #111827;
  border-bottom-left-radius: 4px;
}

/* Action buttons (confirm/cancel) */
.sf-actions {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid #E5E7EB;
  background: #F9FAFB;
}
.sf-action-btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.sf-action-btn.confirm { background: #10B981; color: white; }
.sf-action-btn.confirm:hover { background: #059669; }
.sf-action-btn.cancel { background: white; color: #6B7280; border: 1px solid #E5E7EB; }
.sf-action-btn.cancel:hover { background: #F9FAFB; }

/* Status bar */
.sf-status-bar {
  padding: 8px 16px;
  background: #EEF2FF;
  color: #6366F1;
  font-size: 12px;
  text-align: center;
  border-top: 1px solid #E5E7EB;
}

/* Input area */
.sf-input-area { display: flex; padding: 12px; border-top: 1px solid #E5E7EB; gap: 8px; }
.sf-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  resize: none;
  min-height: 36px;
  max-height: 80px;
}
.sf-input:focus { border-color: #6366F1; }
.sf-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #6366F1;
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s;
}
.sf-send-btn:hover { background: #4F46E5; }
.sf-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Empty state */
.sf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9CA3AF;
  text-align: center;
  padding: 20px;
}
.sf-empty p { margin-top: 8px; font-size: 12px; }

/* Loading indicator */
.sf-loading { display: flex; gap: 4px; padding: 10px 14px; align-self: flex-start; }
.sf-loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #9CA3AF;
  animation: sf-bounce 1.4s infinite ease-in-out;
}
.sf-loading-dot:nth-child(1) { animation-delay: -0.32s; }
.sf-loading-dot:nth-child(2) { animation-delay: -0.16s; }
@keyframes sf-bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* Scrollbar styling */
.sf-messages::-webkit-scrollbar, .sf-threads::-webkit-scrollbar { width: 4px; }
.sf-messages::-webkit-scrollbar-thumb, .sf-threads::-webkit-scrollbar-thumb {
  background: #D1D5DB;
  border-radius: 2px;
}
```

- [ ] **Step 2: Create content.js**

The content script builds all DOM elements programmatically using `document.createElement` and `textContent` (no innerHTML with dynamic data). It:

1. Creates a shadow DOM host element
2. Loads `content.css` into the shadow root via a `<link>` tag
3. Builds the bubble button, panel container, header, thread list, message area, action buttons, status bar, and input area — all via safe DOM APIs
4. Implements state management: `sessions[]`, `activeSessionId`, `isOpen`, `isLoading`, `pollTimer`
5. Renders threads by creating DOM elements per session
6. Renders messages by creating `div.sf-message` elements with `textContent` (safe from XSS)
7. Shows confirm/cancel buttons when `status === "awaiting_confirmation"`
8. Shows status bar during execution and polls `GET /sessions/:id` every 5 seconds
9. Shows PR link or error when done
10. All API calls go through `chrome.runtime.sendMessage` to the service worker
11. Mounts the host element to `document.body`

Key functions:
- `send(type, payload)` — message passing to service worker
- `renderThreads()` — rebuilds thread list DOM
- `renderMessages(session)` — rebuilds message list DOM
- `renderActions(session)` — shows/hides confirm/cancel/status based on session state
- `loadSessions()` — fetches session list from server
- `selectSession(id)` — fetches session detail and renders it
- `createNewSession()` — prompts for title, creates session via API
- `sendMessage()` — sends user input, shows optimistic message, shows loading dots, renders response
- `confirmPlan()` / `cancelPlan()` — action button handlers
- `startPolling()` / `stopPolling()` — interval-based status polling during execution

- [ ] **Step 3: Commit**

```bash
git add packages/chrome-extension/content/
git commit -m "feat(extension): add content script with floating chat bubble and panel"
```

---

## Task 10: Add .gitignore and Verify Extension Loads

**Files:**
- Modify: `.gitignore` (root — add `.superpowers/`)

- [ ] **Step 1: Add .superpowers/ to root .gitignore**

Append to the root `.gitignore`:

```
# Superpowers brainstorming sessions
.superpowers/
```

- [ ] **Step 2: Manual verification — load extension in Chrome**

Instructions to verify the extension works:

1. Start the SpecFlow server: `cd packages/server && npm run dev`
2. Open Chrome, navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked", select `packages/chrome-extension/`
5. Open any `http://localhost:*` page
6. Verify: indigo bubble appears in bottom-right corner
7. Click extension icon in toolbar — popup appears with login form
8. Enter server URL (`http://localhost:3001`) and admin password, click Login
9. Click the floating bubble — chat panel opens
10. Click "+" — enter thread title — new thread appears
11. Type a message — should get AI response (if provider is configured)
12. If plan is returned — Confirm/Cancel buttons appear
13. Click Confirm — status bar shows "Executing...", polls for completion

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add .superpowers/ to gitignore"
```

---

## Summary

| Task | What it does | Files changed |
|------|-------------|---------------|
| 1 | Decouple Session type from Slack | `shared/types.ts` |
| 2 | Update session store for chat | `server/sessions/session-store.ts`, `slack/handlers.ts`, `sessions/session-cleanup.ts` |
| 3 | Add Bearer token auth | `server/api/auth.ts` |
| 4 | Extend CORS | `server/api/router.ts` |
| 5 | Create chat API routes | `server/api/chat-routes.ts`, `server/api/router.ts` |
| 6 | Extension scaffold + manifest | `chrome-extension/manifest.json`, icons |
| 7 | Service worker (API proxy) | `chrome-extension/background/service-worker.js` |
| 8 | Login popup | `chrome-extension/popup/*` |
| 9 | Content script (chat widget) | `chrome-extension/content/*` |
| 10 | Gitignore + manual verification | `.gitignore` |

Tasks 1-5 are server-side. Tasks 6-9 are extension-side. Task 10 ties it together.
