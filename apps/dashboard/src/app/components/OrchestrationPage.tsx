import { useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { PanelLeftOpen, Activity } from "lucide-react";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Input } from "./ui/input.js";
import { Textarea } from "./ui/textarea.js";
import { Badge } from "./ui/badge.js";
import { Card } from "./ui/card.js";
import type { RootLayoutContext } from "../types.js";

const EMPTY_WORKSPACE_DRAFT = { path: "", name: "" };

export function OrchestrationPage() {
  const { onToggleLeftSidebar, isLeftSidebarOpen, activeWorkspace, workspaces, state, tasks, onRegisterWorkspace, onActivateWorkspace, onDeleteWorkspace, onQueueTask } = useOutletContext<RootLayoutContext>();
  const [workspaceDraft, setWorkspaceDraft] = useState(EMPTY_WORKSPACE_DRAFT);
  const [queueTaskTitle, setQueueTaskTitle] = useState("");
  const [queueTaskPrompt, setQueueTaskPrompt] = useState("");

  const pendingApprovals = useMemo(() => state?.approvals.filter((entry) => entry.status === "pending") ?? [], [state]);
  const runHistory = state?.runHistory ?? [];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#020617] h-full overflow-hidden text-gray-200">
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-4 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">{!isLeftSidebarOpen && <Button data-testid="conversation-shell-sidebar-toggle" variant="ghost" size="icon" onClick={onToggleLeftSidebar}><PanelLeftOpen className="h-5 w-5" /></Button>}<h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2"><Activity className="h-5 w-5 text-orange-400" />Operations</h1></div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="bg-[#111827] border-gray-800 p-5 h-fit">
            <div className="mb-4"><h2 className="text-xl font-semibold text-gray-100">Workspaces</h2><p className="text-sm text-gray-400 mt-1">Track repos and choose the active Pinchy workspace</p></div>
            <div className="space-y-4">
              <div className="bg-[#0b1220] rounded-xl p-4 border border-blue-900/30">
                <div className="flex justify-between items-start">
                  <div><div className="font-bold text-sm text-blue-400">{activeWorkspace ? activeWorkspace.name : "No active workspace"}</div><div className="text-xs text-gray-400 mt-1">{activeWorkspace ? activeWorkspace.path : "Register a repo path below."}</div><div className="text-xs text-gray-500 mt-3">This selection drives dashboard conversation, run, question, memory, and control-plane routing for the active workspace.</div></div>
                  {activeWorkspace && <Badge className="bg-blue-600 hover:bg-blue-700">active workspace</Badge>}
                </div>
              </div>
              <div className="space-y-3 bg-[#0f172a] p-4 rounded-xl border border-gray-800">
                <Input data-testid="workspace-path-input" placeholder="/absolute/path/to/repo" value={workspaceDraft.path} onChange={(event) => setWorkspaceDraft({ ...workspaceDraft, path: event.target.value })} className="bg-[#1e293b] border-gray-700" />
                <Input data-testid="workspace-name-input" placeholder="Optional workspace name" value={workspaceDraft.name} onChange={(event) => setWorkspaceDraft({ ...workspaceDraft, name: event.target.value })} className="bg-[#1e293b] border-gray-700" />
                <Button data-testid="workspace-add" className="w-full bg-blue-600 hover:bg-blue-700" disabled={!workspaceDraft.path.trim()} onClick={() => void onRegisterWorkspace({ path: workspaceDraft.path, name: workspaceDraft.name || undefined })}>Add workspace</Button>
              </div>
              <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2">
                {workspaces.map((workspace) => (
                  <div key={workspace.id} className="bg-[#0b1220] rounded-xl p-3 border border-gray-800">
                    <div className="flex justify-between items-start gap-2"><div className="min-w-0 flex-1"><div className="font-bold text-sm truncate">{workspace.name}</div><div className="text-xs text-gray-400 truncate mt-1">{workspace.path}</div><div className="text-xs text-gray-500 mt-2">updated {new Date(workspace.updatedAt).toLocaleString()}</div></div><div className="flex flex-col gap-2 shrink-0">{workspace.id === activeWorkspace?.id ? <Badge className="bg-blue-600 w-fit self-end">active</Badge> : <Button variant="outline" size="sm" className="h-7 text-xs border-gray-700 text-gray-300" onClick={() => void onActivateWorkspace(workspace.id)}>Activate</Button>}<Button variant="destructive" size="sm" className="h-7 text-xs bg-red-900/30 text-red-400 hover:bg-red-900/60 hover:text-red-300 border border-red-900/50" onClick={() => void onDeleteWorkspace(workspace.id)}>Delete</Button></div></div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="bg-[#111827] border-gray-800 p-5 h-fit">
            <div className="mb-4"><h2 className="text-xl font-semibold text-gray-100">Queue task</h2><p className="text-sm text-gray-400 mt-1">Inject a manual daemon task</p></div>
            <div className="space-y-3">
              <Input data-testid="queue-task-title-input" placeholder="Task title" value={queueTaskTitle} onChange={(event) => setQueueTaskTitle(event.target.value)} className="bg-[#0f172a] border-gray-700" />
              <Textarea data-testid="queue-task-prompt-input" placeholder="Task prompt" rows={5} value={queueTaskPrompt} onChange={(event) => setQueueTaskPrompt(event.target.value)} className="bg-[#0f172a] border-gray-700 resize-y" />
              <Button data-testid="queue-task-submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={!queueTaskTitle.trim() || !queueTaskPrompt.trim()} onClick={() => void onQueueTask({ title: queueTaskTitle, prompt: queueTaskPrompt })}>Queue task</Button>
            </div>
          </Card>

          <Card className="bg-[#111827] border-gray-800 p-5 h-fit">
            <div className="mb-4"><h2 className="text-xl font-semibold text-gray-100">Approvals</h2><p className="text-sm text-gray-400 mt-1">Resolve pending guarded actions</p></div>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
              {pendingApprovals.length === 0 ? <p className="text-gray-400 text-sm">No pending approvals.</p> : pendingApprovals.map((approval) => <div key={approval.id} className="bg-[#0b1220] rounded-xl p-4 border border-amber-900/30"><div className="font-bold text-amber-400">{approval.toolName}</div><div className="text-sm text-gray-300 mt-1">{approval.reason}</div></div>)}
            </div>
          </Card>

          <Card className="bg-[#111827] border-gray-800 p-5 h-fit">
            <div className="mb-4"><h2 className="text-xl font-semibold text-gray-100">Tasks</h2><p className="text-sm text-gray-400 mt-1">Local queue state</p></div>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
              {tasks.length === 0 ? <p className="text-gray-400 text-sm">No tasks yet.</p> : tasks.map((task) => <div key={task.id} className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="flex justify-between items-start gap-4 mb-2"><div><div className="font-bold text-gray-100">{task.title}</div><div className="text-sm text-blue-400 mt-1">status: {task.status}</div></div></div>{task.prompt && <div className="text-sm text-gray-400 mt-2 bg-[#1e293b] p-3 rounded-lg">{task.prompt}</div>}</div>)}
            </div>
          </Card>

          <Card className="bg-[#111827] border-gray-800 p-5 h-fit md:col-span-2 lg:col-span-1">
            <div className="mb-4"><h2 className="text-xl font-semibold text-gray-100">Run timeline</h2><p className="text-sm text-gray-400 mt-1">Recent daemon/task events</p></div>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
              {runHistory.length === 0 ? <p className="text-gray-400 text-sm">No run history yet.</p> : runHistory.map((entry) => <div key={entry.id} className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="font-bold text-gray-200">{entry.kind}: {entry.label}</div><div className="text-xs text-gray-400 mt-1 mb-2">{entry.status} • {new Date(entry.ts).toLocaleString()}</div>{entry.details && <div className="text-sm text-gray-300 mt-2 bg-[#1e293b] p-3 rounded-lg border border-gray-700">{entry.details}</div>}</div>)}
            </div>
          </Card>
        </div>
        </div>
      </ScrollArea>
    </div>
  );
}
