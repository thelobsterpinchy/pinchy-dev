import test from "node:test";
import assert from "node:assert/strict";
import { parseWindowBoundsOutput, relativeToAbsolute } from "../apps/host/src/window-utils.js";

test("relativeToAbsolute maps coordinates inside a window", () => {
  const point = relativeToAbsolute({ appName: "Simulator", x: 100, y: 200, width: 400, height: 800 }, 50, 75);
  assert.deepEqual(point, { x: 150, y: 275 });
});

test("parseWindowBoundsOutput parses valid AppleScript output", () => {
  assert.deepEqual(parseWindowBoundsOutput("Simulator|100|200|400|800\n"), {
    appName: "Simulator",
    x: 100,
    y: 200,
    width: 400,
    height: 800,
  });
});

test("parseWindowBoundsOutput returns undefined for incomplete AppleScript output", () => {
  assert.equal(parseWindowBoundsOutput("Simulator|100|200|400\n"), undefined);
});

test("parseWindowBoundsOutput returns undefined for non-numeric coordinates", () => {
  assert.equal(parseWindowBoundsOutput("Simulator|left|200|400|800\n"), undefined);
});
