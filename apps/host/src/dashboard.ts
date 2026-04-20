import http from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ApprovalRecord, DashboardArtifact, DashboardState } from "../../../packages/shared/src/contracts.js";
import { filterArtifactIndex } from "./artifact-index.js";
import { loadApprovalPolicy, setApprovalScope } from "./approval-policy.js";
import { loadGeneratedToolRegistry } from "./generated-tool-registry.js";
import { loadRunContext } from "./run-context.js";
import { loadRoutines } from "./routine-store.js";
import { enqueueTask, loadTasks, updateTaskStatus } from "./task-queue.js";
import { loadGeneratedToolSource } from "./tool-review.js";
import { loadRunHistory } from "./run-history.js";
import { loadDaemonHealth } from "./daemon-health.js";
import { getPendingReloadRequests, queueReloadRequest } from "./reload-requests.js";

type SseClient = {
  id: number;
  res: http.ServerResponse;
};

function readJsonIfPresent<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function readTextTail(path: string, maxChars = 4000) {
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf8");
  return text.slice(-maxChars);
}

function renderSafe(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderJson(value: unknown) {
  return renderSafe(JSON.stringify(value, null, 2));
}

function listArtifacts(cwd: string, filter: { toolName?: string; query?: string; tag?: string }, limit = 24): DashboardArtifact[] {
  const records = filterArtifactIndex(cwd, filter);
  if (records.length > 0) {
    return records
      .map((record) => ({
        name: record.path.replace(/^artifacts\//, ""),
        path: resolve(cwd, record.path),
        note: record.note,
        toolName: record.toolName,
        tags: record.tags,
      }))
      .filter((entry) => existsSync(entry.path))
      .map((entry) => {
        const stat = statSync(entry.path);
        return {
          name: entry.name,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          note: entry.note,
          toolName: entry.toolName,
          tags: entry.tags,
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, limit);
  }

  const base = resolve(cwd, "artifacts");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((name) => ({ name, path: join(base, name) }))
    .filter((entry) => statSync(entry.path).isFile())
    .map((entry) => {
      const stat = statSync(entry.path);
      return {
        name: entry.name,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      } satisfies DashboardArtifact;
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
}

function loadApprovals(cwd: string) {
  return readJsonIfPresent<ApprovalRecord[]>(resolve(cwd, ".pinchy-approvals.json"), []);
}

function saveApprovals(cwd: string, approvals: ApprovalRecord[]) {
  const path = resolve(cwd, ".pinchy-approvals.json");
  mkdirSync(resolve(cwd), { recursive: true });
  writeFileSync(path, JSON.stringify(approvals, null, 2), "utf8");
}

function badge(text: string, tone: "blue" | "green" | "yellow" | "red" | "slate" = "slate") {
  return `<span class="badge badge-${tone}">${renderSafe(text)}</span>`;
}

function sectionHeader(title: string, subtitle?: string) {
  return `<div class="section-header"><div><h2>${renderSafe(title)}</h2>${subtitle ? `<p class="muted">${renderSafe(subtitle)}</p>` : ""}</div></div>`;
}

function renderTaskActions(tasks: ReturnType<typeof loadTasks>) {
  return tasks.map((task) => `
    <div class="action-row">
      <div><strong>${renderSafe(task.title)}</strong><br/>${badge(task.status, task.status === "done" ? "green" : task.status === "blocked" ? "red" : task.status === "running" ? "yellow" : "blue")}</div>
      <form method="post" action="/task">
        <input type="hidden" name="id" value="${renderSafe(task.id)}" />
        <button class="btn" name="status" value="done">Complete</button>
        <button class="btn btn-danger" name="status" value="blocked">Block</button>
      </form>
    </div>
  `).join("");
}

function renderApprovalActions(approvals: ApprovalRecord[]) {
  return approvals.filter((entry) => entry.status === "pending").map((entry) => `
    <div class="action-row">
      <div><strong>${renderSafe(entry.toolName)}</strong><br/><span class="muted">${renderSafe(entry.reason)}</span></div>
      <form method="post" action="/approval">
        <input type="hidden" name="id" value="${renderSafe(entry.id)}" />
        <button class="btn btn-success" name="status" value="approved">Approve</button>
        <button class="btn btn-danger" name="status" value="denied">Deny</button>
      </form>
    </div>
  `).join("");
}

function renderPolicyActions(policy: ReturnType<typeof loadApprovalPolicy>) {
  return Object.entries(policy.scopes ?? {}).map(([scope, enabled]) => `
    <div class="action-row">
      <div><strong>${renderSafe(scope)}</strong><br/>${badge(enabled ? "enabled" : "disabled", enabled ? "green" : "slate")}</div>
      <form method="post" action="/scope">
        <input type="hidden" name="scope" value="${renderSafe(scope)}" />
        <button class="btn" name="enabled" value="${enabled ? "false" : "true"}">${enabled ? "Disable" : "Enable"}</button>
      </form>
    </div>
  `).join("");
}

function renderArtifactGallery(cwd: string, query: string, toolName: string, tag: string) {
  const artifacts = listArtifacts(cwd, { query: query || undefined, toolName: toolName || undefined, tag: tag || undefined });
  const filterForm = `
    <form method="get" action="/" class="filters">
      <input class="input" type="text" name="artifactQuery" value="${renderSafe(query)}" placeholder="search artifacts" />
      <input class="input" type="text" name="artifactTool" value="${renderSafe(toolName)}" placeholder="tool name" />
      <input class="input" type="text" name="artifactTag" value="${renderSafe(tag)}" placeholder="tag" />
      <button class="btn" type="submit">Filter</button>
    </form>
  `;
  if (artifacts.length === 0) return `${filterForm}<p class="muted">No artifacts found.</p>`;
  return `${filterForm}<div class="gallery">${artifacts.map((artifact) => {
    const lower = artifact.name.toLowerCase();
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/.test(lower);
    const href = `/artifact/${encodeURIComponent(artifact.name)}`;
    return `<div class="artifact">${isImage ? `<a href="${href}" target="_blank"><img src="${href}" alt="${renderSafe(artifact.name)}" /></a>` : ""}<div><strong>${renderSafe(artifact.name)}</strong><br/><span class="muted">${artifact.size} bytes</span>${artifact.toolName ? `<br/>${badge(artifact.toolName, "blue")}` : ""}${artifact.tags?.length ? `<div class="tag-row">${artifact.tags.map((entry) => badge(entry, "slate")).join(" ")}</div>` : ""}${artifact.note ? `<div class="muted" style="margin-top:6px;">${renderSafe(artifact.note)}</div>` : ""}</div></div>`;
  }).join("")}</div>`;
}

function renderRoutines(cwd: string) {
  const routines = loadRoutines(cwd);
  if (routines.length === 0) return "<p class=\"muted\">No routines saved.</p>";
  return `<div class="stack">${routines.map((routine) => `<div class="routine-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><div><strong>${renderSafe(routine.name)}</strong><br/><span class="muted">${routine.steps.length} step(s)</span></div><form method="post" action="/routine-run"><input type="hidden" name="name" value="${renderSafe(routine.name)}" /><button class="btn">Queue Run</button></form></div><pre>${renderJson(routine.steps)}</pre></div>`).join("")}</div>`;
}

function renderGeneratedTools(cwd: string, selectedTool?: string) {
  const tools = loadGeneratedToolRegistry(cwd);
  const selected = selectedTool ? loadGeneratedToolSource(cwd, selectedTool) : undefined;
  return `
    <div class="stack">
      ${tools.length === 0 ? `<p class="muted">No generated tools yet.</p>` : tools.map((tool) => `
        <div class="action-row">
          <div><strong>${renderSafe(tool)}</strong></div>
          <form method="get" action="/">
            <input type="hidden" name="generatedTool" value="${renderSafe(tool)}" />
            <button class="btn" type="submit">Review</button>
          </form>
        </div>
      `).join("")}
      ${selected ? `<div class="routine-card"><strong>${renderSafe(selectedTool ?? "")}</strong><pre>${renderSafe(selected.source)}</pre></div>` : ""}
    </div>
  `;
}

function renderQueueTaskForm() {
  return `
    <form method="post" action="/queue-task" class="stack">
      <input class="input" type="text" name="title" placeholder="Task title" required />
      <textarea class="input" name="prompt" placeholder="Task prompt" rows="5" required></textarea>
      <button class="btn" type="submit">Queue Task</button>
    </form>
  `;
}

function renderHtml(cwd: string, params: URLSearchParams) {
  const state = buildApiState(cwd);
  const artifactQuery = params.get("artifactQuery") ?? "";
  const artifactTool = params.get("artifactTool") ?? "";
  const artifactTag = params.get("artifactTag") ?? "";
  const generatedTool = params.get("generatedTool") ?? undefined;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pinchy Dashboard</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; margin: 0; background: #0f172a; color: #e5e7eb; }
    .page { max-width: 1440px; margin: 0 auto; padding: 24px; }
    h1, h2 { margin: 0; }
    textarea { width: 100%; resize: vertical; }
    .hero { display: flex; justify-content: space-between; align-items: stretch; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .hero-card { background: linear-gradient(135deg, #1e293b, #111827); border: 1px solid #334155; border-radius: 16px; padding: 20px; flex: 1; min-width: 280px; }
    .muted { color: #94a3b8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .section-header p { margin: 6px 0 0; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; background: #020617; padding: 12px; border-radius: 10px; overflow: auto; }
    .action-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #0b1220; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
    .btn, .input { border-radius: 10px; border: 1px solid #475569; font: inherit; }
    .btn { background: #1d4ed8; color: white; padding: 8px 12px; cursor: pointer; }
    .btn:hover { background: #2563eb; }
    .btn-danger { background: #b91c1c; }
    .btn-danger:hover { background: #dc2626; }
    .btn-success { background: #047857; }
    .btn-success:hover { background: #059669; }
    .input { background: #0f172a; color: #e5e7eb; padding: 8px 10px; min-width: 120px; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .artifact, .routine-card { background: #0b1220; border-radius: 12px; padding: 10px; border: 1px solid #1e293b; }
    img { width: 100%; height: 140px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; background: #1e293b; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 600; margin-right: 6px; }
    .badge-blue { background: #1d4ed8; color: #dbeafe; }
    .badge-green { background: #065f46; color: #d1fae5; }
    .badge-yellow { background: #92400e; color: #fef3c7; }
    .badge-red { background: #991b1b; color: #fee2e2; }
    .badge-slate { background: #334155; color: #e2e8f0; }
    .tag-row { margin-top: 8px; }
    .stack { display: grid; gap: 10px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <div class="hero-card">
        <h1>Pinchy Dashboard</h1>
        <p class="muted">Local control plane for approvals, tasks, artifacts, generated tools, routines, and audit visibility.</p>
        <p class="muted">cwd: ${renderSafe(cwd)}</p>
        ${state.runContext ? `<p class="muted">current run: ${renderSafe(state.runContext.currentRunLabel)} (${renderSafe(state.runContext.currentRunId)})</p>` : ""}
      </div>
      <div class="hero-card">
        <div>${badge(`${state.tasks.filter((entry) => entry.status === "pending").length} pending tasks`, "blue")}${badge(`${state.approvals.filter((entry) => entry.status === "pending").length} pending approvals`, state.approvals.some((entry) => entry.status === "pending") ? "yellow" : "green")}${badge(`${state.generatedTools.length} generated tools`, "slate")}</div>
        <p class="muted" style="margin-top:12px;">Use this dashboard as the primary local operator UI. Buttons are large, sections are filterable, generated tools are reviewable, and artifacts open in a new tab.</p>
      </div>
    </div>
    <div class="grid">
      <section class="card">${sectionHeader("Tasks", "Queued work and quick status actions")}${renderTaskActions(state.tasks)}<pre>${renderJson(state.tasks)}</pre></section>
      <section class="card">${sectionHeader("Queue Task", "Create a new queued task for the daemon")}${renderQueueTaskForm()}</section>
      <section class="card">${sectionHeader("Approvals", "Review and resolve pending actions")}${renderApprovalActions(state.approvals)}<pre>${renderJson(state.approvals)}</pre></section>
      <section class="card">${sectionHeader("Goals", "Current daemon improvement/debugging goals")}<pre>${renderJson(state.goals)}</pre></section>
      <section class="card">${sectionHeader("Watch Config", "Filesystem watcher triggers")}<pre>${renderJson(state.watch)}</pre></section>
      <section class="card">${sectionHeader("Approval Scopes", "Persistent allow/deny toggles")}${renderPolicyActions(state.policy)}<pre>${renderJson(state.policy)}</pre></section>
      <section class="card">${sectionHeader("Artifacts", "Filter by query, tool, or tag")}${renderArtifactGallery(cwd, artifactQuery, artifactTool, artifactTag)}</section>
      <section class="card">${sectionHeader("Routines", "Saved reusable workflows")}${renderRoutines(cwd)}</section>
      <section class="card">${sectionHeader("Generated Tools", "Review generated tool scaffolds before reload")}${renderGeneratedTools(cwd, generatedTool)}</section>
      <section class="card">${sectionHeader("Daemon Health", "Heartbeat and current activity")}<pre>${renderJson(state.daemonHealth ?? { status: "unknown" })}</pre></section>
      <section class="card">${sectionHeader("Run Timeline", "Recent task/goal/iteration events")}<pre>${renderJson(state.runHistory)}</pre></section>
    </div>
    <section class="card" style="margin-top:16px;">${sectionHeader("Audit Tail", "Latest audit log output")}<pre>${renderSafe(state.auditTail)}</pre></section>
  </div>
</body>
</html>`;
}

function parseForm(body: string) {
  const params = new URLSearchParams(body);
  return Object.fromEntries(params.entries());
}

async function readJsonBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function buildApiState(cwd: string): DashboardState {
  return {
    runContext: loadRunContext(cwd),
    tasks: loadTasks(cwd),
    approvals: loadApprovals(cwd),
    generatedTools: loadGeneratedToolRegistry(cwd),
    routines: loadRoutines(cwd),
    artifacts: listArtifacts(cwd, {}, 50),
    policy: loadApprovalPolicy(cwd),
    goals: readJsonIfPresent(resolve(cwd, ".pinchy-goals.json"), {}),
    watch: readJsonIfPresent(resolve(cwd, ".pinchy-watch.json"), {}),
    auditTail: readTextTail(resolve(cwd, "logs/pinchy-audit.jsonl")),
    daemonHealth: loadDaemonHealth(cwd),
    runHistory: loadRunHistory(cwd).slice(0, 20),
    pendingReloadRequests: getPendingReloadRequests(cwd),
  };
}

function loadGeneratedToolDetail(cwd: string, name: string) {
  return loadGeneratedToolSource(cwd, name);
}

function loadGeneratedToolDiff(cwd: string, name: string) {
  const detail = loadGeneratedToolDetail(cwd, name);
  if (!detail) return undefined;
  const relativePath = detail.path.replace(`${cwd}/`, "");
  try {
    const unstaged = execFileSync("git", ["diff", "--", relativePath], { cwd, encoding: "utf8" }).trim();
    const staged = execFileSync("git", ["diff", "--cached", "--", relativePath], { cwd, encoding: "utf8" }).trim();
    const status = execFileSync("git", ["status", "--porcelain", "--", relativePath], { cwd, encoding: "utf8" }).trim();
    if (!unstaged && !staged && status.startsWith("??")) {
      return { path: relativePath, diff: `Untracked generated tool:\n${relativePath}` };
    }
    return {
      path: relativePath,
      diff: [staged ? `# staged\n${staged}` : "", unstaged ? `# unstaged\n${unstaged}` : ""].filter(Boolean).join("\n\n") || "No git diff for this generated tool.",
    };
  } catch (error) {
    return { path: relativePath, diff: `Unable to compute git diff: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function handleAction(cwd: string, action: string, payload: Record<string, unknown>) {
  if (action === "task" && typeof payload.id === "string" && typeof payload.status === "string") {
    updateTaskStatus(cwd, payload.id, payload.status as "done" | "blocked" | "pending" | "running");
    return;
  }
  if (action === "queue-task" && typeof payload.title === "string" && typeof payload.prompt === "string") {
    enqueueTask(cwd, payload.title, payload.prompt);
    return;
  }
  if (action === "routine-run" && typeof payload.name === "string") {
    enqueueTask(cwd, `Run routine: ${payload.name}`, `Use /run-routine ${payload.name} or equivalent routine execution flow to run the saved routine named ${payload.name}.`);
    return;
  }
  if (action === "approval" && typeof payload.id === "string" && typeof payload.status === "string") {
    const approvals = loadApprovals(cwd);
    const match = approvals.find((entry) => entry.id === payload.id);
    if (match && (payload.status === "approved" || payload.status === "denied")) {
      match.status = payload.status;
      saveApprovals(cwd, approvals);
    }
    return;
  }
  if (action === "scope" && typeof payload.scope === "string" && typeof payload.enabled === "boolean") {
    setApprovalScope(cwd, payload.scope, payload.enabled);
    return;
  }
  if (action === "generated-tool-reload" && typeof payload.name === "string") {
    queueReloadRequest(cwd, payload.name);
    return;
  }
  if (action === "reload-runtime") {
    queueReloadRequest(cwd, typeof payload.name === "string" ? payload.name : undefined);
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function openSse(res: http.ServerResponse) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  res.write("retry: 3000\n\n");
}

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  const port = Number(process.env.PINCHY_DASHBOARD_PORT ?? 4310);
  const sseClients: SseClient[] = [];
  let nextClientId = 1;
  let lastStateJson = JSON.stringify(buildApiState(cwd));

  const broadcastState = () => {
    const nextState = buildApiState(cwd);
    const nextJson = JSON.stringify(nextState);
    if (nextJson === lastStateJson) return;
    lastStateJson = nextJson;
    for (const client of sseClients) {
      client.res.write(`event: state\ndata: ${nextJson}\n\n`);
    }
  };

  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/artifact/")) {
      const name = decodeURIComponent(req.url.slice("/artifact/".length));
      const path = resolve(cwd, "artifacts", name);
      if (!existsSync(path)) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200);
      res.end(readFileSync(path));
      return;
    }

    if (req.url === "/api/state" && req.method === "GET") {
      sendJson(res, 200, buildApiState(cwd));
      return;
    }

    if (req.url === "/api/events" && req.method === "GET") {
      openSse(res);
      const clientId = nextClientId++;
      const client = { id: clientId, res };
      sseClients.push(client);
      res.write(`event: state\ndata: ${lastStateJson}\n\n`);
      req.on("close", () => {
        const index = sseClients.findIndex((entry) => entry.id === clientId);
        if (index >= 0) sseClients.splice(index, 1);
      });
      return;
    }

    if (req.url?.startsWith("/api/generated-tools/") && req.method === "GET") {
      const rawName = decodeURIComponent(req.url.slice("/api/generated-tools/".length));
      const wantsDiff = rawName.endsWith("/diff");
      const name = wantsDiff ? rawName.slice(0, -"/diff".length) : rawName;
      if (wantsDiff) {
        const diff = loadGeneratedToolDiff(cwd, name);
        if (!diff) {
          sendJson(res, 404, { ok: false, error: `Generated tool not found: ${name}` });
          return;
        }
        sendJson(res, 200, { ok: true, diff });
        return;
      }
      const detail = loadGeneratedToolDetail(cwd, name);
      if (!detail) {
        sendJson(res, 404, { ok: false, error: `Generated tool not found: ${name}` });
        return;
      }
      sendJson(res, 200, { ok: true, tool: detail });
      return;
    }

    if (req.url?.startsWith("/api/actions/") && req.method === "POST") {
      const action = req.url.slice("/api/actions/".length);
      void readJsonBody(req)
        .then(async (payload) => {
          await handleAction(cwd, action, payload);
          broadcastState();
          sendJson(res, 200, { ok: true });
        })
        .catch((error) => {
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return;
    }

    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        const form = parseForm(Buffer.concat(chunks).toString("utf8"));
        if (req.url === "/task" && typeof form.id === "string" && typeof form.status === "string") updateTaskStatus(cwd, form.id, form.status as "done" | "blocked" | "pending" | "running");
        if (req.url === "/queue-task" && typeof form.title === "string" && typeof form.prompt === "string") enqueueTask(cwd, form.title, form.prompt);
        if (req.url === "/routine-run" && typeof form.name === "string") enqueueTask(cwd, `Run routine: ${form.name}`, `Use /run-routine ${form.name} or equivalent routine execution flow to run the saved routine named ${form.name}.`);
        if (req.url === "/approval" && typeof form.id === "string" && typeof form.status === "string") {
          const approvals = loadApprovals(cwd);
          const match = approvals.find((entry) => entry.id === form.id);
          if (match && (form.status === "approved" || form.status === "denied")) {
            match.status = form.status;
            saveApprovals(cwd, approvals);
          }
        }
        if (req.url === "/scope" && typeof form.scope === "string" && typeof form.enabled === "string") setApprovalScope(cwd, form.scope, form.enabled === "true");
        broadcastState();
        res.writeHead(303, { location: "/" });
        res.end();
      });
      return;
    }

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderHtml(cwd, url.searchParams));
  });

  const heartbeat = setInterval(() => {
    broadcastState();
    for (const client of sseClients) {
      client.res.write(`: keepalive ${Date.now()}\n\n`);
    }
  }, 3000);

  server.listen(port, () => {
    console.log(`Pinchy dashboard running at http://127.0.0.1:${port}`);
  });

  server.on("close", () => {
    clearInterval(heartbeat);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
