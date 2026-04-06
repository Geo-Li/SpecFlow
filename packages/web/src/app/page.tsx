"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/status-badge";

interface SessionSummary {
  id: string;
  status: "idle" | "planning" | "awaiting_confirmation" | "editing" | "executing" | "done";
  originalMessage: string;
  prUrl: string | null;
  createdAt: string;
}

export default function DashboardPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => { apiFetch<SessionSummary[]>("/api/sessions").then(setSessions).catch(console.error); }, []);

  const active = sessions.filter((s) => s.status !== "done");
  const withPR = sessions.filter((s) => s.prUrl);

  return (
    <>
      <PageHeader title="Dashboard" description="SpecFlow system overview" />
      <div className="grid grid-cols-3 gap-6 mb-6">
        <Card><p className="text-sm text-text-secondary">Active Sessions</p><p className="text-2xl font-semibold mt-1">{active.length}</p></Card>
        <Card><p className="text-sm text-text-secondary">Total Sessions</p><p className="text-2xl font-semibold mt-1">{sessions.length}</p></Card>
        <Card><p className="text-sm text-text-secondary">PRs Created</p><p className="text-2xl font-semibold mt-1">{withPR.length}</p></Card>
      </div>
      <Card>
        <h2 className="text-lg font-semibold mb-4">Recent Sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-text-secondary">No sessions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-text-secondary border-b border-border"><th className="pb-2">Message</th><th className="pb-2">Status</th><th className="pb-2">Created</th></tr></thead>
            <tbody>
              {sessions.slice(0, 10).map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 even:bg-gray-50">
                  <td className="py-2 max-w-xs truncate">{s.originalMessage}</td>
                  <td className="py-2"><StatusBadge status={s.status} /></td>
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
