type SessionStatus = "idle" | "planning" | "awaiting_confirmation" | "editing" | "executing" | "done";

const statusConfig: Record<SessionStatus, { label: string; className: string }> = {
  idle: { label: "Idle", className: "bg-gray-100 text-gray-600" },
  planning: { label: "Planning", className: "bg-primary-light text-primary" },
  awaiting_confirmation: { label: "Awaiting Confirmation", className: "bg-warning-light text-warning" },
  editing: { label: "Editing", className: "bg-primary-light text-primary" },
  executing: { label: "Executing", className: "bg-blue-50 text-blue-600" },
  done: { label: "Done", className: "bg-success-light text-success" },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const config = statusConfig[status];
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>{config.label}</span>;
}
