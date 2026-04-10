export type SessionStatus =
  | "idle"
  | "intake"
  | "planning"
  | "clarifying"
  | "plan_ready"
  | "plan_approved"
  | "awaiting_confirmation"
  | "editing"
  | "executing"
  | "done"
  | "cancelled"
  | "failed"
  | "pr_created"
  | "blocked";

export const TERMINAL_STATUSES: readonly SessionStatus[] = [
  "done",
  "cancelled",
  "failed",
  "pr_created",
] as const;

export type ProviderType = "anthropic" | "openai" | "google" | "openai-compatible";

export interface RuntimeProviderPayload {
  type: ProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export type ExecutionMode = "worktree" | "branch";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ProviderConfig extends RuntimeProviderPayload {
  id: string;
  name: string;
}

export interface RepoConfig {
  id: string;
  name: string;
  localPath: string;
  defaultBranch: string;
  isDefault: boolean;
  executionMode: ExecutionMode;
}

export interface Session {
  id: string;
  channelId?: string;
  threadTs?: string;
  userId: string;
  conversationHistory: Message[];
  plan: string | null;
  planMessageTs: string | null;
  status: SessionStatus;
  executionMode: ExecutionMode;
  baseBranch: string;
  prUrl: string | null;
  repoId: string;
  providerId: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  originalMessage: string;
  source: "slack" | "chat";
  title: string | null;
}

export type SessionSummary = Pick<Session, "id" | "status" | "userId" | "originalMessage" | "prUrl" | "error" | "createdAt">;

export interface AppConfig {
  defaultProviderId: string | null;
  defaultRepoId: string | null;
  maxConcurrentExecutions: number;
  systemPromptOverride: string | null;
  providers: ProviderConfig[];
  repos: RepoConfig[];
}
