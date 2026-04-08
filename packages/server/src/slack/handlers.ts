import type { App } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/types";
import { PLAN_MARKER } from "../planner/system-prompt.js";
import { getConfig } from "../config-store.js";
import { buildPlanMessage } from "./blocks.js";
import { convex, assertConvexEnabled } from "../convex-client.js";
import { getDefaultRepoId, sanitizeError, NO_MESSAGE_STATUSES } from "../utils.js";

async function handleNewTask(
  app: App, channelId: string, threadTs: string, userId: string, text: string
): Promise<void> {
  assertConvexEnabled();
  const config = getConfig();
  const repoId = getDefaultRepoId(config);

  const { id: requestId } = await convex.requests.create({
    orgId: "default",
    requesterId: userId,
    source: "slack",
    sourceRef: { channelId, threadTs },
    type: "code_change",
    title: text.slice(0, 100),
    rawRequest: text,
    repoId,
  });

  const { response } = await convex.agent.startPlanning({
    requestId,
    rawRequest: text,
    userId,
  });

  if (response.includes(PLAN_MARKER)) {
    await app.client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      blocks: buildPlanMessage(response, requestId),
      text: "Implementation plan ready for review.",
    });
    await convex.requests.updateStatus({ id: requestId, status: "plan_ready" });
  } else {
    await app.client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: response,
    });
  }
}

async function handleThreadReply(
  app: App, channelId: string, threadTs: string, text: string
): Promise<void> {
  assertConvexEnabled();

  const request = await convex.requests.getByThread(channelId, threadTs);
  if (!request) return;

  if (NO_MESSAGE_STATUSES.includes(request.status as any)) return;
  if (!request.threadId) return;

  if (request.status === "plan_ready") {
    await convex.requests.updateStatus({ id: request._id, status: "clarifying" });
  }

  const { response } = await convex.agent.continueThread({
    threadId: request.threadId,
    message: text,
  });

  if (response.includes(PLAN_MARKER)) {
    await app.client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      blocks: buildPlanMessage(response, request._id),
      text: "Implementation plan ready for review.",
    });
    await convex.requests.updateStatus({ id: request._id, status: "plan_ready" });
  } else {
    await app.client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: response,
    });
  }
}

export function registerHandlers(app: App): void {
  app.event("app_mention", async ({ event }) => {
    const threadTs = event.ts;
    const channelId = event.channel;
    const userId = event.user ?? "unknown";
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

    try {
      if (event.thread_ts) {
        const request = await convex.requests.getByThread(channelId, event.thread_ts);
        if (request) {
          await handleThreadReply(app, channelId, event.thread_ts, text);
          return;
        }
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
        const request = await convex.requests.getByThread(channelId, msg.thread_ts);
        if (request) {
          await handleThreadReply(app, channelId, msg.thread_ts, text);
          return;
        }
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
