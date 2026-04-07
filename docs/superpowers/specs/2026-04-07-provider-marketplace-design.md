# Provider Marketplace UI Redesign

## Problem

The current LLM Providers page uses a generic dropdown (`anthropic` / `openai-compatible`) and a modal form. Users must know what "OpenAI Compatible" means and manually enter base URLs for third-party providers. This is unintuitive — users expect to see real provider names and browse available options.

## Solution

Replace the current page with a tabbed interface featuring first-party provider tabs and a browsable marketplace.

## Tab Layout

Four top-level tabs:

```
[ Anthropic ] [ OpenAI ] [ Google ] [ Marketplace ]
```

### First-Party Tabs (Anthropic, OpenAI, Google)

Each tab provides a branded, focused setup form:

- Provider logo + name header
- **API Key** — password input
- **Model** — dropdown of popular models for that vendor, plus a "Custom model" free-text option
  - Anthropic: `claude-sonnet-4-20250514`, `claude-opus-4-0-20250514`, `claude-haiku-4-5-20251001`
  - OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o3-mini`
  - Google: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash`
- **Save & Connect** button
- If already connected: green "Connected" badge, current model, Edit / Disconnect actions
- No base URL field — hardcoded per provider

### Marketplace Tab

A search bar at the top, followed by a categorized list.

**Categories** (collapsible sections):

**Cloud APIs:**
| Provider | Description | Default Base URL |
|----------|-------------|-----------------|
| Groq | Fast inference for open-source models | `https://api.groq.com/openai/v1` |
| Together AI | Open-source model hosting | `https://api.together.xyz/v1` |
| Fireworks AI | Fast open-source model inference | `https://api.fireworks.ai/inference/v1` |
| Mistral | European AI models | `https://api.mistral.ai/v1` |
| Perplexity | Search-augmented models | `https://api.perplexity.ai` |
| DeepSeek | Cost-effective reasoning models | `https://api.deepseek.com/v1` |
| Cohere | Enterprise NLP models | `https://api.cohere.com/v1` |

**Open Source / Local:**
| Provider | Description | Default Base URL |
|----------|-------------|-----------------|
| Ollama | Run models locally | `http://localhost:11434/v1` |
| LM Studio | Local model server | `http://localhost:1234/v1` |
| vLLM | High-throughput serving | `http://localhost:8000/v1` |

**Custom:**
- "Add Custom Provider" — for any OpenAI-compatible endpoint not in the catalog

**Each marketplace row shows:** colored initial avatar (or logo), provider name, short description, and a "Connect" button.

**Connect flow:** Clicking "Connect" opens a modal with:
- API Key input
- Model input (with placeholder examples for that provider)
- Base URL pre-filled from catalog (editable)
- Save button

Connected marketplace providers show a green "Connected" badge with Edit / Disconnect options.

## Data Model

### Provider Catalog (`packages/shared/src/provider-catalog.ts`)

```typescript
interface CatalogEntry {
  slug: string;           // e.g. "groq"
  name: string;           // e.g. "Groq"
  description: string;    // Short one-liner
  category: "cloud" | "local" | "custom";
  defaultBaseUrl: string;
  exampleModels: string[];
  docsUrl?: string;
}
```

A static array of `CatalogEntry` objects. A `fetchRemoteCatalog()` stub is exported alongside it, returning an empty array for now — this is the extension point for future dynamic fetching.

### Schema Changes (`packages/shared/src/config.ts`)

The `type` enum expands:

```typescript
// Before
type: z.enum(["anthropic", "openai-compatible"])

// After
type: z.enum(["anthropic", "openai", "google", "openai-compatible"])
```

`"openai"` and `"google"` are distinct types so first-party tabs can identify their own providers. Under the hood, all three non-Anthropic types use the OpenAI SDK with different default base URLs.

### Server Provider Factory

`packages/server/src/planner/planner.ts` — the `getProvider()` factory adds cases for `"openai"` and `"google"`:
- `"openai"` — calls `createOpenAIProvider()` (base URL defaults to `https://api.openai.com/v1`)
- `"google"` — calls `createOpenAIProvider()` with base URL `https://generativelanguage.googleapis.com/v1beta/openai/`
- `"openai-compatible"` — unchanged, uses user-provided base URL

No new provider file needed for Google — it reuses `openai-provider.ts` with a different base URL.

## Files to Update

Both the Zod schema and the hand-written TypeScript interface must be updated in lockstep:

- `packages/shared/src/config.ts` — expand `type` enum in `providerConfigSchema`
- `packages/shared/src/types.ts` — expand `type` union in `ProviderConfig` interface

### URL Validation Change

The current `safeUrl` validator enforces HTTPS-only (`u.startsWith("https://")`). This breaks local providers (Ollama, LM Studio, vLLM) which use `http://localhost:...`. Change the validator to allow `http://` for localhost and private network addresses:

```typescript
const safeUrl = z
  .string()
  .url()
  .refine(
    (u) => u.startsWith("https://") || u.startsWith("http://localhost") || u.startsWith("http://127.0.0.1"),
    "Must use HTTPS (or http for localhost)"
  );
```

## Design Decisions

### One provider per first-party tab

Each first-party tab (Anthropic, OpenAI, Google) supports exactly **one** configured provider. The tab shows either the setup form or the connected state — not a list. This keeps the UX simple. Users who need multiple configs for the same vendor (e.g., two Anthropic keys) can add extras via the Marketplace "Custom Provider" option.

### Base URL handling for first-party providers

First-party tabs do not show a base URL field. The base URL is **not persisted to config** — it is resolved server-side in `getProvider()` based on the `type` field. The config only stores `type`, `apiKey`, and `model`.

### Google API key format

Google's OpenAI-compatible endpoint accepts the standard `Authorization: Bearer <key>` header when using a Gemini API key (not a service account). The OpenAI SDK's default auth works as-is — no adaptation needed in `createOpenAIProvider`.

### Button label: "Save" not "Connect"

No connectivity test is performed on save. The button should read **"Save"** (not "Save & Connect"). The "Connected" badge means "configured," not "verified." This avoids blocking the UI on slow or offline API calls. A future enhancement could add a "Test Connection" button.

### Existing `openai-compatible` configs

Existing provider configs with `type: "openai-compatible"` are left as-is — no auto-migration. They appear in the configured providers list on the Marketplace tab. Users can manually reconfigure if they want to move to a first-party tab.

### Design token usage

- Connected badge: `colors.success` text on `colors["success-light"]` background
- Tab active state: `colors.primary` underline, `colors["text-primary"]` text
- Tab inactive: `colors["text-secondary"]` text
- Category headers: `colors["text-primary"]`, `font-medium`
- Provider descriptions: `colors["text-secondary"]`, `text-sm`

## Component Structure

```
packages/web/src/app/providers/page.tsx    — Tab container + state
packages/web/src/components/provider-tab.tsx       — Reusable first-party tab form
packages/web/src/components/marketplace-tab.tsx    — Marketplace list + search + connect modal
```

## Future: Dynamic Registry

The `fetchRemoteCatalog()` stub in `provider-catalog.ts` is the hook. When ready:
1. Host a JSON file (GitHub raw or simple endpoint) with the same `CatalogEntry[]` shape
2. Implement the fetch with caching and error fallback to the static list
3. Merge remote entries with local catalog, deduplicating by slug

No other changes needed — the Marketplace tab already renders from the catalog array.
