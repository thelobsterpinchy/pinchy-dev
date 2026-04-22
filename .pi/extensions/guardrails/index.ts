import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { isTestLikePath, shouldEnforceTddForPath } from "../../../apps/host/src/engineering-policy.js";
import { assessUserRequestTasks } from "../../../apps/host/src/orchestration-policy.js";

const BLOCKED_BASH_PATTERNS = [
  /rm\s+-rf\s+\//,
  /sudo\s+/,
  /mkfs\./,
  /dd\s+if=/,
  /chmod\s+-R\s+777/,
  /diskutil\s+eraseDisk/,
];

const BLOCKED_CODE_QUALITY_SHORTCUTS = [
  /--no-verify\b/,
  /\bany\b.*eslint-disable/,
  /eslint-disable(?!.*specific)/,
  /@ts-ignore/,
  /FIXME\s*:\s*later/i,
];

const PROTECTED_PATH_PATTERNS = [
  /(^|\/)\.env(\.|$)/,
  /credentials/i,
  /id_rsa/i,
  /\.aws\//,
  /\.ssh\//,
  /auth\.json$/,
];

function isProtectedPath(path: string) {
  return PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function shouldRemindAboutTests(path: string) {
  return !/(test|spec|fixture|snapshot)/i.test(path);
}

export default function guardrails(pi: ExtensionAPI) {
  let hasTouchedTestsThisSession = false;
  let currentTurnRequiresDelegation = false;
  let delegationStartedThisTurn = false;

  pi.on("session_start", async () => {
    hasTouchedTestsThisSession = false;
    currentTurnRequiresDelegation = false;
    delegationStartedThisTurn = false;
  });

  pi.on("message_start", async (event) => {
    const message = event?.message;
    if (!message || typeof message !== "object") return;
    if ((message as { role?: unknown }).role !== "user" || typeof (message as { content?: unknown }).content !== "string") return;
    const assessment = assessUserRequestTasks((message as { content: string }).content);
    currentTurnRequiresDelegation = assessment.requiresDelegation;
    delegationStartedThisTurn = false;
  });

  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: `${event.systemPrompt}

Engineering Guardrails:
- Behavior changes follow TDD by default: identify the smallest useful failing test first, then implement, then re-run validation.
- For bug fixes, prefer regression tests before implementation.
- Use /skill:tdd-implementation for behavior changes and /skill:design-pattern-review or /skill:engineering-excellence for structural changes.
- Keep code clean: small focused functions, explicit names, cohesive modules, clear boundaries, and composition over unnecessary inheritance.
- Prefer the lightest design pattern that solves the real problem. Avoid speculative abstractions.
- Do not bypass quality checks with shortcuts like broad eslint disables or ts-ignore unless explicitly justified.
- If tests are impractical, explain why before changing implementation code.
- Do not access secrets or protected files.
- Prefer safe observation before taking action on browser or desktop targets.
- Keep autonomous self-improvement scoped to this repository by default.`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event?.toolName === "delegate_task_plan" || event?.toolName === "queue_task") {
      delegationStartedThisTurn = true;
    }

    if (isToolCallEventType("bash", event)) {
      const blocked = BLOCKED_BASH_PATTERNS.find((pattern) => pattern.test(event.input.command));
      if (blocked) {
        return { block: true, reason: `Blocked dangerous command: ${blocked}` };
      }
      const qualityShortcut = BLOCKED_CODE_QUALITY_SHORTCUTS.find((pattern) => pattern.test(event.input.command));
      if (qualityShortcut) {
        return { block: true, reason: `Blocked code-quality shortcut: ${qualityShortcut}` };
      }
      if (/git\s+push/.test(event.input.command) && process.env.PINCHY_ALLOW_GIT_PUSH !== "1") {
        return { block: true, reason: "git push is blocked unless PINCHY_ALLOW_GIT_PUSH=1 is set." };
      }
    }

    if (isToolCallEventType("read", event)) {
      const path = event.input.path;
      if (isProtectedPath(path)) {
        return { block: true, reason: `Protected path blocked: ${path}` };
      }
      if (isTestLikePath(path)) hasTouchedTestsThisSession = true;
    }

    if (isToolCallEventType("write", event)) {
      const path = event.input.path;
      if (isProtectedPath(path)) {
        return { block: true, reason: `Protected path blocked: ${path}` };
      }
      if (isTestLikePath(path)) hasTouchedTestsThisSession = true;
      if (currentTurnRequiresDelegation && shouldEnforceTddForPath(path) && !delegationStartedThisTurn) {
        return { block: true, reason: `Orchestration guardrail: this user request contains multiple tasks. Reply with the task plan in-thread and call delegate_task_plan or queue_task before editing implementation code (${path}).` };
      }
      if (shouldEnforceTddForPath(path) && !hasTouchedTestsThisSession && process.env.PINCHY_ALLOW_NON_TDD !== "1") {
        return { block: true, reason: `TDD guardrail: touch or create a relevant test before writing implementation code (${path}). Override only with PINCHY_ALLOW_NON_TDD=1.` };
      }
      if (shouldRemindAboutTests(path)) {
        ctx.ui.setStatus("guardrails", `Writing ${path}; confirm tests or regression coverage are updated.`);
      }
    }

    if (isToolCallEventType("edit", event)) {
      const path = event.input.path;
      if (isProtectedPath(path)) {
        return { block: true, reason: `Protected path blocked: ${path}` };
      }
      if (isTestLikePath(path)) hasTouchedTestsThisSession = true;
      if (currentTurnRequiresDelegation && shouldEnforceTddForPath(path) && !delegationStartedThisTurn) {
        return { block: true, reason: `Orchestration guardrail: this user request contains multiple tasks. Reply with the task plan in-thread and call delegate_task_plan or queue_task before editing implementation code (${path}).` };
      }
      if (shouldEnforceTddForPath(path) && !hasTouchedTestsThisSession && process.env.PINCHY_ALLOW_NON_TDD !== "1") {
        return { block: true, reason: `TDD guardrail: update or inspect a relevant test before editing implementation code (${path}). Override only with PINCHY_ALLOW_NON_TDD=1.` };
      }
      if (shouldRemindAboutTests(path)) {
        ctx.ui.setStatus("guardrails", `Editing ${path}; consider adding or updating tests first.`);
      }
    }
  });

  pi.registerCommand("suggest-test-command", {
    description: "Show the test command Pinchy will prefer during validation.",
    handler: async (_args, ctx) => {
      const suggested = process.env.PINCHY_TEST_COMMAND ?? "npm test";
      ctx.ui.notify(`Suggested validation command: ${suggested}`, "info");
    },
  });

  pi.registerCommand("engineering-checklist", {
    description: "Show Pinchy's required engineering workflow for TDD and code quality.",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        "Engineering checklist: 1) restate behavior, 2) add/update a failing test first when practical, 3) run targeted validation, 4) make the smallest fix, 5) refactor only with tests green, 6) explain chosen pattern/tradeoff briefly.",
        "info",
      );
    },
  });
}
