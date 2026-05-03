import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { PanelLeftOpen, Settings } from "lucide-react";
import { Button } from "./ui/button.js";
import { ScrollArea } from "./ui/scroll-area.js";
import { Input } from "./ui/input.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.js";
import { Card } from "./ui/card.js";
import { Checkbox } from "./ui/checkbox.js";
import { Textarea } from "./ui/textarea.js";
import type { RootLayoutContext } from "../types.js";
import type { DashboardSettings } from "../pinchy-dashboard-client.js";
import { PINCHY_PROVIDER_CATALOG, findPinchyProvider } from "../../../../../packages/shared/src/pi-provider-catalog.js";

const EMPTY_SETTINGS_DRAFT: DashboardSettings = {
  defaultProvider: "",
  defaultModel: "",
  defaultThinkingLevel: "medium",
  defaultBaseUrl: "",
  modelOptions: {},
  savedModelConfigs: [],
  providerApiKey: "",
  autoDeleteEnabled: false,
  autoDeleteDays: 30,
  toolRetryWarningThreshold: 5,
  toolRetryHardStopThreshold: 10,
  dangerModeEnabled: false,
};

type SavedModelConfigDraft = NonNullable<DashboardSettings["savedModelConfigs"]>[number];
type RuntimeModelOptionsDraft = NonNullable<DashboardSettings["modelOptions"]>;

function normalizeNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeIntegerInput(value: string) {
  const parsed = normalizeNumberInput(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function readModelOptionNumber(options: DashboardSettings["modelOptions"], key: keyof RuntimeModelOptionsDraft) {
  const value = options?.[key];
  return typeof value === "number" ? String(value) : "";
}

function readStopSequences(options: DashboardSettings["modelOptions"]) {
  return options?.stop?.join("\n") ?? "";
}

function cleanModelOptions(options: DashboardSettings["modelOptions"]) {
  const next: RuntimeModelOptionsDraft = {};
  if (typeof options?.temperature === "number") next.temperature = options.temperature;
  if (typeof options?.topP === "number") next.topP = options.topP;
  if (typeof options?.topK === "number") next.topK = options.topK;
  if (typeof options?.minP === "number") next.minP = options.minP;
  if (typeof options?.maxTokens === "number") next.maxTokens = options.maxTokens;
  if (typeof options?.seed === "number") next.seed = options.seed;
  if (Array.isArray(options?.stop) && options.stop.length > 0) next.stop = options.stop;
  if (typeof options?.repeatPenalty === "number") next.repeatPenalty = options.repeatPenalty;
  if (typeof options?.frequencyPenalty === "number") next.frequencyPenalty = options.frequencyPenalty;
  if (typeof options?.presencePenalty === "number") next.presencePenalty = options.presencePenalty;
  if (typeof options?.contextWindow === "number") next.contextWindow = options.contextWindow;
  return Object.keys(next).length > 0 ? next : undefined;
}

function slugifyPresetName(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `model-config-${Date.now()}`;
}

function upsertSavedModelConfig(configs: DashboardSettings["savedModelConfigs"], config: SavedModelConfigDraft) {
  const current = configs ?? [];
  const existingIndex = current.findIndex((entry) => entry.id === config.id);
  if (existingIndex < 0) return [...current, config];
  return current.map((entry, index) => index === existingIndex ? config : entry);
}

function deleteSavedModelConfig(configs: DashboardSettings["savedModelConfigs"], id: string) {
  return (configs ?? []).filter((entry) => entry.id !== id);
}

export function SettingsPage() {
  const { onToggleLeftSidebar, isLeftSidebarOpen, settings, onUpdateSettings, onDiscoverLocalServerModel } = useOutletContext<RootLayoutContext>();
  const [settingsDraft, setSettingsDraft] = useState<DashboardSettings>(EMPTY_SETTINGS_DRAFT);
  const [settingsStatus, setSettingsStatus] = useState({ tone: "idle", message: "Workspace-local Pinchy runtime defaults for Pi-backed runs." });
  const [detectedModel, setDetectedModel] = useState<string | undefined>(undefined);
  const [newPresetName, setNewPresetName] = useState("");

  useEffect(() => {
    if (settings) {
      setSettingsDraft({
        ...EMPTY_SETTINGS_DRAFT,
        ...settings,
        modelOptions: settings.modelOptions ?? {},
        savedModelConfigs: settings.savedModelConfigs ?? [],
      });
    }
  }, [settings]);

  const selectedProvider = useMemo(() => findPinchyProvider(settingsDraft.defaultProvider), [settingsDraft.defaultProvider]);
  const selectedProviderCredentialStored = selectedProvider?.id ? settings?.storedProviderCredentials?.[selectedProvider.id] === true : false;

  const summaryRows = useMemo(() => [
    { label: "Provider", value: settings?.defaultProvider || "—", sourceLabel: settings?.sources?.defaultProvider || "unset" },
    { label: "Model", value: settings?.defaultModel || "—", sourceLabel: settings?.sources?.defaultModel || "unset" },
    { label: "Thinking level", value: settings?.defaultThinkingLevel || "medium", sourceLabel: settings?.sources?.defaultThinkingLevel || "unset" },
    { label: "Auto delete", value: settings?.autoDeleteEnabled ? `on (${settings?.autoDeleteDays ?? 30} days)` : "off", sourceLabel: settings?.sources?.autoDeleteEnabled || "unset" },
    { label: "Tool retry penalty", value: `warn ${settings?.toolRetryWarningThreshold ?? 5} / hard stop ${settings?.toolRetryHardStopThreshold ?? 10}`, sourceLabel: settings?.sources?.toolRetryWarningThreshold || settings?.sources?.toolRetryHardStopThreshold || "unset" },
    { label: "Danger Mode", value: settings?.dangerModeEnabled ? "sandbox-only enabled" : "off", sourceLabel: settings?.sources?.dangerModeEnabled || "unset" },
  ], [settings]);

  function setModelOption<K extends keyof RuntimeModelOptionsDraft>(key: K, value: RuntimeModelOptionsDraft[K] | undefined) {
    setSettingsDraft((current) => ({
      ...current,
      modelOptions: value === undefined
        ? Object.fromEntries(Object.entries(current.modelOptions ?? {}).filter(([entryKey]) => entryKey !== key))
        : { ...(current.modelOptions ?? {}), [key]: value },
    }));
  }

  function saveCurrentModelConfig() {
    const trimmedName = newPresetName.trim();
    if (!trimmedName) {
      setSettingsStatus({ tone: "idle", message: "Enter a name before saving a model config." });
      return;
    }

    const id = slugifyPresetName(trimmedName);
    setSettingsDraft((current) => ({
      ...current,
      savedModelConfigs: upsertSavedModelConfig(current.savedModelConfigs, {
        id,
        name: trimmedName,
        provider: current.defaultProvider?.trim() || undefined,
        model: current.defaultModel?.trim() || undefined,
        baseUrl: current.defaultBaseUrl?.trim() || undefined,
        thinkingLevel: current.defaultThinkingLevel,
        modelOptions: cleanModelOptions(current.modelOptions),
      }),
    }));
    setSettingsStatus({ tone: "idle", message: `Saved preset “${trimmedName}”. Click Save settings to persist it.` });
    setNewPresetName("");
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#020617] h-full overflow-hidden text-gray-200">
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-4 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-10 shrink-0"><div className="flex items-center gap-3">{!isLeftSidebarOpen && <Button data-testid="conversation-shell-sidebar-toggle" variant="ghost" size="icon" onClick={onToggleLeftSidebar}><PanelLeftOpen className="h-5 w-5" /></Button>}<h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2"><Settings className="h-5 w-5 text-gray-400" />Settings</h1></div></div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
          <Card className="bg-[#111827] border-gray-800 p-5 h-fit">
            <div className="mb-6"><h2 className="text-xl font-semibold text-gray-100">Settings</h2><p className="text-sm text-gray-400 mt-1">Configure Pinchy defaults</p></div>
            <div className="space-y-6">
              <div><div className="text-xs text-gray-400 mb-2">Provider</div><Select value={settingsDraft.defaultProvider || undefined} onValueChange={(value) => { setSettingsDraft((current) => ({ ...current, defaultProvider: value })); const provider = findPinchyProvider(value); setSettingsStatus({ tone: "idle", message: provider?.description ?? "Choose the Pi provider Pinchy should use for this workspace." }); }}><SelectTrigger data-testid="settings-provider-select" className="bg-[#0f172a] border-gray-700 text-gray-200"><SelectValue placeholder="Select a Pi provider" /></SelectTrigger><SelectContent>{PINCHY_PROVIDER_CATALOG.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.label}</SelectItem>)}</SelectContent></Select>{selectedProvider ? <div className="text-xs text-gray-500 mt-2">{selectedProvider.description}</div> : null}</div>
              <div><div className="text-xs text-gray-400 mb-2">Model</div><Input data-testid="settings-model-input" placeholder={selectedProvider?.supportsBaseUrl ? "Model on your selected endpoint" : "Provider model id"} value={settingsDraft.defaultModel} onChange={(event) => setSettingsDraft({ ...settingsDraft, defaultModel: event.target.value })} className="bg-[#0f172a] border-gray-700" /></div>
              {(selectedProvider?.supportsBaseUrl ?? true) ? <div><div className="text-xs text-gray-400 mb-2">Endpoint / base URL</div><Input data-testid="settings-base-url-input" placeholder={selectedProvider?.baseUrlPlaceholder ?? "http://127.0.0.1:11434/v1"} value={settingsDraft.defaultBaseUrl} onChange={(event) => setSettingsDraft({ ...settingsDraft, defaultBaseUrl: event.target.value })} className="bg-[#0f172a] border-gray-700" /><div className="text-xs text-gray-500 mt-2">Use this for local Ollama servers, OpenAI-compatible endpoints, Azure, or other provider-specific overrides.</div>{detectedModel ? <div data-testid="settings-detected-model" className="text-xs text-emerald-400 mt-2">Detected model: {detectedModel}</div> : null}</div> : null}
              {selectedProvider && (selectedProvider.authKind === "api-key" || selectedProvider.authKind === "optional-api-key") ? <div><div className="text-xs text-gray-400 mb-2">API key</div><Input data-testid="settings-provider-api-key-input" type="password" placeholder={selectedProvider.envVar ? `Optional: ${selectedProvider.envVar}` : "Paste API key"} value={settingsDraft.providerApiKey ?? ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, providerApiKey: event.target.value })} className="bg-[#0f172a] border-gray-700" /><div className="text-xs text-gray-500 mt-2">{selectedProviderCredentialStored ? "A key is already stored for this provider in Pi auth.json. Saving a new value will replace it." : "Pinchy stores provider keys in Pi auth.json and never returns them to the UI."}</div></div> : null}
              <div><div className="text-xs text-gray-400 mb-2">Thinking level</div><Select value={settingsDraft.defaultThinkingLevel} onValueChange={(value) => setSettingsDraft({ ...settingsDraft, defaultThinkingLevel: value as DashboardSettings["defaultThinkingLevel"] })}><SelectTrigger data-testid="settings-thinking-select" className="bg-[#0f172a] border-gray-700 text-gray-200"><SelectValue placeholder="Select thinking level" /></SelectTrigger><SelectContent><SelectItem value="off">off</SelectItem><SelectItem value="low">low</SelectItem><SelectItem value="medium">medium</SelectItem><SelectItem value="high">high</SelectItem></SelectContent></Select></div>

              <div className="rounded-xl border border-gray-800 bg-[#0b1220] p-4 space-y-4">
                <div>
                  <div className="font-bold text-gray-100 mb-1">Model tuning</div>
                  <div className="text-xs text-gray-500">Useful knobs for local and OpenAI-compatible backends. Leave blank to use provider defaults.</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><div className="text-xs text-gray-400 mb-2">Temperature</div><Input data-testid="settings-model-option-temperature" placeholder="0.2" value={readModelOptionNumber(settingsDraft.modelOptions, "temperature")} onChange={(event) => setModelOption("temperature", normalizeNumberInput(event.target.value))} className="bg-[#0f172a] border-gray-700" /></div>
                  <div><div className="text-xs text-gray-400 mb-2">Top P</div><Input data-testid="settings-model-option-top-p" placeholder="0.95" value={readModelOptionNumber(settingsDraft.modelOptions, "topP")} onChange={(event) => setModelOption("topP", normalizeNumberInput(event.target.value))} className="bg-[#0f172a] border-gray-700" /></div>
                  <div><div className="text-xs text-gray-400 mb-2">Top K</div><Input data-testid="settings-model-option-top-k" placeholder="40" value={readModelOptionNumber(settingsDraft.modelOptions, "topK")} onChange={(event) => setModelOption("topK", normalizeIntegerInput(event.target.value))} className="bg-[#0f172a] border-gray-700" /></div>
                  <div><div className="text-xs text-gray-400 mb-2">Min P</div><Input data-testid="settings-model-option-min-p" placeholder="0.05" value={readModelOptionNumber(settingsDraft.modelOptions, "minP")} onChange={(event) => setModelOption("minP", normalizeNumberInput(event.target.value))} className="bg-[#0f172a] border-gray-700" /></div>
                  <div><div className="text-xs text-gray-400 mb-2">Max tokens</div><Input data-testid="settings-model-option-max-tokens" placeholder="2048" value={readModelOptionNumber(settingsDraft.modelOptions, "maxTokens")} onChange={(event) => setModelOption("maxTokens", normalizeIntegerInput(event.target.value))} className="bg-[#0f172a] border-gray-700" /></div>
                  <div><div className="text-xs text-gray-400 mb-2">Seed</div><Input data-testid="settings-model-option-seed" placeholder="7" value={readModelOptionNumber(settingsDraft.modelOptions, "seed")} onChange={(event) => setModelOption("seed", normalizeIntegerInput(event.target.value))} className="bg-[#0f172a] border-gray-700" /></div>
                  <div><div className="text-xs text-gray-400 mb-2">Repeat penalty</div><Input data-testid="settings-model-option-repeat-penalty" placeholder="1.05" value={readModelOptionNumber(settingsDraft.modelOptions, "repeatPenalty")} onChange={(event) => setModelOption("repeatPenalty", normalizeNumberInput(event.target.value))} className="bg-[#0f172a] border-gray-700" /></div>
                  <div><div className="text-xs text-gray-400 mb-2">Presence penalty</div><Input data-testid="settings-model-option-presence-penalty" placeholder="0.1" value={readModelOptionNumber(settingsDraft.modelOptions, "presencePenalty")} onChange={(event) => setModelOption("presencePenalty", normalizeNumberInput(event.target.value))} className="bg-[#0f172a] border-gray-700" /></div>
                  <div><div className="text-xs text-gray-400 mb-2">Frequency penalty</div><Input data-testid="settings-model-option-frequency-penalty" placeholder="0.2" value={readModelOptionNumber(settingsDraft.modelOptions, "frequencyPenalty")} onChange={(event) => setModelOption("frequencyPenalty", normalizeNumberInput(event.target.value))} className="bg-[#0f172a] border-gray-700" /></div>
                  <div><div className="text-xs text-gray-400 mb-2">Context window</div><Input data-testid="settings-model-option-context-window" placeholder="8192" value={readModelOptionNumber(settingsDraft.modelOptions, "contextWindow")} onChange={(event) => setModelOption("contextWindow", normalizeIntegerInput(event.target.value))} className="bg-[#0f172a] border-gray-700" /></div>
                </div>
                <div><div className="text-xs text-gray-400 mb-2">Stop sequences</div><Textarea data-testid="settings-model-option-stop" placeholder="One stop sequence per line" value={readStopSequences(settingsDraft.modelOptions)} onChange={(event) => setModelOption("stop", event.target.value.split("\n").filter((entry) => entry.trim().length > 0))} className="bg-[#0f172a] border-gray-700 min-h-24" /></div>
              </div>

              <div className="rounded-xl border border-gray-800 bg-[#0b1220] p-4 space-y-4">
                <div>
                  <div className="font-bold text-gray-100 mb-1">Saved model configs</div>
                  <div className="text-xs text-gray-500">Save reusable provider/model/tuning presets for local models or cloud backends.</div>
                </div>
                <div className="flex flex-col md:flex-row gap-3">
                  <Input data-testid="settings-model-config-name-input" placeholder="Local Qwen coder" value={newPresetName} onChange={(event) => setNewPresetName(event.target.value)} className="bg-[#0f172a] border-gray-700" />
                  <Button data-testid="settings-save-model-config" variant="outline" className="bg-[#0b1220] border-gray-700 hover:bg-[#1e293b] text-gray-300" onClick={saveCurrentModelConfig}>Save current as preset</Button>
                </div>
                <div className="space-y-3">
                  {(settingsDraft.savedModelConfigs ?? []).length === 0 ? <div className="text-xs text-gray-500">No saved model configs yet.</div> : null}
                  {(settingsDraft.savedModelConfigs ?? []).map((config) => (
                    <div key={config.id} className="rounded-lg border border-gray-800 bg-[#0f172a] p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-gray-200">{config.name}</div>
                          <div className="text-xs text-gray-500">{config.provider || "—"} / {config.model || "—"}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button data-testid={`settings-apply-model-config-${config.id}`} variant="outline" className="bg-[#0b1220] border-gray-700 hover:bg-[#1e293b] text-gray-300 h-8 text-xs" onClick={() => {
                            setSettingsDraft((current) => ({
                              ...current,
                              defaultProvider: config.provider ?? current.defaultProvider,
                              defaultModel: config.model ?? current.defaultModel,
                              defaultBaseUrl: config.baseUrl ?? "",
                              defaultThinkingLevel: config.thinkingLevel ?? current.defaultThinkingLevel,
                              modelOptions: config.modelOptions ?? {},
                            }));
                            setSettingsStatus({ tone: "idle", message: `Applied preset “${config.name}”. Click Save settings to persist it.` });
                          }}>Apply</Button>
                          <Button data-testid={`settings-delete-model-config-${config.id}`} variant="ghost" className="text-gray-400 hover:text-gray-200 h-8 text-xs" onClick={() => {
                            setSettingsDraft((current) => ({
                              ...current,
                              savedModelConfigs: deleteSavedModelConfig(current.savedModelConfigs, config.id),
                            }));
                            setSettingsStatus({ tone: "idle", message: `Removed preset “${config.name}”. Click Save settings to persist it.` });
                          }}>Remove</Button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">thinking: {config.thinkingLevel ?? "medium"}{config.baseUrl ? ` • endpoint: ${config.baseUrl}` : ""}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-800 bg-[#0b1220] p-4 space-y-3"><div className="flex items-center space-x-2"><Checkbox id="settings-auto-delete-enabled" checked={settingsDraft.autoDeleteEnabled === true} onCheckedChange={(checked) => setSettingsDraft({ ...settingsDraft, autoDeleteEnabled: checked === true })} /><label htmlFor="settings-auto-delete-enabled" className="text-sm font-medium leading-none text-gray-300">Auto-delete old chats and artifacts</label></div><div><div className="text-xs text-gray-400 mb-2">Retention days</div><Input data-testid="settings-auto-delete-days-input" type="number" min={1} disabled={settingsDraft.autoDeleteEnabled !== true} placeholder="30" value={String(settingsDraft.autoDeleteDays ?? 30)} onChange={(event) => setSettingsDraft({ ...settingsDraft, autoDeleteDays: Number(event.target.value || 30) })} className="bg-[#0f172a] border-gray-700 disabled:opacity-50" /><div className="text-xs text-gray-500 mt-2">When enabled, Pinchy automatically deletes chats and artifacts older than this many days.</div></div></div>
              <div className="rounded-xl border border-gray-800 bg-[#0b1220] p-4 space-y-3"><div className="font-bold text-gray-100">Tool retry penalty</div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><div className="text-xs text-gray-400 mb-2">Warning threshold</div><Input data-testid="settings-tool-retry-warning-threshold" type="number" min={1} placeholder="5" value={String(settingsDraft.toolRetryWarningThreshold ?? 5)} onChange={(event) => setSettingsDraft({ ...settingsDraft, toolRetryWarningThreshold: Number(event.target.value || 5) })} className="bg-[#0f172a] border-gray-700" /></div><div><div className="text-xs text-gray-400 mb-2">Hard stop threshold</div><Input data-testid="settings-tool-retry-hard-stop-threshold" type="number" min={1} placeholder="10" value={String(settingsDraft.toolRetryHardStopThreshold ?? 10)} onChange={(event) => setSettingsDraft({ ...settingsDraft, toolRetryHardStopThreshold: Number(event.target.value || 10) })} className="bg-[#0f172a] border-gray-700" /></div></div><div className="text-xs text-gray-500">Warn Pinchy before it keeps repeating the same tool call, then hard-stop and force a reassessment if it keeps retrying.</div></div>
              <div className="rounded-xl border border-amber-900/40 bg-[#0b1220] p-4 space-y-3"><div className="flex items-center space-x-2"><Checkbox id="settings-danger-mode-enabled" data-testid="settings-danger-mode-enabled" checked={settingsDraft.dangerModeEnabled === true} onCheckedChange={(checked) => setSettingsDraft({ ...settingsDraft, dangerModeEnabled: checked === true })} /><label htmlFor="settings-danger-mode-enabled" className="text-sm font-medium leading-none text-amber-200">Danger Mode (sandbox only)</label></div><div className="text-xs text-amber-300/90">Declares that this workspace may use risky local actions like desktop interaction, simulator control, clicks, typing, and validation runs in a sandboxed environment. This is a repo-local signal only and may not bypass host-level approval requirements.</div></div>
              <div className="flex flex-wrap items-center gap-3 pt-2"><Button data-testid="settings-save" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => void onUpdateSettings({
                ...settingsDraft,
                modelOptions: cleanModelOptions(settingsDraft.modelOptions),
                savedModelConfigs: settingsDraft.savedModelConfigs ?? [],
              }).then(() => {
                setSettingsDraft((current) => ({ ...current, providerApiKey: "" }));
                setSettingsStatus({ tone: "success", message: "Settings saved." });
              })}>Save settings</Button><Button variant="ghost" className="text-gray-400 hover:text-gray-200" onClick={() => void onDiscoverLocalServerModel(settingsDraft.defaultBaseUrl || "").then((result) => { setDetectedModel(result.detectedModel); if (result.detectedModel) setSettingsDraft((current) => ({ ...current, defaultModel: current.defaultModel || result.detectedModel })); })}>Detect model</Button><span className={`text-xs ${settingsStatus.tone === "success" ? "text-emerald-400" : "text-gray-500"}`}>{settingsStatus.message}</span></div>
            </div>
          </Card>

          <Card className="bg-[#111827] border-gray-800 p-5 h-fit">
            <div className="mb-6"><h2 className="text-xl font-semibold text-gray-100">Configuration guidance</h2><p className="text-sm text-gray-400 mt-1">Keep Pinchy as the shell and Pi as the execution substrate</p></div>
            <div className="space-y-4">
              <div className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="font-bold text-gray-100 mb-2">Workspace-local runtime config</div><div className="text-sm text-gray-400">Settings applied here choose the provider, model, endpoint, and tuning that Pinchy uses for this active workspace.</div><div className="text-xs text-gray-500 mt-2">These settings are persisted in .pinchy-runtime.json.</div></div>
              <div className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="font-bold text-gray-100 mb-2">Recommended local-model flow</div><div className="text-sm text-gray-400">Running Pi and a local OpenAI-compatible server together locally.</div><div className="text-xs text-gray-500 mt-2">Good defaults to expose across Ollama, LM Studio, and vLLM-style servers are temperature, top-p, top-k, min-p, seed, stop sequences, max tokens, repetition penalty, and context window.</div></div>
              <div className="bg-[#0b1220] rounded-xl p-4 border border-gray-800"><div className="font-bold text-gray-100 mb-2">Current effective defaults</div><div className="text-sm text-gray-400 mb-3">Merged runtime config for this workspace.</div><div className="space-y-2 text-sm text-gray-300 w-full">{summaryRows.map((row) => <div key={row.label} className="flex justify-between items-center gap-4 bg-[#1e293b] p-2 px-3 rounded-lg border border-gray-700"><span className="font-medium">{row.label}: {row.value}</span><span className="text-xs text-gray-500">{row.sourceLabel}</span></div>)}</div></div>
            </div>
          </Card>
        </div>
        </div>
      </ScrollArea>
    </div>
  );
}
