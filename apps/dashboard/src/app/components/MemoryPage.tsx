import { useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { PanelLeftOpen, BrainCircuit } from "lucide-react";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Input } from "./ui/input.js";
import { Textarea } from "./ui/textarea.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.js";
import { Badge } from "./ui/badge.js";
import { Card } from "./ui/card.js";
import { Checkbox } from "./ui/checkbox.js";
import type { RootLayoutContext } from "../types.js";
import type { SavedMemory } from "../../../../../packages/shared/src/contracts.js";

const EMPTY_MEMORY_DRAFT = { title: "", content: "", kind: "note" as SavedMemory["kind"], tags: "", pinned: false };

export function MemoryPage() {
  const { onToggleLeftSidebar, isLeftSidebarOpen, memories, onCreateMemory, onUpdateMemory, onDeleteMemory } = useOutletContext<RootLayoutContext>();
  const [memoryDraft, setMemoryDraft] = useState(EMPTY_MEMORY_DRAFT);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryQuery, setMemoryQuery] = useState("");

  const filteredMemories = useMemo(() => memories.filter((memory) => {
    const query = memoryQuery.toLowerCase();
    return memory.title.toLowerCase().includes(query) || memory.content.toLowerCase().includes(query) || memory.tags.some((tag) => tag.toLowerCase().includes(query));
  }), [memories, memoryQuery]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#020617] h-full overflow-hidden text-gray-200">
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-4 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
        <div className="flex items-center gap-3">
          {!isLeftSidebarOpen && <Button data-testid="conversation-shell-sidebar-toggle" variant="ghost" size="icon" onClick={onToggleLeftSidebar}><PanelLeftOpen className="h-5 w-5" /></Button>}
          <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-purple-400" />Memory</h1>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
          <Card className="bg-[#111827] border-gray-800 p-5 h-fit">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-100">{editingMemoryId ? "Edit memory" : "Create memory"}</h2>
              <p className="text-sm text-gray-400 mt-1">Pinchy-native saved memory inspired by OpenClaw's first-class memory surface</p>
            </div>
            <div className="space-y-4">
              <Input data-testid="memory-title-input" placeholder="Memory title" value={memoryDraft.title} onChange={(event) => setMemoryDraft({ ...memoryDraft, title: event.target.value })} className="bg-[#0f172a] border-gray-700" />
              <Select value={memoryDraft.kind} onValueChange={(value) => setMemoryDraft({ ...memoryDraft, kind: value as SavedMemory["kind"] })}>
                <SelectTrigger data-testid="memory-kind-select" className="bg-[#0f172a] border-gray-700 text-gray-200"><SelectValue placeholder="Kind" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">note</SelectItem>
                  <SelectItem value="decision">decision</SelectItem>
                  <SelectItem value="fact">fact</SelectItem>
                  <SelectItem value="summary">summary</SelectItem>
                </SelectContent>
              </Select>
              <Input data-testid="memory-tags-input" placeholder="tags, comma, separated" value={memoryDraft.tags} onChange={(event) => setMemoryDraft({ ...memoryDraft, tags: event.target.value })} className="bg-[#0f172a] border-gray-700" />
              <Textarea data-testid="memory-content-input" placeholder="Saved memory content" value={memoryDraft.content} onChange={(event) => setMemoryDraft({ ...memoryDraft, content: event.target.value })} className="bg-[#0f172a] border-gray-700 min-h-[200px]" />
              <div className="flex items-center space-x-2 py-2"><Checkbox id="pin" checked={memoryDraft.pinned} onCheckedChange={(checked) => setMemoryDraft({ ...memoryDraft, pinned: checked === true })} /><label htmlFor="pin" className="text-sm font-medium leading-none text-gray-300">Pin this memory</label></div>
              <div className="flex gap-3 pt-2">
                <Button data-testid="memory-submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={!memoryDraft.title.trim() || !memoryDraft.content.trim()} onClick={() => void (editingMemoryId ? onUpdateMemory(editingMemoryId, { ...memoryDraft, tags: memoryDraft.tags.split(",").map((entry) => entry.trim()).filter(Boolean) }) : onCreateMemory({ ...memoryDraft, tags: memoryDraft.tags.split(",").map((entry) => entry.trim()).filter(Boolean) }))}>{editingMemoryId ? "Update memory" : "Save memory"}</Button>
                <Button variant="ghost" onClick={() => { setEditingMemoryId(null); setMemoryDraft(EMPTY_MEMORY_DRAFT); }} className="text-gray-400 hover:text-gray-200">Clear</Button>
              </div>
            </div>
          </Card>

          <Card className="bg-[#111827] border-gray-800 p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div><h2 className="text-xl font-semibold text-gray-100">Saved memories</h2><p className="text-sm text-gray-400 mt-1">Searchable local memory entries</p></div>
              <Input data-testid="memory-search" placeholder="Search memories" value={memoryQuery} onChange={(event) => setMemoryQuery(event.target.value)} className="bg-[#0f172a] border-gray-700 w-full sm:w-[220px]" />
            </div>
            <div className="space-y-4">
              {filteredMemories.length === 0 ? <p className="text-gray-400 text-sm">No memories saved yet.</p> : filteredMemories.map((memory) => (
                <div key={memory.id} className="bg-[#0b1220] rounded-xl p-4 border border-gray-800">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-3">
                    <div><div className="font-bold text-gray-100">{memory.title}</div><div className="text-sm text-gray-400 mt-1">{memory.kind} • {memory.tags.join(", ") || "untagged"}</div></div>
                    <div className="flex items-center gap-2">{memory.pinned && <Badge className="bg-purple-600 hover:bg-purple-700 text-white">pinned</Badge>}<Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-200 h-8" onClick={() => { setEditingMemoryId(memory.id); setMemoryDraft({ title: memory.title, content: memory.content, kind: memory.kind, tags: memory.tags.join(", "), pinned: memory.pinned }); }}>Edit</Button><Button variant="destructive" size="sm" className="bg-red-900/50 text-red-400 hover:bg-red-900/80 hover:text-red-300 h-8" onClick={() => void onDeleteMemory(memory.id)}>Delete</Button></div>
                  </div>
                  <div className="text-gray-300 text-sm whitespace-pre-wrap bg-[#111827] p-3 rounded-lg">{memory.content}</div>
                  <div className="text-xs text-gray-500 mt-3">updated {new Date(memory.updatedAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
        </div>
      </ScrollArea>
    </div>
  );
}
