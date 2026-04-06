"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { StatusBadge } from "@/components/status-badge";

type SessionStatus = "idle" | "planning" | "awaiting_confirmation" | "editing" | "executing" | "done";
interface Message { role: string; content: string; }
interface Session { id: string; status: SessionStatus; userId: string; originalMessage: string; plan: string | null; conversationHistory: Message[]; prUrl: string | null; error: string | null; executionMode: string; baseBranch: string; createdAt: string; }

export default function SessionDetailPage() {
  const params = useParams();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => { if (params.id) apiFetch<Session>(`/api/sessions/${params.id}`).then(setSession); }, [params.id]);

  if (!session) return <p className="text-sm text-text-secondary">Loading...</p>;

  return (
    <>
      <PageHeader title={session.originalMessage.slice(0, 60)} description={`Session ${session.id}`} />
      <div className="space-y-6 max-w-3xl">
        <Card>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-text-secondary">Status:</span> <StatusBadge status={session.status} /></div>
            <div><span className="text-text-secondary">Mode:</span> {session.executionMode}</div>
            <div><span className="text-text-secondary">Base Branch:</span> {session.baseBranch}</div>
            <div><span className="text-text-secondary">Created:</span> {new Date(session.createdAt).toLocaleString()}</div>
            {session.prUrl && <div className="col-span-2"><span className="text-text-secondary">PR:</span>{" "}<a href={session.prUrl} target="_blank" rel="noopener" className="text-primary hover:underline">{session.prUrl}</a></div>}
            {session.error && <div className="col-span-2"><span className="text-text-secondary">Error:</span>{" "}<span className="text-error">{session.error}</span></div>}
          </div>
        </Card>
        {session.plan && (
          <Card>
            <h2 className="text-lg font-semibold mb-3">Plan</h2>
            <pre className="text-sm bg-gray-50 p-4 rounded-md overflow-auto whitespace-pre-wrap">{session.plan}</pre>
          </Card>
        )}
        <Card>
          <h2 className="text-lg font-semibold mb-3">Conversation</h2>
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
