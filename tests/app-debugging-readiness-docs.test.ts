import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function assertMentions(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    assert.match(text, pattern);
  }
}

test("desktop app-debugging docs stay aligned on observation-first readiness and approval flow", () => {
  const readme = readFileSync("README.md", "utf8");
  const operations = readFileSync("docs/OPERATIONS.md", "utf8");
  const architecture = readFileSync("docs/ARCHITECTURE.md", "utf8");

  assert.match(readme, /Desktop and simulator debugging/i);
  assert.match(readme, /approval-aware local action controls/i);

  assertMentions(operations, [
    /`desktop_screenshot`/i,
    /`active_app_info`/i,
    /`desktop_ui_snapshot`/i,
    /`desktop_open_app`/i,
  ]);
  assert.match(operations, /capture a `desktop_screenshot` first/i);
  assert.match(operations, /inspect the frontmost app\/window with `active_app_info`/i);
  assert.match(operations, /use `desktop_ui_snapshot` .* before interacting/i);
  assert.match(operations, /only use `desktop_open_app` .* after approval/i);
  assert.match(operations, /save JSON artifacts under `artifacts\/`/i);
  assert.match(operations, /observation-first/i);
  assert.match(operations, /dangerModeEnabled/i);
  assert.match(operations, /does not override host-level approval enforcement/i);

  assert.match(architecture, /local screenshot and active-app inspection tools/i);
  assert.match(architecture, /approval-gated app opening/i);
});
