import test from "node:test";
import assert from "node:assert/strict";
import { buildPinchyInitPlan, formatPinchyInitSummary } from "../apps/host/src/pinchy-init.js";

test("buildPinchyInitPlan scaffolds packaged defaults and gitignore lines for a fresh repo", () => {
  const plan = buildPinchyInitPlan({
    cwd: "/work/demo",
    packageRoot: "/pkg/pinchy-dev",
    existingFiles: new Set<string>(),
    existingGitignore: "node_modules/\n",
  });

  assert.ok(plan.copyPaths.some((entry) => entry.from === "/pkg/pinchy-dev/.pi" && entry.to === "/work/demo/.pi"));
  assert.ok(plan.writeFiles.some((entry) => entry.path === "/work/demo/.pinchy-runtime.json"));
  assert.ok(plan.writeFiles.some((entry) => entry.path === "/work/demo/.pinchy-goals.json"));

  const runtimeConfig = plan.writeFiles.find((entry) => entry.path === "/work/demo/.pinchy-runtime.json");
  assert.ok(runtimeConfig);
  const parsedRuntimeConfig = JSON.parse(runtimeConfig.content);
  assert.equal(parsedRuntimeConfig.submarine.enabled, true);
  assert.equal(parsedRuntimeConfig.submarine.pythonPath, "python3");
  assert.equal(parsedRuntimeConfig.submarine.scriptModule, "submarine.serve_stdio");
  assert.equal(parsedRuntimeConfig.submarine.supervisorModel, "qwen3-coder");
  assert.equal(parsedRuntimeConfig.submarine.agents.worker.model, "qwen3-coder");

  const watchConfig = plan.writeFiles.find((entry) => entry.path === "/work/demo/.pinchy-watch.json");
  assert.ok(watchConfig);
  assert.match(
    watchConfig.content,
    /prefer tests\/docs\/guardrails, and stop if no safe improvement is needed\./,
  );

  assert.match(plan.gitignoreText, /\.pinchy\/env/);
  assert.match(plan.gitignoreText, /\.pinchy\/run\//);
  assert.match(plan.gitignoreText, /\.pinchy-tasks\.json\.bak-\*/);
  assert.match(plan.gitignoreText, /artifacts\//);
});

test("formatPinchyInitSummary explains next steps after initialization", () => {
  const summary = formatPinchyInitSummary("/work/demo", {
    copyPaths: [{ from: "/pkg/pinchy-dev/.pi", to: "/work/demo/.pi" }],
    writeFiles: [
      { path: "/work/demo/.pinchy-runtime.json", content: "{}\n" },
      { path: "/work/demo/.pinchy-goals.json", content: "{}\n" },
    ],
    gitignoreText: ".pinchy/run/\n",
  });

  assert.match(summary, /Initialized workspace at \/work\/demo/);
  assert.match(summary, /copied: 1 paths/);
  assert.match(summary, /wrote: 2 files/);
  assert.match(summary, /Next steps:/);
  assert.match(summary, /pinchy doctor/);
  assert.match(summary, /pinchy up/);
  assert.match(summary, /pinchy agent/);
  assert.match(summary, /Submarine runtime is enabled for new workspaces/);
  assert.match(summary, /submarine\.enabled false/);
});

test("buildPinchyInitPlan respects existing workspace files and avoids duplicate gitignore lines", () => {
  const plan = buildPinchyInitPlan({
    cwd: "/work/demo",
    packageRoot: "/pkg/pinchy-dev",
    existingFiles: new Set<string>([
      "/work/demo/.pi",
      "/work/demo/.pinchy-runtime.json",
      "/work/demo/.pinchy-goals.json",
      "/work/demo/.pinchy-watch.json",
    ]),
    existingGitignore: ".pinchy/run/\nartifacts/\n",
  });

  assert.deepEqual(plan.copyPaths, []);
  assert.deepEqual(plan.writeFiles, []);
  assert.match(plan.gitignoreText, /^\.pinchy\/run\/\nartifacts\/\n/m);
  assert.equal(plan.gitignoreText.match(/^\.pinchy\/run\/$/gm)?.length, 1);
  assert.equal(plan.gitignoreText.match(/^artifacts\/$/gm)?.length, 1);
  assert.match(plan.gitignoreText, /\.pinchy\/state\//);
  assert.match(plan.gitignoreText, /\.pinchy-tasks\.json\.bak-\*/);
  assert.match(plan.gitignoreText, /logs\/\*\.jsonl/);
});
