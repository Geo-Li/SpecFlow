import { Router, type Request, type Response } from "express";
import { getConfig, saveConfig } from "../config-store.js";
import { repoConfigSchema } from "@specflow/shared";
import { nanoid } from "nanoid";
import { resolve, dirname, sep } from "node:path";
import { readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);
const BROWSE_ROOT = homedir();

function validateLocalPath(localPath: string): string | null {
  if (!localPath || typeof localPath !== "string") return "Local path is required";
  const normalized = localPath.replace(/\/+$/, "") || "/";
  const resolved = resolve(normalized);
  if (resolved !== normalized) return "Local path must be an absolute, canonical path (no '..' segments)";
  return null;
}

export function createRepoRouter(): Router {
  const router = Router();

  router.get("/api/browse-dirs", async (req: Request, res: Response) => {
    const requestedPath = typeof req.query.path === "string" ? req.query.path : BROWSE_ROOT;
    const resolved = resolve(requestedPath);
    if (resolved !== requestedPath && requestedPath !== BROWSE_ROOT) {
      res.status(400).json({ error: "Path must be absolute and canonical" });
      return;
    }
    if (resolved !== BROWSE_ROOT && !resolved.startsWith(BROWSE_ROOT + sep)) {
      res.status(403).json({ error: "Path is outside the allowed browsable root" });
      return;
    }
    try {
      const entries = await readdir(resolved, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
      const parent = resolved === BROWSE_ROOT ? null : dirname(resolved);
      res.json({ path: resolved, dirs, parent });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      const message = code === "EACCES" ? "Permission denied"
        : code === "ENOENT" ? "Directory does not exist"
        : "Cannot read directory";
      res.status(400).json({ error: message });
    }
  });

  router.get("/api/repos/branches", async (req: Request, res: Response) => {
    const localPath = typeof req.query.localPath === "string" ? req.query.localPath : "";
    const pathErr = validateLocalPath(localPath);
    if (pathErr) { res.status(400).json({ error: pathErr }); return; }
    try {
      const { stdout } = await execFileAsync("git", ["branch", "--list", "--format=%(refname:short)"], {
        cwd: localPath,
        encoding: "utf-8",
        timeout: 5000,
      });
      const branches = stdout.split("\n").map((b) => b.trim()).filter(Boolean);
      res.json({ branches });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      const message = code === "ENOENT" ? "git is not installed or not in PATH"
        : (err as Error).message?.includes("timeout") ? "Git command timed out"
        : "Not a git repository or git not available";
      res.status(400).json({ error: message });
    }
  });

  router.get("/api/repos", (_req: Request, res: Response) => {
    res.json(getConfig().repos);
  });

  router.post("/api/repos", (req: Request, res: Response) => {
    const pathErr = validateLocalPath(req.body?.localPath);
    if (pathErr) { res.status(400).json({ error: pathErr }); return; }
    const id = nanoid();
    const result = repoConfigSchema.safeParse({ ...req.body, id });
    if (!result.success) { res.status(400).json({ error: result.error.issues[0]?.message || "Invalid repo data" }); return; }
    const config = getConfig();
    try {
      saveConfig({ ...config, repos: [...config.repos, result.data] });
    } catch (err) {
      console.error("Failed to save config:", err);
      res.status(500).json({ error: "Failed to save configuration" });
      return;
    }
    res.status(201).json({ id });
  });

  router.put("/api/repos/:id", (req: Request, res: Response) => {
    const config = getConfig();
    const idx = config.repos.findIndex((r) => r.id === req.params.id);
    if (idx === -1) { res.status(404).json({ error: "Repo not found" }); return; }
    if (req.body?.localPath) {
      const pathErr = validateLocalPath(req.body.localPath);
      if (pathErr) { res.status(400).json({ error: pathErr }); return; }
    }
    const merged = { ...config.repos[idx], ...req.body, id: req.params.id };
    const result = repoConfigSchema.safeParse(merged);
    if (!result.success) { res.status(400).json({ error: result.error.issues[0]?.message || "Invalid repo data" }); return; }
    const repos = [...config.repos];
    repos[idx] = result.data;
    try {
      saveConfig({ ...config, repos });
    } catch (err) {
      console.error("Failed to save config:", err);
      res.status(500).json({ error: "Failed to save configuration" });
      return;
    }
    res.json({ ok: true });
  });

  router.delete("/api/repos/:id", (req: Request, res: Response) => {
    const config = getConfig();
    try {
      saveConfig({ ...config, repos: config.repos.filter((r) => r.id !== req.params.id) });
    } catch (err) {
      console.error("Failed to save config:", err);
      res.status(500).json({ error: "Failed to save configuration" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
