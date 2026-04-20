import test from "node:test";
import assert from "node:assert/strict";
import { relativeToAbsolute } from "../apps/host/src/window-utils.js";

test("relativeToAbsolute maps coordinates inside a window", () => {
  const point = relativeToAbsolute({ appName: "Simulator", x: 100, y: 200, width: 400, height: 800 }, 50, 75);
  assert.deepEqual(point, { x: 150, y: 275 });
});
