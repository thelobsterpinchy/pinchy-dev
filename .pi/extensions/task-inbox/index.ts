import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { enqueueTask, loadTasks, updateTaskStatus } from "../../../apps/host/src/task-queue.js";

export default function taskInbox(pi: ExtensionAPI) {
  pi.registerTool({
    name: "queue_task",
    label: "Queue Task",
    description: "Queue a task into Pinchy's local goal inbox.",
    promptSnippet: "Use this to queue follow-up work instead of losing future tasks.",
    parameters: Type.Object({
      title: Type.String({ description: "Short task title." }),
      prompt: Type.String({ description: "Prompt to run when the task is processed." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const task = enqueueTask(ctx.cwd, params.title, params.prompt);
      return {
        content: [{ type: "text", text: `Queued task ${task.id}: ${task.title}` }],
        details: task,
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
