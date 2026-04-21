import test from "node:test";
import assert from "node:assert/strict";
import { requestControlPlaneApi } from "../apps/host/src/control-plane-proxy.js";

test("control plane proxy forwards method, body, and content type to the API", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ ok: true, path: "/questions/question-1/reply" }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  };

  const response = await requestControlPlaneApi({
    apiBaseUrl: "http://127.0.0.1:4320",
    path: "/questions/question-1/reply",
    method: "POST",
    bodyText: JSON.stringify({ conversationId: "conversation-1", channel: "dashboard", content: "Reply" }),
    contentType: "application/json",
    fetchImpl: fetchMock,
  });

  assert.equal(response.status, 201);
  assert.equal(response.contentType, "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(response.bodyText), { ok: true, path: "/questions/question-1/reply" });
  assert.equal(String(calls[0]?.input), "http://127.0.0.1:4320/questions/question-1/reply");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.headers && (calls[0].init.headers as Record<string, string>)["content-type"], "application/json");
});

test("control plane proxy forwards workspace override headers to the API", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await requestControlPlaneApi({
    apiBaseUrl: "http://127.0.0.1:4320",
    path: "/conversations",
    method: "GET",
    fetchImpl: fetchMock,
    headers: { "x-pinchy-workspace-path": "/tmp/demo-repo" },
  });

  assert.equal((calls[0]?.init?.headers as Record<string, string>)?.["x-pinchy-workspace-path"], "/tmp/demo-repo");
});

test("control plane proxy preserves query strings for GET requests", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify([{ id: "delivery-1" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = await requestControlPlaneApi({
    apiBaseUrl: "http://127.0.0.1:4320",
    path: "/deliveries?channel=dashboard",
    method: "GET",
    fetchImpl: fetchMock,
  });

  assert.equal(response.status, 200);
  assert.equal(String(calls[0]?.input), "http://127.0.0.1:4320/deliveries?channel=dashboard");
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(response.bodyText, JSON.stringify([{ id: "delivery-1" }]));
});

test("control plane proxy falls back to JSON content type when the upstream omits one", async () => {
  const fetchMock: typeof fetch = async () => new Response(new Uint8Array(Buffer.from("{\"ok\":true}")), {
    status: 200,
  });

  const response = await requestControlPlaneApi({
    apiBaseUrl: "http://127.0.0.1:4320",
    path: "/health",
    method: "GET",
    fetchImpl: fetchMock,
  });

  assert.equal(response.status, 200);
  assert.equal(response.bodyText, "{\"ok\":true}");
  assert.equal(response.contentType, "application/json; charset=utf-8");
});
