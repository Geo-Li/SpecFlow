"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/status-badge";

import type { SessionStatus, Message, ExecutionMode } from "@specflow/shared";
interface SessionDetail { id: string; status: SessionStatus; userId: string; originalMessage: string; plan: string | null; conversationHistory: Message[]; prUrl: string | null; error: string | null; executionMode: ExecutionMode; baseBranch: string; createdAt: string; }

export default function SessionDetailPage() {
  const params = useParams();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (params.id) apiFetch<SessionDetail>(`/api/sessions/${params.id}`).then(setSession).catch((err) => setError(err.message || "Failed to load session")); }, [params.id]);

  if (error) return <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>;
  if (!session) return <p className="text-sm text-text-secondary">Loading...</p>;

  return (
    <>
      <PageHeader title={session.originalMessage.slice(0, 60)} description={`Session ${session.id}`} />
      <div className="space-y-6 max-w-3xl">
        <Card>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-text-tertiary">Status:</span> <StatusBadge status={session.status} /></div>
            <div><span className="text-text-tertiary">Mode:</span> {session.executionMode}</div>
            <div><span className="text-text-tertiary">Base Branch:</span> {session.baseBranch}</div>
            <div><span className="text-text-tertiary">Created:</span> {new Date(session.createdAt).toLocaleString()}</div>
            {session.prUrl && <div className="col-span-2"><span className="text-text-tertiary">PR:</span>{" "}<a href={session.prUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{session.prUrl}</a></div>}
            {session.error && <div className="col-span-2"><span className="text-text-tertiary">Error:</span>{" "}<span className="text-error">{session.error}</span></div>}
          </div>
        </Card>
        {session.plan && (
          <Card>
            <h2 className="text-[15px] font-semibold mb-3">Plan</h2>
            <pre className="text-sm bg-black/[0.03] p-4 rounded-lg overflow-auto whitespace-pre-wrap">{session.plan}</pre>
          </Card>
        )}
        <Card>
          <h2 className="text-[15px] font-semibold mb-3">Conversation</h2>
          <div className="space-y-3">
            {session.conversationHistory.map((msg, i) => (
              <div key={i} className={`text-sm ${msg.role === "user" ? "text-text-primary" : "text-text-secondary"}`}>
                <span className="font-medium">{msg.role === "user" ? "User" : "Agent"}:</span>{" "}
                <span className="whitespace-pre-wrap">{msg.content.slice(0, 500)}{msg.content.length > 500 ? "..." : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
