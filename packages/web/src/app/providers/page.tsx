"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Input, inputBaseStyles } from "@/components/input";
import { Modal } from "@/components/modal";

interface Provider { id: string; name: string; type: string; apiKey: string; model: string; baseUrl?: string; }

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ name: "", type: "anthropic" as string, apiKey: "", model: "", baseUrl: "" });

  const load = () => apiFetch<Provider[]>("/api/providers").then(setProviders).catch((err) => setError(err.message || "Failed to load providers"));
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    setFormError("");
    try {
      await apiFetch("/api/providers", { method: "POST", body: JSON.stringify(form) });
      setIsModalOpen(false);
      setForm({ name: "", type: "anthropic", apiKey: "", model: "", baseUrl: "" });
      load();
    } catch (err) {
      setFormError((err as Error).message || "Failed to add provider");
    }
  };

  const handleDelete = async (id: string) => {
    try { await apiFetch(`/api/providers/${id}`, { method: "DELETE" }); load(); }
    catch (err) { setError((err as Error).message || "Failed to delete provider"); }
  };

  return (
    <>
      <PageHeader title="LLM Providers" description="Configure planning agent providers" />
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      <div className="mb-4"><Button onClick={() => setIsModalOpen(true)}>Add Provider</Button></div>
      <div className="space-y-4">
        {providers.map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">{p.name}</p>
              <p className="text-sm text-text-secondary">{p.type} &middot; {p.model} &middot; Key: {p.apiKey}</p>
            </div>
            <Button variant="danger" onClick={() => handleDelete(p.id)}>Delete</Button>
          </Card>
        ))}
        {providers.length === 0 && <p className="text-sm text-text-secondary">No providers configured.</p>}
      </div>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Provider">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Type</label>
            <select className={`${inputBaseStyles} text-sm`} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="anthropic">Anthropic</option>
              <option value="openai-compatible">OpenAI Compatible</option>
            </select>
          </div>
          <Input label="API Key" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
          <Input label="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="e.g. claude-sonnet-4-20250514" />
          {form.type === "openai-compatible" && <Input label="Base URL" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />}
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
