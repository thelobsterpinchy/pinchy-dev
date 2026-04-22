import type {
  AgentGuidance,
  DashboardArtifact,
  DashboardState,
  Message,
  PinchyTask,
  SavedMemory,
  WorkspaceEntry,
} from "../../../../packages/shared/src/contracts.js";
import type {
  ConversationState,
  DashboardSettings,
  DoctorReport,
  LocalServerModelDiscovery,
} from "./pinchy-dashboard-client.js";

export type RootLayoutContext = {
  state: DashboardState | null;
  doctorReport: DoctorReport | null;
  settings: DashboardSettings | null;
  conversations: Array<ConversationState["conversation"]>;
  conversationState?: ConversationState;
  selectedConversation?: ConversationState["conversation"];
  selectedAgentTask?: PinchyTask;
  isLoading: boolean;
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  operatorError?: string;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onSendMessage: (message: string) => Promise<void>;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => Promise<void>;
  onSelectAgentTask: (taskId?: string) => void;
  onSaveMessageToMemory: (message: Message) => Promise<void>;
  onReloadRuntime: () => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onCreateMemory: (input: { title: string; content: string; kind: SavedMemory["kind"]; tags: string[]; pinned: boolean }) => Promise<void>;
  onUpdateMemory: (id: string, input: { title: string; content: string; kind: SavedMemory["kind"]; tags: string[]; pinned: boolean }) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onRegisterWorkspace: (input: { path: string; name?: string }) => Promise<void>;
  onActivateWorkspace: (workspaceId: string) => Promise<void>;
  onDeleteWorkspace: (workspaceId: string) => Promise<void>;
  onQueueTask: (input: { title: string; prompt: string }) => Promise<void>;
  onCancelRun: (runId: string) => Promise<void>;
  onReplyToQuestion: (input: { questionId: string; content: string }) => Promise<void>;
  onUpdateSettings: (patch: DashboardSettings) => Promise<void>;
  onDiscoverLocalServerModel: (baseUrl: string) => Promise<LocalServerModelDiscovery>;
  memories: SavedMemory[];
  workspaces: WorkspaceEntry[];
  activeWorkspace?: WorkspaceEntry;
  tasks: PinchyTask[];
  agentGuidances: AgentGuidance[];
  artifacts: DashboardArtifact[];
  onSubmitAgentGuidance: (input: { conversationId: string; taskId: string; runId?: string; content: string }) => Promise<void>;
};
