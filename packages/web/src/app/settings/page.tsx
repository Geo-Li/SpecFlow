"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Input, inputBaseStyles } from "@/components/input";

export default function SettingsPage() {
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { apiFetch<any>("/api/config").then((c) => { setMaxConcurrent(c.maxConcurrentExecutions); setSystemPrompt(c.systemPromptOverride || ""); }).catch((err) => setError(err.message || "Failed to load settings")); }, []);

  const handleSave = async () => {
    setError("");
    try {
      await apiFetch("/api/config", { method: "PUT", body: JSON.stringify({ maxConcurrentExecutions: maxConcurrent, systemPromptOverride: systemPrompt || null }) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message || "Failed to save settings");
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Global configuration" />
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      <Card className="max-w-2xl space-y-4">
        <Input label="Max Concurrent Executions" type="number" min={1} max={10} value={maxConcurrent} onChange={(e) => setMaxConcurrent(Number(e.target.value))} />
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">System Prompt Override</label>
          <textarea className={`${inputBaseStyles} text-sm min-h-[120px]`} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Leave empty to use default system prompt" />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSave}>Save Settings</Button>
          {saved && <span className="text-sm text-success">Saved!</span>}
        </div>
      </Card>
    </>
  );
}
