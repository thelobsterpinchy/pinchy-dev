import { PanelRightClose, Bot, HelpCircle, Workflow, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Separator } from "./ui/separator.js";
import { Badge } from "./ui/badge.js";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion.js";
import { buildConversationAgentListState, buildTaskStatusPresentation } from "../../dashboard-model.js";
import type { ConversationState } from "../pinchy-dashboard-client.js";
import type { PinchyTask } from "../../../../../packages/shared/src/contracts.js";

interface DetailsSidebarProps {
  conversationState?: ConversationState;
  tasks: PinchyTask[];
  selectedTaskId?: string;
  onSelectTask: (taskId?: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function DetailsSidebar({
  conversationState,
  tasks,
  selectedTaskId,
  onSelectTask,
  isOpen,
  onToggle,
}: DetailsSidebarProps) {
  const runs = conversationState?.runs || [];
  const questions = conversationState?.questions || [];
  const messages = conversationState?.messages || [];
  const agentState = conversationState
    ? buildConversationAgentListState({
        conversationId: conversationState.conversation.id,
        tasks,
        messages,
      })
    : { agents: [] };

  if (!isOpen) return null;

  return (
    <div className="w-80 min-w-0 min-h-0 flex flex-col bg-gray-950 border-l border-gray-800 h-full overflow-hidden shadow-lg">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-100 leading-none mb-1">Details</h2>
          <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider leading-none">Agents & Workflows</p>
        </div>
        <Button data-testid="conversation-shell-utility-toggle" variant="ghost" size="icon" onClick={onToggle} className="text-gray-400 hover:text-gray-100">
          <PanelRightClose className="h-5 w-5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 min-w-0">
          {!conversationState && <div className="text-center py-8 text-gray-500 text-sm">Select a conversation to view details</div>}

          {conversationState && (
            <div className="space-y-3 min-w-0">
            <Accordion type="multiple" defaultValue={["agents", "questions"]} className="space-y-2 min-w-0">
              <AccordionItem value="agents" className="border border-gray-800 rounded-lg overflow-hidden min-w-0">
                <AccordionTrigger className="px-4 py-3 hover:bg-gray-800/50 min-w-0">
                  <div className="flex w-full min-w-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Bot className="h-4 w-4 shrink-0 text-cyan-400" />
                      <span className="font-medium truncate">Agents</span>
                    </div>
                    <Badge variant="secondary">{agentState.agents.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3 min-w-0">
                  <div className="space-y-2 min-w-0">
                    {agentState.agents.length === 0 && <p className="text-sm text-gray-500">No spawned agents for this conversation yet.</p>}
                    {agentState.agents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        data-testid={`conversation-agent-${agent.id}`}
                        onClick={() => onSelectTask(selectedTaskId === agent.id ? undefined : agent.id)}
                        className={`w-full rounded-lg border p-3 text-left transition ${selectedTaskId === agent.id ? "border-cyan-500 bg-cyan-950/30" : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"}`}
                      >
                        <div className="flex min-w-0 flex-col gap-2">
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium break-words text-gray-100">{agent.title}</p>
                              {agent.latestUpdate ? <p className="mt-1 text-xs text-gray-400 break-words line-clamp-3">{agent.latestUpdate}</p> : <p className="mt-1 text-xs text-gray-500">No agent output yet.</p>}
                              <AgentExecutionSummary agent={agent} />
                            </div>
                            <div className="shrink-0">
                              <TaskStatusBadge task={agent} />
                            </div>
                          </div>
                          {agent.dependencyCount > 0 ? <div className="text-[11px] text-amber-400">Waiting on {agent.dependencyCount} depende{agent.dependencyCount === 1 ? "ncy" : "ncies"}.</div> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="questions" className="border border-gray-800 rounded-lg overflow-hidden min-w-0">
                <AccordionTrigger className="px-4 py-3 hover:bg-gray-800/50 min-w-0">
                  <div className="flex w-full min-w-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <HelpCircle className="h-4 w-4 shrink-0 text-orange-400" />
                      <span className="font-medium truncate">Questions</span>
                    </div>
                    <Badge variant="secondary">{questions.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3">
                  <div className="space-y-2">
                    {questions.length === 0 && <p className="text-sm text-gray-500">No questions</p>}
                    {questions.slice().reverse().map((question) => (
                      <div key={question.id} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                        <p className="text-sm">{question.prompt}</p>
                        <div className="flex items-center gap-2 mt-2"><Badge variant="outline" className="text-xs">{question.priority}</Badge><Badge variant="outline" className="text-xs">{question.status}</Badge></div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="summary" className="border border-gray-800 rounded-lg overflow-hidden min-w-0">
                <AccordionTrigger className="px-4 py-3 hover:bg-gray-800/50 min-w-0">
                  <div className="flex w-full min-w-0 items-center gap-2">
                    <Workflow className="h-4 w-4 shrink-0 text-purple-400" />
                    <span className="font-medium truncate">Summary</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">Messages</span><span className="font-medium">{messages.length}</span></div>
                    <Separator />
                    <div className="flex justify-between"><span className="text-gray-400">Pending Questions</span><span className="font-medium">{questions.filter((question) => question.status === "pending_delivery" || question.status === "waiting_for_human").length}</span></div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function AgentExecutionSummary({ agent }: { agent: ReturnType<typeof buildConversationAgentListState>["agents"][number] }) {
  const lines: string[] = [];
  if (agent.execution?.blockedByTaskTitles && agent.execution.blockedByTaskTitles.length > 0) {
    lines.push(`Waiting on: ${agent.execution.blockedByTaskTitles.join(", ")}`);
  }
  if (agent.execution?.linkedRunStatus) {
    lines.push(`Run: ${agent.execution.linkedRunStatus}`);
  }
  if (typeof agent.execution?.workerPid === "number") {
    lines.push(`Worker PID ${agent.execution.workerPid}`);
  } else if (agent.execution?.workerStatus) {
    lines.push(`Worker: ${agent.execution.workerStatus}`);
  }
  if (agent.execution?.sessionPath) {
    lines.push("Pi session attached");
  }
  if (lines.length === 0) {
    return null;
  }
  return <div className="mt-2 space-y-1 text-[11px] text-gray-500">{lines.map((line) => <div key={line}>{line}</div>)}</div>;
}

function TaskStatusBadge({ task }: { task: Pick<PinchyTask, "status" | "execution"> }) {
  const presentation = buildTaskStatusPresentation(task);
  const config = {
    running: { icon: Clock, label: "Running", className: "bg-cyan-900/50 text-cyan-300 border-cyan-600" },
    pending: { icon: Clock, label: "Queued", className: "bg-gray-700 text-gray-300 border-gray-600" },
    done: { icon: CheckCircle2, label: "Done", className: "bg-green-900/50 text-green-300 border-green-600" },
    blocked: { icon: AlertCircle, label: "Blocked", className: "bg-orange-900/50 text-orange-300 border-orange-600" },
  };

  const item = config[presentation.tone as keyof typeof config] || config.pending;
  const Icon = item.icon;

  return <Badge variant="outline" className={`text-xs border max-w-full whitespace-normal break-words ${item.className}`}><Icon className="h-3 w-3 mr-1 shrink-0" />{presentation.label}</Badge>;
}
