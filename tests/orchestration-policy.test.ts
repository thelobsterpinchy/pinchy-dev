import test from "node:test";
import assert from "node:assert/strict";
import { assessUserRequestTasks, buildOrchestrationSummary } from "../apps/host/src/orchestration-policy.js";

test("assessUserRequestTasks keeps truly small requests inline", () => {
  const assessment = assessUserRequestTasks("Fix the flaky worker test.");

  assert.equal(assessment.taskCount, 1);
  assert.equal(assessment.requiresDelegation, false);
  assert.equal(assessment.executionShape, "single");
});

test("assessUserRequestTasks detects multi-task parallelizable requests", () => {
  const assessment = assessUserRequestTasks("Audit the worker, inspect the dashboard, and capture the failing network requests.");

  assert.equal(assessment.requiresDelegation, true);
  assert.equal(assessment.taskCount, 3);
  assert.equal(assessment.executionShape, "parallel");
});

test("assessUserRequestTasks detects dependency-chained requests", () => {
  const assessment = assessUserRequestTasks("Find the root cause then patch it then validate it.");

  assert.equal(assessment.requiresDelegation, true);
  assert.equal(assessment.taskCount, 3);
  assert.equal(assessment.executionShape, "dependency-chained");
});

test("buildOrchestrationSummary formats a mixed execution plan with dependency edges and synthesis state", () => {
  const summary = buildOrchestrationSummary({
    intro: "I classified this request into delegated work.",
    tasks: [
      { title: "Audit worker logs", status: "pending" },
      { title: "Review dashboard smoke", status: "running" },
      { title: "Apply safe fix", status: "pending", dependsOnTitles: ["Audit worker logs", "Review dashboard smoke"] },
    ],
  });

  assert.match(summary, /execution mode: mixed/i);
  assert.match(summary, /delegated tasks created: 3/i);
  assert.match(summary, /1\. Audit worker logs/i);
  assert.match(summary, /3\. Apply safe fix/i);
  assert.match(summary, /Apply safe fix waits for Audit worker logs/i);
  assert.match(summary, /Apply safe fix waits for Review dashboard smoke/i);
  assert.match(summary, /synthesis status: waiting on 3 delegated task\(s\) before final synthesis/i);
});

 test("buildOrchestrationSummary reports when delegated work is ready for final synthesis", () => {
  const summary = buildOrchestrationSummary({
    tasks: [
      { title: "Audit worker logs", status: "done" },
      { title: "Apply safe fix", status: "done", dependsOnTitles: ["Audit worker logs"] },
    ],
  });

  assert.match(summary, /execution mode: dependency-chained/i);
  assert.match(summary, /Apply safe fix waits for Audit worker logs/i);
  assert.match(summary, /synthesis status: ready to synthesize the final thread update/i);
});
