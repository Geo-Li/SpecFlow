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

async function callPlannerWithRetry(
  agent: ReturnType<typeof createPlanningAgent>,
  history: Message[],
  systemPrompt: string
): Promise<string> {
  try {
    return await agent.chat(history, systemPrompt);
  } catch (firstErr) {
    console.warn("Planning agent failed, retrying once:", (firstErr as Error).message);
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
