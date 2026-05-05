import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { buildSubmarinePythonEnv, getBundledSubmarinePythonPath } from "../apps/host/src/submarine-python.js";

test("buildSubmarinePythonEnv puts bundled Submarine package on PYTHONPATH", () => {
  const bundledPath = getBundledSubmarinePythonPath();
  const env = buildSubmarinePythonEnv({ PYTHONPATH: "/existing/path" });

  assert.equal(existsSync(`${bundledPath}/submarine/serve_stdio.py`), true);
  assert.equal(env.PYTHONPATH, `${bundledPath}${delimiter}/existing/path`);
});
