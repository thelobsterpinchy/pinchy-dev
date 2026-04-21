export type LocalServerModelDiscovery = {
  models: string[];
  detectedModel?: string;
};

function normalizeModelEntries(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (entry && typeof entry === "object") {
          const record = entry as Record<string, unknown>;
          if (typeof record.id === "string") return record.id.trim();
          if (typeof record.name === "string") return record.name.trim();
        }
        return "";
      })
      .filter(Boolean);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return normalizeModelEntries(record.data);
    }
    if (Array.isArray(record.models)) {
      return normalizeModelEntries(record.models);
    }
  }

  return [];
}

function buildModelsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

export async function discoverLocalServerModel(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<LocalServerModelDiscovery> {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return { models: [] };
  }

  const response = await fetchImpl(buildModelsUrl(trimmed), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Model discovery failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const models = normalizeModelEntries(payload);
  return {
    models,
    detectedModel: models[0],
  };
}
