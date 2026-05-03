import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRunOutcome } from "../services/agent-worker/src/run-outcomes.js";

test("normalizeRunOutcome collapses repeated adjacent chunks in completed assistant replies", () => {
  const duplicated = [
    "Yes — I’ll treat this as a dependency-chained fix.",
    "Yes — I’ll treat this as a dependency-chained fix.",
    "Good — the wake-up behavior is now implemented in the worker path.",
    "Good — the wake-up behavior is now implemented in the worker path.",
    "Yes — I fixed that.",
  ].join("");

  const outcome = normalizeRunOutcome({
    kind: "completed",
    summary: "done",
    message: duplicated,
  }, {
    summary: "fallback",
    message: "fallback",
  });

  assert.equal(outcome.kind, "completed");
  assert.equal(
    outcome.message,
    [
      "Yes — I’ll treat this as a dependency-chained fix.",
      "Good — the wake-up behavior is now implemented in the worker path.",
      "Yes — I fixed that.",
    ].join(""),
  );
});

test("normalizeRunOutcome collapses repeated adjacent chunks in blocked assistant replies", () => {
  const duplicated = "Need your decision before I continue.Need your decision before I continue.";

  const outcome = normalizeRunOutcome({
    kind: "waiting_for_human",
    summary: "blocked",
    message: duplicated,
    blockedReason: "Need persistence choice",
    question: { prompt: "Should I use JSON files or SQLite?" },
  }, {
    summary: "fallback",
    message: "fallback",
  });

  assert.equal(outcome.kind, "waiting_for_human");
  assert.equal(outcome.message, "Need your decision before I continue.");
});
