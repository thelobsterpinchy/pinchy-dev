import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setSessionScope } from "../../../apps/host/src/session-approval.js";
import { getApprovalScopeForTool, isActionAutoApproved, setApprovalScope } from "../../../apps/host/src/approval-policy.js";

type ApprovalRecord = {
  id: string;
  ts: string;
  status: "pending" | "approved" | "denied";
  toolName: string;
  reason: string;
  payload: Record<string, unknown>;
};

const APPROVALS_PATH = ".pinchy-approvals.json";
const DESKTOP_ACTION_SCOPE = "desktop.actions";

function normalizeApprovalPayload(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function approvalMatchesToolCall(entry: ApprovalRecord, toolName: string, payload: Record<string, unknown>) {
  return entry.toolName === toolName && JSON.stringify(entry.payload) === JSON.stringify(payload);
}

async function loadApprovals(cwd: string): Promise<ApprovalRecord[]> {
  const path = resolve(cwd, APPROVALS_PATH);
  try {
    return JSON.parse(await readFile(path, "utf8")) as ApprovalRecord[];
  } catch {
    return [];
  }
}

async function saveApprovals(cwd: string, approvals: ApprovalRecord[]) {
  const path = resolve(cwd, APPROVALS_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(approvals, null, 2), "utf8");
}

async function appendAuditNote(cwd: string, line: string) {
  const path = resolve(cwd, "logs/pinchy-approvals.log");
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${new Date().toISOString()} ${line}\n`, "utf8");
}

export default function approvalInbox(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const scope = getApprovalScopeForTool(event.toolName);
    if (scope !== DESKTOP_ACTION_SCOPE) return;

    const payload = normalizeApprovalPayload(event.input);
    const reason = typeof payload.reason === "string" ? payload.reason : "";

    if (isActionAutoApproved(ctx.cwd, DESKTOP_ACTION_SCOPE)) {
      await appendAuditNote(ctx.cwd, `approved-use tool=${event.toolName} scope=${DESKTOP_ACTION_SCOPE}`);
      return;
    }

    const approvals = await loadApprovals(ctx.cwd);
    const approved = approvals.find((entry) => entry.status === "approved" && approvalMatchesToolCall(entry, event.toolName, payload));
    if (approved) {
      await appendAuditNote(ctx.cwd, `approved-use tool=${event.toolName}`);
      return;
    }

    const existingPending = approvals.find((entry) => entry.status === "pending" && approvalMatchesToolCall(entry, event.toolName, payload));
    if (!existingPending) {
      approvals.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: new Date().toISOString(),
        status: "pending",
        toolName: event.toolName,
        reason,
        payload,
      });
      await saveApprovals(ctx.cwd, approvals);
      await appendAuditNote(ctx.cwd, `pending tool=${event.toolName}`);
    }

    if (!ctx.hasUI && process.env.PINCHY_ALLOW_DESKTOP_ACTIONS !== "1") {
      return {
        block: true,
        reason: `Pending approval required. Review ${APPROVALS_PATH}, run /approvals to inspect pending requests, then /approve <id> or /deny <id> before retrying.`,
      };
    }
  });

  pi.registerCommand("approvals", { description: "Show current pending approvals.", handler: async (_args, ctx) => { const approvals = await loadApprovals(ctx.cwd); const pending = approvals.filter((entry) => entry.status === "pending"); const message = pending.length === 0 ? "No pending approvals." : pending.map((entry) => `${entry.id} ${entry.toolName} ${JSON.stringify(entry.payload)} reason=${entry.reason}`).join("\n"); ctx.ui.notify(message, "info"); } });

  pi.registerCommand("approve", { description: "Approve a pending action by id. Usage: /approve <id>", handler: async (args, ctx) => { const id = (args || "").trim(); if (!id) { ctx.ui.notify("Usage: /approve <id>", "error"); return; } const approvals = await loadApprovals(ctx.cwd); const match = approvals.find((entry) => entry.id === id); if (!match) { ctx.ui.notify(`Approval not found: ${id}`, "error"); return; } match.status = "approved"; await saveApprovals(ctx.cwd, approvals); await appendAuditNote(ctx.cwd, `approved id=${id} tool=${match.toolName}`); ctx.ui.notify(`Approved ${id}`, "info"); } });

  pi.registerCommand("deny", { description: "Deny a pending action by id. Usage: /deny <id>", handler: async (args, ctx) => { const id = (args || "").trim(); if (!id) { ctx.ui.notify("Usage: /deny <id>", "error"); return; } const approvals = await loadApprovals(ctx.cwd); const match = approvals.find((entry) => entry.id === id); if (!match) { ctx.ui.notify(`Approval not found: ${id}`, "error"); return; } match.status = "denied"; await saveApprovals(ctx.cwd, approvals); await appendAuditNote(ctx.cwd, `denied id=${id} tool=${match.toolName}`); ctx.ui.notify(`Denied ${id}`, "info"); } });

  pi.registerCommand("allow-session", {
    description: "Allow a scope for this session only. Usage: /allow-session <scope>",
    handler: async (args, ctx) => {
      const scope = (args || "").trim();
      if (!scope) {
        ctx.ui.notify("Usage: /allow-session <scope>", "error");
        return;
      }
      setSessionScope(ctx.cwd, scope, true);
      ctx.ui.notify(`Enabled session scope: ${scope}`, "info");
    },
  });

  pi.registerCommand("allow-persistent", {
    description: "Allow a scope persistently. Usage: /allow-persistent <scope>",
    handler: async (args, ctx) => {
      const scope = (args || "").trim();
      if (!scope) {
        ctx.ui.notify("Usage: /allow-persistent <scope>", "error");
        return;
      }
      setApprovalScope(ctx.cwd, scope, true);
      ctx.ui.notify(`Enabled persistent scope: ${scope}`, "info");
    },
  });
}
