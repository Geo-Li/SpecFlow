"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/status-badge";
import type { SessionSummary } from "@specflow/shared";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<SessionSummary[]>("/api/sessions").then(setSessions).catch((err) => setError(err.message || "Failed to load sessions")); }, []);

  return (
    <>
      <PageHeader title="Sessions" description="View all task sessions" />
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      <Card>
        {sessions.length === 0 ? <p className="text-sm text-text-secondary">No sessions yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-text-tertiary text-xs border-b border-border"><th className="pb-2 font-medium">Message</th><th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium">PR</th><th className="pb-2 font-medium">Created</th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="py-3"><Link href={`/sessions/${s.id}`} className="text-accent hover:underline max-w-xs truncate block">{s.originalMessage}</Link></td>
                  <td className="py-3"><StatusBadge status={s.status} /></td>
                  <td className="py-3">{s.prUrl ? <a href={s.prUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">View PR</a> : s.error ? <span className="text-error text-xs">Failed</span> : <span className="text-text-tertiary">&mdash;</span>}</td>
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
