import { MessageSquarePlus, Trash2, PanelLeftClose, Settings, Activity, MessageSquare, LayoutDashboard, BrainCircuit, Wrench, ListTodo } from "lucide-react";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { cn } from "./ui/utils.js";
import { useNavigate } from "react-router";
import type { Conversation } from "../../../../../packages/shared/src/contracts.js";
import { firstVisibleRecentChat, shouldHideFromRecentChats } from "../../recent-chat-filter.js";

interface ConversationSidebarProps {
  conversations: Conversation[];
  selectedConversationId?: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => Promise<void>;
  onNewConversation: () => void;
  activePath: string;
}

function renderConversationStatusBubble(conversation: Conversation) {
  if (conversation.attentionStatus === "needs_reply") {
    return <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">Reply needed</span>;
  }
  if (conversation.attentionStatus === "needs_approval") {
    return <span className="inline-flex items-center rounded-full border border-fuchsia-400/30 bg-fuchsia-400/15 px-1.5 py-0.5 text-[10px] font-medium text-fuchsia-200">Approval needed</span>;
  }
  if (conversation.attentionStatus === "working" || conversation.hasActiveRun) {
    return <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">Working</span>;
  }
  return null;
}

export function resolveConversationsNavTarget(conversations: Conversation[]) {
  const visibleConversation = firstVisibleRecentChat(conversations);
  return visibleConversation ? `/c/${visibleConversation.id}` : "/";
}

export function ConversationSidebar({
  conversations,
  selectedConversationId,
  isOpen,
  onToggle,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  activePath,
}: ConversationSidebarProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div className="w-72 flex flex-col bg-[#020617] border-r border-[#1e293b] shrink-0 h-full">
      <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center border border-blue-500/30 shadow-sm">
            <span className="text-blue-400 font-bold text-lg leading-none">🦞</span>
          </div>
          <div>
            <h2 className="font-semibold text-gray-100 leading-none mb-1">Pinchy</h2>
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider leading-none">Control Plane</p>
          </div>
        </div>
        <Button data-testid="conversation-shell-sidebar-toggle" variant="ghost" size="icon" onClick={onToggle} className="text-gray-400 hover:text-gray-100 h-8 w-8">
          <PanelLeftClose className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[#1e293b]">
          <Button data-testid="conversation-create" className="w-full justify-start gap-3 rounded-lg h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm" onClick={onNewConversation}>
            <MessageSquarePlus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        <div className="p-3 space-y-1 border-b border-[#1e293b]">
          <Button data-testid="nav-page-overview" variant="ghost" className={cn("w-full justify-start gap-3 rounded-lg h-9 text-sm", activePath === "/overview" ? "bg-[#1e293b] text-gray-100 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-[#0f172a]")} onClick={() => navigate("/overview")}><LayoutDashboard className="h-4 w-4" />Overview</Button>
          <Button data-testid="nav-page-conversations" variant="ghost" className={cn("w-full justify-start gap-3 rounded-lg h-9 text-sm", activePath === "/" || activePath.startsWith("/c/") ? "bg-[#1e293b] text-gray-100 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-[#0f172a]")} onClick={() => navigate(resolveConversationsNavTarget(conversations))}><MessageSquare className="h-4 w-4" />Conversations</Button>
          <Button data-testid="nav-page-memory" variant="ghost" className={cn("w-full justify-start gap-3 rounded-lg h-9 text-sm", activePath === "/memory" ? "bg-[#1e293b] text-gray-100 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-[#0f172a]")} onClick={() => navigate("/memory")}><BrainCircuit className="h-4 w-4" />Memory</Button>
          <Button data-testid="nav-page-operations" variant="ghost" className={cn("w-full justify-start gap-3 rounded-lg h-9 text-sm", activePath === "/operations" ? "bg-[#1e293b] text-gray-100 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-[#0f172a]")} onClick={() => navigate("/operations")}><Activity className="h-4 w-4" />Operations</Button>
          <Button data-testid="nav-page-tools" variant="ghost" className={cn("w-full justify-start gap-3 rounded-lg h-9 text-sm", activePath === "/tools" ? "bg-[#1e293b] text-gray-100 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-[#0f172a]")} onClick={() => navigate("/tools")}><Wrench className="h-4 w-4" />Tools</Button>
          <Button data-testid="nav-page-tasks" variant="ghost" className={cn("w-full justify-start gap-3 rounded-lg h-9 text-sm", activePath === "/tasks" ? "bg-[#1e293b] text-gray-100 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-[#0f172a]")} onClick={() => navigate("/tasks")}><ListTodo className="h-4 w-4" />Tasks</Button>
          <Button data-testid="nav-page-settings" variant="ghost" className={cn("w-full justify-start gap-3 rounded-lg h-9 text-sm", activePath === "/settings" ? "bg-[#1e293b] text-gray-100 font-medium" : "text-gray-400 hover:text-gray-200 hover:bg-[#0f172a]")} onClick={() => navigate("/settings")}><Settings className="h-4 w-4" />Settings</Button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col pt-2">
          <div className="px-4 py-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Chats</h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-3 pb-4 space-y-1">
              {conversations.filter((conversation) => !shouldHideFromRecentChats(conversation)).map((conversation) => (
                <div key={conversation.id} className={cn("group relative rounded-lg p-2.5 cursor-pointer transition-all hover:bg-[#0f172a] border border-transparent", selectedConversationId === conversation.id && "bg-[#1e293b] text-gray-100 border-[#334155] shadow-sm hover:bg-[#1e293b]")} onClick={() => onSelectConversation(conversation.id)}>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className={cn("text-sm font-medium line-clamp-2 leading-tight", selectedConversationId !== conversation.id && "text-gray-300")}>{conversation.title || "New Conversation"}</h4>
                        <div className="mt-1 flex items-center gap-1.5">
                          {renderConversationStatusBubble(conversation)}
                          {(conversation.pendingQuestionCount ?? 0) > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950">{conversation.pendingQuestionCount}</span> : null}
                        </div>
                      </div>
                      <Button data-testid={`conversation-delete-${conversation.id}`} variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 -mr-1 -mt-1" onClick={(event) => { event.stopPropagation(); void onDeleteConversation(conversation.id); }}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400 hover:text-red-300" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate">{new Date(conversation.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
