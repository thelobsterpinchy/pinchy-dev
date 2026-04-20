import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { findTemplateInImage } from "../apps/host/src/image-match.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-image-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function writePng(path: string, width: number, height: number, fill: [number, number, number, number], patch?: { x: number; y: number; width: number; height: number; color: [number, number, number, number] }) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const color = patch && x >= patch.x && x < patch.x + patch.width && y >= patch.y && y < patch.y + patch.height ? patch.color : fill;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }
  writeFileSync(path, PNG.sync.write(png));
}

test("findTemplateInImage finds an exact png template", () => {
  withTempDir((cwd) => {
    writePng(join(cwd, "screen.png"), 6, 6, [0, 0, 0, 255], { x: 2, y: 3, width: 2, height: 2, color: [255, 0, 0, 255] });
    writePng(join(cwd, "template.png"), 2, 2, [255, 0, 0, 255]);

    const result = findTemplateInImage(cwd, "screen.png", "template.png");
    assert.equal(result.found, true);
    assert.equal(result.x, 2);
    assert.equal(result.y, 3);
  });
});
