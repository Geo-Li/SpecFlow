import { Router, type Request, type Response } from "express";
import { getConfig, saveConfig } from "../config-store.js";
import { nanoid } from "nanoid";

export function createRepoRouter(): Router {
  const router = Router();

  router.get("/api/repos", (_req: Request, res: Response) => {
    res.json(getConfig().repos);
  });

  router.post("/api/repos", (req: Request, res: Response) => {
    const config = getConfig();
    const repo = { ...req.body, id: nanoid() };
    config.repos.push(repo);
    saveConfig(config);
    res.status(201).json({ id: repo.id });
  });

  router.put("/api/repos/:id", (req: Request, res: Response) => {
    const config = getConfig();
    const idx = config.repos.findIndex((r) => r.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: "Repo not found" }); return; }
    config.repos[idx] = { ...config.repos[idx], ...req.body, id: req.params.id };
    saveConfig(config);
    res.json({ ok: true });
  });

  router.delete("/api/repos/:id", (req: Request, res: Response) => {
    const config = getConfig();
    config.repos = config.repos.filter((r) => r.id !== req.params.id);
    saveConfig(config);
    res.json({ ok: true });
  });

  return router;
}
