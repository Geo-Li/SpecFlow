import type { SessionStatus } from "@specflow/shared";

const statusConfig: Record<SessionStatus, { label: string; className: string }> = {
  idle: { label: "Idle", className: "bg-black/[0.04] text-text-secondary" },
  planning: { label: "Planning", className: "bg-accent-light text-accent" },
  awaiting_confirmation: { label: "Awaiting Confirmation", className: "bg-warning-light text-warning" },
  editing: { label: "Editing", className: "bg-accent-light text-accent" },
  executing: { label: "Executing", className: "bg-blue-50 text-blue-600" },
  done: { label: "Done", className: "bg-success-light text-success" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as SessionStatus] ?? { label: status, className: "bg-black/[0.04] text-text-secondary" };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${config.className}`}>{config.label}</span>;
}
