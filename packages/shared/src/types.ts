export type SessionStatus =
  | "idle"
  | "planning"
  | "awaiting_confirmation"
  | "editing"
  | "executing"
  | "done";

export type ExecutionMode = "worktree" | "branch";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: "anthropic" | "openai-compatible";
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface RepoConfig {
  id: string;
  name: string;
  localPath: string;
  defaultBranch: string;
  isDefault: boolean;
}

export interface Session {
  id: string;
  channelId: string;
  threadTs: string;
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
}

export interface AppConfig {
  defaultProviderId: string | null;
  defaultRepoId: string | null;
  maxConcurrentExecutions: number;
  systemPromptOverride: string | null;
  providers: ProviderConfig[];
  repos: RepoConfig[];
}
