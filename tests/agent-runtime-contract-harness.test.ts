import test from "node:test";
import assert from "node:assert/strict";
import type { AgentResourceEntry, Run } from "../packages/shared/src/contracts.js";
import {
  REQUIRED_RUNTIME_RESOURCE_NAMES,
  REQUIRED_RUNTIME_TOOL_NAMES,
  hasRuntimeResource,
  hasRuntimeTool,
  type AgentRuntimeContract,
  type AgentRuntimeStrategy,
  type RuntimeCapabilitySnapshot,
  type RuntimeExecutionInput,
  type RuntimeExecutionResult,
  type RuntimeResumeInput,
  type RuntimeToolDescriptor,
} from "../services/agent-worker/src/agent-runtime-contract.js";

function makeRun(id: string, goal = "Investigate runtime parity"): Run {
  return {
    id,
    conversationId: "conversation-runtime-contract",
    goal,
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-05-05T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z",
  };
}

function requiredTools(): RuntimeToolDescriptor[] {
  return REQUIRED_RUNTIME_TOOL_NAMES.map((name) => ({ name, label: name.replace(/_/g, " ") }));
}

function requiredResources(): AgentResourceEntry[] {
  return [
    { type: "skill", scope: "workspace", name: "design-pattern-review", path: "/repo/.pi/skills/design-pattern-review/SKILL.md" },
    { type: "skill", scope: "workspace", name: "engineering-excellence", path: "/repo/.pi/skills/engineering-excellence/SKILL.md" },
    { type: "skill", scope: "workspace", name: "tdd-implementation", path: "/repo/.pi/skills/tdd-implementation/SKILL.md" },
    { type: "skill", scope: "workspace", name: "website-debugger", path: "/repo/.pi/skills/website-debugger/SKILL.md" },
    { type: "skill", scope: "workspace", name: "playwright-investigation", path: "/repo/.pi/skills/playwright-investigation/SKILL.md" },
    { type: "prompt", scope: "workspace", name: "browser-bug", path: "/repo/.pi/prompts/browser-bug.md" },
  ];
}

type FakeRuntimeOptions = {
  strategy: AgentRuntimeStrategy;
  calls?: string[];
};

function createFakeRuntimeAdapter({ strategy, calls = [] }: FakeRuntimeOptions): AgentRuntimeContract {
  return {
    strategy,
    getCapabilities(cwd: string): RuntimeCapabilitySnapshot {
      calls.push(`${strategy}:capabilities:${cwd}`);
      return {
        strategy,
        tools: requiredTools(),
        resources: requiredResources(),
      };
    },
    async executeRun({ cwd, run }: RuntimeExecutionInput): Promise<RuntimeExecutionResult> {
      calls.push(`${strategy}:execute:${cwd}:${run.id}`);
      if (run.goal.includes("fail")) {
        return {
          outcome: {
            kind: "failed",
            summary: "Runtime failed",
            message: "Runtime failed",
            error: "simulated failure",
            sessionPath: `${strategy}:session:${run.id}`,
          },
          auditEntries: [{ type: "runtime_failed", runId: run.id, summary: "Runtime failed" }],
        };
      }
      if (run.goal.includes("question")) {
        return {
          outcome: {
            kind: "waiting_for_human",
            summary: "Runtime needs input",
            message: "Runtime needs input",
            blockedReason: "Need operator choice",
            question: {
              prompt: "Should the runtime continue?",
              channelHints: ["dashboard"],
            },
            sessionPath: `${strategy}:session:${run.id}`,
          },
          auditEntries: [{ type: "runtime_waiting_for_human", runId: run.id, summary: "Runtime needs input" }],
        };
      }
      return {
        outcome: {
          kind: "completed",
          summary: "Runtime completed",
          message: `Runtime ${strategy} completed ${run.goal}`,
          sessionPath: `${strategy}:session:${run.id}`,
        },
        artifacts: [{ path: `artifacts/${strategy}-${run.id}.json`, toolName: "internet_search" }],
        auditEntries: [{ type: "runtime_completed", runId: run.id, summary: "Runtime completed" }],
      };
    },
    async resumeRun({ cwd, run, reply }: RuntimeResumeInput): Promise<RuntimeExecutionResult> {
      calls.push(`${strategy}:resume:${cwd}:${run.id}:${reply}`);
      return {
        outcome: {
          kind: "completed",
          summary: "Runtime resumed",
          message: `Runtime ${strategy} resumed with ${reply}`,
          sessionPath: run.sessionPath ?? `${strategy}:session:${run.id}`,
        },
        auditEntries: [{ type: "runtime_resumed", runId: run.id, summary: "Runtime resumed" }],
      };
    },
  };
}

type MockSubmarineRpcCall = {
  method: string;
  params: Record<string, unknown>;
};

class MockSubmarineRpcTransport {
  readonly calls: MockSubmarineRpcCall[] = [];

  async request(method: string, params: Record<string, unknown>) {
    this.calls.push({ method, params });
    if (method === "list_capabilities") {
      return {
        tools: requiredTools(),
        resources: requiredResources(),
      };
    }
    if (method === "converse" && typeof params.message === "string" && params.message.includes("question")) {
      return { kind: "waiting_for_human" };
    }
    if (method === "converse" && typeof params.message === "string" && params.message.includes("fail")) {
      return { kind: "failed" };
    }
    return { kind: "completed" };
  }
}

function createMockSubmarineRuntimeAdapter(transport: MockSubmarineRpcTransport): AgentRuntimeContract {
  const fallback = createFakeRuntimeAdapter({ strategy: "submarine" });
  return {
    strategy: "submarine",
    async getCapabilities(cwd: string): Promise<RuntimeCapabilitySnapshot> {
      const result = await transport.request("list_capabilities", { cwd }) as Pick<RuntimeCapabilitySnapshot, "tools" | "resources">;
      return {
        strategy: "submarine",
        tools: result.tools,
        resources: result.resources,
      };
    },
    async executeRun(input: RuntimeExecutionInput) {
      await transport.request("start_session", { cwd: input.cwd, runId: input.run.id });
      await transport.request("converse", { message: input.run.goal, runId: input.run.id });
      return fallback.executeRun(input);
    },
    async resumeRun(input: RuntimeResumeInput) {
      await transport.request("converse", { message: input.reply, runId: input.run.id, resume: true });
      return fallback.resumeRun(input);
    },
  };
}

function registerRuntimeContractTests(name: string, createRuntime: () => AgentRuntimeContract) {
  test(`${name} exposes required shared tools and resources`, async () => {
    const runtime = createRuntime();
    const capabilities = await runtime.getCapabilities("/repo");

    assert.equal(capabilities.strategy, runtime.strategy);
    for (const toolName of REQUIRED_RUNTIME_TOOL_NAMES) {
      assert.equal(hasRuntimeTool(capabilities, toolName), true, `${runtime.strategy} missing tool ${toolName}`);
    }
    for (const resourceName of REQUIRED_RUNTIME_RESOURCE_NAMES) {
      assert.equal(hasRuntimeResource(capabilities, resourceName), true, `${runtime.strategy} missing resource ${resourceName}`);
    }
  });

  test(`${name} completes runs with artifacts and audit entries`, async () => {
    const runtime = createRuntime();
    const result = await runtime.executeRun({ cwd: "/repo", run: makeRun("run-complete") });

    assert.equal(result.outcome.kind, "completed");
    assert.match(result.outcome.message, new RegExp(runtime.strategy));
    assert.ok(result.outcome.sessionPath);
    assert.ok(result.artifacts?.some((artifact) => artifact.path.startsWith("artifacts/")));
    assert.ok(result.auditEntries?.some((entry) => entry.type === "runtime_completed"));
  });

  test(`${name} returns failed outcomes without throwing`, async () => {
    const runtime = createRuntime();
    const result = await runtime.executeRun({ cwd: "/repo", run: makeRun("run-fail", "please fail") });

    assert.equal(result.outcome.kind, "failed");
    assert.match(result.outcome.error ?? "", /simulated failure/);
    assert.ok(result.auditEntries?.some((entry) => entry.type === "runtime_failed"));
  });

  test(`${name} waits for human input and resumes`, async () => {
    const runtime = createRuntime();
    const waiting = await runtime.executeRun({ cwd: "/repo", run: makeRun("run-question", "ask a question") });

    assert.equal(waiting.outcome.kind, "waiting_for_human");
    assert.match(waiting.outcome.question.prompt, /continue/i);
    assert.ok(waiting.outcome.sessionPath);

    const resumedRun = {
      ...makeRun("run-question", "ask a question"),
      sessionPath: waiting.outcome.sessionPath,
      status: "waiting_for_human" as const,
    };
    const resumed = await runtime.resumeRun({ cwd: "/repo", run: resumedRun, reply: "continue" });

    assert.equal(resumed.outcome.kind, "completed");
    assert.equal(resumed.outcome.sessionPath, waiting.outcome.sessionPath);
    assert.ok(resumed.auditEntries?.some((entry) => entry.type === "runtime_resumed"));
  });
}

registerRuntimeContractTests("Pi-backed runtime contract harness", () => createFakeRuntimeAdapter({ strategy: "pi-backed" }));
registerRuntimeContractTests("Submarine runtime contract harness", () => createMockSubmarineRuntimeAdapter(new MockSubmarineRpcTransport()));

test("mock Submarine contract adapter uses RPC without spawning Python", async () => {
  const transport = new MockSubmarineRpcTransport();
  const runtime = createMockSubmarineRuntimeAdapter(transport);

  await runtime.getCapabilities("/repo");
  await runtime.executeRun({ cwd: "/repo", run: makeRun("run-rpc") });
  await runtime.resumeRun({ cwd: "/repo", run: makeRun("run-rpc"), reply: "resume" });

  assert.deepEqual(transport.calls.map((call) => call.method), [
    "list_capabilities",
    "start_session",
    "converse",
    "converse",
  ]);
});
