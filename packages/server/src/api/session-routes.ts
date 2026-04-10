import { Router, type Request, type Response } from "express";
import { convex, assertConvexEnabled } from "../convex-client.js";
import { getConfig } from "../config-store.js";

export function createSessionRouter(): Router {
  const router = Router();

  router.get("/api/sessions", async (_req: Request, res: Response) => {
    try {
      assertConvexEnabled();
    } catch (err) {
      res.status(503).json({ error: "Convex not configured. Set CONVEX_SITE_URL and CONVEX_AUTH_TOKEN to enable session storage." });
      return;
    }

    const rawStatus = _req.query.status;
    const status = typeof rawStatus === "string" ? rawStatus : undefined;

    try {
      const requests = await convex.requests.list({ status });
      const summary = (requests || []).map((r: any) => ({
        id: r._id,
        status: r.status,
        userId: r.requesterId,
        originalMessage: r.rawRequest,
        prUrl: r.prUrl || null,
        error: r.error || null,
        createdAt: new Date(r._creationTime).toISOString(),
        updatedAt: new Date(r._creationTime).toISOString(),
      }));
      res.json(summary);
    } catch (err) {
      console.error("Failed to fetch sessions from Convex:", err);
      res.status(500).json({ error: "Failed to fetch sessions from Convex" });
    }
  });

  router.get("/api/sessions/:id", async (req: Request, res: Response) => {
    try {
      assertConvexEnabled();
    } catch (err) {
      res.status(503).json({ error: "Convex not configured. Set CONVEX_SITE_URL and CONVEX_AUTH_TOKEN to enable session storage." });
      return;
    }

    const id = req.params.id as string;

    try {
      const detail = await convex.requests.getDetail(id);
      if (!detail) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      const config = getConfig();
      const repo = detail.repoId ? config.repos.find((r) => r.id === detail.repoId) : undefined;
      res.json({
        id: detail._id,
        status: detail.status,
        userId: detail.requesterId,
        originalMessage: detail.rawRequest,
        plan: detail.currentPlan?.body ?? null,
        conversationHistory: [],
        prUrl: detail.prUrl || null,
        error: detail.error || null,
        executionMode: detail.executionMode || "worktree",
        baseBranch: detail.baseBranch || repo?.defaultBranch || "main",
        createdAt: new Date(detail._creationTime).toISOString(),
        updatedAt: new Date(detail._creationTime).toISOString(),
        source: detail.source,
        title: detail.title,
        channelId: detail.sourceRef?.channelId,
        threadTs: detail.sourceRef?.threadTs,
      });
    } catch (err) {
      console.error("Failed to fetch session from Convex:", err);
      res.status(500).json({ error: "Failed to fetch session from Convex" });
    }
  });

  return router;
}
