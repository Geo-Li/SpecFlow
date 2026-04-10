import { Router, type Request, type Response } from "express";
import { getConfig, saveConfig } from "../config-store.js";
import { providerConfigSchema } from "@specflow/shared";
import { nanoid } from "nanoid";
import { maskApiKey } from "../utils.js";
import {
  discoverProviderModels,
  type ProviderModelDiscoveryInput,
} from "../provider-models.js";

function resolveModelDiscoveryInput(
  config: ReturnType<typeof getConfig>,
  body: Record<string, unknown>,
): ProviderModelDiscoveryInput {
  const providerId =
    typeof body.providerId === "string" ? body.providerId : undefined;
  const savedProvider = providerId
    ? config.providers.find((provider) => provider.id === providerId)
    : undefined;

  if (providerId && !savedProvider) {
    throw new Error("Provider not found");
  }

  const type =
    (typeof body.type === "string" ? body.type : savedProvider?.type) as
      | ProviderModelDiscoveryInput["type"]
      | undefined;
  const apiKey =
    typeof body.apiKey === "string" && body.apiKey.length > 0
      ? body.apiKey
      : savedProvider?.apiKey;
  const baseUrl =
    typeof body.baseUrl === "string" && body.baseUrl.length > 0
      ? body.baseUrl
      : savedProvider?.baseUrl;

  if (!type) throw new Error("Provider type is required");
  if (!apiKey) throw new Error("API key is required to discover models");

  return { type, apiKey, baseUrl };
}

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

  router.post("/api/providers/discover-models", async (req: Request, res: Response) => {
    const config = getConfig();

    let input: ProviderModelDiscoveryInput;
    try {
      input = resolveModelDiscoveryInput(
        config,
        (req.body ?? {}) as Record<string, unknown>,
      );
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }

    try {
      const models = await discoverProviderModels(input);
      res.json({ models });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch models";
      res.status(502).json({ error: message });
    }
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
