import type { App, BlockAction, ButtonAction } from "@slack/bolt";
import { executeSession } from "../executor/executor.js";
import { getConfig } from "../config-store.js";
import { buildConfirmedMessage, buildCancelledMessage } from "./blocks.js";
import { convex, assertConvexEnabled } from "../convex-client.js";
import { buildLegacySession, sanitizeError } from "../utils.js";

function getActionSessionId(body: BlockAction): string | undefined {
  const action = body.actions?.[0] as ButtonAction | undefined;
  return action?.value;
}

export function registerActions(app: App): void {
  app.action("confirm_plan", async ({ ack, body, client }) => {
    await ack();
    assertConvexEnabled();
    const requestId = getActionSessionId(body as BlockAction);
    const userId = body.user.id;
    if (!requestId) return;

    const detail = await convex.requests.getDetail(requestId);
    if (!detail) return;
    if (!detail.sourceRef.channelId || !detail.sourceRef.threadTs) return;

    const channelId = detail.sourceRef.channelId;
    const threadTs = detail.sourceRef.threadTs;

    if (detail.status !== "plan_ready") {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `This request is currently ${detail.status}. Only plan-ready requests can be confirmed.`,
      });
      return;
    }

    if (detail.requesterId !== userId) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Only the person who started this task can confirm the plan.",
      });
      return;
    }

    const approvedPlan = detail?.currentPlan?.body;
    if (!approvedPlan) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "No approved plan is stored for this request. Ask the planner to regenerate the plan first.",
      });
      return;
    }

    await convex.requests.updateStatus({ id: detail._id, status: "plan_approved" });

    await client.chat.update({
      channel: channelId,
      ts: threadTs,
      blocks: buildConfirmedMessage(userId),
      text: "Plan confirmed.",
    }).catch(() => {});

    const { id: jobId } = await convex.jobs.create({
      requestId: detail._id,
      type: "claude_code_execution",
    });

    await convex.requests.updateStatus({
      id: detail._id,
      status: "executing",
      currentExecutionId: jobId,
    });

    const config = getConfig();
    const repo = config.repos.find((r) => r.id === detail.repoId);
    if (!repo) {
      await Promise.all([
        convex.requests.updateStatus({ id: detail._id, status: "failed", error: "Repo not found in config" }),
        convex.jobs.updateStatus({ id: jobId, status: "failed", error: "Repo not found" }),
      ]);
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: "Error: configured repository not found.",
      });
      return;
    }

    const legacySession = buildLegacySession(detail, repo, "slack", approvedPlan);

    await convex.jobs.updateStatus({ id: jobId, status: "running" });

    const onStatus = async (message: string) => {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: message,
      });
    };

    try {
      const result = await executeSession(legacySession, repo, onStatus);
      if (result.success && result.prUrl) {
        await Promise.all([
          convex.jobs.updateStatus({ id: jobId, status: "completed", output: result.prUrl }),
          convex.requests.updateStatus({ id: detail._id, status: "pr_created", prUrl: result.prUrl }),
        ]);
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: `PR created: ${result.prUrl}`,
        });
      } else {
        const error = result.error || "Unknown error";
        await Promise.all([
          convex.jobs.updateStatus({ id: jobId, status: "failed", error }),
          convex.requests.updateStatus({ id: detail._id, status: "failed", error }),
        ]);
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: "Execution failed. Check the admin dashboard for details.",
        });
      }
    } catch (err) {
      const message = sanitizeError(err);
      console.error("Execution error:", err);
      await Promise.all([
        convex.jobs.updateStatus({ id: jobId, status: "failed", error: message }),
        convex.requests.updateStatus({ id: detail._id, status: "failed", error: message }),
      ]);
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: "Execution encountered an error. Check the admin dashboard for details.",
      });
    }
  });

  app.action("edit_plan", async ({ ack, body, client }) => {
    await ack();
    assertConvexEnabled();
    const requestId = getActionSessionId(body as BlockAction);
    const userId = body.user.id;
    if (!requestId) return;

    const request = await convex.requests.get(requestId);
    if (!request) return;
    if (!request.sourceRef.channelId || !request.sourceRef.threadTs) return;

    const channelId = request.sourceRef.channelId;
    const threadTs = request.sourceRef.threadTs;

    if (request.status !== "plan_ready") {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `This request is currently ${request.status}. Only plan-ready requests can be edited from the review buttons.`,
      });
      return;
    }

    if (request.requesterId !== userId) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Only the person who started this task can edit the plan.",
      });
      return;
    }

    await convex.requests.updateStatus({ id: request._id, status: "clarifying" });
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: "What would you like to change? Reply in this thread with your feedback.",
    });
  });

  app.action("cancel_plan", async ({ ack, body, client }) => {
    await ack();
    assertConvexEnabled();
    const requestId = getActionSessionId(body as BlockAction);
    const userId = body.user.id;
    if (!requestId) return;

    const request = await convex.requests.get(requestId);
    if (!request) return;
    if (!request.sourceRef.channelId || !request.sourceRef.threadTs) return;

    const channelId = request.sourceRef.channelId;
    const threadTs = request.sourceRef.threadTs;

    if (request.status === "executing") {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "This request is already executing and can no longer be cancelled from the review buttons.",
      });
      return;
    }

    if (request.requesterId !== userId) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Only the person who started this task can cancel.",
      });
      return;
    }

    await convex.requests.updateStatus({ id: request._id, status: "cancelled" });
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: "Session cancelled. Start a new request anytime.",
    });
  });
}
