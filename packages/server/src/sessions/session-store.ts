import { nanoid } from "nanoid";
import type { Session, ExecutionMode } from "@specflow/shared";

const sessions = new Map<string, Session>();
const threadIndex = new Map<string, string>();

export interface CreateSessionParams {
  userId: string;
  repoId: string;
  providerId: string;
  originalMessage: string;
  executionMode?: ExecutionMode;
  baseBranch?: string;
  channelId?: string;
  threadTs?: string;
  source: "slack" | "chat";
  title?: string;
}

export function createSession(params: CreateSessionParams): Session {
  const session: Session = {
    id: nanoid(),
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
    source: params.source,
    title: params.title || null,
    ...(params.channelId && { channelId: params.channelId }),
    ...(params.threadTs && { threadTs: params.threadTs }),
  };
  sessions.set(session.id, session);
  if (params.channelId && params.threadTs) {
    threadIndex.set(`${params.channelId}:${params.threadTs}`, session.id);
  }
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

export function getChatSessions(): Session[] {
  return Array.from(sessions.values())
    .filter((s) => s.source === "chat")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getActiveSessions(): Session[] {
  const active: Session[] = [];
  for (const session of sessions.values()) {
    if (session.status !== "done") active.push(session);
  }
  return active;
}

const EVICTION_AGE_MS = 24 * 60 * 60 * 1000;

export function evictDoneSessions(): number {
  const now = Date.now();
  let evicted = 0;
  for (const [id, session] of sessions) {
    if (session.status === "done" && now - new Date(session.updatedAt).getTime() > EVICTION_AGE_MS) {
      sessions.delete(id);
      if (session.channelId && session.threadTs) {
        threadIndex.delete(`${session.channelId}:${session.threadTs}`);
      }
      evicted++;
    }
  }
  return evicted;
}
