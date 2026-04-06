import { getSessionByThread } from "../sessions/session-store.js";
import type { Session } from "@specflow/shared";

export function findSessionForThread(channelId: string, threadTs: string | undefined): Session | undefined {
  if (!threadTs) return undefined;
  return getSessionByThread(channelId, threadTs);
}
