import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { requestScopedApproval } from "../../../apps/host/src/approval-policy.js";
import { loadRoutines, upsertRoutine } from "../../../apps/host/src/routine-store.js";

type ToolCtx = {
  cwd: string;
  hasUI: boolean;
  ui: { confirm(title: string, message: string): Promise<boolean>; notify(message: string, level?: "info" | "warning" | "error"): void };
};

async function executeRoutineSteps(pi: ExtensionAPI, ctx: ToolCtx, name: string) {
  const routine = loadRoutines(ctx.cwd).find((entry) => entry.name === name);
  if (!routine) {
    return { ok: false, message: `Routine not found: ${name}` };
  }

  for (let index = 0; index < routine.steps.length; index += 1) {
    const step = routine.steps[index];
    const approved = await requestScopedApproval(ctx, {
      scope: "routine.exec",
      title: "Routine step approval",
      message: `Execute step ${index + 1}/${routine.steps.length}?\n\nTool: ${step.tool}\nInput: ${JSON.stringify(step.input, null, 2)}`,
    });
    if (!approved) {
      return { ok: false, message: `Routine paused before step ${index + 1}.` };
    }
    pi.sendUserMessage(`Call tool ${step.tool} with input ${JSON.stringify(step.input)}`, { deliverAs: "followUp" });
  }

  return { ok: true, message: `Queued execution for routine ${name}.` };
}

export default function routines(pi: ExtensionAPI) {
  pi.registerTool({
    name: "save_routine",
    label: "Save Routine",
    description: "Save a reusable local routine composed of tool steps.",
    promptSnippet: "Save recurring screen or simulator workflows as named routines.",
    parameters: Type.Object({
      name: Type.String({ description: "Routine name." }),
      steps: Type.Array(Type.Object({
        tool: Type.String({ description: "Tool name such as desktop_click or simulator_tap." }),
        input: Type.Record(Type.String(), Type.Any()),
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const routine = upsertRoutine(ctx.cwd, params.name, params.steps as Array<{ tool: string; input: Record<string, unknown> }>);
      return {
        content: [{ type: "text", text: `Saved routine ${routine.name} with ${routine.steps.length} step(s).` }],
        details: routine,
      };
    },
  });

  pi.registerTool({
    name: "list_routines",
    label: "List Routines",
    description: "List saved local routines.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const routines = loadRoutines(ctx.cwd);
      return {
        content: [{ type: "text", text: routines.length > 0 ? routines.map((routine) => `${routine.name} (${routine.steps.length} steps)`).join("\n") : "No routines saved." }],
        details: { routines },
      };
    },
  });

  pi.registerTool({
    name: "queue_routine_run",
    label: "Queue Routine Run",
    description: "Queue execution instructions for a saved routine as a follow-up agent task.",
    promptSnippet: "Use this to replay a saved routine by turning it into explicit follow-up instructions.",
    parameters: Type.Object({ name: Type.String({ description: "Saved routine name." }) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const routine = loadRoutines(ctx.cwd).find((entry) => entry.name === params.name);
      if (!routine) {
        return { content: [{ type: "text", text: `Routine not found: ${params.name}` }], details: { name: params.name }, isError: true };
      }
      const instructions = [
        `Run saved routine: ${routine.name}`,
        ...routine.steps.map((step, index) => `Step ${index + 1}: call tool ${step.tool} with input ${JSON.stringify(step.input)}`),
      ].join("\n");
      pi.sendUserMessage(instructions, { deliverAs: "followUp" });
      return { content: [{ type: "text", text: `Queued routine ${routine.name} as a follow-up.` }], details: routine };
    },
  });

  pi.registerCommand("routines", {
    description: "Show saved routine names.",
    handler: async (_args, ctx) => {
      const routines = loadRoutines(ctx.cwd);
      ctx.ui.notify(routines.length > 0 ? routines.map((routine) => `${routine.name} (${routine.steps.length} steps)`).join("\n") : "No routines saved.", "info");
    },
  });

  pi.registerCommand("run-routine", {
    description: "Run a saved routine with per-step approvals. Usage: /run-routine <name>",
    handler: async (args, ctx) => {
      const name = (args || "").trim();
      if (!name) {
        ctx.ui.notify("Usage: /run-routine <name>", "error");
        return;
      }
      const result = await executeRoutineSteps(pi, ctx as ToolCtx, name);
      ctx.ui.notify(result.message, result.ok ? "info" : "warning");
    },
  });
}
