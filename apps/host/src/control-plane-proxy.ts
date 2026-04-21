type ControlPlaneRequest = {
  apiBaseUrl: string;
  path: string;
  method: string;
  bodyText?: string;
  contentType?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

function encodeWorkspaceOverrideHeaderValue(value: string) {
  return /^[\u0000-\u00ff]*$/.test(value) ? value : encodeURIComponent(value);
}

function normalizeOutgoingHeaders(headers: Record<string, string>) {
  const normalized = { ...headers };
  const workspacePath = normalized["x-pinchy-workspace-path"];
  if (workspacePath) {
    normalized["x-pinchy-workspace-path"] = encodeWorkspaceOverrideHeaderValue(workspacePath);
  }
  return normalized;
}

export type ControlPlaneResponse = {
  status: number;
  bodyText: string;
  contentType: string;
};

export async function requestControlPlaneApi(input: ControlPlaneRequest): Promise<ControlPlaneResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = normalizeOutgoingHeaders({ ...(input.headers ?? {}) });
  if (input.contentType) {
    headers["content-type"] = input.contentType;
  }

  const response = await fetchImpl(`${input.apiBaseUrl}${input.path}`, {
    method: input.method,
    headers,
    body: input.bodyText,
  });

  return {
    status: response.status,
    bodyText: await response.text(),
    contentType: response.headers.get("content-type") ?? "application/json; charset=utf-8",
  };
}
