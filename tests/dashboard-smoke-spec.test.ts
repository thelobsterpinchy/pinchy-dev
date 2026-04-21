import test from "node:test";
import assert from "node:assert/strict";
import { DASHBOARD_PAGES } from "../apps/dashboard/src/dashboard-model.js";
import { DASHBOARD_SMOKE_SPECS, collectSmokeSelectors, validateDashboardSmokeSpecs } from "../scripts/dashboard-smoke-spec.js";

test("dashboard smoke specs cover every dashboard page exactly once", () => {
  assert.deepEqual(DASHBOARD_SMOKE_SPECS.map((entry) => entry.page), DASHBOARD_PAGES);
});

test("dashboard smoke selector registry stays unique and data-testid-based", () => {
  const selectors = collectSmokeSelectors(DASHBOARD_SMOKE_SPECS);
  assert.equal(new Set(selectors.map((entry) => entry.name)).size, selectors.length);
  assert.ok(selectors.every((entry) => entry.selector.startsWith("[data-testid")));
});

test("dashboard smoke spec validation returns no errors for the checked-in spec", () => {
  assert.deepEqual(validateDashboardSmokeSpecs(DASHBOARD_SMOKE_SPECS), []);
});
