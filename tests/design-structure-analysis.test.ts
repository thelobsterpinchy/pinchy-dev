import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeDesignStructure } from "../apps/host/src/design-structure-analysis.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-design-structure-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("analyzeDesignStructure detects likely anti-patterns from local file contents and recommends healthier patterns", () => {
  withTempDir((cwd) => {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "manager.ts"), `
const container = globalContainer;

export class EverythingManager {
  constructor(a: string, b: string, c: string, d: string, e: string, f: string, g: string) {}

  run(mode: string, kind: string, state: string) {
    const logger = container.get("logger");
    const queue = container.get("queue");
    if (mode === "fast") return queue.push(kind);
    if (mode === "slow") return queue.push(state);
    if (mode === "safe") return queue.push(mode);
    if (mode === "debug") return queue.push(kind + state);
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

    const analysis = analyzeDesignStructure(cwd, { path: "src/manager.ts", maxResults: 4 });

    assert.equal(analysis.filePath, "src/manager.ts");
    assert.equal(analysis.antiPatterns.some((card) => card.slug === "service-locator"), true);
    assert.equal(analysis.antiPatterns.some((card) => card.slug === "long-parameter-list"), true);
    assert.equal(analysis.antiPatterns.some((card) => card.slug === "god-object"), true);
    assert.equal(analysis.patterns.some((card) => card.slug === "dependency-injection"), true);
    assert.equal(analysis.patterns.some((card) => card.slug === "facade"), true);
    assert.equal(analysis.evidence.length > 0, true);
  });
});

test("analyzeDesignStructure reports a useful summary when no strong anti-pattern heuristics match", () => {
  withTempDir((cwd) => {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "small.ts"), `
export function add(a: number, b: number) {
  return a + b;
}
`, "utf8");

    const analysis = analyzeDesignStructure(cwd, { path: "src/small.ts", maxResults: 3 });

    assert.equal(analysis.antiPatterns.length, 0);
    assert.equal(analysis.patterns.length >= 0, true);
    assert.match(analysis.summary, /No strong anti-pattern heuristics matched/i);
  });
});
