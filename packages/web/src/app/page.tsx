"use client";
import { useEffect, useState } from "react";
import { type SessionSummary, TERMINAL_STATUSES } from "@specflow/shared";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/status-badge";

export default function DashboardPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => { apiFetch<SessionSummary[]>("/api/sessions").then(setSessions).catch((err) => setError(err.message || "Failed to load sessions")); }, []);

  const active = sessions.filter((s) => !TERMINAL_STATUSES.includes(s.status as any));
  const withPR = sessions.filter((s) => s.prUrl);

  return (
    <>
      <PageHeader title="Dashboard" description="SpecFlow system overview" />
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">Active Sessions</p><p className="text-[32px] font-bold mt-1 tracking-tight">{active.length}</p></Card>
        <Card><p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">Total Sessions</p><p className="text-[32px] font-bold mt-1 tracking-tight">{sessions.length}</p></Card>
        <Card><p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">PRs Created</p><p className="text-[32px] font-bold mt-1 tracking-tight">{withPR.length}</p></Card>
      </div>
      <Card>
        <h2 className="text-[15px] font-semibold mb-4">Recent Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-text-secondary">No sessions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-text-tertiary text-xs border-b border-border"><th className="pb-2 font-medium">Message</th><th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium">Created</th></tr></thead>
            <tbody>
              {sessions.slice(0, 10).map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="py-3 max-w-xs truncate text-text-primary/60">{s.originalMessage}</td>
                  <td className="py-3"><StatusBadge status={s.status} /></td>
                  <td className="py-3 text-text-tertiary">{new Date(s.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
