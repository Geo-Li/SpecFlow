import { nanoid } from "nanoid";
import type { Session, ExecutionMode } from "@specflow/shared";

const sessions = new Map<string, Session>();
const threadIndex = new Map<string, string>();

export interface CreateSessionParams {
  channelId: string;
  threadTs: string;
  userId: string;
  repoId: string;
  providerId: string;
  originalMessage: string;
  executionMode?: ExecutionMode;
  baseBranch?: string;
}

export function createSession(params: CreateSessionParams): Session {
  const session: Session = {
    id: nanoid(),
    channelId: params.channelId,
    threadTs: params.threadTs,
    userId: params.userId,
    conversationHistory: [],
    plan: null,
    planMessageTs: null,
    status: "idle",
    executionMode: params.executionMode || "worktree",
    baseBranch: params.baseBranch || "main",
    prUrl: null,
    repoId: params.repoId,
    providerId: params.providerId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: null,
    originalMessage: params.originalMessage,
  };
  sessions.set(session.id, session);
  threadIndex.set(`${params.channelId}:${params.threadTs}`, session.id);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getSessionByThread(channelId: string, threadTs: string): Session | undefined {
  const id = threadIndex.get(`${channelId}:${threadTs}`);
  return id ? sessions.get(id) : undefined;
}

export function updateSession(id: string, updates: Partial<Session>): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  const updated = { ...session, ...updates, updatedAt: new Date().toISOString() };
  sessions.set(id, updated);
  return updated;
}

export function getAllSessions(): Session[] {
  return Array.from(sessions.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getActiveSessions(): Session[] {
  return getAllSessions().filter((s) => s.status !== "done");
}
