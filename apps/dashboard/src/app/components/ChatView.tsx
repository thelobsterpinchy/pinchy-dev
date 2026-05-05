import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, MessageSquareReply, PanelLeftOpen, PanelRightOpen, Send, Square, Workflow } from "lucide-react";
import { Button } from "./ui/button.js";
import { Textarea } from "./ui/textarea.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Badge } from "./ui/badge.js";
import { cn } from "./ui/utils.js";
import { buildConversationRunActivityListState, buildConversationThinkingState, buildConversationTranscriptState, buildOrchestrationHomeState, buildTranscriptMessagePresentation, decideTranscriptFollowUp } from "../../dashboard-model.js";
import type { RootLayoutContext } from "../types.js";
import type { Message, Run } from "../../../../../packages/shared/src/contracts.js";

export function scrollTranscriptViewportToBottom(viewport: Pick<HTMLDivElement, "scrollTop" | "scrollHeight">) {
  viewport.scrollTop = viewport.scrollHeight;
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  }
}

export function ChatView({
  conversationState,
  selectedConversation,
  onSendMessage,
  isLoading,
  state,
  tasks,
  onReplyToQuestion,
  onCancelRun,
  onSelectAgentTask,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  isLeftSidebarOpen,
  isRightSidebarOpen,
}: Pick<RootLayoutContext, "conversationState" | "selectedConversation" | "onSendMessage" | "isLoading" | "onToggleLeftSidebar" | "onToggleRightSidebar" | "isLeftSidebarOpen" | "isRightSidebarOpen"> & Partial<Pick<RootLayoutContext, "state" | "tasks" | "onReplyToQuestion" | "onCancelRun" | "onSelectAgentTask">>) {
  const [input, setInput] = useState("");
  const [questionReply, setQuestionReply] = useState("");
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [thinkingNow, setThinkingNow] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousTranscriptRef = useRef<{
    conversationId?: string;
    messageCount: number;
    latestMessageId?: string;
    latestMessageContent?: string;
  } | null>(null);
  const messages = conversationState?.messages || [];
  const runs = conversationState?.runs ?? [];
  const visibleMessages = useMemo(() => selectVisibleTranscriptMessages(messages, runs), [messages, runs]);
  const transcriptState = buildConversationTranscriptState({
    messages: visibleMessages,
    runs,
    hasUnreadLatestMessages: false,
  });
  const thinkingState = buildConversationThinkingState({
    runs,
    messages,
    now: thinkingNow,
  });
  const runActivityState = buildConversationRunActivityListState({
    runActivities: conversationState?.runActivities ?? [],
  });
  const orchestrationHomeState = buildOrchestrationHomeState({
    conversationState,
    dashboardState: state,
    tasks,
    now: thinkingNow,
  });

  useEffect(() => {
    if (!thinkingState.visible) {
      return;
    }
    const interval = window.setInterval(() => {
      setThinkingNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [thinkingState.visible, selectedConversation?.id]);

  useEffect(() => {
    setThinkingExpanded(false);
  }, [selectedConversation?.id, thinkingState.runId]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLDivElement>("[data-slot='scroll-area-viewport']");
    if (!viewport) {
      return;
    }

    const latestMessage = visibleMessages.at(-1);
    const nextTranscript = {
      conversationId: selectedConversation?.id,
      messageCount: visibleMessages.length,
      latestMessageId: latestMessage?.id,
      latestMessageContent: latestMessage?.content,
    };
    const previousTranscript = previousTranscriptRef.current;

    if (!previousTranscript) {
      if (visibleMessages.length > 0) {
        scrollTranscriptViewportToBottom(viewport);
      }
      previousTranscriptRef.current = nextTranscript;
      return;
    }

    const changedConversation = previousTranscript.conversationId !== nextTranscript.conversationId;
    if (changedConversation) {
      scrollTranscriptViewportToBottom(viewport);
      previousTranscriptRef.current = nextTranscript;
      return;
    }

    const followUp = decideTranscriptFollowUp({
      changedConversation,
      messageCountChanged: previousTranscript.messageCount !== nextTranscript.messageCount,
      latestMessageChanged:
        previousTranscript.latestMessageId !== nextTranscript.latestMessageId ||
        previousTranscript.latestMessageContent !== nextTranscript.latestMessageContent,
      isNearBottom: viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 48,
      hadMessagesBefore: previousTranscript.messageCount > 0,
    });

    if (followUp.shouldScrollToBottom) {
      scrollTranscriptViewportToBottom(viewport);
    }

    previousTranscriptRef.current = nextTranscript;
  }, [selectedConversation?.id, visibleMessages]);

  const handleSubmit = () => {
    if (input.trim() && !isLoading) {
      void onSendMessage(input.trim());
      setInput("");
    }
  };
  const handleQuestionReply = () => {
    if (!orchestrationHomeState.pendingQuestion || !questionReply.trim() || !onReplyToQuestion) {
      return;
    }
    void onReplyToQuestion({
      questionId: orchestrationHomeState.pendingQuestion.id,
      content: questionReply.trim(),
    });
    setQuestionReply("");
  };

  const title = selectedConversation?.title || "New Session";
  const statusLabel = selectedConversation?.status || "idle";
  const showThinkingIndicator = isLoading || transcriptState.showTypingIndicator;
  const showEmptyOnboarding = visibleMessages.length === 0 && !showThinkingIndicator;

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-[#020617] h-full overflow-hidden text-gray-200">
      <div className="h-14 border-b border-gray-800/50 flex items-center justify-between px-4 shrink-0 bg-[#020617]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {!isLeftSidebarOpen && (
            <Button data-testid="conversation-shell-sidebar-toggle" variant="ghost" size="icon" onClick={onToggleLeftSidebar} className="text-gray-400 hover:text-gray-100">
              <PanelLeftOpen className="h-5 w-5" />
            </Button>
          )}
          <div className="flex flex-col">
            <h1 className="font-semibold text-gray-100 text-sm">{title}</h1>
            {statusLabel !== "idle" && <span className="text-[10px] text-gray-500 uppercase tracking-wider">{statusLabel}</span>}
          </div>
        </div>
        {!isRightSidebarOpen && (
          <Button data-testid="conversation-shell-utility-toggle" variant="ghost" size="icon" onClick={onToggleRightSidebar} className="text-gray-400 hover:text-gray-100">
            <PanelRightOpen className="h-5 w-5" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
        <div className="w-full flex flex-col pb-6 pt-4">
          <div className="max-w-3xl mx-auto w-full px-4 space-y-6">
            <OrchestrationHome
              state={orchestrationHomeState}
              questionReply={questionReply}
              onQuestionReplyChange={setQuestionReply}
              onSubmitQuestionReply={handleQuestionReply}
              onCancelRun={onCancelRun}
              onSelectAgentTask={onSelectAgentTask}
            />

            {!showEmptyOnboarding && (
              visibleMessages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}

            {showThinkingIndicator && (
              <div className="flex gap-4 items-start pb-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-bold shadow-sm">
                  <span className="text-blue-400 text-sm leading-none">🦞</span>
                </div>
                <div className="flex-1 mt-1.5">
                  {thinkingState.visible ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        data-testid="conversation-thinking-toggle"
                        onClick={() => setThinkingExpanded((value) => !value)}
                        className="inline-flex items-center gap-2 rounded-full border border-[#273244] bg-[#0f172a] px-3 py-2 text-sm text-gray-400 transition-colors hover:border-[#334155] hover:text-gray-300"
                      >
                        {thinkingExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span>{thinkingState.label}</span>
                      </button>
                      {thinkingExpanded && (
                        <div className="space-y-2">
                          <div className="rounded-2xl border border-[#1e293b] bg-[#0b1220] px-4 py-3 text-sm text-gray-400">
                            <div className="space-y-1 whitespace-pre-wrap break-words">
                              {thinkingState.details.map((detail) => (
                                <div key={detail}>{detail}</div>
                              ))}
                            </div>
                          </div>
                          {runActivityState.activities.map((activity) => (
                            <ToolActivityDisclosure key={activity.id} label={activity.label} details={activity.details} />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0f172a] border border-[#1e293b] px-3 py-2">
                      <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="relative z-10 p-4 pb-6 bg-gradient-to-t from-[#020617] via-[#020617] to-transparent shrink-0 border-t border-gray-800/40">
        <div className="max-w-3xl mx-auto">
          <div className="relative border border-[#1e293b] rounded-3xl bg-[#0f172a] shadow-lg focus-within:border-[#334155] focus-within:bg-[#0f172a] transition-all">
            <Textarea
              data-testid="conversation-composer-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Control the autonomous Pinchy thread..."
              className="min-h-[52px] max-h-[200px] bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-4 w-full text-gray-200 resize-none shadow-none text-[15px]"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div className="flex justify-between items-center px-4 pb-3">
              <div className="text-xs text-gray-500 pl-1 hidden sm:inline-block">Guide the running thread or queue the next objective</div>
              <Button data-testid="conversation-composer-submit" onClick={handleSubmit} disabled={!input.trim() || isLoading} size="icon" className={cn("h-8 w-8 rounded-full transition-all", input.trim() && !isLoading ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm" : "bg-[#1e293b] text-gray-500 hover:bg-[#1e293b]")}>
                <Send className="h-4 w-4 ml-0.5" />
              </Button>
            </div>
          </div>
          <div className="text-center mt-3 pb-1">
            <span className="text-[11px] text-gray-500">Pinchy can make mistakes. Verify important info.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrchestrationHome({
  state,
  questionReply,
  onQuestionReplyChange,
  onSubmitQuestionReply,
  onCancelRun,
  onSelectAgentTask,
}: {
  state: ReturnType<typeof buildOrchestrationHomeState>;
  questionReply: string;
  onQuestionReplyChange: (value: string) => void;
  onSubmitQuestionReply: () => void;
  onCancelRun?: (runId: string) => Promise<void>;
  onSelectAgentTask?: (taskId?: string) => void;
}) {
  return (
    <section className="space-y-3" aria-label="Pinchy operator console">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-100">{state.title}</h2>
          <Badge className={cn(
            "border px-2 py-0.5 text-[10px] uppercase",
            state.attentionLevel === "needs-input" ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : state.attentionLevel === "working" ? "border-blue-500/40 bg-blue-500/10 text-blue-200" : "border-slate-600 bg-slate-900 text-slate-300",
          )}>{state.attentionLevel === "needs-input" ? "needs input" : state.attentionLevel}</Badge>
        </div>
        <p className="text-sm text-gray-400">{state.subtitle}</p>
      </div>

      {state.showOperatorOnboarding && (
        <ConsolePanel title="Always-on home" eyebrow="operator console">
          <p className="text-sm text-gray-300">Start by giving Pinchy an objective. This view will track active work, blockers, remote delivery, delegated execution, and the latest useful result.</p>
        </ConsolePanel>
      )}

      {state.pendingQuestion && (
        <ConsolePanel title="Pinchy needs input" eyebrow={state.pendingQuestion.priorityLabel}>
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-100">{state.pendingQuestion.prompt}</p>
            <div className="flex flex-wrap gap-2">
              {state.pendingQuestion.deliveryChannels.map((channel) => (
                <Badge key={channel.id} className="border border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/10">{channel.label}</Badge>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Textarea
                data-testid="pending-question-reply-input"
                value={questionReply}
                onChange={(event) => onQuestionReplyChange(event.target.value)}
                placeholder="Reply so Pinchy can continue..."
                className="min-h-[72px] flex-1 resize-none border-[#334155] bg-[#0b1220] text-gray-100 focus-visible:ring-blue-500"
              />
              <Button data-testid="pending-question-reply-submit" onClick={onSubmitQuestionReply} disabled={!questionReply.trim()} className="sm:self-end">
                <MessageSquareReply className="mr-2 h-4 w-4" />
                Reply
              </Button>
            </div>
          </div>
        </ConsolePanel>
      )}

      {state.activeRun && (
        <ConsolePanel title="Active run" eyebrow={state.activeRun.statusLabel}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-100">{state.activeRun.goal}</p>
              <p className="text-xs text-gray-500">{state.activeRun.elapsedLabel} • updated {state.activeRun.updatedAt}</p>
            </div>
            {state.activeRun.canCancel && onCancelRun && (
              <Button data-testid="active-run-cancel" variant="outline" size="sm" onClick={() => {
                if (state.activeRun) {
                  void onCancelRun(state.activeRun.id);
                }
              }} className="border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/20 hover:text-red-50">
                <Square className="mr-2 h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
          </div>
        </ConsolePanel>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <ConsolePanel title="Latest result" eyebrow={state.latestResult?.label ?? "waiting"}>
          {state.latestResult ? (
            <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{state.latestResult.content}</p>
          ) : (
            <p className="text-sm text-gray-500">No result has been produced for this thread yet.</p>
          )}
        </ConsolePanel>

        <ConsolePanel title="Remote communication" eyebrow={state.daemonStatus ? `daemon ${state.daemonStatus}` : "delivery"}>
          <div className="space-y-2">
            {state.remoteChannels.map((channel) => (
              <div key={channel.id} className="flex items-start justify-between gap-3 rounded-md border border-[#1e293b] bg-[#0b1220] px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-gray-200">{channel.label}</div>
                  {channel.detail && <div className="text-xs text-gray-500">{channel.detail}</div>}
                </div>
                <Badge className={cn(
                  "border text-[10px]",
                  channel.status === "failed" || channel.status === "unconfigured" ? "border-red-500/30 bg-red-500/10 text-red-100" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
                )}>{channel.statusLabel}</Badge>
              </div>
            ))}
          </div>
        </ConsolePanel>
      </div>

      <ConsolePanel title="Delegated execution" eyebrow={`${state.delegatedExecution.total} linked`}>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            {(["running", "pending", "blocked", "done"] as const).map((status) => (
              <div key={status} className="rounded-md border border-[#1e293b] bg-[#0b1220] px-2 py-2">
                <div className="text-base font-semibold text-gray-100">{state.delegatedExecution.counts[status]}</div>
                <div className="text-[10px] uppercase text-gray-500">{status}</div>
              </div>
            ))}
          </div>
          {state.delegatedExecution.topTasks.length > 0 ? (
            <div className="space-y-2">
              {state.delegatedExecution.topTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  data-testid={`inspect-agent-task-${task.id}`}
                  onClick={() => onSelectAgentTask?.(task.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-[#273244] bg-[#0b1220] px-3 py-2 text-left text-sm transition-colors hover:border-[#3b475b]"
                >
                  <span className="min-w-0 truncate text-gray-200"><Workflow className="mr-2 inline h-4 w-4 text-blue-300" />{task.title}</span>
                  <span className="shrink-0 text-xs text-gray-500">inspect execution</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No active delegated execution for this thread.</p>
          )}
        </div>
      </ConsolePanel>
    </section>
  );
}

function ConsolePanel({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#1e293b] bg-[#07111f] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        <span className="shrink-0 rounded-full border border-[#334155] bg-[#0f172a] px-2 py-0.5 text-[10px] uppercase text-gray-400">{eyebrow}</span>
      </div>
      {children}
    </div>
  );
}

function ToolActivityDisclosure({ label, details }: { label: string; details: string[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex items-center gap-2 rounded-full border border-[#273244] bg-[#0f172a] px-3 py-2 text-sm text-gray-400 transition-colors hover:border-[#334155] hover:text-gray-300"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span>{label}</span>
      </button>
      {expanded && (
        <div className="rounded-2xl border border-[#1e293b] bg-[#0b1220] px-4 py-3 text-sm text-gray-400">
          <div className="space-y-1 whitespace-pre-wrap break-words">
            {details.map((detail) => (
              <div key={detail}>{detail}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const presentation = buildTranscriptMessagePresentation(message);

  return (
    <div className={cn("flex w-full gap-4", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold mt-1 bg-[#1e293b] border border-[#334155]">
          <span className="text-gray-100 text-sm leading-none">🦞</span>
        </div>
      )}

      <div className={cn(
        "flex flex-col max-w-[80%]",
        isUser ? "items-end" : "items-start",
      )}>
        {message.runId && !isUser && (
          <div className="mb-1 px-1">
            <Badge className="bg-slate-800/50 hover:bg-slate-800/50 text-[10px] px-1.5 py-0 text-gray-400">{presentation.roleLabel}</Badge>
          </div>
        )}

        <div className={cn(
          "text-[15px] leading-relaxed break-words px-5 py-3 shadow-sm [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l [&_blockquote]:border-[#334155] [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-black/20 [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_p]:my-0 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:bg-[#0b1220] [&_pre]:px-4 [&_pre]:py-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:space-y-1",
          isUser
            ? "bg-[#2563eb] text-white rounded-3xl rounded-tr-md [&_code]:bg-white/15 [&_pre]:bg-blue-950/60"
            : "bg-transparent text-gray-200 px-0 shadow-none pt-1",
        )}>
          <div dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(message.content) }} />
        </div>
      </div>
    </div>
  );
}

function isPlainHumanFacingAgentMessage(message: Pick<Message, "role" | "kind">) {
  return message.role === "agent" && (message.kind === undefined || message.kind === "default");
}

function selectVisibleTranscriptMessages(messages: Message[], runs: Run[]) {
  const runsById = new Map(runs.map((run) => [run.id, run]));
  const latestAgentMessageIdByRun = new Map<string, string>();
  const latestPlainAgentMessageIdByRun = new Map<string, string>();

  for (const message of messages) {
    if (message.role === "agent" && message.runId) {
      latestAgentMessageIdByRun.set(message.runId, message.id);
      if (isPlainHumanFacingAgentMessage(message)) {
        latestPlainAgentMessageIdByRun.set(message.runId, message.id);
      }
    }
  }

  function hasLaterPlainAgentReplyBeforeNextUser(currentIndex: number) {
    for (let index = currentIndex + 1; index < messages.length; index += 1) {
      const nextMessage = messages[index];
      if (!nextMessage) continue;
      if (nextMessage.role === "user") {
        return false;
      }
      if (isPlainHumanFacingAgentMessage(nextMessage)) {
        return true;
      }
    }
    return false;
  }

  return messages.filter((message, index) => {
    if (message.kind === "orchestration_update" || message.kind === "orchestration_final") {
      return false;
    }

    if (message.role !== "agent" || !message.runId) {
      return true;
    }

    const run = runsById.get(message.runId);
    if (run && run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled") {
      return false;
    }

    if (hasLaterPlainAgentReplyBeforeNextUser(index)) {
      return false;
    }

    const preferredVisibleMessageId = latestPlainAgentMessageIdByRun.get(message.runId)
      ?? latestAgentMessageIdByRun.get(message.runId);

    return preferredVisibleMessageId === message.id;
  });
}

function renderMarkdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(escapeHtml(lines[index] ?? ""));
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test((lines[index] ?? "").trim())) {
        items.push(`<li>${renderInlineMarkdown((lines[index] ?? "").trim().replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? "").trim())) {
        items.push(`<li>${renderInlineMarkdown((lines[index] ?? "").trim().replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith(">")) {
        quoteLines.push(renderInlineMarkdown((lines[index] ?? "").trim().replace(/^>\s?/, "")));
        index += 1;
      }
      blocks.push(`<blockquote>${quoteLines.join("<br />")}</blockquote>`);
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !/^(#{1,6})\s+/.test((lines[index] ?? "").trim()) &&
      !(lines[index] ?? "").trim().startsWith("```") &&
      !/^[-*]\s+/.test((lines[index] ?? "").trim()) &&
      !/^\d+\.\s+/.test((lines[index] ?? "").trim()) &&
      !(lines[index] ?? "").trim().startsWith(">")
    ) {
      paragraphLines.push(renderInlineMarkdown((lines[index] ?? "").trim()));
      index += 1;
    }
    blocks.push(`<p>${paragraphLines.join("<br />")}</p>`);
  }

  return blocks.join("");
}

function renderInlineMarkdown(content: string) {
  const tokens: string[] = [];
  let html = escapeHtml(content).replace(/`([^`]+)`/g, (_, code: string) => {
    const token = `__PINCHY_CODE_${tokens.length}__`;
    tokens.push(`<code>${code}</code>`);
    return token;
  });

  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  return tokens.reduce((result, token, index) => result.replace(`__PINCHY_CODE_${index}__`, token), html);
}

function escapeHtml(content: string) {
  return content
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
