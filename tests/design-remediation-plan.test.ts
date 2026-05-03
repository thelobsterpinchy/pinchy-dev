import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDesignRemediationPlan } from "../apps/host/src/design-remediation-plan.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-design-remediation-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("buildDesignRemediationPlan turns structural findings into concrete refactor steps", () => {
  withTempDir((cwd) => {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "manager.ts"), `
const container = globalContainer;
export class EverythingManager {
  constructor(a: string, b: string, c: string, d: string, e: string, f: string, g: string) {}
  run(mode: string, kind: string, state: string) {
    const logger = container.get("logger");
    if (mode === "fast") return logger;
    if (mode === "slow") return logger;
    if (mode === "safe") return logger;
    if (mode === "debug") return logger;
    return logger;
  }
  save() {}
  load() {}
  render() {}
  validate() {}
  notify() {}
  update() {}
  delete() {}
  enqueue() {}
}
`, "utf8");

    const plan = buildDesignRemediationPlan(cwd, { path: "src/manager.ts", maxResults: 4 });

    assert.equal(plan.filePath, "src/manager.ts");
    assert.equal(plan.antiPatterns.some((card) => card.slug === "service-locator"), true);
    assert.equal(plan.patterns.some((card) => card.slug === "dependency-injection"), true);
    assert.equal(plan.steps.length > 0, true);
    assert.match(plan.steps.join("\n"), /Introduce explicit dependency injection/i);
    assert.match(plan.steps.join("\n"), /Extract cohesive responsibilities/i);
    assert.match(plan.summary, /Refactor plan/);
  });
});

test("buildDesignRemediationPlan reports when a file has no strong structural findings", () => {
  withTempDir((cwd) => {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "small.ts"), `export const add = (a: number, b: number) => a + b;\n`, "utf8");

    const plan = buildDesignRemediationPlan(cwd, { path: "src/small.ts", maxResults: 3 });

    assert.equal(plan.steps.length, 0);
    assert.match(plan.summary, /No strong remediation plan needed/i);
  });
});
