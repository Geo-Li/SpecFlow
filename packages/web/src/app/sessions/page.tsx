"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/status-badge";

type SessionStatus = "idle" | "planning" | "awaiting_confirmation" | "editing" | "executing" | "done";
interface SessionSummary { id: string; status: SessionStatus; userId: string; originalMessage: string; prUrl: string | null; error: string | null; createdAt: string; }

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  useEffect(() => { apiFetch<SessionSummary[]>("/api/sessions").then(setSessions); }, []);

  return (
    <>
      <PageHeader title="Sessions" description="View all task sessions" />
      <Card>
        {sessions.length === 0 ? <p className="text-sm text-text-secondary">No sessions yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-text-secondary border-b border-border"><th className="pb-2">Message</th><th className="pb-2">Status</th><th className="pb-2">PR</th><th className="pb-2">Created</th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 even:bg-gray-50">
                  <td className="py-2"><Link href={`/sessions/${s.id}`} className="text-primary hover:underline max-w-xs truncate block">{s.originalMessage}</Link></td>
                  <td className="py-2"><StatusBadge status={s.status} /></td>
                  <td className="py-2">{s.prUrl ? <a href={s.prUrl} target="_blank" rel="noopener" className="text-primary hover:underline">View PR</a> : s.error ? <span className="text-error text-xs">Failed</span> : <span className="text-text-tertiary">—</span>}</td>
                  <td className="py-2 text-text-secondary">{new Date(s.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
