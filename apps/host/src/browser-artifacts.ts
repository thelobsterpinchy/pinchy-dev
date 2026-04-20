import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

export type ArtifactComparison = {
  leftPath: string;
  rightPath: string;
  sameExtension: boolean;
  leftExists: boolean;
  rightExists: boolean;
  leftSize?: number;
  rightSize?: number;
  leftHash?: string;
  rightHash?: string;
  identical: boolean;
  textDiffPreview?: string;
};

function sha256(path: string) {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
}

function buildTextDiffPreview(left: string, right: string) {
  const leftLines = left.split(/\r?\n/);
  const rightLines = right.split(/\r?\n/);
  const preview: string[] = [];
  const max = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < max && preview.length < 20; index += 1) {
    const a = leftLines[index] ?? "";
    const b = rightLines[index] ?? "";
    if (a !== b) {
      preview.push(`- ${a}`);
      preview.push(`+ ${b}`);
    }
  }
  return preview.join("\n");
}

export function compareArtifacts(cwd: string, leftPath: string, rightPath: string): ArtifactComparison {
  const leftAbsolute = resolve(cwd, leftPath.replace(/^@/, ""));
  const rightAbsolute = resolve(cwd, rightPath.replace(/^@/, ""));
  const leftExists = existsSync(leftAbsolute);
  const rightExists = existsSync(rightAbsolute);
  const sameExtension = extname(leftAbsolute) === extname(rightAbsolute);

  if (!leftExists || !rightExists) {
    return {
      leftPath,
      rightPath,
      sameExtension,
      leftExists,
      rightExists,
      identical: false,
    };
  }

  const leftSize = statSync(leftAbsolute).size;
  const rightSize = statSync(rightAbsolute).size;
  const leftHash = sha256(leftAbsolute);
  const rightHash = sha256(rightAbsolute);
  const identical = leftHash === rightHash;

  const textExtensions = new Set([".html", ".txt", ".log", ".json", ".md"]);
  const extension = extname(leftAbsolute);
  const textDiffPreview = !identical && textExtensions.has(extension)
    ? buildTextDiffPreview(readFileSync(leftAbsolute, "utf8"), readFileSync(rightAbsolute, "utf8"))
    : undefined;

  return {
    leftPath,
    rightPath,
    sameExtension,
    leftExists,
    rightExists,
    leftSize,
    rightSize,
    leftHash,
    rightHash,
    identical,
    textDiffPreview,
  };
}
