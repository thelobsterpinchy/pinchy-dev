import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiServer } from "../apps/api/src/server.js";

async function withServer(run: (args: { cwd: string; baseUrl: string }) => Promise<void>) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-api-"));
  const server = createApiServer({ cwd });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ cwd, baseUrl });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("api server exposes health and conversation endpoints", async () => {
  await withServer(async ({ baseUrl }) => {
    const health = await fetch(`${baseUrl}/health`).then((response) => response.json() as Promise<{ ok: boolean }>);
    assert.equal(health.ok, true);

    const createConversationResponse = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Persistent bugfix conversation" }),
    });
    assert.equal(createConversationResponse.status, 201);
    const conversation = await createConversationResponse.json() as { id: string; title: string };
    assert.equal(conversation.title, "Persistent bugfix conversation");

    const conversations = await fetch(`${baseUrl}/conversations`).then((response) => response.json() as Promise<Array<{ id: string }>>);
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0]?.id, conversation.id);
  });
});

test("api server persists messages, runs, questions, and replies", async () => {
  await withServer(async ({ baseUrl }) => {
    const conversation = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Async coding flow" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const messageResponse = await fetch(`${baseUrl}/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "user", content: "Please debug the failing dashboard test" }),
    });
    assert.equal(messageResponse.status, 201);

    const run = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, goal: "Investigate the dashboard test failure" }),
    }).then((response) => response.json() as Promise<{ id: string; status: string }>);
    assert.equal(run.status, "queued");

    const question = await fetch(`${baseUrl}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        runId: run.id,
        prompt: "Should I update the snapshot expectations too?",
        priority: "normal",
        channelHints: ["dashboard"],
      }),
    }).then((response) => response.json() as Promise<{ id: string; status: string }>);
    assert.equal(question.status, "pending_delivery");

    const replyResponse = await fetch(`${baseUrl}/questions/${question.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, channel: "dashboard", content: "Yes, if behavior changed intentionally." }),
    });
    assert.equal(replyResponse.status, 201);

    const messages = await fetch(`${baseUrl}/conversations/${conversation.id}/messages`).then((response) => response.json() as Promise<Array<{ content: string }>>);
    const runs = await fetch(`${baseUrl}/runs?conversationId=${encodeURIComponent(conversation.id)}`).then((response) => response.json() as Promise<Array<{ id: string }>>);
    const questions = await fetch(`${baseUrl}/questions?conversationId=${encodeURIComponent(conversation.id)}`).then((response) => response.json() as Promise<Array<{ id: string; status: string }>>);
    const replies = await fetch(`${baseUrl}/replies?questionId=${encodeURIComponent(question.id)}`).then((response) => response.json() as Promise<Array<{ content: string; channel: string }>>);

    assert.equal(messages.length, 1);
    assert.equal(runs.length, 1);
    assert.equal(questions.length, 1);
    assert.equal(questions[0]?.status, "answered");
    assert.equal(replies.length, 1);
    assert.equal(replies[0]?.content, "Yes, if behavior changed intentionally.");
  });
});

test("api server returns 400 for malformed JSON request bodies", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{\"title\":"
    });

    assert.equal(response.status, 400);
    const body = await response.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /invalid json/i);
  });
});

test("api server exposes notification deliveries with query filters", async () => {
  await withServer(async ({ baseUrl, cwd }) => {
    const { createNotificationDelivery } = await import("../apps/host/src/agent-state-store.js");
    createNotificationDelivery(cwd, {
      channel: "discord",
      status: "sent",
      questionId: "question-1",
      runId: "run-1",
    });
    createNotificationDelivery(cwd, {
      channel: "dashboard",
      status: "failed",
      questionId: "question-2",
      runId: "run-2",
      error: "not configured",
    });

    const all = await fetch(`${baseUrl}/deliveries`).then((response) => response.json() as Promise<Array<{ questionId?: string }>>);
    const byQuestion = await fetch(`${baseUrl}/deliveries?questionId=question-1`).then((response) => response.json() as Promise<Array<{ questionId?: string }>>);
    const byRun = await fetch(`${baseUrl}/deliveries?runId=run-2`).then((response) => response.json() as Promise<Array<{ runId?: string }>>);
    const byChannel = await fetch(`${baseUrl}/deliveries?channel=dashboard`).then((response) => response.json() as Promise<Array<{ channel: string }>>);

    assert.equal(all.length, 2);
    assert.equal(byQuestion.length, 1);
    assert.equal(byQuestion[0]?.questionId, "question-1");
    assert.equal(byRun.length, 1);
    assert.equal(byRun[0]?.runId, "run-2");
    assert.equal(byChannel.length, 1);
    assert.equal(byChannel[0]?.channel, "dashboard");
  });
});
