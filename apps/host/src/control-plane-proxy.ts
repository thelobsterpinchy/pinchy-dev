type ControlPlaneRequest = {
  apiBaseUrl: string;
  path: string;
  method: string;
  bodyText?: string;
  contentType?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

export type ControlPlaneResponse = {
  status: number;
  bodyText: string;
  contentType: string;
};

export async function requestControlPlaneApi(input: ControlPlaneRequest): Promise<ControlPlaneResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = { ...(input.headers ?? {}) };
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
