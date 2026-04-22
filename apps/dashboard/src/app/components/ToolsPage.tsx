import { useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { PanelLeftOpen, Wrench } from "lucide-react";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Input } from "./ui/input.js";
import { Badge } from "./ui/badge.js";
import { Card } from "./ui/card.js";
import type { RootLayoutContext } from "../types.js";

export function ToolsPage() {
  const { onToggleLeftSidebar, isLeftSidebarOpen, state, artifacts } = useOutletContext<RootLayoutContext>();
  const [artifactQuery, setArtifactQuery] = useState("");

  const filteredArtifacts = useMemo(() => artifacts.filter((artifact) => {
    const query = artifactQuery.toLowerCase();
    return artifact.name.toLowerCase().includes(query) || artifact.toolName?.toLowerCase().includes(query) || artifact.note?.toLowerCase().includes(query) || artifact.tags?.some((tag) => tag.toLowerCase().includes(query));
  }), [artifactQuery, artifacts]);

  const agentResources = state?.agentResources ?? [];
  const generatedTools = state?.generatedTools ?? [];
  const routines = state?.routines ?? [];
  const auditTail = state?.auditTail ?? "";

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#020617] h-full overflow-hidden text-gray-200">
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-4 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">{!isLeftSidebarOpen && <Button data-testid="conversation-shell-sidebar-toggle" variant="ghost" size="icon" onClick={onToggleLeftSidebar}><PanelLeftOpen className="h-5 w-5" /></Button>}<h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2"><Wrench className="h-5 w-5 text-green-400" />Tools</h1></div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="bg-[#111827] border-gray-800 p-5 h-fit lg:col-span-3">
            <div className="mb-4"><h2 className="text-xl font-semibold text-gray-100">Pi agent resources</h2><p className="text-sm text-gray-400 mt-1">Synced resource inventory for the current Pinchy + Pi runtime</p></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="font-bold text-gray-200 mb-1">Skills</div><div className="text-xs text-gray-400 mb-3">Loaded slash-command and explicit skill resources.</div><div className="flex flex-wrap gap-2">{agentResources.filter((resource) => resource.type === "skill").map((resource) => <Badge data-testid="tools-agent-resource-skill" key={resource.name} className={resource.scope === "workspace" ? "bg-blue-600" : "bg-slate-600"}>{resource.name}</Badge>)}</div></div>
              <div className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="font-bold text-gray-200 mb-1">Extensions</div><div className="text-xs text-gray-400 mb-3">Pi extension/tool surfaces.</div><div className="flex flex-wrap gap-2">{agentResources.filter((resource) => resource.type === "extension").map((resource) => <Badge key={resource.name} className={resource.scope === "workspace" ? "bg-emerald-600" : "bg-slate-600"}>{resource.name}</Badge>)}</div></div>
              <div className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="font-bold text-gray-200 mb-1">Prompt templates</div><div className="text-xs text-gray-400 mb-3">Prompt shortcuts and reusable resources.</div><div className="flex flex-wrap gap-2">{agentResources.filter((resource) => resource.type === "prompt").map((resource) => <Badge key={resource.name} className={resource.scope === "workspace" ? "bg-purple-600" : "bg-slate-600"}>{resource.name}</Badge>)}</div></div>
            </div>
          </Card>

          <Card className="bg-[#111827] border-gray-800 p-5 h-fit"><div className="mb-4"><h2 className="text-xl font-semibold text-gray-100">Generated tools</h2><p className="text-sm text-gray-400 mt-1">Review source + diff before reload</p></div><div className="space-y-4">{generatedTools.length === 0 ? <p className="text-gray-400 text-sm">No generated tools yet.</p> : generatedTools.map((tool) => <div key={tool} className="flex justify-between items-center bg-[#0b1220] rounded-xl p-3 border border-gray-800"><div className="font-semibold text-sm text-blue-400 truncate mr-2">{tool}</div><Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 text-xs">Loaded</Button></div>)}</div></Card>

          <Card className="bg-[#111827] border-gray-800 p-5 h-fit lg:col-span-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4"><div><h2 className="text-xl font-semibold text-gray-100">Artifacts</h2><p className="text-sm text-gray-400 mt-1">Filter by name, tool, note, or tag</p></div><Input data-testid="artifact-search" placeholder="Filter artifacts" value={artifactQuery} onChange={(event) => setArtifactQuery(event.target.value)} className="bg-[#0f172a] border-gray-700 w-full sm:w-[220px]" /></div>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">{filteredArtifacts.map((artifact) => <div key={artifact.name} className="bg-[#0b1220] rounded-xl p-4 border border-gray-800 flex justify-between items-start gap-4"><div className="min-w-0"><div className="font-bold text-gray-200 truncate">{artifact.name}</div><div className="text-xs text-gray-400 mt-1">{artifact.size} bytes {artifact.toolName && `• ${artifact.toolName}`}</div><div className="flex flex-wrap gap-2 mt-2">{artifact.tags?.map((tag) => <Badge key={tag} className="bg-slate-700">{tag}</Badge>)}</div>{artifact.note && <div className="text-sm text-gray-300 mt-2 bg-[#1e293b] p-2 rounded-lg">{artifact.note}</div>}</div><Button variant="ghost" size="sm" className="h-8 shrink-0">View</Button></div>)}</div>
          </Card>

          <Card className="bg-[#111827] border-gray-800 p-5 h-fit"><div className="mb-4"><h2 className="text-xl font-semibold text-gray-100">Routines</h2><p className="text-sm text-gray-400 mt-1">Saved reusable workflows</p></div><div className="space-y-3">{routines.length === 0 ? <p className="text-gray-400 text-sm">No routines saved.</p> : routines.map((routine) => <div key={routine.name} className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="flex justify-between items-start gap-2 mb-3"><div><div className="font-bold text-gray-200">{routine.name}</div><div className="text-xs text-gray-400 mt-1">{routine.steps.length} step(s)</div></div></div><pre className="bg-[#020617] rounded-lg p-3 text-xs text-gray-400 overflow-x-auto border border-gray-800">{JSON.stringify(routine.steps, null, 2)}</pre></div>)}</div></Card>

          <Card className="bg-[#111827] border-gray-800 p-5 h-fit lg:col-span-2"><div className="mb-4"><h2 className="text-xl font-semibold text-gray-100">Audit tail</h2><p className="text-sm text-gray-400 mt-1">Latest structured worker output</p></div><pre className="bg-[#020617] rounded-xl p-4 text-xs text-emerald-400 overflow-x-auto border border-gray-800 max-h-[320px] overflow-y-auto whitespace-pre-wrap break-words">{auditTail || "No audit entries yet."}</pre></Card>
        </div>
        </div>
      </ScrollArea>
    </div>
  );
}
