import { Router, type Request, type Response } from "express";
import {
  createSession,
  getSession,
  updateSession,
  getChatSessions,
} from "../sessions/session-store.js";
import { assertTransition } from "../sessions/session-machine.js";
import { createPlanningAgent } from "../planner/planner.js";
import { DEFAULT_SYSTEM_PROMPT, PLAN_MARKER } from "../planner/system-prompt.js";
import { getConfig } from "../config-store.js";
import { executeSession } from "../executor/executor.js";
import type { ProviderConfig, AppConfig } from "@specflow/shared";

function getProvider(config: AppConfig): ProviderConfig {
  const providerId = config.defaultProviderId;
  if (!providerId)
    throw new Error("No default LLM provider configured.");
  const provider = config.providers.find((p) => p.id === providerId);
  if (!provider) throw new Error(`Provider ${providerId} not found`);
  return provider;
}

function getDefaultRepoId(config: AppConfig): string {
  if (config.defaultRepoId) return config.defaultRepoId;
  if (config.repos.length === 1) return config.repos[0].id;
  if (config.repos.length === 0)
    throw new Error("No repositories configured.");
  throw new Error(
    "Multiple repos configured but no default set."
  );
}

export function createChatRouter(): Router {
  const router = Router();

  // List chat sessions
  router.get("/api/chat/sessions", (_req: Request, res: Response) => {
    const sessions = getChatSessions();
    res.json(
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
    );
  });

  // Get session detail
  router.get("/api/chat/sessions/:id", (req: Request, res: Response) => {
    const session = getSession(req.params.id as string);
    if (!session || session.source !== "chat") {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({
      id: session.id,
      title: session.title,
      status: session.status,
      conversationHistory: session.conversationHistory,
      plan: session.plan,
      prUrl: session.prUrl,
      error: session.error,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  });

  // Create session
  router.post("/api/chat/sessions", (req: Request, res: Response) => {
    const { title } = req.body;
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }

    let config: AppConfig;
    let provider: ProviderConfig;
    let repoId: string;
    try {
      config = getConfig();
      provider = getProvider(config);
      repoId = getDefaultRepoId(config);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Config error";
      res.status(400).json({ error: msg });
      return;
    }

    const session = createSession({
      userId: "admin",
      repoId,
      providerId: provider.id,
      originalMessage: title,
      source: "chat",
      title,
    });

    res.status(201).json({
      id: session.id,
      title: session.title,
      status: session.status,
      source: session.source,
      conversationHistory: session.conversationHistory,
      createdAt: session.createdAt,
    });
  });

  // Send message
  router.post(
    "/api/chat/sessions/:id/messages",
    async (req: Request, res: Response) => {
      const session = getSession(req.params.id as string);
      if (!session || session.source !== "chat") {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const { content } = req.body;
      if (!content || typeof content !== "string") {
        res.status(400).json({ error: "content is required" });
        return;
      }

      const allowedStatuses = [
        "idle",
        "planning",
        "awaiting_confirmation",
        "editing",
      ];
      if (!allowedStatuses.includes(session.status)) {
        res.status(400).json({
          error: `Cannot send message: session is ${session.status}`,
        });
        return;
      }

      if (session.status === "awaiting_confirmation") {
        assertTransition("awaiting_confirmation", "editing");
        updateSession(session.id, { status: "editing" });
      } else if (session.status === "idle") {
        assertTransition("idle", "planning");
        updateSession(session.id, { status: "planning" });
      }

      const current = getSession(session.id)!;
      updateSession(session.id, {
        conversationHistory: [
          ...current.conversationHistory,
          { role: "user", content },
        ],
      });

      let config: AppConfig;
      let provider: ProviderConfig;
      try {
        config = getConfig();
        provider = getProvider(config);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Config error";
        res.status(400).json({ error: msg });
        return;
      }

      const agent = createPlanningAgent(provider);
      const systemPrompt =
        config.systemPromptOverride || DEFAULT_SYSTEM_PROMPT;
      const refreshed = getSession(session.id)!;

      try {
        // Retry once on failure (matches Slack handler pattern)
        let response: string;
        try {
          response = await agent.chat(refreshed.conversationHistory, systemPrompt);
        } catch (firstErr) {
          console.warn("Planning agent failed, retrying once:", firstErr);
          response = await agent.chat(refreshed.conversationHistory, systemPrompt);
        }

        if (response.includes(PLAN_MARKER)) {
          assertTransition(
            refreshed.status === "editing" ? "editing" : "planning",
            "awaiting_confirmation"
          );
          updateSession(session.id, {
            status: "awaiting_confirmation",
            plan: response,
            conversationHistory: [
              ...refreshed.conversationHistory,
              { role: "assistant", content: response },
            ],
          });
          res.json({
            role: "assistant",
            content: response,
            status: "awaiting_confirmation",
          });
        } else {
          updateSession(session.id, {
            conversationHistory: [
              ...refreshed.conversationHistory,
              { role: "assistant", content: response },
            ],
          });
          const updated = getSession(session.id)!;
          res.json({
            role: "assistant",
            content: response,
            status: updated.status,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Planning failed";
        updateSession(session.id, { status: "done", error: msg });
        res.status(500).json({ error: msg });
      }
    }
  );

  // Confirm plan
  router.post(
    "/api/chat/sessions/:id/confirm",
    async (req: Request, res: Response) => {
      const session = getSession(req.params.id as string);
      if (!session || session.source !== "chat") {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      if (session.status !== "awaiting_confirmation") {
        res.status(400).json({
          error: `Cannot confirm: session is ${session.status}`,
        });
        return;
      }

      assertTransition(session.status, "executing");
      updateSession(session.id, { status: "executing" });

      res.json({ status: "executing" });

      const config = getConfig();
      const repo = config.repos.find((r) => r.id === session.repoId);
      if (!repo) {
        updateSession(session.id, {
          status: "done",
          error: "Repo not found in config",
        });
        return;
      }

      const onStatus = (message: string) => {
        console.log(`[chat][${session.id}] ${message}`);
      };

      try {
        const result = await executeSession(session, repo, onStatus);
        if (result.success && result.prUrl) {
          updateSession(session.id, {
            status: "done",
            prUrl: result.prUrl,
          });
        } else {
          updateSession(session.id, {
            status: "done",
            error: result.error || "Unknown error",
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Execution failed";
        updateSession(session.id, { status: "done", error: msg });
      }
    }
  );

  // Cancel session
  router.post("/api/chat/sessions/:id/cancel", (req: Request, res: Response) => {
    const session = getSession(req.params.id as string);
    if (!session || session.source !== "chat") {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (session.status === "done") {
      res.status(400).json({ error: "Session is already done" });
      return;
    }

    if (session.status === "executing") {
      res.status(400).json({
        error: "Cannot cancel: session is executing",
      });
      return;
    }

    updateSession(session.id, { status: "done" });
    res.json({ status: "done" });
  });

  return router;
}
