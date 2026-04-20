import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { detectProjectSignals, detectValidationPlan } from "../../../apps/host/src/project-detection.js";
import { createRunContext, loadRunContext } from "../../../apps/host/src/run-context.js";

export default function validationHelper(pi: ExtensionAPI) {
  pi.registerTool({
    name: "detect_validation_command",
    label: "Detect Validation Command",
    description: "Detect the best test or validation command for the current repository.",
    promptSnippet: "Detect the best validation command before asking how to run tests.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const plan = detectValidationPlan(ctx.cwd);
      return {
        content: [{
          type: "text",
          text: [
            `Validation command: ${plan.command}`,
            `Reason: ${plan.reason}`,
            `Signals: ${plan.signals.map((signal) => `${signal.kind}:${signal.path}`).join(", ") || "(none)"}`,
          ].join("\n"),
        }],
        details: plan,
      };
    },
  });

  pi.registerTool({
    name: "run_validation_command",
    label: "Run Validation Command",
    description: "Run the detected validation command for this repository with approval gating.",
    promptSnippet: "Run the detected validation command to verify a change when safe to do so.",
    parameters: Type.Object({
      reason: Type.Optional(Type.String({ description: "Why validation is being run." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const plan = detectValidationPlan(ctx.cwd);
      const approved = ctx.hasUI
        ? await ctx.ui.confirm("Run validation command", `Command: ${plan.command}\n\nReason: ${params.reason ?? "Verify recent changes"}`)
        : process.env.PINCHY_ALLOW_VALIDATION_EXEC === "1";
      if (!approved) {
        return {
          content: [{ type: "text", text: `Validation command not approved: ${plan.command}` }],
          details: plan,
          isError: true,
        };
      }

      const runContext = createRunContext(ctx.cwd, params.reason ?? "validation");
      const parts = plan.command.split(" ");
      const command = parts[0] ?? plan.command;
      const args = parts.slice(1);
      const result = await pi.exec(command, args, { timeout: 60_000 });
      return {
        content: [{
          type: "text",
          text: [
            `Run ID: ${runContext.currentRunId}`,
            `Validation command: ${plan.command}`,
            `Exit code: ${String(result.code)}`,
            result.stdout?.slice(0, 4000) ?? "",
            result.stderr?.slice(0, 4000) ?? "",
          ].filter(Boolean).join("\n\n"),
        }],
        details: { plan, result, runContext },
        isError: result.code !== 0,
      };
    },
  });

  pi.registerCommand("project-test-command", {
    description: "Show Pinchy's detected validation command for this repository.",
    handler: async (_args, ctx) => {
      const plan = detectValidationPlan(ctx.cwd);
      ctx.ui.notify(`Validation command: ${plan.command}\nReason: ${plan.reason}`, "info");
    },
  });

  pi.registerCommand("project-signals", {
    description: "Show detected project markers used by Pinchy.",
    handler: async (_args, ctx) => {
      const signals = detectProjectSignals(ctx.cwd);
      ctx.ui.notify(
        signals.length > 0
          ? signals.map((entry) => `${entry.kind}: ${entry.path}`).join("\n")
          : "No project signals detected.",
        "info",
      );
    },
  });

  pi.registerCommand("current-run", {
    description: "Show the current Pinchy run context if present.",
    handler: async (_args, ctx) => {
      const run = loadRunContext(ctx.cwd);
      ctx.ui.notify(run ? `Run: ${run.currentRunLabel} (${run.currentRunId})` : "No current run context.", "info");
    },
  });
}
