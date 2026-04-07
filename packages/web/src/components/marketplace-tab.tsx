"use client";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/button";
import { Input, inputBaseStyles } from "@/components/input";
import { Modal } from "@/components/modal";
import type { CatalogEntry, ProviderConfig } from "@specflow/shared";

interface MarketplaceTabProps {
  catalog: CatalogEntry[];
  providers: ProviderConfig[];
  onUpdate: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  cloud: "Cloud APIs",
  local: "Open Source / Local",
};

const INITIALS_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-violet-100 text-violet-700",
  "bg-orange-100 text-orange-700",
];

const CATEGORIES = ["cloud", "local"] as const;

function getColorForSlug(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
}

export function MarketplaceTab({
  catalog,
  providers,
  onUpdate,
}: MarketplaceTabProps) {
  const [search, setSearch] = useState("");
  const [connectTarget, setConnectTarget] = useState<CatalogEntry | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [form, setForm] = useState({
    name: "",
    apiKey: "",
    model: "",
    baseUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return catalog.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q),
    );
  }, [catalog, search]);

  const { connectedSlugs, connectedProviderIds } = useMemo(() => {
    const slugs = new Map<string, ProviderConfig>();
    for (const p of providers) {
      if (p.type !== "openai-compatible") continue;
      const normalizedBase = p.baseUrl?.replace(/\/$/, "");
      const match = catalog.find((c) => {
        if (normalizedBase) {
          const normalizedCatalog = c.defaultBaseUrl.replace(/\/$/, "");
          if (normalizedBase === normalizedCatalog) return true;
        }
        return c.name.toLowerCase() === p.name.toLowerCase();
      });
      if (match && !slugs.has(match.slug)) slugs.set(match.slug, p);
    }
    const ids = new Set([...slugs.values()].map((p) => p.id));
    return { connectedSlugs: slugs, connectedProviderIds: ids };
  }, [providers, catalog]);

  const openConnect = (entry: CatalogEntry) => {
    setConnectTarget(entry);
    setCustomMode(false);
    setForm({
      name: entry.name,
      apiKey: "",
      model: "",
      baseUrl: entry.defaultBaseUrl,
    });
    setEditingId(null);
  };

  const openEdit = (entry: CatalogEntry, provider: ProviderConfig) => {
    setConnectTarget(entry);
    setCustomMode(false);
    setForm({
      name: provider.name,
      apiKey: "",
      model: provider.model,
      baseUrl: provider.baseUrl || entry.defaultBaseUrl,
    });
    setEditingId(provider.id);
  };

  const openCustom = () => {
    setConnectTarget(null);
    setCustomMode(true);
    setForm({ name: "", apiKey: "", model: "", baseUrl: "" });
    setEditingId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        const body: Record<string, string> = {
          model: form.model,
          baseUrl: form.baseUrl,
        };
        if (form.apiKey) body.apiKey = form.apiKey;
        await apiFetch(`/api/providers/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch("/api/providers", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            type: "openai-compatible",
            apiKey: form.apiKey,
            model: form.model,
            baseUrl: form.baseUrl,
          }),
        });
      }
      setConnectTarget(null);
      setCustomMode(false);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    await apiFetch(`/api/providers/${providerId}`, { method: "DELETE" });
    onUpdate();
  };

  const modalOpen = connectTarget !== null || customMode;

  return (
    <div>
      <div className="mb-6">
        <input
          className={inputBaseStyles}
          placeholder="Search providers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {CATEGORIES.map((cat) => {
        const entries = filtered.filter((e) => e.category === cat);
        if (entries.length === 0) return null;
        return (
          <div key={cat} className="mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="border border-border rounded-lg divide-y divide-border">
              {entries.map((entry) => {
                const connected = connectedSlugs.get(entry.slug);
                return (
                  <div
                    key={entry.slug}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold ${getColorForSlug(entry.slug)}`}
                      >
                        {entry.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {entry.name}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {entry.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {connected ? (
                        <>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-light text-success">
                            Connected
                          </span>
                          <Button
                            variant="secondary"
                            className="text-xs px-2 py-1"
                            onClick={() => openEdit(entry, connected)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            className="text-xs px-2 py-1"
                            onClick={() => handleDisconnect(connected.id)}
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button
                          className="text-xs px-3 py-1"
                          onClick={() => openConnect(entry)}
                        >
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Custom provider */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-text-primary mb-3">Custom</h3>
        <div className="border border-border rounded-lg">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold bg-gray-100 text-gray-600">
                +
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Custom Provider
                </p>
                <p className="text-xs text-text-secondary">
                  Any OpenAI-compatible endpoint
                </p>
              </div>
            </div>
            <Button
              className="text-xs px-3 py-1"
              onClick={openCustom}
            >
              Add
            </Button>
          </div>
        </div>
      </div>

      {/* Existing openai-compatible providers not matched to catalog */}
      {providers
        .filter(
          (p) =>
            p.type === "openai-compatible" &&
            !connectedProviderIds.has(p.id),
        )
        .map((p) => (
          <div key={p.id} className="mb-2">
            <div className="border border-border rounded-lg">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold bg-gray-100 text-gray-600">
                    {p.name[0]?.toUpperCase() || "?"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {p.name}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {p.model} &middot; {p.baseUrl || "Default"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-light text-success">
                    Connected
                  </span>
                  <Button
                    variant="danger"
                    className="text-xs px-2 py-1"
                    onClick={() => handleDisconnect(p.id)}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setConnectTarget(null);
          setCustomMode(false);
        }}
        title={
          editingId
            ? `Edit ${form.name}`
            : connectTarget
              ? `Connect ${connectTarget.name}`
              : "Add Custom Provider"
        }
      >
        <div className="space-y-4">
          {customMode && (
            <Input
              label="Provider Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Provider"
            />
          )}
          <Input
            label="API Key"
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder={editingId ? "Leave blank to keep current" : "Enter your API key"}
          />
          <Input
            label="Model"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder={
              connectTarget?.exampleModels[0]
                ? `e.g. ${connectTarget.exampleModels[0]}`
                : "Model name"
            }
          />
          <Input
            label="Base URL"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setConnectTarget(null);
                setCustomMode(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                (!editingId && !form.apiKey) ||
                !form.model ||
                (customMode && !form.name)
              }
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
