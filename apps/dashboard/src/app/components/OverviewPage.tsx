import { useOutletContext } from "react-router";
import { PanelLeftOpen, LayoutDashboard, RefreshCw, RefreshCcw } from "lucide-react";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Badge } from "./ui/badge.js";
import { Card } from "./ui/card.js";
import type { RootLayoutContext } from "../types.js";

export function OverviewPage() {
  const { onToggleLeftSidebar, isLeftSidebarOpen, state, doctorReport, conversationState, onReloadRuntime, onRefreshAll } = useOutletContext<RootLayoutContext>();

  const summary = {
    pendingTasks: state?.tasks.filter((task) => task.status === "pending" || task.status === "running").length ?? 0,
    pendingApprovals: state?.approvals.filter((entry) => entry.status === "pending").length ?? 0,
    savedMemories: state?.memories.length ?? 0,
    workspaces: state?.workspaces.length ?? 0,
    pinnedMemories: state?.memories.filter((memory) => memory.pinned).length ?? 0,
    recentRuns: state?.runHistory.length ?? 0,
    pendingReloads: state?.pendingReloadRequests.length ?? 0,
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#020617] h-full overflow-hidden text-gray-200">
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-4 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          {!isLeftSidebarOpen && <Button data-testid="conversation-shell-sidebar-toggle" variant="ghost" size="icon" onClick={onToggleLeftSidebar}><PanelLeftOpen className="h-5 w-5" /></Button>}
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2"><LayoutDashboard className="h-5 w-5 text-blue-400" />Overview</h1>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Pending tasks" value={summary.pendingTasks} tone="text-blue-400" />
            <MetricCard label="Pending approvals" value={summary.pendingApprovals} tone="text-amber-400" />
            <MetricCard label="Saved memories" value={summary.savedMemories} tone="text-purple-400" />
            <MetricCard label="Workspaces" value={summary.workspaces} tone="text-green-500" />
            <MetricCard label="Pinned memories" value={summary.pinnedMemories} tone="text-emerald-400" />
            <MetricCard label="Recent runs" value={summary.recentRuns} tone="text-pink-400" />
            <MetricCard label="Reload requests" value={summary.pendingReloads} tone="text-slate-400" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card className="bg-[#111827] border-gray-800 p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-100">Environment health</h2>
                    <p className="text-sm text-gray-400">Workspace readiness and setup status</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-gray-300" onClick={() => void onRefreshAll()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh health</Button>
                </div>
                <div className="bg-[#0b1220] rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-sm">doctor: {doctorReport?.summary.status ?? "loading"}</div>
                      <div className="text-xs text-gray-400 mt-1">ok={doctorReport?.summary.okCount ?? 0} warn={doctorReport?.summary.warnCount ?? 0} fail={doctorReport?.summary.failCount ?? 0}</div>
                      <div className="mt-3 text-sm text-gray-300 space-y-1">{doctorReport?.checks.slice(0, 5).map((check) => <div key={check.name}>{check.name}: {check.status}</div>)}</div>
                    </div>
                    <Badge className={doctorReport?.summary.status === "ok" ? "bg-emerald-600" : "bg-amber-600"}>{doctorReport?.summary.status ?? "loading"}</Badge>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mt-3">Recommended flow: pinchy setup → pinchy doctor → pinchy up → pinchy agent</div>
              </Card>

              <Card className="bg-[#111827] border-gray-800 p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-100">Daemon health</h2>
                    <p className="text-sm text-gray-400">Current automation posture</p>
                  </div>
                  <Button data-testid="reload-runtime" variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => void onReloadRuntime()}><RefreshCcw className="w-4 h-4 mr-2" /> Reload Runtime</Button>
                </div>
                <div className="bg-[#0b1220] rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-sm">status: {state?.daemonHealth?.status ?? "unknown"}</div>
                      <div className="text-xs text-gray-400 mt-1">heartbeat: {state?.daemonHealth?.heartbeatAt ? new Date(state.daemonHealth.heartbeatAt).toLocaleString() : "—"}</div>
                      <div className="mt-3 text-sm text-gray-300 space-y-1">
                        <div>pid: {state?.daemonHealth?.pid ?? "—"}</div>
                        <div>started: {state?.daemonHealth?.startedAt ? new Date(state.daemonHealth.startedAt).toLocaleString() : "—"}</div>
                        <div>activity: {state?.daemonHealth?.currentActivity ?? "idle"}</div>
                        <div>last completed: {state?.daemonHealth?.lastCompletedAt ? new Date(state.daemonHealth.lastCompletedAt).toLocaleString() : "—"}</div>
                        {state?.daemonHealth?.lastError && <div className="text-red-400">last error: {state.daemonHealth.lastError}</div>}
                      </div>
                    </div>
                    <Badge className="bg-blue-600">{state?.daemonHealth?.status ?? "unknown"}</Badge>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="bg-[#111827] border-gray-800 p-5">
                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-gray-100">Selected conversation</h2>
                  <p className="text-sm text-gray-400">Use this like an operator cockpit for one thread</p>
                </div>
                {!conversationState ? <div className="text-sm text-gray-500">Select a conversation from the chat page.</div> : (
                  <>
                    <div className="bg-[#0b1220] rounded-xl p-4 mb-4 flex justify-between items-start">
                      <div>
                        <div className="font-bold text-sm">{conversationState.conversation.title}</div>
                        <div className="text-xs text-gray-400 mt-1">{conversationState.conversation.id}</div>
                        <div className="mt-2 text-sm text-gray-300">
                          <div>{conversationState.messages.length} messages</div>
                          <div>{conversationState.runs.length} runs</div>
                          <div>{conversationState.questions.length} blocked questions</div>
                        </div>
                      </div>
                      <Badge className="bg-slate-600">{conversationState.conversation.status}</Badge>
                    </div>
                    <div className="space-y-3 pl-2">{conversationState.messages.slice(-4).map((message) => <div key={message.id} className="bg-[#1e293b] p-3 rounded-lg border border-slate-700 text-sm text-gray-200"><div className="font-semibold text-xs mb-1 text-blue-400">{message.role}</div>{message.content}</div>)}</div>
                  </>
                )}
              </Card>
            </div>
          </div>
        </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return <div className="bg-[#111827] border border-gray-800 rounded-2xl p-4 shadow-sm"><div className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">{label}</div><div className={`text-3xl font-bold ${tone}`}>{value}</div></div>;
}
