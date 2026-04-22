import { useEffect, useRef, useState } from "react";
import { PanelLeftOpen, PanelRightOpen, Send } from "lucide-react";
import { Button } from "./ui/button.js";
import { Textarea } from "./ui/textarea.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Badge } from "./ui/badge.js";
import { cn } from "./ui/utils.js";
import { buildConversationTranscriptState, decideTranscriptFollowUp } from "../../dashboard-model.js";
import type { RootLayoutContext } from "../types.js";
import type { Message } from "../../../../../packages/shared/src/contracts.js";

export function ChatView({
  conversationState,
  selectedConversation,
  onSendMessage,
  isLoading,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  isLeftSidebarOpen,
  isRightSidebarOpen,
}: Pick<RootLayoutContext, "conversationState" | "selectedConversation" | "onSendMessage" | "isLoading" | "onToggleLeftSidebar" | "onToggleRightSidebar" | "isLeftSidebarOpen" | "isRightSidebarOpen">) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousTranscriptRef = useRef<{
    conversationId?: string;
    messageCount: number;
    latestMessageId?: string;
    latestMessageContent?: string;
  } | null>(null);
  const messages = conversationState?.messages || [];
  const transcriptState = buildConversationTranscriptState({
    messages,
    runs: conversationState?.runs ?? [],
    hasUnreadLatestMessages: false,
  });

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLDivElement>("[data-slot='scroll-area-viewport']");
    if (!viewport) {
      return;
    }

    const latestMessage = messages.at(-1);
    const nextTranscript = {
      conversationId: selectedConversation?.id,
      messageCount: messages.length,
      latestMessageId: latestMessage?.id,
      latestMessageContent: latestMessage?.content,
    };
    const previousTranscript = previousTranscriptRef.current;

    if (!previousTranscript) {
      if (messages.length > 0) {
        viewport.scrollTop = viewport.scrollHeight;
      }
      previousTranscriptRef.current = nextTranscript;
      return;
    }

    const changedConversation = previousTranscript.conversationId !== nextTranscript.conversationId;
    if (changedConversation) {
      viewport.scrollTop = viewport.scrollHeight;
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
    });

    if (followUp.shouldScrollToBottom) {
      viewport.scrollTop = viewport.scrollHeight;
    }

    previousTranscriptRef.current = nextTranscript;
  }, [messages, selectedConversation?.id]);

  const handleSubmit = () => {
    if (input.trim() && !isLoading) {
      void onSendMessage(input.trim());
      setInput("");
    }
  };

  const title = selectedConversation?.title || "New Session";
  const statusLabel = selectedConversation?.status || "idle";

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
            {messages.length === 0 ? (
              <div className="h-[50vh] flex flex-col items-center justify-center text-center opacity-80">
                <div className="w-16 h-16 rounded-3xl bg-[#1e293b] flex items-center justify-center border border-[#334155] shadow-sm mb-6">
                  <span className="text-3xl leading-none">🦞</span>
                </div>
                <h2 className="text-2xl font-semibold text-gray-100 mb-2">How can Pinchy help?</h2>
                <p className="text-[15px] text-gray-400">Send a message to start the conversation.</p>
              </div>
            ) : (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}

            {(isLoading || transcriptState.showTypingIndicator) && (
              <div className="flex gap-4 items-start pb-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-bold shadow-sm">
                  <span className="text-blue-400 text-sm leading-none">🦞</span>
                </div>
                <div className="flex-1 mt-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#0f172a] border border-[#1e293b] px-3 py-2">
                    <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce" />
                  </div>
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
              placeholder="Message Pinchy..."
              className="min-h-[52px] max-h-[200px] bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-4 py-4 w-full text-gray-200 resize-none shadow-none text-[15px]"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div className="flex justify-between items-center px-4 pb-3">
              <div className="text-xs text-gray-500 pl-1 hidden sm:inline-block">Shift + Enter for new line</div>
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

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full gap-4", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold mt-1 bg-[#1e293b] border border-[#334155]">
          <span className="text-gray-100 text-sm leading-none">🦞</span>
        </div>
      )}
      
      <div className={cn(
        "flex flex-col max-w-[80%]",
        isUser ? "items-end" : "items-start"
      )}>
        {message.runId && !isUser && (
          <div className="mb-1 px-1">
            <Badge className="bg-slate-800/50 hover:bg-slate-800/50 text-[10px] px-1.5 py-0 text-gray-400">run</Badge>
          </div>
        )}
        
        <div className={cn(
          "text-[15px] leading-relaxed whitespace-pre-wrap break-words px-5 py-3 shadow-sm",
          isUser 
            ? "bg-[#2563eb] text-white rounded-3xl rounded-tr-md" 
            : "bg-transparent text-gray-200 px-0 shadow-none pt-1"
        )}>
          {message.content}
        </div>
      </div>
    </div>
  );
}
