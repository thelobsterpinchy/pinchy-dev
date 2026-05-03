import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getRunById, listConversations } from "../../../apps/host/src/agent-state-store.js";
import { enqueueDelegationPlan, enqueueTask, loadTasks, updateTaskStatus } from "../../../apps/host/src/task-queue.js";
import { loadRunContext } from "../../../apps/host/src/run-context.js";

function readTaskContext(cwd: string) {
  const runContext = loadRunContext(cwd);
  return {
    conversationId: runContext?.currentConversationId,
    runId: runContext?.currentRunId,
  };
}

function isMainOrchestrationRun(cwd: string, taskContext: ReturnType<typeof readTaskContext>) {
  if (!taskContext.runId) {
    return true;
  }

  const run = getRunById(cwd, taskContext.runId);
  if (!run) {
    return true;
  }

  const conversationTitle = run.conversationId
    ? listConversations(cwd).find((conversation) => conversation.id === run.conversationId)?.title
    : undefined;

  if (run.kind !== "user_prompt") {
    return false;
  }

  if (run.goal.startsWith("Queued task:")) {
    return false;
  }

  if (conversationTitle === "Pinchy queued tasks") {
    return false;
  }

  return true;
}

function assertDelegationAllowed(cwd: string, taskContext: ReturnType<typeof readTaskContext>) {
  if (!isMainOrchestrationRun(cwd, taskContext)) {
    throw new Error("Only the main orchestration thread may spawn subagents. Finish this task directly or report back to the parent thread.");
  }
}

export default function taskInbox(pi: ExtensionAPI) {
  pi.registerTool({
    name: "queue_task",
    label: "Queue Task",
    description: "Queue a task into Pinchy's local goal inbox.",
    promptSnippet: "Use this for a single bounded follow-up task instead of losing future work.",
    parameters: Type.Object({
      title: Type.String({ description: "Short task title." }),
      prompt: Type.String({ description: "Prompt to run when the task is processed." }),
      dependsOnTaskIds: Type.Optional(Type.Array(Type.String({ description: "Optional already-known upstream task ids that must complete first." }))),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const taskContext = readTaskContext(ctx.cwd);
      assertDelegationAllowed(ctx.cwd, taskContext);
      const task = enqueueTask(ctx.cwd, params.title, params.prompt, {
        source: "agent",
        conversationId: taskContext.conversationId,
        runId: taskContext.runId,
        dependsOnTaskIds: params.dependsOnTaskIds,
      });
      return {
        content: [{ type: "text", text: `Queued task ${task.id}: ${task.title}` }],
        details: task,
      };
    },
  });

  pi.registerTool({
    name: "delegate_task_plan",
    label: "Delegate Task Plan",
    description: "Create a bounded subagent plan with parallelizable tasks and dependency-aware follow-ups.",
    promptSnippet: "Use this when a request has multiple independent workstreams or staged dependent subtasks.",
    parameters: Type.Object({
      tasks: Type.Array(Type.Object({
        id: Type.Optional(Type.String({ description: "Local plan id used only for expressing dependencies inside this tool call." })),
        title: Type.String({ description: "Short bounded task title." }),
        prompt: Type.String({ description: "Prompt for the delegated task." }),
        dependsOn: Type.Optional(Type.Array(Type.String({ description: "Local ids of prerequisite tasks from this same plan." }))),
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const taskContext = readTaskContext(ctx.cwd);
      assertDelegationAllowed(ctx.cwd, taskContext);
      const tasks = enqueueDelegationPlan(ctx.cwd, params.tasks.map((task, index) => ({
        id: task.id ?? `task-${index + 1}`,
        title: task.title,
        prompt: task.prompt,
        dependsOn: task.dependsOn,
      })), {
        source: "agent",
        conversationId: taskContext.conversationId,
        runId: taskContext.runId,
      });
      return {
        content: [{ type: "text", text: `Delegated ${tasks.length} task${tasks.length === 1 ? "" : "s"}: ${tasks.map((task) => task.title).join(", ")}` }],
        details: tasks,
      };
    },
  });

  pi.registerCommand("tasks", {
    description: "Show queued Pinchy tasks.",
    handler: async (_args, ctx) => {
      const tasks = loadTasks(ctx.cwd);
      ctx.ui.notify(
        tasks.length > 0
          ? tasks.map((task) => `${task.id} [${task.status}] ${task.title}`).join("\n")
          : "No tasks queued.",
        "info",
      );
    },
  });

  pi.registerCommand("complete-task", {
    description: "Mark a task done. Usage: /complete-task <id>",
    handler: async (args, ctx) => {
      const id = (args || "").trim();
      if (!id) {
        ctx.ui.notify("Usage: /complete-task <id>", "error");
        return;
      }
      const task = updateTaskStatus(ctx.cwd, id, "done");
      ctx.ui.notify(task ? `Marked ${id} done` : `Task not found: ${id}`, task ? "info" : "error");
    },
  });
}
