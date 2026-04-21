import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { discoverLocalServerModel } from "../apps/host/src/local-server-model-discovery.js";

async function withServer(run: (baseUrl: string) => Promise<void>, handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("discoverLocalServerModel reads OpenAI-compatible /models responses and chooses the first model", async () => {
  await withServer(async (baseUrl) => {
    const result = await discoverLocalServerModel(`${baseUrl}/v1`);
    assert.deepEqual(result, {
      models: ["qwen3-coder", "deepseek-r1"],
      detectedModel: "qwen3-coder",
    });
  }, (req, res) => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "qwen3-coder" }, { id: "deepseek-r1" }] }));
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });
});

test("discoverLocalServerModel accepts simple array-style model payloads too", async () => {
  await withServer(async (baseUrl) => {
    const result = await discoverLocalServerModel(baseUrl);
    assert.deepEqual(result, {
      models: ["llama3.1:8b"],
      detectedModel: "llama3.1:8b",
    });
  }, (req, res) => {
    if (req.url === "/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ id: "llama3.1:8b" }]));
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });
});
