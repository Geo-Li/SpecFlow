import { Router, type Request, type Response } from "express";
import { getConfig, saveConfig } from "../config-store.js";

export function createConfigRouter(): Router {
  const router = Router();

  router.get("/api/config", (_req: Request, res: Response) => {
    const config = getConfig();
    const masked = {
      ...config,
      providers: config.providers.map((p) => ({
        ...p,
        apiKey: p.apiKey.slice(0, 8) + "..." + p.apiKey.slice(-4),
      })),
    };
    res.json(masked);
  });

  router.put("/api/config", (req: Request, res: Response) => {
    try {
      const current = getConfig();
      const updates = req.body;
      const updated = {
        ...current,
        defaultProviderId: updates.defaultProviderId ?? current.defaultProviderId,
        defaultRepoId: updates.defaultRepoId ?? current.defaultRepoId,
        maxConcurrentExecutions: updates.maxConcurrentExecutions ?? current.maxConcurrentExecutions,
        systemPromptOverride: updates.systemPromptOverride ?? current.systemPromptOverride,
      };
      saveConfig(updated);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
