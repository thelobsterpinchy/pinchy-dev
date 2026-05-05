import test from "node:test";
import assert from "node:assert/strict";
import { sleepUntilDueOrWorkAvailable } from "../apps/host/src/pinchy-daemon.js";

test("sleepUntilDueOrWorkAvailable waits until due when no higher-priority work appears", async () => {
  let now = 0;
  const sleeps: number[] = [];

  const result = await sleepUntilDueOrWorkAvailable("/repo", 5000, {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    hasPendingTask: () => false,
    hasPendingReloadRequest: () => false,
    pollMs: 1000,
  });

  assert.equal(result, "due");
  assert.deepEqual(sleeps, [1000, 1000, 1000, 1000, 1000]);
});

test("sleepUntilDueOrWorkAvailable wakes early when a ready task appears", async () => {
  let now = 0;
  let checks = 0;
  const sleeps: number[] = [];

  const result = await sleepUntilDueOrWorkAvailable("/repo", 10000, {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    hasPendingTask: () => {
      checks += 1;
      return checks >= 3;
    },
    hasPendingReloadRequest: () => false,
    pollMs: 1000,
  });

  assert.equal(result, "work_available");
  assert.deepEqual(sleeps, [1000, 1000]);
});

test("sleepUntilDueOrWorkAvailable wakes early when a queued task file change requests an immediate wake", async () => {
  let now = 0;
  let wakeChecks = 0;
  const sleeps: number[] = [];

  const result = await sleepUntilDueOrWorkAvailable("/repo", 10000, {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    hasPendingTask: () => false,
    hasPendingReloadRequest: () => false,
    consumePendingTaskWakeSignal: () => {
      wakeChecks += 1;
      return wakeChecks >= 2;
    },
    pollMs: 1000,
  });

  assert.equal(result, "work_available");
  assert.deepEqual(sleeps, [1000]);
});

test("sleepUntilDueOrWorkAvailable wakes early when a reload request appears", async () => {
  let now = 0;
  let checks = 0;
  const sleeps: number[] = [];

  const result = await sleepUntilDueOrWorkAvailable("/repo", 10000, {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    hasPendingTask: () => false,
    hasPendingReloadRequest: () => {
      checks += 1;
      return checks >= 2;
    },
    pollMs: 1000,
  });

  assert.equal(result, "work_available");
  assert.deepEqual(sleeps, [1000]);
});

test("sleepUntilDueOrWorkAvailable returning early does not imply the original due time has arrived", async () => {
  let now = 0;

  const result = await sleepUntilDueOrWorkAvailable("/repo", 10000, {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    hasPendingTask: () => now >= 2000,
    hasPendingReloadRequest: () => false,
    pollMs: 1000,
  });

  assert.equal(result, "work_available");
  assert.ok(now < 10000);
});
