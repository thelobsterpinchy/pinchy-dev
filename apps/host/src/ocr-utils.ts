import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fuzzyIncludes, normalizeForFuzzyMatch } from "./text-match.js";

const execFileAsync = promisify(execFile);

export type OcrWordBox = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
};

export type OcrSearchResult = {
  query: string;
  imagePath: string;
  matched: boolean;
  match?: OcrWordBox;
  words: OcrWordBox[];
};

export type OcrPhraseSearchResult = {
  query: string;
  imagePath: string;
  matched: boolean;
  matchText?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  words: OcrWordBox[];
};

export async function extractOcrWordBoxes(cwd: string, imagePath: string): Promise<OcrWordBox[]> {
  const absolutePath = resolve(cwd, imagePath.replace(/^@/, ""));
  const tempDir = mkdtempSync(join(tmpdir(), "pinchy-ocr-"));
  const outputBase = join(tempDir, "ocr");
  try {
    await execFileAsync("tesseract", [absolutePath, outputBase, "tsv"]);
    const tsv = readFileSync(`${outputBase}.tsv`, "utf8");
    const lines = tsv.split(/\r?\n/).slice(1).filter(Boolean);
    return lines
      .map((line) => line.split("\t"))
      .filter((cols) => cols.length >= 12)
      .map((cols) => ({
        text: cols[11] ?? "",
        left: Number(cols[6]),
        top: Number(cols[7]),
        width: Number(cols[8]),
        height: Number(cols[9]),
        confidence: Number(cols[10]),
      }))
      .filter((word) => word.text.trim().length > 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function findTextOnImage(cwd: string, imagePath: string, query: string): Promise<OcrSearchResult> {
  const words = await extractOcrWordBoxes(cwd, imagePath);
  const match = words.find((word) => fuzzyIncludes(word.text.trim(), query));
  return {
    query,
    imagePath,
    matched: Boolean(match),
    match,
    words,
  };
}

export async function findPhraseOnImage(cwd: string, imagePath: string, query: string): Promise<OcrPhraseSearchResult> {
  const words = await extractOcrWordBoxes(cwd, imagePath);
  const normalizedQuery = normalizeForFuzzyMatch(query);
  const filtered = words.filter((word) => word.confidence >= 0);

  for (let start = 0; start < filtered.length; start += 1) {
    let combinedText = "";
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (let end = start; end < Math.min(filtered.length, start + 6); end += 1) {
      const word = filtered[end];
      combinedText = combinedText ? `${combinedText} ${word.text}` : word.text;
      left = Math.min(left, word.left);
      top = Math.min(top, word.top);
      right = Math.max(right, word.left + word.width);
      bottom = Math.max(bottom, word.top + word.height);

      if (fuzzyIncludes(combinedText, normalizedQuery)) {
        return {
          query,
          imagePath,
          matched: true,
          matchText: combinedText,
          left,
          top,
          width: right - left,
          height: bottom - top,
          words,
        };
      }
    }
  }

  return {
    query,
    imagePath,
    matched: false,
    words,
  };
}
