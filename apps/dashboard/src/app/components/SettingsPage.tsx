import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { PanelLeftOpen, Settings } from "lucide-react";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Input } from "./ui/input.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.js";
import { Card } from "./ui/card.js";
import { Checkbox } from "./ui/checkbox.js";
import type { RootLayoutContext } from "../types.js";
import type { DashboardSettings } from "../pinchy-dashboard-client.js";

const EMPTY_SETTINGS_DRAFT: DashboardSettings = { defaultProvider: "", defaultModel: "", defaultThinkingLevel: "medium", defaultBaseUrl: "", autoDeleteEnabled: false, autoDeleteDays: 30, dangerModeEnabled: false };

export function SettingsPage() {
  const { onToggleLeftSidebar, isLeftSidebarOpen, settings, onUpdateSettings, onDiscoverLocalServerModel } = useOutletContext<RootLayoutContext>();
  const [settingsDraft, setSettingsDraft] = useState<DashboardSettings>(EMPTY_SETTINGS_DRAFT);
  const [settingsStatus, setSettingsStatus] = useState({ tone: "idle", message: "Workspace-local Pinchy runtime defaults for Pi-backed runs." });
  const [detectedModel, setDetectedModel] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (settings) setSettingsDraft(settings);
  }, [settings]);

  const providerPresets = [
    { id: "local-server", label: "Local server", provider: "openai-compatible", suggestedModel: "", helper: "Point Pinchy at a local OpenAI-compatible endpoint and auto-detect its model list." },
    { id: "codex-cloud", label: "Codex cloud", provider: "openai-codex", suggestedModel: "gpt-5.4", helper: "Matches the current Pi agent Codex-style default on this machine." },
    { id: "openai-compatible", label: "OpenAI-compatible", provider: "openai-compatible", suggestedModel: "gpt-4.1", helper: "Use when routing Pinchy through an OpenAI-compatible endpoint." },
  ];

  const summaryRows = useMemo(() => [
    { label: "Provider", value: settings?.defaultProvider || "—", sourceLabel: settings?.sources?.defaultProvider || "unset" },
    { label: "Model", value: settings?.defaultModel || "—", sourceLabel: settings?.sources?.defaultModel || "unset" },
    { label: "Thinking level", value: settings?.defaultThinkingLevel || "medium", sourceLabel: settings?.sources?.defaultThinkingLevel || "unset" },
    { label: "Auto delete", value: settings?.autoDeleteEnabled ? `on (${settings?.autoDeleteDays ?? 30} days)` : "off", sourceLabel: settings?.sources?.autoDeleteEnabled || "unset" },
    { label: "Danger Mode", value: settings?.dangerModeEnabled ? "sandbox-only enabled" : "off", sourceLabel: settings?.sources?.dangerModeEnabled || "unset" },
  ], [settings]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#020617] h-full overflow-hidden text-gray-200">
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-4 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-10 shrink-0"><div className="flex items-center gap-3">{!isLeftSidebarOpen && <Button data-testid="conversation-shell-sidebar-toggle" variant="ghost" size="icon" onClick={onToggleLeftSidebar}><PanelLeftOpen className="h-5 w-5" /></Button>}<h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2"><Settings className="h-5 w-5 text-gray-400" />Settings</h1></div></div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
          <Card className="bg-[#111827] border-gray-800 p-5 h-fit">
            <div className="mb-6"><h2 className="text-xl font-semibold text-gray-100">Settings</h2><p className="text-sm text-gray-400 mt-1">Configure Pinchy defaults</p></div>
            <div className="space-y-6">
              <div><div className="text-xs text-gray-400 mb-2">Provider presets</div><div className="flex flex-wrap gap-2">{providerPresets.map((preset) => <Button data-testid={`settings-preset-${preset.id}`} key={preset.id} variant="outline" className="bg-[#0b1220] border-gray-700 hover:bg-[#1e293b] text-gray-300 h-8 text-xs" onClick={() => { setSettingsDraft((current) => ({ ...current, defaultProvider: preset.provider, defaultModel: current.defaultModel?.trim() ? current.defaultModel : preset.suggestedModel })); setSettingsStatus({ tone: "idle", message: preset.helper }); }}>{preset.label}</Button>)}</div></div>
              <div><div className="text-xs text-gray-400 mb-2">Provider</div><Input data-testid="settings-provider-input" placeholder="openai-compatible" value={settingsDraft.defaultProvider} onChange={(event) => setSettingsDraft({ ...settingsDraft, defaultProvider: event.target.value })} className="bg-[#0f172a] border-gray-700" /></div>
              <div><div className="text-xs text-gray-400 mb-2">Model</div><Input data-testid="settings-model-input" placeholder="Auto-detected from the local server" value={settingsDraft.defaultModel} onChange={(event) => setSettingsDraft({ ...settingsDraft, defaultModel: event.target.value })} className="bg-[#0f172a] border-gray-700" /></div>
              <div><div className="text-xs text-gray-400 mb-2">Endpoint / base URL</div><Input data-testid="settings-base-url-input" placeholder="http://127.0.0.1:11434/v1" value={settingsDraft.defaultBaseUrl} onChange={(event) => setSettingsDraft({ ...settingsDraft, defaultBaseUrl: event.target.value })} className="bg-[#0f172a] border-gray-700" /><div className="text-xs text-gray-500 mt-2">Enter a local server endpoint to auto-detect an available model.</div>{detectedModel ? <div data-testid="settings-detected-model" className="text-xs text-emerald-400 mt-2">Detected model: {detectedModel}</div> : null}</div>
              <div><div className="text-xs text-gray-400 mb-2">Thinking level</div><Select value={settingsDraft.defaultThinkingLevel} onValueChange={(value) => setSettingsDraft({ ...settingsDraft, defaultThinkingLevel: value as DashboardSettings["defaultThinkingLevel"] })}><SelectTrigger data-testid="settings-thinking-select" className="bg-[#0f172a] border-gray-700 text-gray-200"><SelectValue placeholder="Select thinking level" /></SelectTrigger><SelectContent><SelectItem value="off">off</SelectItem><SelectItem value="low">low</SelectItem><SelectItem value="medium">medium</SelectItem><SelectItem value="high">high</SelectItem></SelectContent></Select></div>
              <div className="rounded-xl border border-gray-800 bg-[#0b1220] p-4 space-y-3"><div className="flex items-center space-x-2"><Checkbox id="settings-auto-delete-enabled" checked={settingsDraft.autoDeleteEnabled === true} onCheckedChange={(checked) => setSettingsDraft({ ...settingsDraft, autoDeleteEnabled: checked === true })} /><label htmlFor="settings-auto-delete-enabled" className="text-sm font-medium leading-none text-gray-300">Auto-delete old chats and artifacts</label></div><div><div className="text-xs text-gray-400 mb-2">Retention days</div><Input data-testid="settings-auto-delete-days-input" type="number" min={1} disabled={settingsDraft.autoDeleteEnabled !== true} placeholder="30" value={String(settingsDraft.autoDeleteDays ?? 30)} onChange={(event) => setSettingsDraft({ ...settingsDraft, autoDeleteDays: Number(event.target.value || 30) })} className="bg-[#0f172a] border-gray-700 disabled:opacity-50" /><div className="text-xs text-gray-500 mt-2">When enabled, Pinchy automatically deletes chats and artifacts older than this many days.</div></div></div>
              <div className="rounded-xl border border-amber-900/40 bg-[#0b1220] p-4 space-y-3"><div className="flex items-center space-x-2"><Checkbox id="settings-danger-mode-enabled" data-testid="settings-danger-mode-enabled" checked={settingsDraft.dangerModeEnabled === true} onCheckedChange={(checked) => setSettingsDraft({ ...settingsDraft, dangerModeEnabled: checked === true })} /><label htmlFor="settings-danger-mode-enabled" className="text-sm font-medium leading-none text-amber-200">Danger Mode (sandbox only)</label></div><div className="text-xs text-amber-300/90">Declares that this workspace may use risky local actions like desktop interaction, simulator control, clicks, typing, and validation runs in a sandboxed environment. This is a repo-local signal only and may not bypass host-level approval requirements.</div></div>
              <div className="flex flex-wrap items-center gap-3 pt-2"><Button data-testid="settings-save" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => void onUpdateSettings(settingsDraft).then(() => setSettingsStatus({ tone: "success", message: "Settings saved." }))}>Save settings</Button><Button variant="ghost" className="text-gray-400 hover:text-gray-200" onClick={() => void onDiscoverLocalServerModel(settingsDraft.defaultBaseUrl || "").then((result) => { setDetectedModel(result.detectedModel); if (result.detectedModel) setSettingsDraft((current) => ({ ...current, defaultModel: current.defaultModel || result.detectedModel })); })}>Detect model</Button><span className={`text-xs ${settingsStatus.tone === "success" ? "text-emerald-400" : "text-gray-500"}`}>{settingsStatus.message}</span></div>
            </div>
          </Card>

          <Card className="bg-[#111827] border-gray-800 p-5 h-fit">
            <div className="mb-6"><h2 className="text-xl font-semibold text-gray-100">Configuration guidance</h2><p className="text-sm text-gray-400 mt-1">Keep Pinchy as the shell and Pi as the execution substrate</p></div>
            <div className="space-y-4">
              <div className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="font-bold text-gray-100 mb-2">Workspace-local runtime config</div><div className="text-sm text-gray-400">Settings applied here override global defaults but only affect this active workspace.</div><div className="text-xs text-gray-500 mt-2">These settings are persisted in .pinchy-runtime.json.</div></div>
              <div className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="font-bold text-gray-100 mb-2">Recommended local-model flow</div><div className="text-sm text-gray-400">Running Pi and a local OpenAI-compatible server together locally.</div></div>
              <div className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="font-bold text-gray-100 mb-2">Current effective defaults</div><div className="text-sm text-gray-400 mb-3">Merged global + workspace config.</div><div className="space-y-2 text-sm text-gray-300 w-full">{summaryRows.map((row) => <div key={row.label} className="flex justify-between items-center gap-4 bg-[#1e293b] p-2 px-3 rounded-lg border border-gray-700"><span className="font-medium">{row.label}: {row.value}</span><span className="text-xs text-gray-500">{row.sourceLabel}</span></div>)}</div></div>
            </div>
          </Card>
        </div>
        </div>
      </ScrollArea>
    </div>
  );
}
