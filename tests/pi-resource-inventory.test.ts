import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listPiAgentResources } from "../apps/host/src/pi-resource-inventory.js";

test("listPiAgentResources inventories workspace and user Pi resources for dashboard syncing", () => {
  const root = mkdtempSync(join(tmpdir(), "pinchy-resource-inventory-"));
  const workspace = join(root, "workspace");
  const userAgentDir = join(root, "user-agent");

  mkdirSync(join(workspace, ".pi/extensions/browser-debugger"), { recursive: true });
  mkdirSync(join(workspace, ".pi/skills/tdd-implementation"), { recursive: true });
  mkdirSync(join(workspace, ".pi/prompts"), { recursive: true });
  mkdirSync(join(userAgentDir, "extensions/local-models"), { recursive: true });
  mkdirSync(join(userAgentDir, "skills/global-skill"), { recursive: true });

  writeFileSync(join(workspace, ".pi/extensions/browser-debugger/index.ts"), "export default {};\n");
  writeFileSync(join(workspace, ".pi/skills/tdd-implementation/SKILL.md"), "# tdd\n");
  writeFileSync(join(workspace, ".pi/prompts/browser-bug.md"), "prompt\n");
  writeFileSync(join(userAgentDir, "extensions/local-models/index.ts"), "export default {};\n");
  writeFileSync(join(userAgentDir, "skills/global-skill/SKILL.md"), "# skill\n");

  try {
    const resources = listPiAgentResources(workspace, { userAgentDir });

    assert.ok(resources.some((entry) => entry.type === "extension" && entry.name === "browser-debugger" && entry.scope === "workspace"));
    assert.ok(resources.some((entry) => entry.type === "skill" && entry.name === "tdd-implementation" && entry.scope === "workspace"));
    assert.ok(resources.some((entry) => entry.type === "prompt" && entry.name === "browser-bug" && entry.scope === "workspace"));
    assert.ok(resources.some((entry) => entry.type === "extension" && entry.name === "local-models" && entry.scope === "user"));
    assert.ok(resources.some((entry) => entry.type === "skill" && entry.name === "global-skill" && entry.scope === "user"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
