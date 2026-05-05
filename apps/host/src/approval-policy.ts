import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ApprovalRecord } from "../../../packages/shared/src/contracts.js";
import { isSessionScopeEnabled } from "./session-approval.js";

export type ApprovalPolicy = {
  scopes?: Record<string, boolean>;
};

export type ApprovalRequestContext = {
  cwd: string;
  hasUI: boolean;
  ui?: {
    confirm(title: string, message: string): Promise<boolean>;
  };
};

export type ApprovalRequest = {
  scope: string;
  title: string;
  message: string;
  envVar?: string;
};

const APPROVAL_POLICY_FILE = ".pinchy-approval-policy.json";

const DEFAULT_APPROVAL_SCOPES: Record<string, boolean> = {
  "desktop.actions": true,
  "simulator.actions": true,
  "validation.exec": true,
  "routine.exec": true,
};

const TOOL_SCOPE_BY_NAME: Record<string, string> = {
  desktop_open_app: "desktop.actions",
  desktop_click: "desktop.actions",
  desktop_type_text: "desktop.actions",
  desktop_press_keycode: "desktop.actions",
  window_click_relative: "desktop.actions",
  screen_click_template: "desktop.actions",
  screen_click_text: "desktop.actions",
  simulator_boot_device: "simulator.actions",
  simulator_open_url: "simulator.actions",
  simulator_type_text: "simulator.actions",
  simulator_tap: "simulator.actions",
  simulator_swipe: "simulator.actions",
};

export function getApprovalScopeForTool(toolName: string) {
  return TOOL_SCOPE_BY_NAME[toolName];
}

export function getApprovalPolicyPath(cwd: string) {
  return resolve(cwd, APPROVAL_POLICY_FILE);
}

export function loadApprovalPolicy(cwd: string): ApprovalPolicy {
  const path = getApprovalPolicyPath(cwd);
  if (!existsSync(path)) return { scopes: { ...DEFAULT_APPROVAL_SCOPES } };
  try {
    const saved = JSON.parse(readFileSync(path, "utf8")) as ApprovalPolicy;
    return {
      ...saved,
      scopes: {
        ...DEFAULT_APPROVAL_SCOPES,
        ...(saved.scopes ?? {}),
      },
    };
  } catch {
    return { scopes: { ...DEFAULT_APPROVAL_SCOPES } };
  }
}

export function saveApprovalPolicy(cwd: string, policy: ApprovalPolicy) {
  const path = getApprovalPolicyPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(policy, null, 2), "utf8");
}

export function isActionAutoApproved(cwd: string, scope: string) {
  const policy = loadApprovalPolicy(cwd);
  return policy.scopes?.[scope] === true;
}

export function setApprovalScope(cwd: string, scope: string, enabled: boolean) {
  const policy = loadApprovalPolicy(cwd);
  policy.scopes ??= {};
  policy.scopes[scope] = enabled;
  saveApprovalPolicy(cwd, policy);
  return policy;
}

export async function requestScopedApproval(ctx: ApprovalRequestContext, request: ApprovalRequest) {
  if (isSessionScopeEnabled(ctx.cwd, request.scope)) return true;
  if (isActionAutoApproved(ctx.cwd, request.scope)) return true;
  if (ctx.hasUI && ctx.ui) return ctx.ui.confirm(request.title, request.message);
  return request.envVar ? process.env[request.envVar] === "1" : false;
}

function isScopeAlreadyAllowed(cwd: string, scope: string) {
  return isSessionScopeEnabled(cwd, scope) || isActionAutoApproved(cwd, scope);
}

export function filterActionableApprovals(cwd: string, approvals: ApprovalRecord[]) {
  return approvals.filter((approval) => {
    if (approval.status !== "pending") return true;
    const scope = getApprovalScopeForTool(approval.toolName);
    if (!scope) return true;
    return !isScopeAlreadyAllowed(cwd, scope);
  });
}
