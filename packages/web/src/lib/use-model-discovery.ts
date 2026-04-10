import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api";

interface UseModelDiscoveryOptions {
  providerId?: string;
  apiKey: string;
  baseUrl?: string;
  type: string;
}

interface UseModelDiscoveryReturn {
  discoveredModels: string[];
  discovering: boolean;
  discoverError: string;
  lastFetchedAt: string | null;
  fetchDisabledReason: string;
  fetchButtonTitle: string;
  lastFetchedLabel: string;
  handleDiscoverModels: () => Promise<string[]>;
  resetDiscovery: () => void;
}

export function useModelDiscovery({
  providerId,
  apiKey,
  baseUrl,
  type,
}: UseModelDiscoveryOptions): UseModelDiscoveryReturn {
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState("");
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  const resetDiscovery = useCallback(() => {
    setDiscoveredModels([]);
    setDiscoverError("");
    setLastFetchedAt(null);
  }, []);

  const handleDiscoverModels = useCallback(async () => {
    setDiscovering(true);
    setDiscoverError("");

    try {
      const body: Record<string, string> = providerId
        ? { providerId }
        : { type, apiKey };
      if (providerId && apiKey) body.apiKey = apiKey;
      if (baseUrl) body.baseUrl = baseUrl;

      const response = await apiFetch<{ models: string[] }>(
        "/api/providers/discover-models",
        { method: "POST", body: JSON.stringify(body) },
      );

      setDiscoveredModels(response.models);
      setLastFetchedAt(new Date().toISOString());
      return response.models;
    } catch (err) {
      setDiscoverError(
        err instanceof Error ? err.message : "Failed to fetch models",
      );
      return [];
    } finally {
      setDiscovering(false);
    }
  }, [providerId, apiKey, baseUrl, type]);

  const canFetch = !!providerId || !!apiKey;
  const fetchDisabledReason = discovering
    ? "Fetching models..."
    : !canFetch
      ? "Enter an API key to unlock model discovery."
      : "";
  const fetchButtonTitle =
    fetchDisabledReason || "Fetch the provider's current live model list.";
  const lastFetchedLabel = lastFetchedAt
    ? `Last fetched ${new Date(lastFetchedAt).toLocaleString()}`
    : "Using fallback suggestions until you fetch live models.";

  return {
    discoveredModels,
    discovering,
    discoverError,
    lastFetchedAt,
    fetchDisabledReason,
    fetchButtonTitle,
    lastFetchedLabel,
    handleDiscoverModels,
    resetDiscovery,
  };
}
