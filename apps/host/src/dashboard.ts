import http from "node:http";
import { execFileSync } from "node:child_process";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ApprovalRecord, DashboardState } from "../../../packages/shared/src/contracts.js";
import { handleAction } from "./action-handler.js";
import { DASHBOARD_HTML_STYLES, listArtifacts, renderArtifactGallery, renderGeneratedTools, renderJson, renderQueueTaskForm, renderRoutines, renderSafe, renderTaskActions, sectionHeader } from "./html-utils.js";
import { filterArtifactIndex } from "./artifact-index.js";
import { filterActionableApprovals, loadApprovalPolicy, setApprovalScope } from "./approval-policy.js";
import { loadGeneratedToolRegistry } from "./generated-tool-registry.js";
import { loadRunContext } from "./run-context.js";
import { loadRoutines } from "./routine-store.js";
import { clearCompletedTasks, deleteTask, enqueueDelegationPlan, enqueueTask, loadTasks, reprioritizeTask, updateTaskStatus } from "./task-queue.js";
import { buildObservableTasks } from "./task-observability.js";
import { loadGeneratedToolSource } from "./tool-review.js";
import { loadRunHistory } from "./run-history.js";
import { loadDaemonHealth } from "./daemon-health.js";
import { getPendingReloadRequests, queueReloadRequest } from "./reload-requests.js";
import { requestControlPlaneApi } from "./control-plane-proxy.js";
import { createMemoryEntry, deleteMemoryEntry, listMemoryEntries, updateMemoryEntry } from "./memory-store.js";
import { resolveDashboardAssetRequest, resolveDashboardShellMode } from "./dashboard-ui.js";
import { shouldRunAsCliEntry } from "./module-entry.js";
import { deleteWorkspace, getActiveWorkspace, listWorkspaces, registerWorkspace, setActiveWorkspace } from "./workspace-registry.js";
import { buildPinchyDoctorReport } from "./pinchy-doctor.js";
import { loadPinchyRuntimeConfigFile, readPinchyConfigValue, updatePinchyRuntimeConfig } from "./pinchy-config.js";
import { buildStoredProviderCredentials, storeProviderApiKey } from "./provider-credentials.js";
import { THINKING_LEVELS, loadPinchyRuntimeConfigDetails, normalizeRuntimeModelOptions, normalizeSavedModelConfigs, type ThinkingLevel } from "./runtime-config.js";
import { discoverLocalServerModel } from "./local-server-model-discovery.js";
import { listPiAgentResources } from "./pi-resource-inventory.js";
import { applyAutoDeleteRetention } from "./auto-delete-retention.js";
import { appendMessage, createAgentGuidance, listAgentGuidances, listConversationSessions, listRunActivities, requestRunCancellation } from "./agent-state-store.js";

type SseClient = {
  id: number;
  res: http.ServerResponse;
};

type DashboardServerOptions = {
  cwd: string;
  port: number;
  controlPlaneApiBaseUrl?: string;
  agentDir?: string;
  agentSessionController?: {
    steerRun?: (input: { cwd: string; conversationId: string; runId?: string; content: string }) => Promise<void>;
    queueFollowUp?: (input: { cwd: string; conversationId: string; runId?: string; content: string }) => Promise<void>;
  };
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

function loadApprovals(cwd: string) {
  return readJsonIfPresent<ApprovalRecord[]>(resolve(cwd, ".pinchy-approvals.json"), []);
}

function saveApprovals(cwd: string, approvals: ApprovalRecord[]) {
  const path = resolve(cwd, ".pinchy-approvals.json");
  mkdirSync(resolve(cwd), { recursive: true });
  writeFileSync(path, JSON.stringify(approvals, null, 2), "utf8");
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

function badge(text: string, tone: "blue" | "green" | "yellow" | "red" | "slate" = "slate") {
  return `<span class="badge badge-${tone}">${renderSafe(text)}</span>`;
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
  <style>${DASHBOARD_HTML_STYLES}</style>
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

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function getRouteParams(pathname: string, prefix: string, suffix = "") {
  if (!pathname.startsWith(prefix)) return undefined;
  const remainder = pathname.slice(prefix.length);
  if (suffix && !remainder.endsWith(suffix)) return undefined;
  const raw = suffix ? remainder.slice(0, -suffix.length) : remainder;
  const value = raw.replace(/^\//, "");
  if (!value || value.includes("/")) return undefined;
  return safeDecodeURIComponent(value);
}

async function readJsonBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function getActiveWorkspacePath(cwd: string) {
  return getActiveWorkspace(cwd)?.path ?? cwd;
}

function readDashboardSettings(cwd: string, agentDir: string) {
  const effective = loadPinchyRuntimeConfigDetails(cwd);
  const workspaceConfig = loadPinchyRuntimeConfigFile(cwd);
  return {
    defaultProvider: effective.defaultProvider,
    defaultModel: effective.defaultModel,
    defaultThinkingLevel: effective.defaultThinkingLevel,
    defaultBaseUrl: effective.defaultBaseUrl,
    orchestrationProvider: effective.orchestrationProvider,
    orchestrationModel: effective.orchestrationModel,
    orchestrationBaseUrl: effective.orchestrationBaseUrl,
    subagentProvider: effective.subagentProvider,
    subagentModel: effective.subagentModel,
    subagentBaseUrl: effective.subagentBaseUrl,
    modelOptions: effective.modelOptions,
    savedModelConfigs: effective.savedModelConfigs ?? [],
    storedProviderCredentials: buildStoredProviderCredentials(agentDir),
    autoDeleteEnabled: effective.autoDeleteEnabled,
    autoDeleteDays: effective.autoDeleteDays,
    toolRetryWarningThreshold: effective.toolRetryWarningThreshold,
    toolRetryHardStopThreshold: effective.toolRetryHardStopThreshold,
    dangerModeEnabled: effective.dangerModeEnabled,
    workspaceDefaults: {
      defaultProvider: readPinchyConfigValue(cwd, "defaultProvider"),
      defaultModel: readPinchyConfigValue(cwd, "defaultModel"),
      defaultThinkingLevel: readPinchyConfigValue(cwd, "defaultThinkingLevel") as ThinkingLevel | undefined,
      defaultBaseUrl: readPinchyConfigValue(cwd, "defaultBaseUrl"),
      orchestrationProvider: readPinchyConfigValue(cwd, "orchestrationProvider"),
      orchestrationModel: readPinchyConfigValue(cwd, "orchestrationModel"),
      orchestrationBaseUrl: readPinchyConfigValue(cwd, "orchestrationBaseUrl"),
      subagentProvider: readPinchyConfigValue(cwd, "subagentProvider"),
      subagentModel: readPinchyConfigValue(cwd, "subagentModel"),
      subagentBaseUrl: readPinchyConfigValue(cwd, "subagentBaseUrl"),
      modelOptions: normalizeRuntimeModelOptions(workspaceConfig.modelOptions),
      savedModelConfigs: normalizeSavedModelConfigs(workspaceConfig.savedModelConfigs) ?? [],
      autoDeleteEnabled: readPinchyConfigValue(cwd, "autoDeleteEnabled") as boolean | undefined,
      autoDeleteDays: readPinchyConfigValue(cwd, "autoDeleteDays") as number | undefined,
      toolRetryWarningThreshold: readPinchyConfigValue(cwd, "toolRetryWarningThreshold") as number | undefined,
      toolRetryHardStopThreshold: readPinchyConfigValue(cwd, "toolRetryHardStopThreshold") as number | undefined,
      dangerModeEnabled: readPinchyConfigValue(cwd, "dangerModeEnabled") as boolean | undefined,
    },
    sources: effective.sources,
  };
}

function buildApiState(cwd: string): DashboardState {
  const activeWorkspacePath = getActiveWorkspacePath(cwd);
  applyAutoDeleteRetention(activeWorkspacePath);
  return {
    conversationSessions: listConversationSessions(activeWorkspacePath),
    runActivities: listRunActivities(activeWorkspacePath),
    runContext: loadRunContext(activeWorkspacePath),
    workspaces: listWorkspaces(cwd),
    activeWorkspaceId: getActiveWorkspace(cwd)?.id,
    tasks: buildObservableTasks(activeWorkspacePath),
    agentGuidances: listAgentGuidances(activeWorkspacePath),
    approvals: filterActionableApprovals(activeWorkspacePath, loadApprovals(activeWorkspacePath)),
    generatedTools: loadGeneratedToolRegistry(activeWorkspacePath),
    agentResources: listPiAgentResources(activeWorkspacePath),
    routines: loadRoutines(activeWorkspacePath),
    artifacts: listArtifacts(activeWorkspacePath, {}, 50),
    memories: listMemoryEntries(activeWorkspacePath),
    policy: loadApprovalPolicy(activeWorkspacePath),
    goals: readJsonIfPresent(resolve(activeWorkspacePath, ".pinchy-goals.json"), {}),
    watch: readJsonIfPresent(resolve(activeWorkspacePath, ".pinchy-watch.json"), {}),
    auditTail: readTextTail(resolve(activeWorkspacePath, "logs/pinchy-audit.jsonl")),
    daemonHealth: loadDaemonHealth(activeWorkspacePath),
    runHistory: loadRunHistory(activeWorkspacePath).slice(0, 20),
    pendingReloadRequests: getPendingReloadRequests(activeWorkspacePath),
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

export function createDashboardServer({ cwd, port, controlPlaneApiBaseUrl = "http://127.0.0.1:4320", agentDir = getAgentDir(), agentSessionController }: DashboardServerOptions) {
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
    const requestUrl = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const activeWorkspacePath = getActiveWorkspacePath(cwd);

    if (req.url?.startsWith("/artifact/")) {
      const name = safeDecodeURIComponent(req.url.slice("/artifact/".length));
      if (!name) {
        res.writeHead(404).end("not found");
        return;
      }
      const path = resolve(activeWorkspacePath, "artifacts", name);
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

    if (req.url === "/api/doctor" && req.method === "GET") {
      sendJson(res, 200, buildPinchyDoctorReport(activeWorkspacePath));
      return;
    }

    if (req.url === "/api/settings" && req.method === "GET") {
      sendJson(res, 200, readDashboardSettings(activeWorkspacePath, agentDir));
      return;
    }

    if (req.url === "/api/settings/discover-model" && req.method === "POST") {
      void readJsonBody(req)
        .then(async (payload) => {
          if (typeof payload.baseUrl !== "string" || !payload.baseUrl.trim()) {
            sendJson(res, 400, { ok: false, error: "baseUrl is required" });
            return;
          }
          const result = await discoverLocalServerModel(payload.baseUrl.trim());
          sendJson(res, 200, result);
        })
        .catch((error) => {
          sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return;
    }

    if (req.url === "/api/workspaces" && req.method === "GET") {
      sendJson(res, 200, listWorkspaces(cwd));
      return;
    }

    if (req.url === "/api/workspaces" && req.method === "POST") {
      void readJsonBody(req)
        .then((payload) => {
          if (typeof payload.path !== "string" || !payload.path.trim()) {
            sendJson(res, 400, { ok: false, error: "path is required" });
            return;
          }
          const created = registerWorkspace(cwd, {
            path: payload.path.trim(),
            name: typeof payload.name === "string" ? payload.name.trim() : undefined,
          });
          sendJson(res, 201, created);
          broadcastState();
        })
        .catch((error) => {
          sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return;
    }

    if (req.url === "/api/memory" && req.method === "GET") {
      sendJson(res, 200, listMemoryEntries(activeWorkspacePath));
      return;
    }

    if (req.url === "/api/settings" && req.method === "PATCH") {
      void readJsonBody(req)
        .then((payload) => {
          const nextRuntimeConfig = loadPinchyRuntimeConfigFile(activeWorkspacePath);
          let hasRuntimeConfigChanges = false;
          let providerIdForApiKey: string | undefined;

          if (typeof payload.defaultProvider === "string") {
            const trimmed = payload.defaultProvider.trim();
            nextRuntimeConfig.defaultProvider = trimmed;
            hasRuntimeConfigChanges = true;
            providerIdForApiKey = trimmed;
          }
          if (typeof payload.defaultModel === "string") {
            nextRuntimeConfig.defaultModel = payload.defaultModel.trim();
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.defaultThinkingLevel === "string") {
            const trimmed = payload.defaultThinkingLevel.trim();
            if (!THINKING_LEVELS.includes(trimmed as ThinkingLevel)) {
              sendJson(res, 400, { ok: false, error: `invalid thinking level: ${trimmed}` });
              return;
            }
            nextRuntimeConfig.defaultThinkingLevel = trimmed;
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.defaultBaseUrl === "string") {
            nextRuntimeConfig.defaultBaseUrl = payload.defaultBaseUrl.trim();
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.orchestrationProvider === "string") {
            nextRuntimeConfig.orchestrationProvider = payload.orchestrationProvider.trim();
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.orchestrationModel === "string") {
            nextRuntimeConfig.orchestrationModel = payload.orchestrationModel.trim();
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.orchestrationBaseUrl === "string") {
            nextRuntimeConfig.orchestrationBaseUrl = payload.orchestrationBaseUrl.trim();
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.subagentProvider === "string") {
            nextRuntimeConfig.subagentProvider = payload.subagentProvider.trim();
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.subagentModel === "string") {
            nextRuntimeConfig.subagentModel = payload.subagentModel.trim();
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.subagentBaseUrl === "string") {
            nextRuntimeConfig.subagentBaseUrl = payload.subagentBaseUrl.trim();
            hasRuntimeConfigChanges = true;
          }
          if (payload.modelOptions !== undefined) {
            const normalized = normalizeRuntimeModelOptions(payload.modelOptions);
            if (payload.modelOptions && typeof payload.modelOptions === "object" && !normalized) {
              sendJson(res, 400, { ok: false, error: "invalid modelOptions payload" });
              return;
            }
            nextRuntimeConfig.modelOptions = normalized;
            hasRuntimeConfigChanges = true;
          }
          if (payload.savedModelConfigs !== undefined) {
            const normalized = normalizeSavedModelConfigs(payload.savedModelConfigs);
            if (!Array.isArray(payload.savedModelConfigs) || normalized === undefined) {
              sendJson(res, 400, { ok: false, error: "invalid savedModelConfigs payload" });
              return;
            }
            nextRuntimeConfig.savedModelConfigs = normalized;
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.autoDeleteEnabled === "boolean") {
            nextRuntimeConfig.autoDeleteEnabled = payload.autoDeleteEnabled;
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.autoDeleteDays === "number") {
            if (!Number.isInteger(payload.autoDeleteDays) || payload.autoDeleteDays <= 0) {
              sendJson(res, 400, { ok: false, error: `invalid auto delete days: ${payload.autoDeleteDays}` });
              return;
            }
            nextRuntimeConfig.autoDeleteDays = payload.autoDeleteDays;
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.toolRetryWarningThreshold === "number") {
            if (!Number.isInteger(payload.toolRetryWarningThreshold) || payload.toolRetryWarningThreshold <= 0) {
              sendJson(res, 400, { ok: false, error: `invalid tool retry warning threshold: ${payload.toolRetryWarningThreshold}` });
              return;
            }
            nextRuntimeConfig.toolRetryWarningThreshold = payload.toolRetryWarningThreshold;
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.toolRetryHardStopThreshold === "number") {
            if (!Number.isInteger(payload.toolRetryHardStopThreshold) || payload.toolRetryHardStopThreshold <= 0) {
              sendJson(res, 400, { ok: false, error: `invalid tool retry hard stop threshold: ${payload.toolRetryHardStopThreshold}` });
              return;
            }
            nextRuntimeConfig.toolRetryHardStopThreshold = payload.toolRetryHardStopThreshold;
            hasRuntimeConfigChanges = true;
          }
          if (typeof payload.dangerModeEnabled === "boolean") {
            nextRuntimeConfig.dangerModeEnabled = payload.dangerModeEnabled;
            hasRuntimeConfigChanges = true;
          }

          if (
            typeof nextRuntimeConfig.toolRetryWarningThreshold === "number"
            && typeof nextRuntimeConfig.toolRetryHardStopThreshold === "number"
            && nextRuntimeConfig.toolRetryHardStopThreshold <= nextRuntimeConfig.toolRetryWarningThreshold
          ) {
            sendJson(res, 400, { ok: false, error: "tool retry hard stop threshold must be greater than warning threshold" });
            return;
          }

          if (hasRuntimeConfigChanges) {
            updatePinchyRuntimeConfig(activeWorkspacePath, nextRuntimeConfig);
          }

          if (typeof payload.providerApiKey === "string" && providerIdForApiKey) {
            storeProviderApiKey({
              agentDir,
              providerId: providerIdForApiKey,
              apiKey: payload.providerApiKey,
            });
          }
          sendJson(res, 200, readDashboardSettings(activeWorkspacePath, agentDir));
        })
        .catch((error) => {
          sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return;
    }

    if (req.url === "/api/memory" && req.method === "POST") {
      void readJsonBody(req)
        .then((payload) => {
          if (typeof payload.title !== "string" || !payload.title.trim()) {
            sendJson(res, 400, { ok: false, error: "title is required" });
            return;
          }
          if (typeof payload.content !== "string" || !payload.content.trim()) {
            sendJson(res, 400, { ok: false, error: "content is required" });
            return;
          }
          sendJson(res, 201, createMemoryEntry(activeWorkspacePath, {
            title: payload.title.trim(),
            content: payload.content.trim(),
            kind: payload.kind === "note" || payload.kind === "decision" || payload.kind === "fact" || payload.kind === "summary" ? payload.kind : undefined,
            tags: Array.isArray(payload.tags) ? payload.tags.filter((entry): entry is string => typeof entry === "string") : undefined,
            pinned: typeof payload.pinned === "boolean" ? payload.pinned : undefined,
            sourceConversationId: typeof payload.sourceConversationId === "string" ? payload.sourceConversationId : undefined,
            sourceRunId: typeof payload.sourceRunId === "string" ? payload.sourceRunId : undefined,
          }));
          broadcastState();
        })
        .catch((error) => {
          sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return;
    }

    if (req.url?.startsWith("/api/control-plane/")) {
      const path = req.url.slice("/api/control-plane".length);
      const contentType = req.headers["content-type"];
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.from(chunk));
        }
        const proxyResponse = await requestControlPlaneApi({
          apiBaseUrl: controlPlaneApiBaseUrl,
          path,
          method: req.method ?? "GET",
          bodyText: chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined,
          contentType: typeof contentType === "string" ? contentType : undefined,
          headers: { "x-pinchy-workspace-path": getActiveWorkspacePath(cwd) },
        });
        res.writeHead(proxyResponse.status, { "content-type": proxyResponse.contentType });
        res.end(proxyResponse.bodyText);
      })().catch((error) => {
        sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
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

    const workspaceActivationId = getRouteParams(requestUrl.pathname, "/api/workspaces/", "/activate");
    if (workspaceActivationId && req.method === "POST") {
      const workspace = setActiveWorkspace(cwd, workspaceActivationId);
      if (!workspace) {
        sendJson(res, 404, { ok: false, error: `Workspace not found: ${workspaceActivationId}` });
        return;
      }
      sendJson(res, 200, { ok: true, workspace });
      broadcastState();
      return;
    }

    const workspaceId = getRouteParams(requestUrl.pathname, "/api/workspaces/");
    if (workspaceId && req.method === "DELETE") {
      const workspaces = listWorkspaces(cwd);
      if (!workspaces.some((workspace) => workspace.id === workspaceId)) {
        sendJson(res, 404, { ok: false, error: `Workspace not found: ${workspaceId}` });
        return;
      }
      const deleted = deleteWorkspace(cwd, workspaceId);
      if (!deleted) {
        sendJson(res, 409, { ok: false, error: "Cannot delete the last remaining workspace." });
        return;
      }
      sendJson(res, 200, { ok: true, workspace: deleted, activeWorkspaceId: getActiveWorkspace(cwd)?.id });
      broadcastState();
      return;
    }

    const memoryId = getRouteParams(requestUrl.pathname, "/api/memory/");
    if (memoryId && req.method === "PATCH") {
      void readJsonBody(req)
        .then((payload) => {
          const updated = updateMemoryEntry(activeWorkspacePath, memoryId, {
            title: typeof payload.title === "string" ? payload.title.trim() : undefined,
            content: typeof payload.content === "string" ? payload.content.trim() : undefined,
            kind: payload.kind === "note" || payload.kind === "decision" || payload.kind === "fact" || payload.kind === "summary" ? payload.kind : undefined,
            tags: Array.isArray(payload.tags) ? payload.tags.filter((entry): entry is string => typeof entry === "string") : undefined,
            pinned: typeof payload.pinned === "boolean" ? payload.pinned : undefined,
            sourceConversationId: typeof payload.sourceConversationId === "string" ? payload.sourceConversationId : undefined,
            sourceRunId: typeof payload.sourceRunId === "string" ? payload.sourceRunId : undefined,
          });
          if (!updated) {
            sendJson(res, 404, { ok: false, error: `Memory not found: ${memoryId}` });
            return;
          }
          sendJson(res, 200, updated);
          broadcastState();
        })
        .catch((error) => {
          sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        });
      return;
    }

    if (memoryId && req.method === "DELETE") {
      const deleted = deleteMemoryEntry(activeWorkspacePath, memoryId);
      if (!deleted) {
        sendJson(res, 404, { ok: false, error: `Memory not found: ${memoryId}` });
        return;
      }
      broadcastState();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.url?.startsWith("/api/generated-tools/") && req.method === "GET") {
      const rawName = safeDecodeURIComponent(req.url.slice("/api/generated-tools/".length));
      if (!rawName) {
        sendJson(res, 404, { ok: false, error: "Generated tool not found." });
        return;
      }
      const wantsDiff = rawName.endsWith("/diff");
      const name = wantsDiff ? rawName.slice(0, -"/diff".length) : rawName;
      if (wantsDiff) {
        const diff = loadGeneratedToolDiff(activeWorkspacePath, name);
        if (!diff) {
          sendJson(res, 404, { ok: false, error: `Generated tool not found: ${name}` });
          return;
        }
        sendJson(res, 200, { ok: true, diff });
        return;
      }
      const detail = loadGeneratedToolDetail(activeWorkspacePath, name);
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
          await handleAction(activeWorkspacePath, action, payload, { agentSessionController });
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
        if (req.url === "/task" && typeof form.id === "string" && typeof form.status === "string") updateTaskStatus(activeWorkspacePath, form.id, form.status as "done" | "blocked" | "pending" | "running");
        if (req.url === "/queue-task" && typeof form.title === "string" && typeof form.prompt === "string") enqueueTask(activeWorkspacePath, form.title, form.prompt);
        if (req.url === "/routine-run" && typeof form.name === "string") enqueueTask(activeWorkspacePath, `Run routine: ${form.name}`, `Use /run-routine ${form.name} or equivalent routine execution flow to run the saved routine named ${form.name}.`);
        if (req.url === "/approval" && typeof form.id === "string" && typeof form.status === "string") {
          const approvals = loadApprovals(activeWorkspacePath);
          const match = approvals.find((entry) => entry.id === form.id);
          if (match && (form.status === "approved" || form.status === "denied")) {
            match.status = form.status;
            saveApprovals(activeWorkspacePath, approvals);
          }
        }
        if (req.url === "/scope" && typeof form.scope === "string" && typeof form.enabled === "string") setApprovalScope(activeWorkspacePath, form.scope, form.enabled === "true");
        broadcastState();
        res.writeHead(303, { location: "/" });
        res.end();
      });
      return;
    }

    if (req.method === "GET") {
      const asset = resolveDashboardAssetRequest(cwd, requestUrl.pathname);
      if (asset) {
        res.writeHead(200, { "content-type": asset.contentType });
        res.end(readFileSync(asset.path));
        return;
      }

      const shell = resolveDashboardShellMode(cwd);
      if (shell.kind === "modern") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(readFileSync(shell.indexPath, "utf8"));
        return;
      }
    }

    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderHtml(cwd, requestUrl.searchParams));
  });

  const heartbeat = setInterval(() => {
    broadcastState();
    for (const client of sseClients) {
      client.res.write(`: keepalive ${Date.now()}\n\n`);
    }
  }, 3000);

  server.on("close", () => {
    clearInterval(heartbeat);
  });

  return server;
}

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  const port = Number(process.env.PINCHY_DASHBOARD_PORT ?? 4310);
  const controlPlaneApiBaseUrl = process.env.PINCHY_API_BASE_URL ?? "http://127.0.0.1:4320";
  const server = createDashboardServer({ cwd, port, controlPlaneApiBaseUrl });

  server.listen(port, () => {
    console.log(`Pinchy dashboard running at http://127.0.0.1:${port}`);
  });
}

if (shouldRunAsCliEntry(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
