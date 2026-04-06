import { getActiveSessions, updateSession } from "./session-store.js";

const TIMEOUT_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export type TimeoutCallback = (sessionId: string, channelId: string, threadTs: string) => void;

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startCleanupLoop(onTimeout: TimeoutCallback): void {
  intervalId = setInterval(() => {
    const now = Date.now();
    for (const session of getActiveSessions()) {
      const lastUpdate = new Date(session.updatedAt).getTime();
      if (now - lastUpdate > TIMEOUT_MS) {
        updateSession(session.id, { status: "done", error: "Session timed out due to inactivity." });
        onTimeout(session.id, session.channelId, session.threadTs);
      }
    }
  }, CHECK_INTERVAL_MS);
}

export function stopCleanupLoop(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}
