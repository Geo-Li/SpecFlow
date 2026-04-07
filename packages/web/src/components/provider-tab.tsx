"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Input, inputBaseStyles } from "@/components/input";
import type { ProviderConfig } from "@specflow/shared";

interface ProviderTabProps {
  type: "anthropic" | "openai" | "google";
  label: string;
  models: string[];
  providers: ProviderConfig[];
  onUpdate: () => void;
}

export function ProviderTab({
  type,
  label,
  models,
  providers,
  onUpdate,
}: ProviderTabProps) {
  const existing = providers.find((p) => p.type === type);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(models[0] || "");
  const [customModel, setCustomModel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing && !editing) {
      setApiKey("");
      setModel(existing.model);
      setCustomModel("");
    }
  }, [existing, editing]);

  const isCustomModel = model === "__custom__";
  const activeModel = isCustomModel ? customModel : model;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (existing && editing) {
        const body: Record<string, string> = { model: activeModel };
        if (apiKey) body.apiKey = apiKey;
        await apiFetch(`/api/providers/${existing.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/providers", {
          method: "POST",
          body: JSON.stringify({
            name: label,
            type,
            apiKey,
            model: activeModel,
          }),
        });
      }
      setEditing(false);
      setApiKey("");
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!existing) return;
    await apiFetch(`/api/providers/${existing.id}`, { method: "DELETE" });
    setEditing(false);
    setApiKey("");
    setModel(models[0] || "");
    onUpdate();
  };

  if (existing && !editing) {
    return (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">{label}</h3>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-light text-success">
            Connected
          </span>
        </div>
        <div className="space-y-2 text-sm text-text-secondary mb-4">
          <p>
            <span className="font-medium text-text-primary">Model:</span>{" "}
            {existing.model}
          </p>
          <p>
            <span className="font-medium text-text-primary">API Key:</span>{" "}
            {existing.apiKey}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="danger" onClick={handleDisconnect}>
            Disconnect
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold text-text-primary mb-4">{label}</h3>
      <div className="space-y-4">
        <Input
          label="API Key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={existing ? "Leave blank to keep current key" : "Enter your API key"}
        />
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Model
          </label>
          <select
            className={inputBaseStyles}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value="__custom__">Custom model...</option>
          </select>
        </div>
        {isCustomModel && (
          <Input
            label="Custom Model Name"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="Enter model identifier"
          />
        )}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={
              saving ||
              (!existing && !apiKey) ||
              !activeModel
            }
          >
            {saving ? "Saving..." : "Save"}
          </Button>
          {editing && (
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
