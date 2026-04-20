import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";

export type FuzzyImageCompareResult = {
  comparable: boolean;
  width?: number;
  height?: number;
  differentPixels?: number;
  totalPixels?: number;
  differenceRatio?: number;
  matchesWithinThreshold?: boolean;
  threshold: number;
  reason?: string;
};

function readPng(path: string) {
  return PNG.sync.read(readFileSync(path));
}

export function compareImagesFuzzy(cwd: string, leftPath: string, rightPath: string, threshold = 0.01): FuzzyImageCompareResult {
  const left = readPng(resolve(cwd, leftPath.replace(/^@/, "")));
  const right = readPng(resolve(cwd, rightPath.replace(/^@/, "")));

  if (left.width !== right.width || left.height !== right.height) {
    return {
      comparable: false,
      threshold,
      reason: `Dimension mismatch: ${left.width}x${left.height} vs ${right.width}x${right.height}`,
    };
  }

  let differentPixels = 0;
  const totalPixels = left.width * left.height;
  for (let i = 0; i < left.data.length; i += 4) {
    const dr = Math.abs(left.data[i] - right.data[i]);
    const dg = Math.abs(left.data[i + 1] - right.data[i + 1]);
    const db = Math.abs(left.data[i + 2] - right.data[i + 2]);
    const da = Math.abs(left.data[i + 3] - right.data[i + 3]);
    if (dr + dg + db + da > 0) differentPixels += 1;
  }

  const differenceRatio = totalPixels === 0 ? 0 : differentPixels / totalPixels;
  return {
    comparable: true,
    width: left.width,
    height: left.height,
    differentPixels,
    totalPixels,
    differenceRatio,
    matchesWithinThreshold: differenceRatio <= threshold,
    threshold,
  };
}
