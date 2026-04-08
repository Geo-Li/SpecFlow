import { Router, type Request, type Response } from "express";
import { convex, assertConvexEnabled } from "../convex-client.js";
import { sanitizeError } from "../utils.js";

export function createSessionRouter(): Router {
  const router = Router();

  router.get("/api/sessions", async (_req: Request, res: Response) => {
    try {
      assertConvexEnabled();
    } catch (err) {
      res.status(503).json({ error: "Convex not configured. Set CONVEX_SITE_URL to enable session storage." });
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
      res.status(503).json({ error: "Convex not configured. Set CONVEX_SITE_URL to enable session storage." });
      return;
    }

    const id = req.params.id as string;

    try {
      const request = await convex.requests.get(id);
      if (!request) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json({
        id: request._id,
        status: request.status,
        userId: request.requesterId,
        originalMessage: request.rawRequest,
        prUrl: request.prUrl || null,
        error: request.error || null,
        createdAt: new Date(request._creationTime).toISOString(),
        updatedAt: new Date(request._creationTime).toISOString(),
        source: request.source,
        title: request.title,
        channelId: request.sourceRef?.channelId,
        threadTs: request.sourceRef?.threadTs,
      });
    } catch (err) {
      console.error("Failed to fetch session from Convex:", err);
      res.status(500).json({ error: "Failed to fetch session from Convex" });
    }
  });

  return router;
}
