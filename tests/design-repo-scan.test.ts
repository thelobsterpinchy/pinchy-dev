import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepositoryDesignStructure } from "../apps/host/src/design-repo-scan.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-design-scan-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("scanRepositoryDesignStructure ranks structurally suspicious files across a repository", () => {
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
    writeFileSync(join(cwd, "src", "small.ts"), `export const add = (a: number, b: number) => a + b;\n`, "utf8");
    writeFileSync(join(cwd, "src", "locator.ts"), `
export function loadThing() {
  const queue = container.get("queue");
  const logger = container.get("logger");
  return { queue, logger };
}
`, "utf8");

    const result = scanRepositoryDesignStructure(cwd, { include: ["src"], maxFiles: 5, maxResultsPerFile: 3 });

    assert.equal(result.files.length, 2);
    assert.equal(result.files[0]?.filePath, "src/manager.ts");
    assert.equal(result.files[0]?.antiPatterns.some((card) => card.slug === "god-object"), true);
    assert.equal(result.files.some((file) => file.filePath === "src/locator.ts"), true);
    assert.match(result.summary, /Scanned/);
  });
});
