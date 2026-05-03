import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { appendRunActivity } from "../../../apps/host/src/agent-state-store.js";
import { loadRunContext } from "../../../apps/host/src/run-context.js";

const AUDIT_LOG_PATH = "logs/pinchy-audit.jsonl";

function summarizeToolDetails(details: unknown) {
  if (!details || typeof details !== "object") {
    return [] as string[];
  }
  return Object.entries(details as Record<string, unknown>)
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

async function writeAudit(cwd: string, record: Record<string, unknown>) {
  const absolutePath = resolve(cwd, AUDIT_LOG_PATH);
  await mkdir(dirname(absolutePath), { recursive: true });
  await appendFile(absolutePath, `${JSON.stringify(record)}\n`, "utf8");
}

export default function auditLog(pi: ExtensionAPI) {
  pi.on("tool_execution_end", async (event, ctx) => {
    const details = event.result?.details ?? null;
    const runContext = loadRunContext(ctx.cwd);
    if (runContext?.currentRunId && runContext.currentConversationId) {
      appendRunActivity(ctx.cwd, {
        conversationId: runContext.currentConversationId,
        runId: runContext.currentRunId,
        kind: "tool",
        status: event.isError ? "failed" : "completed",
        label: `Tool: ${event.toolName}`,
        toolName: event.toolName,
        details: summarizeToolDetails(details),
      });
    }

    await writeAudit(ctx.cwd, {
      ts: new Date().toISOString(),
      type: "tool_execution_end",
      toolName: event.toolName,
      runId: runContext?.currentRunId,
      conversationId: runContext?.currentConversationId,
      isError: event.isError,
      details,
    });
  });

  pi.on("agent_end", async (event, ctx) => {
    await writeAudit(ctx.cwd, {
      ts: new Date().toISOString(),
      type: "agent_end",
      messageCount: event.messages.length,
    });
  });

  pi.registerCommand("audit-tail", {
    description: "Show the path to the Pinchy audit log.",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`Audit log: ${resolve(ctx.cwd, AUDIT_LOG_PATH)}`, "info");
    },
  });
}
