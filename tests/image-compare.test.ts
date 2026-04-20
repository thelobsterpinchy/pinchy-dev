import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { compareImagesFuzzy } from "../apps/host/src/image-compare.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-fuzzy-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function writePng(path: string, width: number, height: number, color: [number, number, number, number], diffPixel?: { x: number; y: number; color: [number, number, number, number] }) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const chosen = diffPixel && diffPixel.x === x && diffPixel.y === y ? diffPixel.color : color;
      png.data[idx] = chosen[0];
      png.data[idx + 1] = chosen[1];
      png.data[idx + 2] = chosen[2];
      png.data[idx + 3] = chosen[3];
    }
  }
  writeFileSync(path, PNG.sync.write(png));
}

test("compareImagesFuzzy reports a small pixel difference", () => {
  withTempDir((cwd) => {
    writePng(join(cwd, "a.png"), 4, 4, [0, 0, 0, 255]);
    writePng(join(cwd, "b.png"), 4, 4, [0, 0, 0, 255], { x: 1, y: 2, color: [255, 0, 0, 255] });
    const result = compareImagesFuzzy(cwd, "a.png", "b.png", 0.2);
    assert.equal(result.comparable, true);
    assert.equal(result.differentPixels, 1);
    assert.equal(result.matchesWithinThreshold, true);
  });
});
