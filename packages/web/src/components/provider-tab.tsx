"use client";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useModelDiscovery } from "@/lib/use-model-discovery";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Select } from "@/components/select";
import type { ProviderConfig } from "@specflow/shared";

interface ProviderTabProps {
  type: "anthropic" | "openai" | "google";
  label: string;
  models: string[];
  providers: ProviderConfig[];
  defaultProviderId: string | null;
  onSetActive: (id: string) => void;
  onUpdate: () => void;
}

export function ProviderTab({
  type,
  label,
  models,
  providers,
  defaultProviderId,
  onSetActive,
  onUpdate,
}: ProviderTabProps) {
  const existing = providers.find((p) => p.type === type);
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(models[0] || "");
  const [customModel, setCustomModel] = useState("");
  const [saving, setSaving] = useState(false);
  const {
    discoveredModels,
    discovering,
    discoverError,
    fetchButtonTitle,
    lastFetchedLabel,
    handleDiscoverModels: discoverModels,
    resetDiscovery,
  } = useModelDiscovery({
    providerId: existing?.id,
    apiKey,
    type,
  });

  const existingId = existing?.id;
  const existingModel = existing?.model;

  useEffect(() => {
    if (existingId && !editing) {
      setApiKey("");
      setModel(existingModel || models[0] || "");
      setCustomModel("");
      resetDiscovery();
    }
    if (!existingId && !editing) {
      setModel(models[0] || "");
      setCustomModel("");
      resetDiscovery();
    }
  }, [existingId, existingModel, editing, models, resetDiscovery]);

  const isCustomModel = model === "__custom__";
  const activeModel = isCustomModel ? customModel : model;
  const availableModels = useMemo(() => {
    const sourceModels = discoveredModels.length > 0 ? discoveredModels : models;
    const combined = [
      existing?.model,
      !isCustomModel ? model : undefined,
      customModel,
      ...sourceModels,
    ]
      .map((value) => value?.trim() || "")
      .filter(Boolean);
    return [...new Set(combined)];
  }, [
    customModel,
    discoveredModels,
    existing?.model,
    isCustomModel,
    model,
    models,
  ]);

  const handleDiscoverModels = async () => {
    const fetched = await discoverModels();
    if (fetched.length > 0) {
      const target = activeModel && fetched.includes(activeModel) ? activeModel : fetched[0];
      setModel(target);
      setCustomModel("");
    }
  };

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
    const isActive = existing.id === defaultProviderId;
    return (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">{label}</h3>
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                Active
              </span>
            )}
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-light text-success">
              Connected
            </span>
          </div>
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
          {!isActive && (
            <Button onClick={() => onSetActive(existing.id)}>
              Set as Active
            </Button>
          )}
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
        <Select
          label="Model"
          value={model}
          onChange={setModel}
          options={[
            ...availableModels.map((m) => ({ value: m, label: m })),
            { value: "__custom__", label: "Custom model..." },
          ]}
          placeholder="Select a model"
        />
        {isCustomModel && (
          <Input
            label="Custom Model Name"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="Enter model identifier"
          />
        )}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span title={fetchButtonTitle}>
              <Button
                type="button"
                variant="secondary"
                onClick={handleDiscoverModels}
                disabled={discovering || (!existing && !apiKey)}
              >
                {discovering ? "Fetching..." : "Fetch Latest Models"}
              </Button>
            </span>
            <p className="text-xs text-text-secondary">
              Pulls the current provider list and updates the suggestions.
            </p>
          </div>
          <p className="text-xs text-text-secondary">{lastFetchedLabel}</p>
          {discoverError && (
            <p className="text-sm text-error">{discoverError}</p>
          )}
        </div>
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
