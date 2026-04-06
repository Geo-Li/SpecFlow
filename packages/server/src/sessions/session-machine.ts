import type { SessionStatus } from "@specflow/shared";

const validTransitions: Record<SessionStatus, SessionStatus[]> = {
  idle: ["planning", "done"],
  planning: ["awaiting_confirmation", "done"],
  awaiting_confirmation: ["editing", "executing", "done"],
  editing: ["awaiting_confirmation", "done"],
  executing: ["done"],
  done: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}

export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid session transition: ${from} -> ${to}`);
  }
}
