import { Router, type Request, type Response } from "express";
import { getAllSessions, getSession } from "../sessions/session-store.js";

export function createSessionRouter(): Router {
  const router = Router();

  router.get("/api/sessions", (req: Request, res: Response) => {
    let sessions = getAllSessions();
    const status = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status as string | undefined;
    if (status) { sessions = sessions.filter((s) => s.status === status); }
    const summary = sessions.map((s) => ({
      id: s.id, status: s.status, userId: s.userId,
      originalMessage: s.originalMessage, prUrl: s.prUrl,
      error: s.error, createdAt: s.createdAt, updatedAt: s.updatedAt,
    }));
    res.json(summary);
  });

  router.get("/api/sessions/:id", (req: Request, res: Response) => {
    const session = getSession(req.params.id as string);
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(session);
  });

  return router;
}
