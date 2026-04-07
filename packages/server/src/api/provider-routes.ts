import { Router, type Request, type Response } from "express";
import { getConfig, saveConfig } from "../config-store.js";
import { providerConfigSchema } from "@specflow/shared";
import { nanoid } from "nanoid";
import { maskApiKey } from "../utils.js";

export function createProviderRouter(): Router {
  const router = Router();

  router.get("/api/providers", (_req: Request, res: Response) => {
    const config = getConfig();
    const masked = config.providers.map((p) => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
    }));
    res.json(masked);
  });

  router.post("/api/providers", (req: Request, res: Response) => {
    const id = nanoid();
    const result = providerConfigSchema.safeParse({ ...req.body, id });
    if (!result.success) { res.status(400).json({ error: result.error.issues[0]?.message || "Invalid provider data" }); return; }
    const config = getConfig();
    try {
      saveConfig({ ...config, providers: [...config.providers, result.data] });
    } catch (err) {
      console.error("Failed to save config:", err);
      res.status(500).json({ error: "Failed to save configuration" });
      return;
    }
    res.status(201).json({ id });
  });

  router.put("/api/providers/:id", (req: Request, res: Response) => {
    const config = getConfig();
    const idx = config.providers.findIndex((p) => p.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: "Provider not found" }); return; }
    const merged = { ...config.providers[idx], ...req.body, id: req.params.id };
    const result = providerConfigSchema.safeParse(merged);
    if (!result.success) { res.status(400).json({ error: result.error.issues[0]?.message || "Invalid provider data" }); return; }
    const providers = [...config.providers];
    providers[idx] = result.data;
    try {
      saveConfig({ ...config, providers });
    } catch (err) {
      console.error("Failed to save config:", err);
      res.status(500).json({ error: "Failed to save configuration" });
      return;
    }
    res.json({ ok: true });
  });

  router.delete("/api/providers/:id", (req: Request, res: Response) => {
    const config = getConfig();
    try {
      saveConfig({ ...config, providers: config.providers.filter((p) => p.id !== req.params.id) });
    } catch (err) {
      console.error("Failed to save config:", err);
      res.status(500).json({ error: "Failed to save configuration" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
