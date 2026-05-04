import { useMemo, useState } from "react";
import { ArrowLeft, Bot } from "lucide-react";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Textarea } from "./ui/textarea.js";
import { cn } from "./ui/utils.js";
import { buildAgentSessionState, buildTaskStatusPresentation, buildTranscriptMessagePresentation } from "../../dashboard-model.js";
import type { AgentGuidance, Conversation, Message, PinchyTask } from "../../../../../packages/shared/src/contracts.js";
import type { ConversationState } from "../pinchy-dashboard-client.js";

type TaskAgentDetailPanelProps = {
  conversationState?: ConversationState;
  selectedConversation?: Conversation;
  selectedTask?: PinchyTask;
  agentGuidances: AgentGuidance[];
  onBack: () => void;
  onSubmitAgentGuidance: (input: { conversationId: string; taskId: string; runId?: string; content: string }) => Promise<void>;
  onSteerAgentRun: (input: { conversationId: string; runId?: string; content: string }) => Promise<void>;
  backLabel?: string;
};

export function TaskAgentDetailPanel({
  conversationState,
  selectedConversation,
  selectedTask,
  agentGuidances,
  onBack,
  onSubmitAgentGuidance,
  onSteerAgentRun,
  backLabel = "Back",
}: TaskAgentDetailPanelProps) {
  const [guidanceInput, setGuidanceInput] = useState("");
  const [steerInput, setSteerInput] = useState("");
  const [isSubmittingGuidance, setIsSubmittingGuidance] = useState(false);
  const [isSteering, setIsSteering] = useState(false);

  const session = buildAgentSessionState({
    conversationId: selectedConversation?.id ?? conversationState?.conversation.id ?? "",
    selectedTaskId: selectedTask?.id,
    tasks: selectedTask ? [selectedTask] : [],
    messages: conversationState?.messages ?? [],
  });

  const scopedGuidance = useMemo(
    () => agentGuidances.filter((guidance) => guidance.taskId === selectedTask?.id),
    [agentGuidances, selectedTask?.id],
  );

  if (session.mode !== "agent" || !session.agent || !selectedConversation || !selectedTask) {
    return null;
  }

  const linkedRunId = session.agent.runId;
  const canSubmitGuidance = Boolean(linkedRunId) && selectedTask.status !== "done" && guidanceInput.trim().length > 0 && !isSubmittingGuidance;
  const canSteer = Boolean(linkedRunId) && selectedTask.status !== "done" && steerInput.trim().length > 0 && !isSteering;

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-[#020617] h-full overflow-hidden text-gray-200">
      <div className="h-14 border-b border-gray-800/50 flex items-center justify-between px-4 shrink-0 bg-[#020617]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-gray-400 hover:text-gray-100" data-testid="task-progress-back-button">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 flex-col">
            <div className="text-[10px] uppercase tracking-wider text-cyan-400">Worker task</div>
            <h1 className="font-semibold text-gray-100 text-sm break-words">{session.agent.title}</h1>
            <div className="text-[11px] text-gray-500">{backLabel}</div>
          </div>
        </div>
        <TaskStatusBadge task={selectedTask} />
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="w-full flex flex-col pb-6 pt-4">
          <div className="max-w-3xl mx-auto w-full px-4 space-y-6">
            <div className="rounded-2xl border border-cyan-900/40 bg-[#0b1220] p-4">
              <div className="flex items-center gap-2 text-cyan-300 text-sm font-medium">
                <Bot className="h-4 w-4" />
                Scoped task
              </div>
              <div className="mt-2 text-lg font-semibold text-gray-100 break-words">{session.agent.title}</div>
              <div className="mt-2 text-sm text-gray-400 break-words whitespace-pre-wrap">{session.agent.prompt}</div>
              {session.agent.latestUpdate ? <div className="mt-3 rounded-lg border border-gray-800 bg-[#111827] p-3 text-sm text-gray-300 break-words whitespace-pre-wrap">{session.agent.latestUpdate}</div> : null}
              <TaskExecutionDiagnostics task={selectedTask} />
            </div>

            <div className="rounded-2xl border border-gray-800 bg-[#0f172a] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-100">Guidance queue</div>
                  <div className="text-xs text-gray-500">Pending guidance is applied at the next safe worker checkpoint for this task.</div>
                </div>
                <Badge variant="outline" className="border-cyan-800 text-cyan-300">{scopedGuidance.length} item(s)</Badge>
              </div>
              {scopedGuidance.length === 0 ? (
                <div className="text-sm text-gray-500">No scoped guidance yet.</div>
              ) : (
                <div className="space-y-2">
                  {scopedGuidance.map((guidance) => <GuidanceBubble key={guidance.id} guidance={guidance} />)}
                </div>
              )}
            </div>

            {session.agent.transcript.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-800 bg-[#0f172a] p-6 text-sm text-gray-400" data-testid="task-progress-empty-transcript">
                This task has not produced scoped output yet. Once its linked run starts writing messages, they will appear here.
              </div>
            ) : (
              <div className="space-y-3" data-testid="task-progress-transcript">
                {session.agent.transcript.map((message) => <TaskAgentMessageBubble key={message.id} message={message} />)}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="relative z-10 p-4 pb-6 bg-gradient-to-t from-[#020617] via-[#020617] to-transparent shrink-0 border-t border-gray-800/40">
        <div className="max-w-3xl mx-auto space-y-3">
          {!linkedRunId ? (
            <div className="rounded-2xl border border-dashed border-gray-800 bg-[#0f172a] px-4 py-3 text-sm text-gray-400" data-testid="task-progress-no-live-run">
              This task has not been assigned a live run yet. Steering is available once the worker links it to a run.
            </div>
          ) : selectedTask.status === "done" ? (
            <div className="rounded-2xl border border-dashed border-gray-800 bg-[#0f172a] px-4 py-3 text-sm text-gray-400">
              This task is finished. Its scoped thread remains inspectable, but live steering is disabled because the task has ended.
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-[#1e293b] bg-[#0f172a] shadow-lg p-3" data-testid="task-progress-steer-panel">
                <div className="px-3 pt-1 text-xs text-gray-500">Live steering for the linked run.</div>
                <Textarea
                  data-testid="task-progress-steer-input"
                  value={steerInput}
                  onChange={(event) => setSteerInput(event.target.value)}
                  placeholder="Steer the active run now..."
                  className="min-h-[68px] max-h-[200px] bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-3 w-full text-gray-200 resize-none shadow-none text-[15px]"
                />
                <div className="flex items-center justify-between px-2 pt-2 gap-3">
                  <div className="text-xs text-gray-500">Sent directly to the linked run for this task.</div>
                  <Button
                    data-testid="task-progress-steer-submit"
                    disabled={!canSteer}
                    onClick={async () => {
                      if (!linkedRunId || !steerInput.trim()) return;
                      setIsSteering(true);
                      try {
                        await onSteerAgentRun({
                          conversationId: selectedConversation.id,
                          runId: linkedRunId,
                          content: steerInput.trim(),
                        });
                        setSteerInput("");
                      } finally {
                        setIsSteering(false);
                      }
                    }}
                  >
                    Steer run
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-[#1e293b] bg-[#0f172a] shadow-lg p-3">
                <Textarea
                  data-testid="task-progress-guidance-input"
                  value={guidanceInput}
                  onChange={(event) => setGuidanceInput(event.target.value)}
                  placeholder="Queue scoped guidance for the next checkpoint..."
                  className="min-h-[68px] max-h-[200px] bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-3 w-full text-gray-200 resize-none shadow-none text-[15px]"
                />
                <div className="flex items-center justify-between px-2 pt-2 gap-3">
                  <div className="text-xs text-gray-500">Scoped to this task only. Applied at the next safe checkpoint.</div>
                  <Button
                    data-testid="task-progress-guidance-submit"
                    disabled={!canSubmitGuidance}
                    onClick={async () => {
                      if (!guidanceInput.trim() || !linkedRunId) return;
                      setIsSubmittingGuidance(true);
                      try {
                        await onSubmitAgentGuidance({
                          conversationId: selectedConversation.id,
                          taskId: selectedTask.id,
                          runId: linkedRunId,
                          content: guidanceInput.trim(),
                        });
                        setGuidanceInput("");
                      } finally {
                        setIsSubmittingGuidance(false);
                      }
                    }}
                  >
                    Send guidance
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskExecutionDiagnostics({ task }: { task: PinchyTask }) {
  const rows = [
    task.execution?.linkedRunStatus ? { label: "Run status", value: task.execution.linkedRunStatus } : undefined,
    typeof task.execution?.workerPid === "number" ? { label: "Worker PID", value: String(task.execution.workerPid) } : undefined,
    task.execution?.workerStatus ? { label: "Worker", value: task.execution.workerStatus } : undefined,
    task.execution?.blockedByTaskTitles && task.execution.blockedByTaskTitles.length > 0
      ? { label: "Waiting on", value: task.execution.blockedByTaskTitles.join(", ") }
      : undefined,
    task.execution?.sessionPath ? { label: "Pi session", value: task.execution.sessionPath } : undefined,
  ].filter((row): row is { label: string; value: string } => Boolean(row));

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-800 bg-[#111827] p-3 text-xs text-gray-400" data-testid="task-progress-diagnostics">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-gray-500">Execution diagnostics</div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="break-words"><span className="text-gray-500">{row.label}:</span> <span className="text-gray-300">{row.value}</span></div>
        ))}
      </div>
    </div>
  );
}

function GuidanceBubble({ guidance }: { guidance: AgentGuidance }) {
  const tone = guidance.status === "applied"
    ? "border-green-800/60 bg-green-950/20"
    : guidance.status === "cancelled"
      ? "border-gray-800 bg-gray-900/40"
      : "border-cyan-800/60 bg-cyan-950/20";

  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wider text-gray-500">Guidance</div>
        <Badge variant="outline" className="text-[11px] capitalize">{guidance.status}</Badge>
      </div>
      <div className="mt-2 text-sm text-gray-200 whitespace-pre-wrap break-words">{guidance.content}</div>
      <div className="mt-2 text-[11px] text-gray-500">Queued {new Date(guidance.createdAt).toLocaleString()}{guidance.appliedAt ? ` • Applied ${new Date(guidance.appliedAt).toLocaleString()}` : ""}</div>
    </div>
  );
}

function TaskAgentMessageBubble({ message }: { message: Message }) {
  const presentation = buildTranscriptMessagePresentation(message);

  return (
    <div className={cn("flex w-full gap-4", presentation.align === "end" ? "justify-end" : "justify-start")}>
      {presentation.align !== "end" && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold mt-1 bg-[#1e293b] border border-[#334155]">
          <span className="text-gray-100 text-sm leading-none">🦞</span>
        </div>
      )}
      <div className={cn("flex flex-col", presentation.align === "end" ? "items-end max-w-[80%]" : "items-start max-w-[88%]")}>
        <div
          className={cn(
            "text-[15px] leading-relaxed whitespace-pre-wrap break-words",
            presentation.align === "end"
              ? "bg-[#2563eb] text-white rounded-3xl rounded-tr-md px-5 py-3 shadow-sm"
              : presentation.surfaceTone === "agent-inline"
                ? "bg-transparent text-gray-200 px-0 py-1"
                : "rounded-2xl border px-4 py-3 text-gray-200 shadow-sm",
          )}
          style={presentation.surfaceTone === "agent-inline" ? undefined : { background: presentation.background, borderColor: presentation.borderColor, boxShadow: presentation.shadow }}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function TaskStatusBadge({ task }: { task: Pick<PinchyTask, "status" | "execution"> }) {
  const presentation = buildTaskStatusPresentation(task);
  const tone = presentation.tone === "running"
    ? "bg-cyan-900/50 text-cyan-300 border-cyan-600"
    : presentation.tone === "done"
      ? "bg-green-900/50 text-green-300 border-green-600"
      : presentation.tone === "blocked"
        ? "bg-orange-900/50 text-orange-300 border-orange-600"
        : "bg-gray-700 text-gray-300 border-gray-600";

  return <Badge variant="outline" className={`text-xs border` + ` ${tone}`}>{presentation.label}</Badge>;
}
