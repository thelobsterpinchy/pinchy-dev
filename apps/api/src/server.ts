import http from "node:http";
import {
  appendMessage,
  createConversation,
  createQuestion,
  createRun,
  deleteConversation,
  getConversationSessionBinding,
  getQuestionById,
  getRunById,
  listConversations,
  listMessages,
  listNotificationDeliveries,
  listQuestions,
  listReplies,
  listRunActivities,
  listRuns,
  updateRunStatus,
} from "../../host/src/agent-state-store.js";
import { isRunKind } from "../../../packages/shared/src/contracts.js";
import { normalizeDiscordInboundReply, DiscordInboundNormalizationError } from "../../../services/notifiers/discord-inbound.js";
import { InboundReplyIngestionError, ingestInboundReply } from "../../../services/notifiers/inbound-replies.js";
import { shouldRunAsCliEntry } from "../../host/src/module-entry.js";

type ApiServerOptions = {
  cwd: string;
  apiToken?: string;
};

class InvalidJsonBodyError extends Error {}

function decodeWorkspaceOverrideHeaderValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveRequestCwd(defaultCwd: string, req: http.IncomingMessage) {
  const header = req.headers["x-pinchy-workspace-path"];
  if (typeof header !== "string" || !header.trim()) {
    return defaultCwd;
  }
  return decodeWorkspaceOverrideHeaderValue(header.trim());
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function isAuthorized(req: http.IncomingMessage, apiToken?: string) {
  if (!apiToken) return true;
  return req.headers.authorization === `Bearer ${apiToken}`;
}

function sendJsonBodyError(res: http.ServerResponse, error: unknown) {
  if (error instanceof SyntaxError) {
    sendJson(res, 400, { ok: false, error: "invalid JSON body" });
    return;
  }
  if (error instanceof InvalidJsonBodyError) {
    sendJson(res, 400, { ok: false, error: error.message });
    return;
  }
  sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
}

async function readJsonBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidJsonBodyError("JSON body must be an object");
  }

  return parsed as Record<string, unknown>;
}

function getRouteParams(pathname: string, prefix: string, suffix = "") {
  if (!pathname.startsWith(prefix)) return undefined;
  const remainder = pathname.slice(prefix.length);
  if (suffix && !remainder.endsWith(suffix)) return undefined;
  const raw = suffix ? remainder.slice(0, -suffix.length) : remainder;
  const value = raw.replace(/^\//, "");
  if (!value || value.includes("/")) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function getConversationById(cwd: string, conversationId: string) {
  return listConversations(cwd).find((conversation) => conversation.id === conversationId);
}

function parseRunKind(value: unknown) {
  return typeof value === "string" && isRunKind(value) ? value : undefined;
}

export function createApiServer({ cwd, apiToken = process.env.PINCHY_API_TOKEN }: ApiServerOptions) {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const { pathname, searchParams } = url;
    const requestCwd = resolveRequestCwd(cwd, req);

    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (!isAuthorized(req, apiToken)) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    if (req.method === "GET" && pathname === "/conversations") {
      sendJson(res, 200, listConversations(requestCwd));
      return;
    }

    if (req.method === "POST" && pathname === "/conversations") {
      void readJsonBody(req)
        .then((payload) => {
          if (typeof payload.title !== "string" || !payload.title.trim()) {
            sendJson(res, 400, { ok: false, error: "title is required" });
            return;
          }
          sendJson(res, 201, createConversation(requestCwd, { title: payload.title.trim() }));
        })
        .catch((error) => sendJsonBodyError(res, error));
      return;
    }

    const conversationIdForDetail = getRouteParams(pathname, "/conversations/");
    if (conversationIdForDetail && req.method === "DELETE") {
      if (!deleteConversation(requestCwd, conversationIdForDetail)) {
        sendJson(res, 404, { ok: false, error: `Conversation not found: ${conversationIdForDetail}` });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    const conversationIdForMessages = getRouteParams(pathname, "/conversations/", "/messages");
    if (conversationIdForMessages && req.method === "GET") {
      sendJson(res, 200, listMessages(requestCwd, conversationIdForMessages));
      return;
    }
    if (conversationIdForMessages && req.method === "POST") {
      void readJsonBody(req)
        .then((payload) => {
          if (!getConversationById(requestCwd, conversationIdForMessages)) {
            sendJson(res, 404, { ok: false, error: `Conversation not found: ${conversationIdForMessages}` });
            return;
          }
          if (payload.role !== "user" && payload.role !== "agent" && payload.role !== "system") {
            sendJson(res, 400, { ok: false, error: "valid role is required" });
            return;
          }
          if (typeof payload.content !== "string" || !payload.content.trim()) {
            sendJson(res, 400, { ok: false, error: "content is required" });
            return;
          }
          if (payload.kind !== undefined && payload.kind !== "default" && payload.kind !== "orchestration_update" && payload.kind !== "orchestration_final") {
            sendJson(res, 400, { ok: false, error: "valid message kind is required when provided" });
            return;
          }
          sendJson(res, 201, appendMessage(requestCwd, {
            conversationId: conversationIdForMessages,
            role: payload.role,
            content: payload.content.trim(),
            runId: typeof payload.runId === "string" ? payload.runId : undefined,
            kind: typeof payload.kind === "string" ? payload.kind : undefined,
          }));
        })
        .catch((error) => sendJsonBodyError(res, error));
      return;
    }

    const conversationIdForState = getRouteParams(pathname, "/conversations/", "/state");
    if (conversationIdForState && req.method === "GET") {
      const conversation = getConversationById(requestCwd, conversationIdForState);
      if (!conversation) {
        sendJson(res, 404, { ok: false, error: `Conversation not found: ${conversationIdForState}` });
        return;
      }
      const messages = listMessages(requestCwd, conversationIdForState);
      const runs = listRuns(requestCwd, conversationIdForState);
      const questions = listQuestions(requestCwd, conversationIdForState);
      const questionIds = new Set(questions.map((question) => question.id));
      const runIds = new Set(runs.map((run) => run.id));
      const replies = listReplies(requestCwd).filter((reply) => questionIds.has(reply.questionId));
      const deliveries = listNotificationDeliveries(requestCwd).filter((delivery) => (delivery.questionId ? questionIds.has(delivery.questionId) : false) || (delivery.runId ? runIds.has(delivery.runId) : false));
      const runActivities = listRunActivities(requestCwd, { conversationId: conversationIdForState }).filter((activity) => runIds.has(activity.runId));
      sendJson(res, 200, {
        conversation,
        messages,
        runs,
        questions,
        replies,
        deliveries,
        runActivities,
        sessionBinding: getConversationSessionBinding(requestCwd, conversationIdForState),
      });
      return;
    }

    const conversationIdForRuns = getRouteParams(pathname, "/conversations/", "/runs");
    if (conversationIdForRuns && req.method === "POST") {
      void readJsonBody(req)
        .then((payload) => {
          if (typeof payload.goal !== "string" || !payload.goal.trim()) {
            sendJson(res, 400, { ok: false, error: "goal is required" });
            return;
          }
          if (!getConversationById(requestCwd, conversationIdForRuns)) {
            sendJson(res, 404, { ok: false, error: `Conversation not found: ${conversationIdForRuns}` });
            return;
          }
          if (payload.kind !== undefined && !parseRunKind(payload.kind)) {
            sendJson(res, 400, { ok: false, error: "valid run kind is required when provided" });
            return;
          }
          sendJson(res, 201, createRun(requestCwd, {
            conversationId: conversationIdForRuns,
            goal: payload.goal.trim(),
            kind: parseRunKind(payload.kind),
          }));
        })
        .catch((error) => sendJsonBodyError(res, error));
      return;
    }

    if (req.method === "GET" && pathname === "/runs") {
      const conversationId = searchParams.get("conversationId") ?? undefined;
      sendJson(res, 200, listRuns(requestCwd, conversationId));
      return;
    }

    const runIdForDetail = getRouteParams(pathname, "/runs/");
    if (runIdForDetail && req.method === "GET") {
      const run = getRunById(requestCwd, runIdForDetail);
      if (!run) {
        sendJson(res, 404, { ok: false, error: `Run not found: ${runIdForDetail}` });
        return;
      }
      sendJson(res, 200, run);
      return;
    }

    const runIdForCancel = getRouteParams(pathname, "/runs/", "/cancel");
    if (runIdForCancel && req.method === "POST") {
      const run = getRunById(requestCwd, runIdForCancel);
      if (!run) {
        sendJson(res, 404, { ok: false, error: `Run not found: ${runIdForCancel}` });
        return;
      }
      if (["completed", "failed", "cancelled"].includes(run.status)) {
        sendJson(res, 409, { ok: false, error: `Run cannot be cancelled from status: ${run.status}` });
        return;
      }
      sendJson(res, 200, updateRunStatus(requestCwd, runIdForCancel, "cancelled"));
      return;
    }

    if (req.method === "POST" && pathname === "/runs") {
      void readJsonBody(req)
        .then((payload) => {
          if (typeof payload.conversationId !== "string" || typeof payload.goal !== "string") {
            sendJson(res, 400, { ok: false, error: "conversationId and goal are required" });
            return;
          }
          if (!getConversationById(requestCwd, payload.conversationId)) {
            sendJson(res, 404, { ok: false, error: `Conversation not found: ${payload.conversationId}` });
            return;
          }
          if (payload.kind !== undefined && !parseRunKind(payload.kind)) {
            sendJson(res, 400, { ok: false, error: "valid run kind is required when provided" });
            return;
          }
          sendJson(res, 201, createRun(requestCwd, {
            conversationId: payload.conversationId,
            goal: payload.goal,
            kind: parseRunKind(payload.kind),
          }));
        })
        .catch((error) => sendJsonBodyError(res, error));
      return;
    }

    if (req.method === "GET" && pathname === "/questions") {
      const conversationId = searchParams.get("conversationId") ?? undefined;
      sendJson(res, 200, listQuestions(requestCwd, conversationId));
      return;
    }

    const questionIdForDetail = getRouteParams(pathname, "/questions/");
    if (questionIdForDetail && req.method === "GET") {
      const question = getQuestionById(requestCwd, questionIdForDetail);
      if (!question) {
        sendJson(res, 404, { ok: false, error: `Question not found: ${questionIdForDetail}` });
        return;
      }
      sendJson(res, 200, question);
      return;
    }

    if (req.method === "GET" && pathname === "/replies") {
      const questionId = searchParams.get("questionId") ?? undefined;
      sendJson(res, 200, listReplies(requestCwd, questionId));
      return;
    }

    if (req.method === "GET" && pathname === "/deliveries") {
      const questionId = searchParams.get("questionId") ?? undefined;
      const runId = searchParams.get("runId") ?? undefined;
      const channel = searchParams.get("channel");
      sendJson(res, 200, listNotificationDeliveries(requestCwd, {
        questionId,
        runId,
        channel: channel === "discord" || channel === "imessage" || channel === "pinchy-app" || channel === "dashboard" ? channel : undefined,
      }));
      return;
    }

    if (req.method === "POST" && pathname === "/questions") {
      void readJsonBody(req)
        .then((payload) => {
          if (typeof payload.conversationId !== "string" || typeof payload.runId !== "string" || typeof payload.prompt !== "string") {
            sendJson(res, 400, { ok: false, error: "conversationId, runId, and prompt are required" });
            return;
          }
          sendJson(res, 201, createQuestion(requestCwd, {
            conversationId: payload.conversationId,
            runId: payload.runId,
            agentRunId: typeof payload.agentRunId === "string" ? payload.agentRunId : undefined,
            taskId: typeof payload.taskId === "string" ? payload.taskId : undefined,
            prompt: payload.prompt,
            priority: payload.priority === "low" || payload.priority === "normal" || payload.priority === "high" || payload.priority === "urgent" ? payload.priority : "normal",
            channelHints: Array.isArray(payload.channelHints)
              ? payload.channelHints.filter((entry): entry is "discord" | "imessage" | "pinchy-app" | "dashboard" => typeof entry === "string" && ["discord", "imessage", "pinchy-app", "dashboard"].includes(entry))
              : undefined,
          }));
        })
        .catch((error) => sendJsonBodyError(res, error));
      return;
    }

    const questionIdForReply = getRouteParams(pathname, "/questions/", "/reply");
    if (questionIdForReply && req.method === "POST") {
      void readJsonBody(req)
        .then(async (payload) => {
          if (typeof payload.conversationId !== "string" || typeof payload.content !== "string") {
            sendJson(res, 400, { ok: false, error: "conversationId and content are required" });
            return;
          }
          const channel = payload.channel;
          if (channel !== "discord" && channel !== "imessage" && channel !== "pinchy-app" && channel !== "dashboard") {
            sendJson(res, 400, { ok: false, error: "valid channel is required" });
            return;
          }
          try {
            const reply = await ingestInboundReply(requestCwd, {
              questionId: questionIdForReply,
              conversationId: payload.conversationId,
              channel,
              content: payload.content,
              rawPayload: payload.rawPayload,
            });
            sendJson(res, 201, reply);
          } catch (error) {
            if (error instanceof InboundReplyIngestionError) {
              sendJson(res, error.statusCode, { ok: false, error: error.message });
              return;
            }
            throw error;
          }
        })
        .catch((error) => sendJsonBodyError(res, error));
      return;
    }

    if (req.method === "POST" && pathname === "/webhooks/discord/reply") {
      void readJsonBody(req)
        .then(async (payload) => {
          try {
            const normalized = normalizeDiscordInboundReply(payload);
            const reply = await ingestInboundReply(requestCwd, normalized);
            sendJson(res, 201, reply);
          } catch (error) {
            if (error instanceof DiscordInboundNormalizationError) {
              sendJson(res, 400, { ok: false, error: error.message });
              return;
            }
            if (error instanceof InboundReplyIngestionError) {
              sendJson(res, error.statusCode, { ok: false, error: error.message });
              return;
            }
            throw error;
          }
        })
        .catch((error) => sendJsonBodyError(res, error));
      return;
    }

    sendJson(res, 404, { ok: false, error: `Not found: ${pathname}` });
  });
}

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  const port = Number(process.env.PINCHY_API_PORT ?? 4320);
  const server = createApiServer({ cwd });
  server.listen(port, () => {
    console.log(`Pinchy API running at http://127.0.0.1:${port}`);
  });
}

if (shouldRunAsCliEntry(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
