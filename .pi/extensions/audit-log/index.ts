import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const AUDIT_LOG_PATH = "logs/pinchy-audit.jsonl";

async function writeAudit(cwd: string, record: Record<string, unknown>) {
  const absolutePath = resolve(cwd, AUDIT_LOG_PATH);
  await mkdir(dirname(absolutePath), { recursive: true });
  await appendFile(absolutePath, `${JSON.stringify(record)}\n`, "utf8");
}

export default function auditLog(pi: ExtensionAPI) {
  pi.on("tool_execution_end", async (event, ctx) => {
    await writeAudit(ctx.cwd, {
      ts: new Date().toISOString(),
      type: "tool_execution_end",
      toolName: event.toolName,
      isError: event.isError,
      details: event.result?.details ?? null,
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
