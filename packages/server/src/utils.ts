import type { AppConfig, ProviderConfig, RepoConfig, RuntimeProviderPayload, Session, SessionStatus } from "@specflow/shared";

export function maskApiKey(key: string): string {
  if (key.length <= 12) return "***";
  return key.slice(0, 8) + "..." + key.slice(-4);
}

export function sanitizeError(err: unknown, fallback = "Unknown error"): string {
  const message = err instanceof Error ? err.message : fallback;
  if (message.length > 200) return message.slice(0, 200) + "...";
  return message;
}

export { TERMINAL_STATUSES } from "@specflow/shared";

export function toRuntimePayload(provider: ProviderConfig): RuntimeProviderPayload {
  return { type: provider.type, apiKey: provider.apiKey, model: provider.model, baseUrl: provider.baseUrl };
}
export const NO_MESSAGE_STATUSES: readonly SessionStatus[] = ["done", "cancelled", "failed", "executing", "plan_approved"];

export function getDefaultRepoId(config: AppConfig): string {
  if (config.defaultRepoId) return config.defaultRepoId;
  if (config.repos.length === 1) return config.repos[0].id;
  if (config.repos.length === 0)
    throw new Error("No repositories configured. Please add one in the admin dashboard.");
  throw new Error("Multiple repos configured but no default set. Please set a default in the admin dashboard.");
}

export function getDefaultProvider(config: AppConfig): ProviderConfig {
  if (config.defaultProviderId) {
    const provider = config.providers.find((p) => p.id === config.defaultProviderId);
    if (provider) return provider;
    throw new Error("Default provider is configured but missing. Fix it in the admin dashboard.");
  }
  if (config.providers.length === 1) return config.providers[0];
  if (config.providers.length === 0)
    throw new Error("No providers configured. Please add one in the admin dashboard.");
  throw new Error("Multiple providers configured but no default set. Please set a default in the admin dashboard.");
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
  plan: string,
): Session {
  return {
    id: request._id,
    channelId: request.sourceRef?.channelId ?? undefined,
    threadTs: request.sourceRef?.threadTs ?? undefined,
    userId: request.requesterId,
    conversationHistory: [],
    plan,
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
