import { Router, type Request, type Response } from "express";
import { getConfig, saveConfig } from "../config-store.js";
import { maskApiKey } from "../utils.js";

export function createConfigRouter(): Router {
  const router = Router();

  router.get("/api/config", (_req: Request, res: Response) => {
    try {
      const config = getConfig();
      const masked = {
        ...config,
        providers: config.providers.map((p) => ({
          ...p,
          apiKey: maskApiKey(p.apiKey),
        })),
      };
      res.json(masked);
    } catch (err) {
      console.error("Failed to read config:", err);
      res.status(500).json({ error: "Failed to read configuration" });
    }
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
      console.error("Failed to save config:", err);
      res.status(500).json({ error: "Failed to save configuration" });
    }
  });

  return router;
}
