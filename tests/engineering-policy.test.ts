import test from "node:test";
import assert from "node:assert/strict";
import { isImplementationCodePath, isTestLikePath, shouldEnforceTddForPath } from "../apps/host/src/engineering-policy.js";

test("engineering policy identifies test files", () => {
  assert.equal(isTestLikePath("tests/example.test.ts"), true);
  assert.equal(isTestLikePath("src/example.ts"), false);
});

test("engineering policy identifies implementation code", () => {
  assert.equal(isImplementationCodePath("src/example.ts"), true);
  assert.equal(isImplementationCodePath("src/example.test.ts"), false);
  assert.equal(isImplementationCodePath("README.md"), false);
});

test("engineering policy enforces TDD for implementation code paths", () => {
  assert.equal(shouldEnforceTddForPath("apps/host/src/main.ts"), true);
  assert.equal(shouldEnforceTddForPath("tests/main.test.ts"), false);
});
