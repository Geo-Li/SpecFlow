"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Input } from "@/components/input";

export default function SettingsPage() {
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { apiFetch<any>("/api/config").then((c) => { setMaxConcurrent(c.maxConcurrentExecutions); setSystemPrompt(c.systemPromptOverride || ""); }); }, []);

  const handleSave = async () => {
    await apiFetch("/api/config", { method: "PUT", body: JSON.stringify({ maxConcurrentExecutions: maxConcurrent, systemPromptOverride: systemPrompt || null }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <PageHeader title="Settings" description="Global configuration" />
      <Card className="max-w-2xl space-y-4">
        <Input label="Max Concurrent Executions" type="number" min={1} max={10} value={maxConcurrent} onChange={(e) => setMaxConcurrent(Number(e.target.value))} />
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">System Prompt Override</label>
          <textarea className="w-full px-3 py-2 rounded-md border border-border text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none min-h-[120px]" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Leave empty to use default system prompt" />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSave}>Save Settings</Button>
          {saved && <span className="text-sm text-success">Saved!</span>}
        </div>
      </Card>
    </>
  );
}
