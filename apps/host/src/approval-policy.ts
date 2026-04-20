import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type ApprovalPolicy = {
  scopes?: Record<string, boolean>;
};

const APPROVAL_POLICY_FILE = ".pinchy-approval-policy.json";

export function getApprovalPolicyPath(cwd: string) {
  return resolve(cwd, APPROVAL_POLICY_FILE);
}

export function loadApprovalPolicy(cwd: string): ApprovalPolicy {
  const path = getApprovalPolicyPath(cwd);
  if (!existsSync(path)) return { scopes: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ApprovalPolicy;
  } catch {
    return { scopes: {} };
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
