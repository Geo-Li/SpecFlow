import { Router, type Request, type Response } from "express";
import { getConfig, saveConfig } from "../config-store.js";
import { nanoid } from "nanoid";

export function createProviderRouter(): Router {
  const router = Router();

  router.get("/api/providers", (_req: Request, res: Response) => {
    const config = getConfig();
    const masked = config.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey.slice(0, 8) + "..." + p.apiKey.slice(-4),
    }));
    res.json(masked);
  });

  router.post("/api/providers", (req: Request, res: Response) => {
    const config = getConfig();
    const provider = { ...req.body, id: nanoid() };
    config.providers.push(provider);
    saveConfig(config);
    res.status(201).json({ id: provider.id });
  });

  router.put("/api/providers/:id", (req: Request, res: Response) => {
    const config = getConfig();
    const idx = config.providers.findIndex((p) => p.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: "Provider not found" }); return; }
    config.providers[idx] = { ...config.providers[idx], ...req.body, id: req.params.id };
    saveConfig(config);
    res.json({ ok: true });
  });

  router.delete("/api/providers/:id", (req: Request, res: Response) => {
    const config = getConfig();
    config.providers = config.providers.filter((p) => p.id !== req.params.id);
    saveConfig(config);
    res.json({ ok: true });
  });

  return router;
}
