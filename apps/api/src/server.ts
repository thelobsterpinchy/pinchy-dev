import http from "node:http";
import {
  appendMessage,
  createConversation,
  createHumanReply,
  createQuestion,
  createRun,
  listConversations,
  listMessages,
  listQuestions,
  listReplies,
  listRuns,
  markQuestionAnswered,
} from "../../host/src/agent-state-store.js";

type ApiServerOptions = {
  cwd: string;
};

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendJsonBodyError(res: http.ServerResponse, error: unknown) {
  if (error instanceof SyntaxError) {
    sendJson(res, 400, { ok: false, error: "invalid JSON body" });
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
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function getRouteParams(pathname: string, prefix: string, suffix = "") {
  if (!pathname.startsWith(prefix)) return undefined;
  const remainder = pathname.slice(prefix.length);
  if (suffix && !remainder.endsWith(suffix)) return undefined;
  const raw = suffix ? remainder.slice(0, -suffix.length) : remainder;
  const value = raw.replace(/^\//, "");
  return value ? decodeURIComponent(value) : undefined;
}

export function createApiServer({ cwd }: ApiServerOptions) {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const { pathname, searchParams } = url;

    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/conversations") {
      sendJson(res, 200, listConversations(cwd));
      return;
    }

    if (req.method === "POST" && pathname === "/conversations") {
      void readJsonBody(req)
        .then((payload) => {
          if (typeof payload.title !== "string" || !payload.title.trim()) {
            sendJson(res, 400, { ok: false, error: "title is required" });
            return;
          }
          sendJson(res, 201, createConversation(cwd, { title: payload.title.trim() }));
        })
        .catch((error) => sendJsonBodyError(res, error));
      return;
    }

    const conversationIdForMessages = getRouteParams(pathname, "/conversations/", "/messages");
    if (conversationIdForMessages && req.method === "GET") {
      sendJson(res, 200, listMessages(cwd, conversationIdForMessages));
      return;
    }
    if (conversationIdForMessages && req.method === "POST") {
      void readJsonBody(req)
        .then((payload) => {
          if (payload.role !== "user" && payload.role !== "agent" && payload.role !== "system") {
            sendJson(res, 400, { ok: false, error: "valid role is required" });
            return;
          }
          if (typeof payload.content !== "string" || !payload.content.trim()) {
            sendJson(res, 400, { ok: false, error: "content is required" });
            return;
          }
          sendJson(res, 201, appendMessage(cwd, {
            conversationId: conversationIdForMessages,
            role: payload.role,
            content: payload.content.trim(),
            runId: typeof payload.runId === "string" ? payload.runId : undefined,
          }));
        })
        .catch((error) => sendJsonBodyError(res, error));
      return;
    }

    if (req.method === "GET" && pathname === "/runs") {
      const conversationId = searchParams.get("conversationId") ?? undefined;
      sendJson(res, 200, listRuns(cwd, conversationId));
      return;
    }

    if (req.method === "POST" && pathname === "/runs") {
      void readJsonBody(req)
        .then((payload) => {
          if (typeof payload.conversationId !== "string" || typeof payload.goal !== "string") {
            sendJson(res, 400, { ok: false, error: "conversationId and goal are required" });
            return;
          }
          sendJson(res, 201, createRun(cwd, {
            conversationId: payload.conversationId,
            goal: payload.goal,
          }));
        })
        .catch((error) => sendJsonBodyError(res, error));
      return;
    }

    if (req.method === "GET" && pathname === "/questions") {
      const conversationId = searchParams.get("conversationId") ?? undefined;
      sendJson(res, 200, listQuestions(cwd, conversationId));
      return;
    }

    if (req.method === "GET" && pathname === "/replies") {
      const questionId = searchParams.get("questionId") ?? undefined;
      sendJson(res, 200, listReplies(cwd, questionId));
      return;
    }

    if (req.method === "POST" && pathname === "/questions") {
      void readJsonBody(req)
        .then((payload) => {
          if (typeof payload.conversationId !== "string" || typeof payload.runId !== "string" || typeof payload.prompt !== "string") {
            sendJson(res, 400, { ok: false, error: "conversationId, runId, and prompt are required" });
            return;
          }
          sendJson(res, 201, createQuestion(cwd, {
            conversationId: payload.conversationId,
            runId: payload.runId,
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
        .then((payload) => {
          if (typeof payload.conversationId !== "string" || typeof payload.content !== "string") {
            sendJson(res, 400, { ok: false, error: "conversationId and content are required" });
            return;
          }
          const channel = payload.channel;
          if (channel !== "discord" && channel !== "imessage" && channel !== "pinchy-app" && channel !== "dashboard") {
            sendJson(res, 400, { ok: false, error: "valid channel is required" });
            return;
          }
          const reply = createHumanReply(cwd, {
            questionId: questionIdForReply,
            conversationId: payload.conversationId,
            channel,
            content: payload.content,
          });
          markQuestionAnswered(cwd, questionIdForReply);
          sendJson(res, 201, reply);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
