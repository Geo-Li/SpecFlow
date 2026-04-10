import { Router, type Request, type Response } from "express";
import { PLAN_MARKER } from "../planner/system-prompt.js";
import { getConfig } from "../config-store.js";
import { executeSession } from "../executor/executor.js";
import { convex, assertConvexEnabled } from "../convex-client.js";
import { getDefaultProvider, getDefaultRepoId, sanitizeError, toRuntimePayload, buildLegacySession, TERMINAL_STATUSES, NO_MESSAGE_STATUSES } from "../utils.js";

export function createChatRouter(): Router {
  const router = Router();

  // List chat sessions (dashboard source)
  router.get("/api/chat/sessions", async (_req: Request, res: Response) => {
    try {
      assertConvexEnabled();
      const requests = await convex.requests.list({});
      const dashboardSessions = (requests || [])
        .filter((r: any) => r.source === "dashboard")
        .map((r: any) => ({
          id: r._id,
          title: r.title,
          status: r.status,
          createdAt: new Date(r._creationTime).toISOString(),
          updatedAt: new Date(r._creationTime).toISOString(),
        }));
      res.json(dashboardSessions);
    } catch (err) {
      res.status(503).json({ error: sanitizeError(err, "Failed to fetch sessions") });
    }
  });

  // Get session detail
  router.get("/api/chat/sessions/:id", async (req: Request, res: Response) => {
    try {
      assertConvexEnabled();
      const request = await convex.requests.get(req.params.id as string);
      if (!request || request.source !== "dashboard") {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json({
        id: request._id,
        title: request.title,
        status: request.status,
        plan: null,
        prUrl: request.prUrl || null,
        error: request.error || null,
        createdAt: new Date(request._creationTime).toISOString(),
        updatedAt: new Date(request._creationTime).toISOString(),
      });
    } catch (err) {
      res.status(503).json({ error: sanitizeError(err, "Failed to fetch session") });
    }
  });

  // Create session
  router.post("/api/chat/sessions", async (req: Request, res: Response) => {
    const { title } = req.body;
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }

    try {
      assertConvexEnabled();
      const config = getConfig();
      const repoId = getDefaultRepoId(config);

      const { id } = await convex.requests.create({
        orgId: "default",
        requesterId: "admin",
        source: "dashboard",
        sourceRef: {},
        type: "code_change",
        title,
        rawRequest: title,
        repoId,
      });

      res.status(201).json({
        id,
        title,
        status: "intake",
        source: "dashboard",
        conversationHistory: [],
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: sanitizeError(err, "Failed to create session") });
    }
  });

  // Send message
  router.post(
    "/api/chat/sessions/:id/messages",
    async (req: Request, res: Response) => {
      try {
        assertConvexEnabled();
      } catch {
        res.status(503).json({ error: "Convex not configured. Set CONVEX_SITE_URL and CONVEX_AUTH_TOKEN." });
        return;
      }

      const { content } = req.body;
      if (!content || typeof content !== "string") {
        res.status(400).json({ error: "content is required" });
        return;
      }

      const request = await convex.requests.get(req.params.id as string);
      if (!request || request.source !== "dashboard") {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      if (NO_MESSAGE_STATUSES.includes(request.status as any)) {
        res.status(400).json({ error: `Cannot send message: session is ${request.status}` });
        return;
      }

      try {
        let response: string;
        const config = getConfig();
        const provider = getDefaultProvider(config);

        if (!request.threadId) {
          const result = await convex.agent.startPlanning({
            requestId: request._id,
            rawRequest: content,
            userId: "admin",
            provider: toRuntimePayload(provider),
            systemPrompt: config.systemPromptOverride ?? undefined,
          });
          response = result.response;
        } else {
          const result = await convex.agent.continueThread({
            requestId: request._id,
            threadId: request.threadId,
            message: content,
            provider: toRuntimePayload(provider),
            systemPrompt: config.systemPromptOverride ?? undefined,
          });
          response = result.response;
        }

        const hasPlan = response.includes(PLAN_MARKER);

        res.json({
          role: "assistant",
          content: response,
          status: hasPlan ? "plan_ready" : "clarifying",
        });
      } catch (err) {
        const msg = sanitizeError(err, "Planning failed");
        await convex.requests.updateStatus({ id: request._id, status: "failed", error: msg });
        res.status(500).json({ error: msg });
      }
    }
  );

  // Confirm plan
  router.post(
    "/api/chat/sessions/:id/confirm",
    async (req: Request, res: Response) => {
      try {
        assertConvexEnabled();
      } catch {
        res.status(503).json({ error: "Convex not configured. Set CONVEX_SITE_URL and CONVEX_AUTH_TOKEN." });
        return;
      }

      const detail = await convex.requests.getDetail(req.params.id as string);
      if (!detail || detail.source !== "dashboard") {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      if (detail.status !== "plan_ready") {
        res.status(400).json({ error: `Cannot confirm: session is ${detail.status}` });
        return;
      }

      const approvedPlan = detail?.currentPlan?.body;
      if (!approvedPlan) {
        res.status(400).json({ error: "Cannot confirm: no approved plan is stored for this session." });
        return;
      }

      const { id: jobId } = await convex.jobs.create({
        requestId: detail._id,
        type: "claude_code_execution",
      });

      await convex.requests.updateStatus({
        id: detail._id,
        status: "executing",
        currentExecutionId: jobId,
      });

      res.json({ status: "executing" });

      // Execute in background
      const config = getConfig();
      const repo = config.repos.find((r) => r.id === detail.repoId);
      if (!repo) {
        await Promise.all([
          convex.requests.updateStatus({ id: detail._id, status: "failed", error: "Repo not found" }),
          convex.jobs.updateStatus({ id: jobId, status: "failed", error: "Repo not found" }),
        ]);
        return;
      }

      const legacySession = buildLegacySession(detail, repo, "chat", approvedPlan);

      await convex.jobs.updateStatus({ id: jobId, status: "running" });

      const onStatus = (message: string) => {
        console.log(`[chat][${detail._id}] ${message}`);
      };

      try {
        const result = await executeSession(legacySession, repo, onStatus);
        if (result.success && result.prUrl) {
          await Promise.all([
            convex.jobs.updateStatus({ id: jobId, status: "completed", output: result.prUrl }),
            convex.requests.updateStatus({ id: detail._id, status: "pr_created", prUrl: result.prUrl }),
          ]);
        } else {
          const error = result.error || "Unknown error";
          await Promise.all([
            convex.jobs.updateStatus({ id: jobId, status: "failed", error }),
            convex.requests.updateStatus({ id: detail._id, status: "failed", error }),
          ]);
        }
      } catch (err) {
        const msg = sanitizeError(err, "Execution failed");
        await Promise.all([
          convex.jobs.updateStatus({ id: jobId, status: "failed", error: msg }),
          convex.requests.updateStatus({ id: detail._id, status: "failed", error: msg }),
        ]);
      }
    }
  );

  // Cancel session
  router.post("/api/chat/sessions/:id/cancel", async (req: Request, res: Response) => {
    try {
      assertConvexEnabled();
    } catch {
      res.status(503).json({ error: "Convex not configured. Set CONVEX_SITE_URL and CONVEX_AUTH_TOKEN." });
      return;
    }

    const request = await convex.requests.get(req.params.id as string);
    if (!request || request.source !== "dashboard") {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (TERMINAL_STATUSES.includes(request.status as any)) {
      res.status(400).json({ error: "Session is already done" });
      return;
    }

    if (request.status === "executing") {
      res.status(400).json({ error: "Cannot cancel: session is executing" });
      return;
    }

    await convex.requests.updateStatus({ id: request._id, status: "cancelled" });
    res.json({ status: "cancelled" });
  });

  return router;
}
