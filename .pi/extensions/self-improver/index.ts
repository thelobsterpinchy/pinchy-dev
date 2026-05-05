import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_PROMPT = [
  "Run a safe self-improvement cycle for this repository.",
  "Stay within this repository unless explicitly instructed otherwise.",
  "Focus on docs, prompts, skills, extensions, tests, guardrails, and small refactors.",
  "Avoid edited files with unrelated dirty-worktree changes.",
  "Validate any changes when practical.",
  "When changing behavior, prefer a test-first or regression-test-first workflow.",
  "If no safe improvement is warranted, explain why and stop.",
  "Do not weaken safety or expand beyond this repo unless explicitly instructed.",
  "Use /skill:self-improvement-loop if helpful.",
].join(" ");

function loadHealthHints(cwd: string): string {
  const path = resolve(cwd, ".pinchy-health.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").trim();
}

function buildPrompt(cwd: string, focus?: string) {
  const hints = loadHealthHints(cwd);
  return [
    BASE_PROMPT,
    focus ? `Focus area: ${focus}.` : "",
    hints ? `Current health hints:\n${hints}` : "",
  ].filter(Boolean).join("\n\n");
}

export default function selfImprover(pi: ExtensionAPI) {
  pi.registerCommand("self-improve", {
    description: "Queue a safe self-improvement cycle for this repository.",
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      pi.sendUserMessage(buildPrompt(ctx.cwd, args || undefined));
    },
  });

  pi.registerCommand("pinchy-health", {
    description: "Show current repo health hints used by self-improvement cycles.",
    handler: async (_args, ctx) => {
      const hints = loadHealthHints(ctx.cwd) || "No .pinchy-health.md file found.";
      ctx.ui.notify(hints, "info");
    },
  });

  pi.registerTool({
    name: "queue_self_improvement_cycle",
    label: "Queue Self Improvement Cycle",
    description: "Queue a bounded self-improvement pass for this repository.",
    promptSnippet: "Use this to start a safe repository self-improvement cycle.",
    parameters: Type.Object({
      focus: Type.Optional(Type.String({ description: "Optional focus area such as docs, testing, or browser debugging." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      pi.sendUserMessage(buildPrompt(ctx.cwd, params.focus), { deliverAs: "followUp" });
      return {
        content: [{ type: "text", text: "Queued a self-improvement cycle as a follow-up." }],
        details: { focus: params.focus ?? null },
      };
    },
  });
}
