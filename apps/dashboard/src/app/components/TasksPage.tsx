import { useEffect, useMemo, useState } from "react";
import { ListTodo, PanelLeftOpen, ArrowUp, ArrowDown, ArrowBigUp, ArrowBigDown, Trash2, Eye } from "lucide-react";
import { useOutletContext } from "react-router";
import { buildTaskStatusPresentation } from "../../dashboard-model.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card } from "./ui/card.js";
import { Input } from "./ui/input.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Textarea } from "./ui/textarea.js";
import { TaskAgentDetailPanel } from "./TaskAgentDetailPanel.js";
import { fetchConversationState, type ConversationState } from "../pinchy-dashboard-client.js";
import type { RootLayoutContext } from "../types.js";
import type { AgentGuidance, Conversation, PinchyTask } from "../../../../../packages/shared/src/contracts.js";

const TASK_FILTERS = ["all", "pending", "running", "blocked", "done"] as const;
type TaskFilter = typeof TASK_FILTERS[number];

function toneForStatus(status: string) {
  if (status === "done") return "bg-emerald-700/70 text-emerald-100";
  if (status === "running") return "bg-blue-700/70 text-blue-100";
  if (status === "blocked") return "bg-amber-700/70 text-amber-100";
  return "bg-slate-700 text-slate-100";
}

function TaskStatusBadge({ task }: { task: PinchyTask }) {
  const presentation = buildTaskStatusPresentation(task);
  return <Badge className={toneForStatus(presentation.tone)}>{presentation.label}</Badge>;
}

type TasksPageContentProps = Pick<RootLayoutContext,
  | "onToggleLeftSidebar"
  | "isLeftSidebarOpen"
  | "tasks"
  | "onQueueTask"
  | "onDeleteTask"
  | "onClearCompletedTasks"
  | "onReprioritizeTask"
  | "agentGuidances"
  | "conversations"
  | "onSubmitAgentGuidance"
  | "onSteerAgentRun"
> & {
  selectedTask?: PinchyTask;
  selectedConversation?: Conversation;
  selectedConversationState?: ConversationState;
  onSelectTask: (task?: PinchyTask) => void;
};

export function TasksPageContent({
  onToggleLeftSidebar,
  isLeftSidebarOpen,
  tasks,
  onQueueTask,
  onDeleteTask,
  onClearCompletedTasks,
  onReprioritizeTask,
  agentGuidances,
  selectedTask,
  selectedConversation,
  selectedConversationState,
  onSelectTask,
  onSubmitAgentGuidance,
  onSteerAgentRun,
}: TasksPageContentProps) {
  const [queueTaskTitle, setQueueTaskTitle] = useState("");
  const [queueTaskPrompt, setQueueTaskPrompt] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");

  const filteredTasks = useMemo(() => {
    const query = taskQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      if (taskFilter !== "all" && task.status !== taskFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [task.title, task.prompt, task.status, task.execution?.queueState, ...(task.execution?.blockedByTaskTitles ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [taskFilter, taskQuery, tasks]);

  const taskIndexById = new Map(filteredTasks.map((task, index) => [task.id, index]));
  const activeCount = tasks.filter((task) => task.status === "pending" || task.status === "running" || task.status === "blocked").length;
  const completedCount = tasks.filter((task) => task.status === "done").length;

  if (selectedTask && selectedConversation) {
    return (
      <TaskAgentDetailPanel
        conversationState={selectedConversationState}
        selectedConversation={selectedConversation}
        selectedTask={selectedTask}
        agentGuidances={agentGuidances}
        onBack={() => onSelectTask(undefined)}
        onSubmitAgentGuidance={onSubmitAgentGuidance}
        onSteerAgentRun={onSteerAgentRun}
        backLabel="Back to Tasks"
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#020617] h-full overflow-hidden text-gray-200">
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-4 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          {!isLeftSidebarOpen && <Button data-testid="conversation-shell-sidebar-toggle" variant="ghost" size="icon" onClick={onToggleLeftSidebar}><PanelLeftOpen className="h-5 w-5" /></Button>}
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2"><ListTodo className="h-5 w-5 text-cyan-400" />Tasks</h1>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-[#111827] border-gray-800 p-5 h-fit">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-100">Queue task</h2>
                <p className="text-sm text-gray-400 mt-1">Add a bounded task to the shared Pinchy backlog.</p>
              </div>
              <div className="space-y-3">
                <Input data-testid="tasks-queue-title-input" placeholder="Task title" value={queueTaskTitle} onChange={(event) => setQueueTaskTitle(event.target.value)} className="bg-[#0f172a] border-gray-700" />
                <Textarea data-testid="tasks-queue-prompt-input" placeholder="Task prompt" rows={6} value={queueTaskPrompt} onChange={(event) => setQueueTaskPrompt(event.target.value)} className="bg-[#0f172a] border-gray-700 resize-y" />
                <Button
                  data-testid="tasks-queue-submit"
                  className="w-full bg-cyan-600 hover:bg-cyan-700"
                  disabled={!queueTaskTitle.trim() || !queueTaskPrompt.trim()}
                  onClick={() => void onQueueTask({ title: queueTaskTitle, prompt: queueTaskPrompt })}
                >
                  Queue task
                </Button>
              </div>
            </Card>

            <Card className="bg-[#111827] border-gray-800 p-5 h-fit lg:col-span-2">
              <div className="flex flex-col gap-4 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-100">Task backlog</h2>
                    <p className="text-sm text-gray-400 mt-1">Reorder queued work, inspect blockers, clear completed history, delete stale tasks, and drill into linked worker progress.</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge className="bg-cyan-700/70 text-cyan-100">{activeCount} active</Badge>
                    <Badge className="bg-emerald-700/70 text-emerald-100">{completedCount} completed</Badge>
                    <Button
                      data-testid="tasks-clear-completed"
                      variant="outline"
                      className="border-gray-700 text-gray-200"
                      disabled={completedCount === 0}
                      onClick={() => void onClearCompletedTasks()}
                    >
                      Remove completed
                    </Button>
                    <Input data-testid="tasks-search" placeholder="Filter tasks" value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} className="bg-[#0f172a] border-gray-700 w-full sm:w-[220px]" />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {TASK_FILTERS.map((filter) => {
                    const selected = taskFilter === filter;
                    return (
                      <Button
                        key={filter}
                        data-testid={`tasks-status-filter-${filter}`}
                        variant={selected ? "default" : "outline"}
                        className={selected ? "bg-cyan-600 hover:bg-cyan-700 text-white" : "border-gray-700 text-gray-300"}
                        onClick={() => setTaskFilter(filter)}
                      >
                        {filter === "all" ? "All" : filter}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 max-h-[640px] overflow-y-auto pr-2">
                {filteredTasks.length === 0 ? <p className="text-gray-400 text-sm">No tasks matched this filter.</p> : filteredTasks.map((task) => {
                  const index = taskIndexById.get(task.id) ?? 0;
                  const isFirst = index === 0;
                  const isLast = index === filteredTasks.length - 1;
                  const canInspect = Boolean(task.conversationId);
                  return (
                    <div key={task.id} className="bg-[#0b1220] rounded-xl p-4 border border-gray-800">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-bold text-gray-100">{task.title}</div>
                            <TaskStatusBadge task={task} />
                            {task.execution?.queueState ? <Badge variant="outline" className="text-xs border-gray-700 text-gray-300">{task.execution.queueState}</Badge> : null}
                          </div>
                          <div className="text-sm text-gray-400 mt-2 whitespace-pre-wrap break-words">{task.prompt}</div>
                          <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
                            <span>updated {new Date(task.updatedAt).toLocaleString()}</span>
                            {task.execution?.blockedByTaskTitles && task.execution.blockedByTaskTitles.length > 0 ? <span>blocked by {task.execution.blockedByTaskTitles.join(", ")}</span> : null}
                            {task.execution?.linkedRunStatus ? <span>run {task.execution.linkedRunStatus}</span> : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <Button
                            data-testid={`task-inspect-${task.id}`}
                            variant="outline"
                            className="border-gray-700 text-gray-200"
                            disabled={!canInspect}
                            onClick={() => onSelectTask(task)}
                          >
                            <Eye className="h-4 w-4 mr-2" />Inspect progress
                          </Button>
                          <Button data-testid={`task-move-top-${task.id}`} variant="outline" size="icon" className="h-8 w-8 border-gray-700 text-gray-300" disabled={isFirst} onClick={() => void onReprioritizeTask({ taskId: task.id, direction: "top" })}>
                            <ArrowBigUp className="h-4 w-4" />
                          </Button>
                          <Button data-testid={`task-move-up-${task.id}`} variant="outline" size="icon" className="h-8 w-8 border-gray-700 text-gray-300" disabled={isFirst} onClick={() => void onReprioritizeTask({ taskId: task.id, direction: "up" })}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button data-testid={`task-move-down-${task.id}`} variant="outline" size="icon" className="h-8 w-8 border-gray-700 text-gray-300" disabled={isLast} onClick={() => void onReprioritizeTask({ taskId: task.id, direction: "down" })}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button data-testid={`task-move-bottom-${task.id}`} variant="outline" size="icon" className="h-8 w-8 border-gray-700 text-gray-300" disabled={isLast} onClick={() => void onReprioritizeTask({ taskId: task.id, direction: "bottom" })}>
                            <ArrowBigDown className="h-4 w-4" />
                          </Button>
                          <Button data-testid={`task-delete-${task.id}`} variant="destructive" size="icon" className="h-8 w-8 bg-red-900/30 text-red-300 hover:bg-red-900/60 border border-red-900/50" onClick={() => void onDeleteTask(task.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export function TasksPage() {
  const context = useOutletContext<RootLayoutContext>();
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined);
  const [selectedConversationState, setSelectedConversationState] = useState<ConversationState | undefined>(undefined);
  const selectedTask = context.tasks.find((task) => task.id === selectedTaskId);
  const selectedConversation = context.conversations.find((conversation) => conversation.id === selectedTask?.conversationId);

  useEffect(() => {
    let cancelled = false;

    if (!selectedTask?.conversationId) {
      setSelectedConversationState(undefined);
      return;
    }

    void fetchConversationState(selectedTask.conversationId)
      .then((state) => {
        if (!cancelled) {
          setSelectedConversationState(state);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedConversationState(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTask?.conversationId]);

  return (
    <TasksPageContent
      {...context}
      selectedTask={selectedTask}
      selectedConversation={selectedConversation}
      selectedConversationState={selectedConversationState}
      onSelectTask={(task) => {
        setSelectedTaskId(task?.id);
        if (!task) {
          setSelectedConversationState(undefined);
        }
      }}
    />
  );
}
