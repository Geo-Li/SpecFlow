import type { AppConfig, RepoConfig, Session } from "@specflow/shared";

export function maskApiKey(key: string): string {
  if (key.length <= 12) return "***";
  return key.slice(0, 8) + "..." + key.slice(-4);
}

export function sanitizeError(err: unknown, fallback = "Unknown error"): string {
  const message = err instanceof Error ? err.message : fallback;
  if (message.length > 200) return message.slice(0, 200) + "...";
  return message;
}

export const TERMINAL_STATUSES = ["done", "cancelled", "failed"] as const;
export const NO_MESSAGE_STATUSES = ["done", "cancelled", "failed", "executing", "plan_approved"] as const;

export function getDefaultRepoId(config: AppConfig): string {
  if (config.defaultRepoId) return config.defaultRepoId;
  if (config.repos.length === 1) return config.repos[0].id;
  if (config.repos.length === 0)
    throw new Error("No repositories configured. Please add one in the admin dashboard.");
  throw new Error("Multiple repos configured but no default set. Please set a default in the admin dashboard.");
}

export function buildLegacySession(
  request: {
    _id: string;
    requesterId: string;
    rawRequest: string;
    title: string;
    executionMode?: string;
    baseBranch?: string;
    repoId?: string;
    sourceRef?: { channelId?: string; threadTs?: string };
  },
  repo: RepoConfig,
  source: "slack" | "chat",
): Session {
  return {
    id: request._id,
    channelId: request.sourceRef?.channelId ?? undefined,
    threadTs: request.sourceRef?.threadTs ?? undefined,
    userId: request.requesterId,
    conversationHistory: [],
    plan: request.rawRequest,
    planMessageTs: null,
    status: "executing",
    executionMode: (request.executionMode || "worktree") as "worktree" | "branch",
    baseBranch: request.baseBranch || repo.defaultBranch,
    prUrl: null,
    repoId: request.repoId || repo.id,
    providerId: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: null,
    originalMessage: request.rawRequest,
    source,
    title: request.title,
  };
}
