import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { findPhraseOnImage, findTextOnImage } from "../../../apps/host/src/ocr-utils.js";
import { appendArtifactRecord } from "../../../apps/host/src/artifact-index.js";

const execFileAsync = promisify(execFile);

async function ensureTesseract() {
  try {
    await execFileAsync("bash", ["-lc", "command -v tesseract"]);
  } catch {
    throw new Error("OCR tools require tesseract. Install with: brew install tesseract");
  }
}

function recordArtifact(cwd: string, path: string, toolName: string, note?: string) {
  appendArtifactRecord(cwd, {
    path,
    toolName,
    createdAt: new Date().toISOString(),
    mediaType: path.endsWith(".png") ? "image/png" : undefined,
    note,
    tags: ["ocr"],
  });
}

export default function ocrTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: "screen_ocr_extract",
    label: "Screen OCR Extract",
    description: "Capture the screen or read an image file and extract visible text using Tesseract OCR.",
    promptSnippet: "Use OCR to find visible text on screen when exact image templates are not practical.",
    parameters: Type.Object({ imagePath: Type.Optional(Type.String()), screenshotPath: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      await ensureTesseract();
      const imagePath = params.imagePath ?? params.screenshotPath ?? `artifacts/ocr-${Date.now()}.png`;
      const absolutePath = resolve(ctx.cwd, imagePath.replace(/^@/, ""));
      if (!params.imagePath) {
        await mkdir(dirname(absolutePath), { recursive: true });
        await execFileAsync("screencapture", ["-x", absolutePath]);
      }
      recordArtifact(ctx.cwd, imagePath, "screen_ocr_extract");
      const { stdout } = await execFileAsync("tesseract", [absolutePath, "stdout"]);
      return { content: [{ type: "text", text: stdout.trim() || "(no text detected)" }], details: { imagePath, text: stdout.trim() } };
    },
  });

  pi.registerTool({
    name: "screen_find_text",
    label: "Screen Find Text",
    description: "Capture the screen or inspect an image and find the bounding box of matching visible text.",
    promptSnippet: "Find text positions on screen so follow-up tools can click more safely.",
    parameters: Type.Object({ query: Type.String(), imagePath: Type.Optional(Type.String()), screenshotPath: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      await ensureTesseract();
      const imagePath = params.imagePath ?? params.screenshotPath ?? `artifacts/ocr-find-${Date.now()}.png`;
      const absolutePath = resolve(ctx.cwd, imagePath.replace(/^@/, ""));
      if (!params.imagePath) {
        await mkdir(dirname(absolutePath), { recursive: true });
        await execFileAsync("screencapture", ["-x", absolutePath]);
      }
      recordArtifact(ctx.cwd, imagePath, "screen_find_text", `query=${params.query}`);
      const isPhraseQuery = params.query.trim().includes(" ");
      const result = isPhraseQuery
        ? await findPhraseOnImage(ctx.cwd, imagePath, params.query)
        : await findTextOnImage(ctx.cwd, imagePath, params.query);
      const matched = isPhraseQuery ? result.matched : result.matched;
      return {
        content: [{
          type: "text",
          text: matched
            ? `Matched text for \"${params.query}\" in ${imagePath}`
            : `Did not find text matching \"${params.query}\" in ${imagePath}`,
        }],
        details: result,
        isError: !result.matched,
      };
    },
  });
}
