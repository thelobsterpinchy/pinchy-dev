import type { DashboardState } from "../../../../packages/shared/src/contracts.js";
import {
  appendConversationMessage,
  cancelRun,
  createConversation,
  createMemory,
  createRun,
  deleteConversation,
  deleteMemory,
  deleteWorkspace,
  discoverLocalServerModel,
  fetchConversationState,
  fetchConversations,
  fetchSettings,
  registerWorkspace,
  replyToQuestion,
  setActiveWorkspace,
  submitAgentGuidance,
  submitPromptToConversation,
  updateMemory,
  updateSettings,
  type ConversationState,
  type DashboardSettings,
  type LocalServerModelDiscovery,
} from "../control-plane-client.js";

export type DoctorReport = {
  summary: { status: "ok" | "warn" | "fail"; okCount: number; warnCount: number; failCount: number };
  checks: Array<{ name: string; status: "ok" | "warn" | "fail"; message: string; hint?: string }>;
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function fetchDashboardState() {
  return fetchJson<DashboardState>("/api/state");
}

export function fetchDoctorReport() {
  return fetchJson<DoctorReport>("/api/doctor");
}

export async function reloadRuntime() {
  return fetchJson<{ ok: true }>("/api/actions/reload-runtime", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function queueManualTask(input: { title: string; prompt: string }) {
  return fetchJson<{ ok: true }>("/api/actions/queue-task", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export {
  appendConversationMessage,
  cancelRun,
  createConversation,
  createMemory,
  createRun,
  deleteConversation,
  deleteMemory,
  deleteWorkspace,
  discoverLocalServerModel,
  fetchConversationState,
  fetchConversations,
  fetchSettings,
  registerWorkspace,
  replyToQuestion,
  setActiveWorkspace,
  submitAgentGuidance,
  submitPromptToConversation,
  updateMemory,
  updateSettings,
};

export type { ConversationState, DashboardSettings, LocalServerModelDiscovery };
