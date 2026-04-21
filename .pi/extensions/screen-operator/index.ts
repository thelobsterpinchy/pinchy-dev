import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { findTemplateInImage } from "../../../apps/host/src/image-match.js";
import { requestScopedApproval } from "../../../apps/host/src/approval-policy.js";
import { appendArtifactRecord } from "../../../apps/host/src/artifact-index.js";
import { findPhraseOnImage, findTextOnImage } from "../../../apps/host/src/ocr-utils.js";

const execFileAsync = promisify(execFile);

type ToolCtx = {
  cwd: string;
  hasUI: boolean;
  ui: { confirm(title: string, message: string): Promise<boolean> };
};

function requireDarwin() {
  if (process.platform !== "darwin") {
    throw new Error("screen interaction tools currently ship with macOS implementations only.");
  }
}

async function isCommandAvailable(command: string) {
  try {
    await execFileAsync("bash", ["-lc", `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}

async function clickAt(x: number, y: number) {
  const hasCliclick = await isCommandAvailable("cliclick");
  if (!hasCliclick) throw new Error("desktop_click requires cliclick. Install with: brew install cliclick");
  await execFileAsync("cliclick", [`c:${Math.round(x)},${Math.round(y)}`]);
}

async function typeText(text: string) {
  await execFileAsync("osascript", ["-e", `tell application \"System Events\" to keystroke ${JSON.stringify(text)}`]);
}

async function pressKey(key: string) {
  await execFileAsync("osascript", ["-e", `tell application \"System Events\" to key code ${Number(key)}`]);
}

async function captureScreenshot(targetPath: string) {
  await execFileAsync("screencapture", ["-x", targetPath]);
}

async function requestApproval(ctx: ToolCtx, title: string, message: string, scope: string) {
  return requestScopedApproval(ctx, {
    scope,
    title,
    message,
    envVar: "PINCHY_ALLOW_DESKTOP_ACTIONS",
  });
}

function recordArtifact(cwd: string, path: string, toolName: string, note?: string, tags?: string[]) {
  appendArtifactRecord(cwd, {
    path,
    toolName,
    createdAt: new Date().toISOString(),
    mediaType: path.endsWith(".png") ? "image/png" : undefined,
    note,
    tags,
  });
}

export default function screenOperator(pi: ExtensionAPI) {
  pi.registerTool({ name: "desktop_click", label: "Desktop Click", description: "Click a screen coordinate after explicit approval.", promptSnippet: "Click the local desktop only after approval and only for targeted debugging actions.", parameters: Type.Object({ x: Type.Number(), y: Type.Number(), reason: Type.String() }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const approved = await requestApproval(ctx, "Desktop click approval", `Click (${params.x}, ${params.y})?\n\nReason: ${params.reason}`, "desktop.actions"); if (!approved) return { content: [{ type: "text", text: "Desktop click not approved." }], details: { approved: false }, isError: true }; await clickAt(params.x, params.y); return { content: [{ type: "text", text: `Clicked (${params.x}, ${params.y}).` }], details: { approved: true, x: params.x, y: params.y } }; } });

  pi.registerTool({ name: "desktop_type_text", label: "Desktop Type Text", description: "Type text into the focused application after explicit approval.", promptSnippet: "Type into the local desktop only after approval and only for focused debugging workflows.", parameters: Type.Object({ text: Type.String(), reason: Type.String() }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const approved = await requestApproval(ctx, "Desktop typing approval", `Type text into the focused app?\n\nReason: ${params.reason}\n\nText preview: ${params.text.slice(0, 120)}`, "desktop.actions"); if (!approved) return { content: [{ type: "text", text: "Desktop typing not approved." }], details: { approved: false }, isError: true }; await typeText(params.text); return { content: [{ type: "text", text: "Typed text into the focused application." }], details: { approved: true, length: params.text.length } }; } });

  pi.registerTool({ name: "desktop_press_keycode", label: "Desktop Press Keycode", description: "Press a macOS key code after approval.", parameters: Type.Object({ keyCode: Type.Number(), reason: Type.String() }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const approved = await requestApproval(ctx, "Desktop key press approval", `Press key code ${params.keyCode}?\n\nReason: ${params.reason}`, "desktop.actions"); if (!approved) return { content: [{ type: "text", text: "Desktop key press not approved." }], details: { approved: false }, isError: true }; await pressKey(String(params.keyCode)); return { content: [{ type: "text", text: `Pressed key code ${params.keyCode}.` }], details: { approved: true, keyCode: params.keyCode } }; } });

  pi.registerTool({ name: "screen_find_template", label: "Screen Find Template", description: "Capture the screen and search for an exact PNG template match.", promptSnippet: "Find an exact visual template on the current screen before clicking by coordinates.", parameters: Type.Object({ templatePath: Type.String(), screenshotPath: Type.Optional(Type.String()) }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const screenshotPath = params.screenshotPath ?? `artifacts/screen-find-${Date.now()}.png`; const absolutePath = resolve(ctx.cwd, screenshotPath.replace(/^@/, "")); await mkdir(dirname(absolutePath), { recursive: true }); await captureScreenshot(absolutePath); recordArtifact(ctx.cwd, screenshotPath, "screen_find_template", `template=${params.templatePath}`, ["screen", "template"]); const result = findTemplateInImage(ctx.cwd, screenshotPath, params.templatePath); return { content: [{ type: "text", text: result.found ? `Found template at (${result.x}, ${result.y}) in ${screenshotPath}` : `Template not found in ${screenshotPath}` }], details: { screenshotPath, templatePath: params.templatePath, ...result }, isError: !result.found }; } });

  pi.registerTool({ name: "screen_click_template", label: "Screen Click Template", description: "Find an exact PNG template on the screen and click its center after approval.", promptSnippet: "Use visual template matching to click safer than raw coordinates when possible.", parameters: Type.Object({ templatePath: Type.String(), reason: Type.String(), screenshotPath: Type.Optional(Type.String()) }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const screenshotPath = params.screenshotPath ?? `artifacts/screen-click-${Date.now()}.png`; const absolutePath = resolve(ctx.cwd, screenshotPath.replace(/^@/, "")); await mkdir(dirname(absolutePath), { recursive: true }); await captureScreenshot(absolutePath); recordArtifact(ctx.cwd, screenshotPath, "screen_click_template", `template=${params.templatePath}`, ["screen", "template", "click"]); const result = findTemplateInImage(ctx.cwd, screenshotPath, params.templatePath); if (!result.found || result.x === undefined || result.y === undefined) return { content: [{ type: "text", text: `Template not found: ${params.templatePath}` }], details: { screenshotPath, templatePath: params.templatePath, ...result }, isError: true }; const clickX = result.x + Math.floor(result.templateWidth / 2); const clickY = result.y + Math.floor(result.templateHeight / 2); const approved = await requestApproval(ctx, "Template click approval", `Click matched template center at (${clickX}, ${clickY})?\n\nTemplate: ${params.templatePath}\nReason: ${params.reason}`, "desktop.actions"); if (!approved) return { content: [{ type: "text", text: "Template click not approved." }], details: { approved: false, clickX, clickY, ...result }, isError: true }; await clickAt(clickX, clickY); return { content: [{ type: "text", text: `Clicked matched template center at (${clickX}, ${clickY}).` }], details: { approved: true, screenshotPath, templatePath: params.templatePath, clickX, clickY, ...result } }; } });

  pi.registerTool({ name: "screen_click_text", label: "Screen Click Text", description: "Capture the screen, OCR it, and click the center of matched visible text after approval.", promptSnippet: "Use OCR-based targeting when image templates are unavailable but visible text is stable.", parameters: Type.Object({ query: Type.String(), reason: Type.String(), screenshotPath: Type.Optional(Type.String()) }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const screenshotPath = params.screenshotPath ?? `artifacts/screen-click-text-${Date.now()}.png`; const absolutePath = resolve(ctx.cwd, screenshotPath.replace(/^@/, "")); await mkdir(dirname(absolutePath), { recursive: true }); await captureScreenshot(absolutePath); recordArtifact(ctx.cwd, screenshotPath, "screen_click_text", `query=${params.query}`, ["screen", "ocr", "click"]); const isPhraseQuery = params.query.trim().includes(" "); let match: { text: string; left: number; top: number; width: number; height: number } | undefined; let result: unknown; if (isPhraseQuery) { const phraseResult = await findPhraseOnImage(ctx.cwd, screenshotPath, params.query); result = phraseResult; if (phraseResult.matched && phraseResult.left !== undefined && phraseResult.top !== undefined && phraseResult.width !== undefined && phraseResult.height !== undefined) { match = { text: phraseResult.matchText ?? params.query, left: phraseResult.left, top: phraseResult.top, width: phraseResult.width, height: phraseResult.height }; } } else { const textResult = await findTextOnImage(ctx.cwd, screenshotPath, params.query); result = textResult; if (textResult.matched && textResult.match) { match = { text: textResult.match.text, left: textResult.match.left, top: textResult.match.top, width: textResult.match.width, height: textResult.match.height }; } } if (!match) return { content: [{ type: "text", text: `Did not find visible text matching \"${params.query}\".` }], details: result, isError: true }; const clickX = match.left + Math.floor(match.width / 2); const clickY = match.top + Math.floor(match.height / 2); const approved = await requestApproval(ctx, "OCR click approval", `Click OCR-matched text \"${match.text}\" at (${clickX}, ${clickY})?\n\nReason: ${params.reason}`, "desktop.actions"); if (!approved) return { content: [{ type: "text", text: "OCR click not approved." }], details: { approved: false, clickX, clickY, result }, isError: true }; await clickAt(clickX, clickY); return { content: [{ type: "text", text: `Clicked OCR-matched text \"${match.text}\" at (${clickX}, ${clickY}).` }], details: { approved: true, clickX, clickY, result } }; } });
}
