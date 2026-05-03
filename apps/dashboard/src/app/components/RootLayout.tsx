import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import { ConversationSidebar } from "./ConversationSidebar.js";
import { DetailsSidebar } from "./DetailsSidebar.js";
import { cn } from "./ui/utils.js";
import { resolveConversationRouteAfterRefresh } from "../../dashboard-model.js";
import {
  cancelRun,
  createConversation,
  createMemory,
  deleteConversation,
  deleteMemory,
  deleteWorkspace,
  discoverLocalServerModel,
  fetchConversationState,
  fetchConversations,
  fetchDashboardState,
  fetchDoctorReport,
  fetchSettings,
  queueManualTask,
  registerWorkspace,
  reloadRuntime,
  replyToQuestion,
  setActiveWorkspace,
  steerAgentRun,
  queueAgentFollowUp,
  reprioritizeTask,
  clearCompletedTasks,
  deleteTask,
  submitAgentGuidance,
  submitPromptToConversation,
  updateMemory,
  updateSettings,
} from "../pinchy-dashboard-client.js";
import type { RootLayoutContext } from "../types.js";
import type { Message, SavedMemory } from "../../../../../packages/shared/src/contracts.js";

function buildMemoryDraftFromMessage(message: Message) {
  return {
    title: `${message.role} message`,
    content: message.content,
    kind: "note" as const,
    tags: ["conversation", message.role],
    pinned: false,
  };
}

export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeParams = useParams();
  const agentPathMatch = location.pathname.match(/^\/c\/([^/]+)\/agents\/([^/]+)$/);
  const conversationId = agentPathMatch ? decodeURIComponent(agentPathMatch[1] ?? "") : routeParams.conversationId;
  const taskId = agentPathMatch ? decodeURIComponent(agentPathMatch[2] ?? "") : undefined;

  const [state, setState] = useState<RootLayoutContext["state"]>(null);
  const [doctorReport, setDoctorReport] = useState<RootLayoutContext["doctorReport"]>(null);
  const [settings, setSettings] = useState<RootLayoutContext["settings"]>(null);
  const [conversations, setConversations] = useState<RootLayoutContext["conversations"]>([]);
  const [conversationState, setConversationState] = useState<RootLayoutContext["conversationState"]>(undefined);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [operatorError, setOperatorError] = useState<string | undefined>(undefined);

  const loadShell = useCallback(async () => {
    const [nextState, nextDoctorReport, nextSettings, nextConversations] = await Promise.all([
      fetchDashboardState(),
      fetchDoctorReport(),
      fetchSettings(),
      fetchConversations(),
    ]);
    setState(nextState);
    setDoctorReport(nextDoctorReport);
    setSettings(nextSettings);
    setConversations(nextConversations);
    return { nextState, nextConversations };
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const nextConversationState = await fetchConversationState(id);
    setConversationState(nextConversationState);
    return nextConversationState;
  }, []);

  const selectedAgentTask = useMemo(
    () => state?.tasks.find((task) => task.id === taskId && task.conversationId === conversationId),
    [conversationId, state?.tasks, taskId],
  );

  const refreshAll = useCallback(async () => {
    try {
      const { nextConversations } = await loadShell();
      setOperatorError(undefined);

      const resolvedConversationRoute = resolveConversationRouteAfterRefresh({
        pathname: location.pathname,
        routeConversationId: conversationId,
        availableConversationIds: nextConversations.map((conversation) => conversation.id),
      });

      if (resolvedConversationRoute && resolvedConversationRoute !== location.pathname) {
        navigate(resolvedConversationRoute, { replace: true });
        return;
      }

      if (conversationId) {
        await loadConversation(conversationId);
      } else {
        setConversationState(undefined);
      }
    } catch (error) {
      setOperatorError(error instanceof Error ? error.message : String(error));
    }
  }, [conversationId, loadConversation, loadShell, location.pathname, navigate]);

  useEffect(() => {
    void refreshAll();
    const interval = window.setInterval(() => {
      void refreshAll();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [refreshAll]);

  useEffect(() => {
    if (!conversationId) {
      setConversationState(undefined);
      return;
    }
    void loadConversation(conversationId).catch((error) => {
      setOperatorError(error instanceof Error ? error.message : String(error));
    });
  }, [conversationId]);

  const handleSendMessage = async (prompt: string) => {
    try {
      setIsLoading(true);
      let targetConversationId = conversationId;
      if (!targetConversationId) {
        const created = await createConversation(prompt.slice(0, 50) || "New chat");
        targetConversationId = created.id;
        navigate(`/c/${created.id}`);
      }
      await submitPromptToConversation({ conversationId: targetConversationId, prompt, kind: "user_prompt" });
      await refreshAll();
      if (targetConversationId) {
        await loadConversation(targetConversationId);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    await deleteConversation(id);
    if (conversationId === id) {
      navigate("/");
    }
    await refreshAll();
  };

  const handleSaveMessageToMemory = async (message: Message) => {
    await createMemory(buildMemoryDraftFromMessage(message));
    await refreshAll();
  };

  const context: RootLayoutContext = {
    state,
    doctorReport,
    settings,
    conversations,
    conversationState,
    selectedConversation: conversations.find((entry) => entry.id === conversationId),
    selectedAgentTask,
    isLoading,
    isLeftSidebarOpen,
    isRightSidebarOpen,
    operatorError,
    onToggleLeftSidebar: () => setIsLeftSidebarOpen((current) => !current),
    onToggleRightSidebar: () => setIsRightSidebarOpen((current) => !current),
    onSendMessage: handleSendMessage,
    onNewConversation: () => navigate("/"),
    onDeleteConversation: handleDeleteConversation,
    onSelectAgentTask: (nextTaskId) => {
      if (!conversationId) {
        return;
      }
      navigate(nextTaskId ? `/c/${conversationId}/agents/${nextTaskId}` : `/c/${conversationId}`);
    },
    onSaveMessageToMemory: handleSaveMessageToMemory,
    onReloadRuntime: async () => {
      await reloadRuntime();
      await refreshAll();
    },
    onRefreshAll: refreshAll,
    onCreateMemory: async (input) => {
      await createMemory(input);
      await refreshAll();
    },
    onUpdateMemory: async (id, input) => {
      await updateMemory(id, input);
      await refreshAll();
    },
    onDeleteMemory: async (id) => {
      await deleteMemory(id);
      await refreshAll();
    },
    onRegisterWorkspace: async (input) => {
      await registerWorkspace(input);
      await refreshAll();
    },
    onActivateWorkspace: async (workspaceId) => {
      await setActiveWorkspace(workspaceId);
      await refreshAll();
    },
    onDeleteWorkspace: async (workspaceId) => {
      await deleteWorkspace(workspaceId);
      await refreshAll();
    },
    onQueueTask: async (input) => {
      await queueManualTask(input);
      await refreshAll();
    },
    onDeleteTask: async (taskId) => {
      await deleteTask(taskId);
      await refreshAll();
    },
    onClearCompletedTasks: async () => {
      await clearCompletedTasks();
      await refreshAll();
    },
    onReprioritizeTask: async (input) => {
      await reprioritizeTask(input);
      await refreshAll();
    },
    onCancelRun: async (runId) => {
      await cancelRun(runId);
      await refreshAll();
    },
    onReplyToQuestion: async (input) => {
      if (!conversationId) return;
      await replyToQuestion({ questionId: input.questionId, conversationId, content: input.content });
      await refreshAll();
    },
    onUpdateSettings: async (patch) => {
      const nextSettings = await updateSettings(patch);
      setSettings(nextSettings);
      await refreshAll();
    },
    onDiscoverLocalServerModel: discoverLocalServerModel,
    memories: state?.memories ?? [],
    workspaces: state?.workspaces ?? [],
    activeWorkspace: state?.workspaces.find((entry) => entry.id === state.activeWorkspaceId),
    tasks: state?.tasks ?? [],
    agentGuidances: state?.agentGuidances ?? [],
    artifacts: state?.artifacts ?? [],
    onSubmitAgentGuidance: async (input) => {
      await submitAgentGuidance(input);
      await refreshAll();
      if (conversationId) {
        await loadConversation(conversationId);
      }
    },
    onSteerAgentRun: async (input) => {
      await steerAgentRun(input);
      await refreshAll();
      if (conversationId) {
        await loadConversation(conversationId);
      }
    },
    onQueueAgentFollowUp: async (input) => {
      await queueAgentFollowUp(input);
      await refreshAll();
      if (conversationId) {
        await loadConversation(conversationId);
      }
    },
  };

  const isChatPage = location.pathname === "/" || location.pathname.startsWith("/c/");

  return (
    <div className="h-screen w-screen flex bg-gray-950 text-gray-100 overflow-hidden font-sans relative">
      <ConversationSidebar
        conversations={conversations}
        selectedConversationId={conversationId}
        isOpen={isLeftSidebarOpen}
        onToggle={() => setIsLeftSidebarOpen((current) => !current)}
        onSelectConversation={(id) => navigate(`/c/${id}`)}
        onDeleteConversation={handleDeleteConversation}
        onNewConversation={() => navigate("/")}
        activePath={location.pathname}
      />

      <div className={cn(
        "flex-1 flex flex-col min-w-0 min-h-0 bg-gray-950/50 relative shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.5)] z-10 rounded-tl-2xl overflow-hidden border-l border-t border-gray-800",
        isChatPage && isRightSidebarOpen && "mr-80",
      )}>
        <Outlet context={context} />
      </div>

      {isChatPage && (
        <div className="absolute inset-y-0 right-0 z-20">
          <DetailsSidebar
            conversationState={conversationState}
            tasks={state?.tasks ?? []}
            selectedTaskId={selectedAgentTask?.id}
            onSelectTask={(nextTaskId) => {
              if (!conversationId) {
                return;
              }
              navigate(nextTaskId ? `/c/${conversationId}/agents/${nextTaskId}` : `/c/${conversationId}`);
            }}
            isOpen={isRightSidebarOpen}
            onToggle={() => setIsRightSidebarOpen((current) => !current)}
          />
        </div>
      )}
    </div>
  );
}
