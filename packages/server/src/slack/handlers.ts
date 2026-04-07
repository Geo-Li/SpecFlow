import type { App } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/types";
import { createSession, updateSession, getSession, getSessionByThread } from "../sessions/session-store.js";
import { assertTransition } from "../sessions/session-machine.js";
import { createPlanningAgent } from "../planner/planner.js";
import { DEFAULT_SYSTEM_PROMPT, PLAN_MARKER } from "../planner/system-prompt.js";
import { getConfig } from "../config-store.js";
import { buildPlanMessage } from "./blocks.js";
import type { ProviderConfig, Message, AppConfig } from "@specflow/shared";

function getProvider(config: AppConfig): ProviderConfig {
  const providerId = config.defaultProviderId;
  if (!providerId) throw new Error("No default LLM provider configured. Please set one in the admin dashboard.");
  const provider = config.providers.find((p) => p.id === providerId);
  if (!provider) throw new Error(`Provider ${providerId} not found`);
  return provider;
}

function getDefaultRepoId(config: AppConfig): string {
  if (config.defaultRepoId) return config.defaultRepoId;
  if (config.repos.length === 1) return config.repos[0].id;
  if (config.repos.length === 0) throw new Error("No repositories configured. Please add one in the admin dashboard.");
  throw new Error("Multiple repos configured but no default set. Please set a default in the admin dashboard.");
}

function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (message.length > 200) return message.slice(0, 200) + "...";
  return message;
}

async function callPlannerWithRetry(
  agent: ReturnType<typeof createPlanningAgent>,
  history: Message[],
  systemPrompt: string
): Promise<string> {
  try {
    return await agent.chat(history, systemPrompt);
  } catch (firstErr) {
    console.warn("Planning agent failed, retrying once:", firstErr);
    return await agent.chat(history, systemPrompt);
  }
}

async function handlePlannerResponse(
  app: App, sessionId: string, channelId: string, threadTs: string, response: string
): Promise<void> {
  const current = getSession(sessionId)!;

  if (response.includes(PLAN_MARKER)) {
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

async function runPlannerRound(
  app: App, sessionId: string, channelId: string, threadTs: string, config: AppConfig, provider: ProviderConfig
): Promise<void> {
  const agent = createPlanningAgent(provider);
  const systemPrompt = config.systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
  const current = getSession(sessionId)!;

  try {
    const response = await callPlannerWithRetry(agent, current.conversationHistory, systemPrompt);
    await handlePlannerResponse(app, sessionId, channelId, threadTs, response);
  } catch (err) {
    const safeMsg = sanitizeError(err);
    updateSession(sessionId, { status: "done", error: safeMsg });
    await app.client.chat.postMessage({
      channel: channelId, thread_ts: threadTs,
      text: `Planning failed. Please try again.`,
    });
  }
}

async function handleNewTask(app: App, channelId: string, threadTs: string, userId: string, text: string): Promise<void> {
  let config: AppConfig;
  let provider: ProviderConfig;
  let repoId: string;

  try {
    config = getConfig();
    provider = getProvider(config);
    repoId = getDefaultRepoId(config);
  } catch (err) {
    const safeMsg = sanitizeError(err);
    await app.client.chat.postMessage({
      channel: channelId, thread_ts: threadTs,
      text: `:warning: *SpecFlow is not fully configured yet.*\n${safeMsg}\n\nPlease visit the admin dashboard to complete setup.`,
    });
    return;
  }

  const session = createSession({ channelId, threadTs, userId, repoId, providerId: provider.id, originalMessage: text, source: "slack" });
  assertTransition(session.status, "planning");
  updateSession(session.id, {
    status: "planning",
    conversationHistory: [{ role: "user", content: text }],
  });

  await runPlannerRound(app, session.id, channelId, threadTs, config, provider);
}

async function handleThreadReply(app: App, channelId: string, threadTs: string, text: string): Promise<void> {
  const session = getSessionByThread(channelId, threadTs);
  if (!session) return;
  if (!["planning", "awaiting_confirmation", "editing"].includes(session.status)) return;

  let config: AppConfig;
  let provider: ProviderConfig;

  try {
    config = getConfig();
    provider = getProvider(config);
  } catch (err) {
    const safeMsg = sanitizeError(err);
    await app.client.chat.postMessage({
      channel: channelId, thread_ts: threadTs,
      text: `:warning: *SpecFlow is not fully configured yet.*\n${safeMsg}\n\nPlease visit the admin dashboard to complete setup.`,
    });
    return;
  }

  if (session.status === "awaiting_confirmation") {
    assertTransition("awaiting_confirmation", "editing");
    updateSession(session.id, { status: "editing" });
  }

  const refreshed = getSession(session.id)!;

  updateSession(session.id, {
    conversationHistory: [...refreshed.conversationHistory, { role: "user", content: text }],
  });

  await runPlannerRound(app, session.id, channelId, threadTs, config, provider);
}

export function registerHandlers(app: App): void {
  app.event("app_mention", async ({ event }) => {
    const threadTs = event.ts;
    const channelId = event.channel;
    const userId = event.user ?? "unknown";
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

    try {
      if (event.thread_ts) {
        const existing = getSessionByThread(channelId, event.thread_ts);
        if (existing) { await handleThreadReply(app, channelId, event.thread_ts, text); return; }
      }
      await handleNewTask(app, channelId, threadTs, userId, text);
    } catch (err) {
      console.error("Unhandled error in app_mention handler:", err);
      await app.client.chat.postMessage({
        channel: channelId, thread_ts: threadTs,
        text: `:x: Something went wrong: ${sanitizeError(err)}`,
      }).catch(() => {});
    }
  });

  app.event("message", async ({ event }) => {
    const msg = event as GenericMessageEvent;
    if (msg.channel_type !== "im") return;
    if (event.subtype) return;
    const channelId = msg.channel;
    const threadTs = msg.thread_ts || msg.ts;
    const userId = msg.user;
    const text = msg.text || "";

    try {
      if (msg.thread_ts) {
        const existing = getSessionByThread(channelId, msg.thread_ts);
        if (existing) { await handleThreadReply(app, channelId, msg.thread_ts, text); return; }
      }
      await handleNewTask(app, channelId, threadTs, userId, text);
    } catch (err) {
      console.error("Unhandled error in message handler:", err);
      await app.client.chat.postMessage({
        channel: channelId, thread_ts: threadTs,
        text: `:x: Something went wrong: ${sanitizeError(err)}`,
      }).catch(() => {});
    }
  });
}
