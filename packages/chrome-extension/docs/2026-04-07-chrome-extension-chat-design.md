# Chrome Extension Chat Widget — MVP Design

## Overview

A Chrome extension that injects a floating chat bubble onto any browser tab, allowing developers to discuss ideas with the SpecFlow planning agent and trigger code execution — the same workflow as the Slack bot, delivered through the browser.

The server is the central brain. Slack, Chrome extension, and future clients are all thin UI layers calling the same API.

## Architecture

```
Chrome Extension (content script)
  → service-worker (holds JWT, proxies calls)
  → Express server :3001
    → /api/chat/* routes (new)
    → Planning Agent (reuse)
    → Executor + Queue (reuse)
    → Session State Machine (reuse)
```

## Server Changes

### Auth: Add Bearer Token Support

The current auth is cookie-only (httpOnly). Chrome extensions cannot access httpOnly cookies from `fetch`. Two changes:

1. **`authMiddleware`** — also accept `Authorization: Bearer <token>` header (fallback to cookie)
2. **`POST /api/auth/login`** — return `{ ok: true, token: "<jwt>" }` in the response body alongside setting the cookie

Existing cookie-based clients (web dashboard) continue working unchanged. The extension stores the token in `chrome.storage.local` and sends it via Bearer header.

### CORS: Accept Extension Origin

The current CORS is hardcoded to `http://localhost:3000`. Change to accept a list:
- `http://localhost:3000` (web dashboard)
- `chrome-extension://*` (any Chrome extension — in production, pin to the specific extension ID)

### Session Type: Decouple from Slack

The `Session` interface has Slack-specific required fields (`channelId`, `threadTs`, `planMessageTs`). For chat sessions:

- Make `channelId`, `threadTs`, `planMessageTs` **optional** in the shared type
- Add `source: 'slack' | 'chat'` field to `Session`
- Add `title: string | null` field (for chat thread names)
- Chat sessions use `null` for all Slack fields
- The `threadIndex` map only indexes Slack sessions (skip when `source === 'chat'`)

### Message History

Chat sessions store messages in the existing `conversationHistory: Message[]` field. The shared `Message` type already has `role` and `content` — no new type needed. The API response adds `timestamp` on read (derived from session `updatedAt`), but storage stays simple.

### New Chat Routes

Mounted as `/api/chat`, protected by `authMiddleware`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat/sessions` | POST | Create a new session |
| `/api/chat/sessions` | GET | List all chat sessions |
| `/api/chat/sessions/:id` | GET | Get session with conversation history |
| `/api/chat/sessions/:id/messages` | POST | Send message, get AI response |
| `/api/chat/sessions/:id/confirm` | POST | Confirm plan, trigger execution |
| `/api/chat/sessions/:id/cancel` | POST | Cancel session |

**Key decisions:**
- No separate `/edit` endpoint — sending a message via `/messages` while status is `awaiting_confirmation` auto-transitions to `editing` then re-runs the planner (same as Slack thread reply behavior)
- `repoId` and `providerId` are resolved from config defaults (same as Slack handler `getProvider` / `getDefaultRepoId`)
- `userId` is `"admin"` (single-user auth for MVP — no user identity in JWT)
- Cancellation works from any active state (`idle`, `planning`, `awaiting_confirmation`, `editing`)

### Route Details

**POST /api/chat/sessions**
```json
// Request
{ "title": "Fix navbar styling" }
// Response 201
{ "id": "abc123", "title": "Fix navbar styling", "status": "idle", "source": "chat", "conversationHistory": [], "createdAt": "..." }
```

**POST /api/chat/sessions/:id/messages**
```json
// Request
{ "content": "I want to add dark mode to the dashboard" }
// Response 200
{ "role": "assistant", "content": "Here's my plan...", "status": "awaiting_confirmation" }
```

The response includes `status` so the client knows whether to show confirm/cancel buttons. If the planner asks a clarifying question (no `PLAN_MARKER`), status stays `planning`. If it returns a plan, status becomes `awaiting_confirmation`.

**Timeout:** The planner can take 10-60s. The server sets no timeout on `/api/chat/sessions/:id/messages`. The client should show a loading indicator and use `AbortController` for user-initiated cancellation.

**POST /api/chat/sessions/:id/confirm**
```json
// Response 200
{ "status": "executing" }
```

After confirmation, the client polls `GET /api/chat/sessions/:id` for status updates (`executing` → `done`, check `prUrl` and `error` fields).

**POST /api/chat/sessions/:id/cancel**
```json
// Response 200
{ "status": "done" }
```

### Error Handling

- Message on wrong status (e.g., `/confirm` when not `awaiting_confirmation`) → 400 `{ "error": "Cannot confirm: session is not awaiting confirmation" }`
- Session not found → 404
- Config not ready (no provider/repo) → 400 with descriptive message

## Chrome Extension Structure

```
packages/chrome-extension/
├── manifest.json            # Manifest V3
├── popup/
│   ├── popup.html           # Login form + server URL config
│   ├── popup.css
│   └── popup.js
├── content/
│   ├── content.js           # Injects bubble + chat panel (shadow DOM)
│   └── content.css          # Chat widget styles (injected into shadow root)
├── background/
│   └── service-worker.js    # JWT storage, API proxy
├── icons/                   # 16, 32, 48, 128px icons
└── docs/
```

### Manifest V3

```json
{
  "manifest_version": 3,
  "name": "SpecFlow",
  "version": "0.1.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["http://localhost:*/*"],
  "background": { "service_worker": "background/service-worker.js" },
  "content_scripts": [{
    "matches": ["http://localhost:*/*"],
    "js": ["content/content.js"],
    "css": []
  }],
  "action": { "default_popup": "popup/popup.html", "default_icon": "icons/icon-48.png" }
}
```

Injected on `http://localhost:*` by default. Configurable later via options page.

### Content Script — Chat UI

- Uses **shadow DOM** to isolate styles from host page
- **Floating bubble**: 48px circle, bottom-right corner, fixed position, indigo gradient (matches SpecFlow brand)
- **Chat panel**: ~380px wide, ~520px tall, slides up from bubble
- **Design reference**: SpecFlow dashboard — clean whites (#FFFFFF surface), subtle shadows (`glass` shadow tokens), Inter font (loaded via `@import` in shadow root styles), border radius `16px` for main panel / `10px` for inner elements

#### Panel Layout

```
┌─────────────────────────┐
│ SpecFlow  [+ New] [—]   │  ← header
├────────┬────────────────┤
│ Thread1│ User: message  │  ← thread list (left, narrow)
│ Thread2│ AI: response   │  ← active conversation (right)
│ Thread3│                │
│        │ [Confirm]      │  ← action buttons (when awaiting_confirmation)
│        │ [Cancel]       │
│        ├────────────────┤
│        │ [Type message] │  ← input bar
└────────┴────────────────┘
```

- Thread list shows session titles, active status badge
- Action buttons appear inline when `status === 'awaiting_confirmation'`
- After confirm: show "Executing..." with polling indicator, then PR link on completion
- Minimize button collapses back to bubble

### Service Worker

Stores JWT and server URL in `chrome.storage.local`. All API calls go through the service worker via `chrome.runtime.sendMessage`:

| Message type | Payload | Action |
|-------------|---------|--------|
| `login` | `{ serverUrl, password }` | POST `/api/auth/login`, store token |
| `createSession` | `{ title }` | POST `/api/chat/sessions` |
| `getSessions` | — | GET `/api/chat/sessions` |
| `getSession` | `{ sessionId }` | GET `/api/chat/sessions/:id` |
| `sendMessage` | `{ sessionId, content }` | POST `/api/chat/sessions/:id/messages` |
| `confirmPlan` | `{ sessionId }` | POST `/api/chat/sessions/:id/confirm` |
| `cancelPlan` | `{ sessionId }` | POST `/api/chat/sessions/:id/cancel` |

All fetch calls include `Authorization: Bearer <token>` header.

### Popup

- Server URL input (default: `http://localhost:3001`)
- Password input
- Login button
- Status indicator: "Connected" / "Not connected"
- Minimal styling matching SpecFlow brand

## What We Reuse vs Build

| Component | Action |
|-----------|--------|
| Planning agent | Reuse |
| Executor + queue | Reuse |
| Session state machine | Reuse |
| Session store | Extend — make Slack fields optional, add source/title |
| Auth middleware | Extend — add Bearer token support |
| CORS config | Extend — accept extension origin |
| Login route | Extend — return token in body |
| `/api/chat/*` routes | **New** |
| Chrome extension | **New** |
| Shared `Session` type | Modify — optional Slack fields, add source/title |

## Out of Scope (MVP)

- DOM element inspector / selector
- WebSocket streaming
- Rich markdown rendering (basic formatting only)
- Session persistence (still in-memory)
- Auth provider integration (Clerk, etc.)
- Chrome Web Store publishing
- Per-user session scoping (single admin user for now)
