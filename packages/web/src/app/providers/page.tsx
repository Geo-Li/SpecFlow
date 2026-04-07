"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { ProviderTab } from "@/components/provider-tab";
import { MarketplaceTab } from "@/components/marketplace-tab";
import {
  type ProviderConfig,
  FIRST_PARTY_MODELS,
  providerCatalog,
} from "@specflow/shared";

const TABS = [
  { key: "anthropic", label: "Anthropic" },
  { key: "openai", label: "OpenAI" },
  { key: "google", label: "Google" },
  { key: "marketplace", label: "Marketplace" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("anthropic");

  const load = () => apiFetch<ProviderConfig[]>("/api/providers").then(setProviders);
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader
        title="LLM Providers"
        description="Configure planning agent providers"
      />

      {/* Tab bar */}
      <div className="border-b border-border mb-6">
        <nav className="flex gap-0 -mb-px">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const hasProvider =
              tab.key !== "marketplace" &&
              providers.some((p) => p.type === tab.key);
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary hover:border-border"
                }`}
              >
                {tab.label}
                {hasProvider && (
                  <span className="ml-2 inline-block w-2 h-2 rounded-full bg-success" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab !== "marketplace" && FIRST_PARTY_MODELS[activeTab] && (
        <ProviderTab
          type={activeTab as "anthropic" | "openai" | "google"}
          label={TABS.find((t) => t.key === activeTab)!.label}
          models={FIRST_PARTY_MODELS[activeTab]}
          providers={providers}
          onUpdate={load}
        />
      )}
      {activeTab === "marketplace" && (
        <MarketplaceTab
          catalog={providerCatalog}
          providers={providers}
          onUpdate={load}
        />
      )}
    </>
  );
}
