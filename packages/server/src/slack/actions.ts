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
