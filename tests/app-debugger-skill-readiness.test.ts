import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("app-debugger skill stays observation-first and names the desktop readiness tools", () => {
  const skill = readFileSync(".pi/skills/app-debugger/SKILL.md", "utf8");

  assert.match(skill, /desktop_screenshot/i);
  assert.match(skill, /active_app_info/i);
  assert.match(skill, /desktop_ui_snapshot/i);
  assert.match(skill, /desktop_open_app/i);
  assert.match(skill, /artifacts\//i);
  assert.match(skill, /approval/i);
  assert.match(skill, /regression coverage|regression test/i);
  assert.match(skill, /smallest viable fix|minimal fix/i);
});
