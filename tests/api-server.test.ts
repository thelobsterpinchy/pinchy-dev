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

test("api server honors a workspace override header for control-plane state", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const workspaceCwd = mkdtempSync(join(tmpdir(), "pinchy-api-workspace-"));
    try {
      const response = await fetch(`${baseUrl}/conversations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pinchy-workspace-path": workspaceCwd,
        },
        body: JSON.stringify({ title: "Workspace-specific conversation" }),
      });
      assert.equal(response.status, 201);

      const rootConversations = await fetch(`${baseUrl}/conversations`).then((result) => result.json() as Promise<Array<{ id: string }>>);
      const workspaceConversations = await fetch(`${baseUrl}/conversations`, {
        headers: { "x-pinchy-workspace-path": workspaceCwd },
      }).then((result) => result.json() as Promise<Array<{ title: string }>>);

      assert.equal(rootConversations.length, 0);
      assert.equal(workspaceConversations.length, 1);
      assert.equal(workspaceConversations[0]?.title, "Workspace-specific conversation");
      assert.notEqual(workspaceCwd, cwd);
    } finally {
      rmSync(workspaceCwd, { recursive: true, force: true });
    }
  });
});

test("api server decodes an encoded workspace override header for unicode paths", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const workspaceCwd = `${cwd}/Brandon’s workspace`;
    try {
      const encodedWorkspaceCwd = encodeURIComponent(workspaceCwd);
      const response = await fetch(`${baseUrl}/conversations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pinchy-workspace-path": encodedWorkspaceCwd,
        },
        body: JSON.stringify({ title: "Unicode workspace conversation" }),
      });
      assert.equal(response.status, 201);

      const workspaceConversations = await fetch(`${baseUrl}/conversations`, {
        headers: { "x-pinchy-workspace-path": encodedWorkspaceCwd },
      }).then((result) => result.json() as Promise<Array<{ title: string }>>);
      const rootConversations = await fetch(`${baseUrl}/conversations`).then((result) => result.json() as Promise<Array<{ title: string }>>);

      assert.equal(workspaceConversations.length, 1);
      assert.equal(workspaceConversations[0]?.title, "Unicode workspace conversation");
      assert.equal(rootConversations.length, 0);
    } finally {
      rmSync(workspaceCwd, { recursive: true, force: true });
    }
  });
});

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

test("api server ignores ambient PINCHY_API_TOKEN unless auth is explicitly configured", async () => {
  const originalToken = process.env.PINCHY_API_TOKEN;
  process.env.PINCHY_API_TOKEN = "ambient-token";

  try {
    await withServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/conversations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "No explicit auth" }),
      });

      assert.equal(response.status, 201);
    });
  } finally {
    if (originalToken === undefined) delete process.env.PINCHY_API_TOKEN;
    else process.env.PINCHY_API_TOKEN = originalToken;
  }
});

test("api server requires bearer token for non-health routes when PINCHY_API_TOKEN is configured", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-api-auth-"));
  const server = createApiServer({ cwd, apiToken: "local-token" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const unauthorized = await fetch(`${baseUrl}/conversations`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${baseUrl}/conversations`, {
      headers: { authorization: "Bearer local-token" },
    });
    assert.equal(authorized.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(cwd, { recursive: true, force: true });
  }
});


test("api server deletes a conversation session, its linked records, and requests cancellation for active runs", async () => {
  await withServer(async ({ baseUrl, cwd }) => {
    const conversation = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Delete session" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    await fetch(`${baseUrl}/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "user", content: "delete this chat" }),
    });

    const run = await fetch(`${baseUrl}/conversations/${conversation.id}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "delete this chat session" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const { updateRunStatus, listRunCancellationRequests } = await import("../apps/host/src/agent-state-store.js");
    updateRunStatus(cwd, run.id, "running", { sessionPath: "/tmp/pi-session-delete.json" });

    const deleteResponse = await fetch(`${baseUrl}/conversations/${conversation.id}`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(await deleteResponse.json(), { ok: true });

    const conversations = await fetch(`${baseUrl}/conversations`).then((response) => response.json() as Promise<Array<{ id: string }>>);
    assert.equal(conversations.length, 0);

    const aggregateResponse = await fetch(`${baseUrl}/conversations/${conversation.id}/state`);
    assert.equal(aggregateResponse.status, 404);
    assert.equal(listRunCancellationRequests(cwd)[0]?.runId, run.id);
  });
});

test("api server returns 404 when posting a message to a missing conversation", async () => {
  await withServer(async ({ baseUrl, cwd }) => {
    const missingConversationId = "missing-conversation";
    const response = await fetch(`${baseUrl}/conversations/${missingConversationId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "user", content: "hello" }),
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: `Conversation not found: ${missingConversationId}` });

    const { listMessages } = await import("../apps/host/src/agent-state-store.js");
    assert.deepEqual(listMessages(cwd, missingConversationId), []);
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

test("api server returns 400 for valid JSON bodies that are not objects", async () => {
  await withServer(async ({ baseUrl }) => {
    for (const requestBody of ["null", "[]", '"hello"', "42"]) {
      const response = await fetch(`${baseUrl}/conversations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
      });

      assert.equal(response.status, 400);
      const body = await response.json() as { ok: boolean; error: string };
      assert.equal(body.ok, false);
      assert.match(body.error, /must be an object/i);
    }
  });
});

test("api server returns 404 instead of crashing on malformed percent-encoded route ids", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/conversations/%E0%A4%A/state`);

    assert.equal(response.status, 404);
    const body = await response.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /not found/i);
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

test("api server exposes run detail, question detail, and aggregate conversation state", async () => {
  await withServer(async ({ baseUrl, cwd }) => {
    const { appendRunActivity, createNotificationDelivery, updateRunStatus } = await import("../apps/host/src/agent-state-store.js");

    const conversation = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Control plane conversation" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    await fetch(`${baseUrl}/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "user", content: "Please run a QA cycle." }),
    });

    const run = await fetch(`${baseUrl}/conversations/${conversation.id}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "Run a focused QA cycle", kind: "qa_cycle" }),
    }).then((response) => response.json() as Promise<{ id: string; kind: string; status: string }>);

    updateRunStatus(cwd, run.id, "completed", {
      sessionPath: "/tmp/pi-thread-session.json",
    });

    const question = await fetch(`${baseUrl}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        runId: run.id,
        prompt: "Should I update the regression snapshots too?",
        priority: "high",
        channelHints: ["dashboard"],
      }),
    }).then((response) => response.json() as Promise<{ id: string; runId: string }>);

    createNotificationDelivery(cwd, {
      channel: "dashboard",
      status: "sent",
      questionId: question.id,
      runId: run.id,
    });
    appendRunActivity(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      kind: "tool",
      status: "completed",
      label: "Tool: read",
      toolName: "read",
      details: ["path: README.md"],
    });

    const runDetailResponse = await fetch(`${baseUrl}/runs/${run.id}`);
    assert.equal(runDetailResponse.status, 200);
    const runDetail = await runDetailResponse.json() as { id: string; kind: string; status: string };
    assert.equal(runDetail.id, run.id);
    assert.equal(runDetail.kind, "qa_cycle");

    const questionDetailResponse = await fetch(`${baseUrl}/questions/${question.id}`);
    assert.equal(questionDetailResponse.status, 200);
    const questionDetail = await questionDetailResponse.json() as { id: string; runId: string; priority: string };
    assert.equal(questionDetail.id, question.id);
    assert.equal(questionDetail.runId, run.id);
    assert.equal(questionDetail.priority, "high");

    const aggregateResponse = await fetch(`${baseUrl}/conversations/${conversation.id}/state`);
    assert.equal(aggregateResponse.status, 200);
    const aggregate = await aggregateResponse.json() as {
      conversation: { id: string };
      messages: Array<{ content: string }>;
      runs: Array<{ id: string }>;
      questions: Array<{ id: string }>;
      replies: Array<{ questionId: string }>;
      deliveries: Array<{ questionId?: string; runId?: string }>;
      runActivities: Array<{ runId: string; toolName?: string; label: string }>;
      sessionBinding?: { conversationId: string; sessionPath: string; sourceRunId?: string; updatedAt?: string };
    };

    assert.equal(aggregate.conversation.id, conversation.id);
    assert.equal(aggregate.messages.length, 1);
    assert.equal(aggregate.runs.length, 1);
    assert.equal(aggregate.runs[0]?.id, run.id);
    assert.equal(aggregate.sessionBinding?.conversationId, conversation.id);
    assert.equal(aggregate.sessionBinding?.sessionPath, "/tmp/pi-thread-session.json");
    assert.equal(aggregate.sessionBinding?.sourceRunId, run.id);
    assert.match(aggregate.sessionBinding?.updatedAt ?? "", /^20/);
    assert.equal(aggregate.questions.length, 1);
    assert.equal(aggregate.questions[0]?.id, question.id);
    assert.equal(aggregate.replies.length, 0);
    assert.equal(aggregate.deliveries.length, 1);
    assert.equal(aggregate.deliveries[0]?.questionId, question.id);
    assert.equal(aggregate.deliveries[0]?.runId, run.id);
    assert.equal(aggregate.runActivities.length, 1);
    assert.equal(aggregate.runActivities[0]?.runId, run.id);
    assert.equal(aggregate.runActivities[0]?.toolName, "read");
    assert.equal(aggregate.runActivities[0]?.label, "Tool: read");
  });
});

test("api server supports conversation-scoped run creation and run cancellation", async () => {
  await withServer(async ({ baseUrl }) => {
    const conversation = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Run control" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const createRunResponse = await fetch(`${baseUrl}/conversations/${conversation.id}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "Follow up on a watcher change", kind: "watch_followup" }),
    });
    assert.equal(createRunResponse.status, 201);
    const run = await createRunResponse.json() as { id: string; kind: string; status: string };
    assert.equal(run.kind, "watch_followup");
    assert.equal(run.status, "queued");

    const cancelResponse = await fetch(`${baseUrl}/runs/${run.id}/cancel`, {
      method: "POST",
    });
    assert.equal(cancelResponse.status, 200);
    const cancelledRun = await cancelResponse.json() as { id: string; status: string; completedAt?: string };
    assert.equal(cancelledRun.id, run.id);
    assert.equal(cancelledRun.status, "cancelled");
    assert.ok(cancelledRun.completedAt);

    const runDetail = await fetch(`${baseUrl}/runs/${run.id}`).then((response) => response.json() as Promise<{ status: string }>);
    assert.equal(runDetail.status, "cancelled");

    const missingCancel = await fetch(`${baseUrl}/runs/run-missing/cancel`, {
      method: "POST",
    });
    assert.equal(missingCancel.status, 404);
  });
});

test("api server rejects run creation for unknown conversations", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: "conversation-missing", goal: "Run without a real conversation" }),
    });

    assert.equal(response.status, 404);
    const body = await response.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /conversation not found/i);
  });
});

test("api server rejects replies for unknown questions and mismatched conversations", async () => {
  await withServer(async ({ baseUrl }) => {
    const unknownQuestion = await fetch(`${baseUrl}/questions/question-missing/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: "conversation-1", channel: "dashboard", content: "reply" }),
    });
    assert.equal(unknownQuestion.status, 404);

    const conversation = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Inbound reply test" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const otherConversation = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Other conversation" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const run = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, goal: "Wait for a reply" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const question = await fetch(`${baseUrl}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, runId: run.id, prompt: "Need a decision" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const mismatch = await fetch(`${baseUrl}/questions/${question.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: otherConversation.id, channel: "dashboard", content: "Use JSON." }),
    });

    assert.equal(mismatch.status, 409);
    const body = await mismatch.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /conversation/i);
  });
});

test("api server rejects duplicate replies after a question has already been answered", async () => {
  await withServer(async ({ baseUrl }) => {
    const conversation = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Duplicate reply test" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const run = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, goal: "Wait for one reply" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const question = await fetch(`${baseUrl}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, runId: run.id, prompt: "One answer only" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const firstReply = await fetch(`${baseUrl}/questions/${question.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, channel: "dashboard", content: "First answer." }),
    });
    assert.equal(firstReply.status, 201);

    const duplicateReply = await fetch(`${baseUrl}/questions/${question.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, channel: "dashboard", content: "Second answer." }),
    });

    assert.equal(duplicateReply.status, 409);
    const body = await duplicateReply.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /already answered/i);
  });
});

test("api server ingests Discord inbound replies through a webhook-style endpoint", async () => {
  await withServer(async ({ baseUrl }) => {
    const conversation = await fetch(`${baseUrl}/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Discord inbound" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const run = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, goal: "Wait for Discord reply" }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const question = await fetch(`${baseUrl}/questions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        runId: run.id,
        prompt: "Reply from Discord",
        channelHints: ["discord"],
      }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const webhookResponse = await fetch(`${baseUrl}/webhooks/discord/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionId: question.id,
        conversationId: conversation.id,
        content: "Use JSON files first.",
        messageId: "discord-message-1",
        authorUsername: "pinchy-operator",
        channelId: "discord-channel-1",
      }),
    });

    assert.equal(webhookResponse.status, 201);
    const reply = await webhookResponse.json() as { questionId: string; channel: string; rawPayload?: unknown };
    assert.equal(reply.questionId, question.id);
    assert.equal(reply.channel, "discord");

    const replies = await fetch(`${baseUrl}/replies?questionId=${encodeURIComponent(question.id)}`).then((response) => response.json() as Promise<Array<{ channel: string; rawPayload?: unknown }>>);
    assert.equal(replies.length, 1);
    assert.equal(replies[0]?.channel, "discord");
    assert.deepEqual(replies[0]?.rawPayload, {
      source: "discord",
      messageId: "discord-message-1",
      authorUsername: "pinchy-operator",
      channelId: "discord-channel-1",
    });

    const questionDetail = await fetch(`${baseUrl}/questions/${question.id}`).then((response) => response.json() as Promise<{ status: string }>);
    assert.equal(questionDetail.status, "answered");
  });
});

test("api server rejects malformed Discord inbound reply payloads", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/webhooks/discord/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionId: "question-1",
        conversationId: "conversation-1",
        content: "   ",
      }),
    });

    assert.equal(response.status, 400);
    const body = await response.json() as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /content/i);
  });
});
