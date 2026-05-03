import test from "node:test";
import assert from "node:assert/strict";
import { assessUserRequestTasks, buildOrchestrationSummary } from "../apps/host/src/orchestration-policy.js";

test("assessUserRequestTasks requires delegation for single-task coding requests", () => {
  const assessment = assessUserRequestTasks("Fix the flaky worker test.");

  assert.equal(assessment.taskCount, 1);
  assert.equal(assessment.requiresDelegation, true);
  assert.equal(assessment.executionShape, "single");
});

test("assessUserRequestTasks keeps truly small non-coding requests inline", () => {
  const assessment = assessUserRequestTasks("How are you today?");

  assert.equal(assessment.taskCount, 1);
  assert.equal(assessment.requiresDelegation, false);
  assert.equal(assessment.executionShape, "single");
});

test("assessUserRequestTasks requires delegation for research-heavy requests", () => {
  const assessment = assessUserRequestTasks("Research the best approach for local-first agent memory persistence and summarize the tradeoffs.");

  assert.equal(assessment.taskCount, 1);
  assert.equal(assessment.requiresDelegation, true);
  assert.equal(assessment.executionShape, "single");
});

test("assessUserRequestTasks requires delegation for time-intensive tool-calling requests", () => {
  const assessment = assessUserRequestTasks("Run browser probes across the dashboard, capture screenshots, inspect failing requests, and summarize what you find.");

  assert.equal(assessment.requiresDelegation, true);
  assert.equal(assessment.taskCount, 4);
  assert.equal(assessment.executionShape, "parallel");
});

test("assessUserRequestTasks detects multi-task parallelizable requests", () => {
  const assessment = assessUserRequestTasks("Audit the worker, inspect the dashboard, and capture the failing network requests.");

  assert.equal(assessment.requiresDelegation, true);
  assert.equal(assessment.taskCount, 3);
  assert.equal(assessment.executionShape, "parallel");
});


test("assessUserRequestTasks splits direct multi-task requests joined only by and", () => {
  const assessment = assessUserRequestTasks("Audit the worker and inspect the dashboard.");

  assert.equal(assessment.requiresDelegation, true);
  assert.equal(assessment.taskCount, 2);
  assert.equal(assessment.executionShape, "parallel");
});

test("assessUserRequestTasks splits three direct multi-task requests joined only by and", () => {
  const assessment = assessUserRequestTasks("Audit the worker and inspect the dashboard and capture the failing network requests.");

  assert.equal(assessment.requiresDelegation, true);
  assert.equal(assessment.taskCount, 3);
  assert.equal(assessment.executionShape, "parallel");
});

test("assessUserRequestTasks keeps single requests with 'go ahead and' phrasing intact", () => {
  const assessment = assessUserRequestTasks("Please go ahead and inspect the dashboard.");

  assert.equal(assessment.requiresDelegation, false);
  assert.equal(assessment.taskCount, 1);
  assert.equal(assessment.executionShape, "single");
});

test("assessUserRequestTasks detects dependency-chained requests", () => {
  const assessment = assessUserRequestTasks("Find the root cause then patch it then validate it.");

  assert.equal(assessment.requiresDelegation, true);
  assert.equal(assessment.taskCount, 3);
  assert.equal(assessment.executionShape, "dependency-chained");
});

test("assessUserRequestTasks focuses on the trailing ask when the request is mostly pasted internal orchestration text", () => {
  const assessment = assessUserRequestTasks([
    "Acknowledged. I’m treating this as a mixed but mostly parallel planning task: 1) load the relevant design-review guidance, 2) split the fix into bounded investigation tracks.",
    "Request assessment:",
    "- extracted task count: 191",
    "- execution shape: mixed",
    "Execution policy:",
    "- Respond first in the main thread with a short orchestration acknowledgement before doing deeper work.",
    "- Use delegate_task_plan to create bounded subtasks in one tool call when there are multiple independent workstreams or a dependency chain.",
    "What actually happened",
    "The clearest root cause",
    "can you create a task to patch this too?",
  ].join("\n\n"));

  assert.equal(assessment.taskCount, 1);
  assert.equal(assessment.executionShape, "single");
  assert.equal(assessment.requiresDelegation, false);
});

test("assessUserRequestTasks requires delegation for a trailing direct fix request after pasted internal transcript text", () => {
  const assessment = assessUserRequestTasks([
    "Yes — I checked the task state directly, and I can tell you what happened.",
    "Bottom line",
    "Important conclusion",
    "Execution policy:",
    "- Decompose the request into one or more bounded tasks before acting.",
    "you have code privilege, go ahead and fix this.",
  ].join("\n\n"));

  assert.equal(assessment.taskCount, 1);
  assert.equal(assessment.executionShape, "single");
  assert.equal(assessment.requiresDelegation, true);
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
