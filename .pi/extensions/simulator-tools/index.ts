import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requestScopedApproval } from "../../../apps/host/src/approval-policy.js";
import { appendArtifactRecord } from "../../../apps/host/src/artifact-index.js";
import { getFrontWindowBounds, relativeToAbsolute } from "../../../apps/host/src/window-utils.js";
import { buildArtifactMetadata, mergeArtifactTags } from "../../../apps/host/src/artifact-metadata.js";

const execFileAsync = promisify(execFile);

type ToolCtx = {
  cwd: string;
  hasUI: boolean;
  ui: { confirm(title: string, message: string): Promise<boolean> };
};

function requireDarwin() {
  if (process.platform !== "darwin") throw new Error("Simulator tools currently ship with macOS implementations only.");
}

async function simctl(args: string[]) {
  const { stdout } = await execFileAsync("xcrun", ["simctl", ...args]);
  return stdout.trim();
}

async function focusSimulator() {
  await execFileAsync("open", ["-a", "Simulator"]);
}

async function typeText(text: string) {
  await execFileAsync("osascript", ["-e", `tell application \"System Events\" to keystroke ${JSON.stringify(text)}`]);
}

async function ensureCliclick() {
  try {
    await execFileAsync("bash", ["-lc", "command -v cliclick"]);
  } catch {
    throw new Error("Simulator gesture helpers require cliclick. Install with: brew install cliclick");
  }
}

async function simulatorClick(x: number, y: number) {
  await ensureCliclick();
  await execFileAsync("cliclick", [`c:${Math.round(x)},${Math.round(y)}`]);
}

async function simulatorSwipe(x1: number, y1: number, x2: number, y2: number) {
  await ensureCliclick();
  await execFileAsync("cliclick", [`dd:${Math.round(x1)},${Math.round(y1)}`, `dm:${Math.round(x2)},${Math.round(y2)}`, `du:${Math.round(x2)},${Math.round(y2)}`]);
}

async function requestApproval(ctx: ToolCtx, title: string, message: string) {
  return requestScopedApproval(ctx, {
    scope: "simulator.actions",
    title,
    message,
    envVar: "PINCHY_ALLOW_SIMULATOR_ACTIONS",
  });
}

function recordArtifact(cwd: string, path: string, toolName: string, note?: string, tags?: string[]) {
  appendArtifactRecord(cwd, {
    path,
    mediaType: path.endsWith(".png") ? "image/png" : undefined,
    ...buildArtifactMetadata(cwd, toolName, note, mergeArtifactTags(tags, ["simulator"])),
  });
}

async function getSimulatorAbsolutePoint(relativeX: number, relativeY: number) {
  await focusSimulator();
  const bounds = await getFrontWindowBounds("Simulator");
  if (!bounds) throw new Error("Could not determine Simulator window bounds.");
  return { ...relativeToAbsolute(bounds, relativeX, relativeY), bounds };
}

export default function simulatorTools(pi: ExtensionAPI) {
  pi.registerTool({ name: "simulator_list_devices", label: "Simulator List Devices", description: "List available iOS simulators.", parameters: Type.Object({}), async execute() { requireDarwin(); const output = await simctl(["list", "devices", "available"]); return { content: [{ type: "text", text: output }], details: { output } }; } });
  pi.registerTool({ name: "simulator_boot_device", label: "Simulator Boot Device", description: "Boot an iOS simulator device by UDID or name with approval.", parameters: Type.Object({ device: Type.String(), reason: Type.String() }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const approved = await requestApproval(ctx, "Simulator approval", `Boot simulator ${params.device}?\n\nReason: ${params.reason}`); if (!approved) return { content: [{ type: "text", text: "Simulator boot not approved." }], details: { approved: false }, isError: true }; const output = await simctl(["boot", params.device]).catch(async () => await simctl(["bootstatus", params.device, "-b"])); return { content: [{ type: "text", text: output || `Booted ${params.device}.` }], details: { approved: true, device: params.device } }; } });
  pi.registerTool({ name: "simulator_open_url", label: "Simulator Open URL", description: "Open a URL in the booted simulator with approval.", parameters: Type.Object({ url: Type.String(), reason: Type.String() }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const approved = await requestApproval(ctx, "Simulator approval", `Open URL in booted simulator?\n\n${params.url}\n\nReason: ${params.reason}`); if (!approved) return { content: [{ type: "text", text: "Simulator URL open not approved." }], details: { approved: false }, isError: true }; const output = await simctl(["openurl", "booted", params.url]); return { content: [{ type: "text", text: output || `Opened ${params.url} in booted simulator.` }], details: { approved: true, url: params.url } }; } });
  pi.registerTool({ name: "simulator_screenshot", label: "Simulator Screenshot", description: "Capture a screenshot from the booted simulator.", parameters: Type.Object({ outputPath: Type.Optional(Type.String()) }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const outputPath = params.outputPath ?? `artifacts/simulator-${Date.now()}.png`; const absolutePath = resolve(ctx.cwd, outputPath.replace(/^@/, "")); await mkdir(dirname(absolutePath), { recursive: true }); await execFileAsync("xcrun", ["simctl", "io", "booted", "screenshot", absolutePath]); recordArtifact(ctx.cwd, outputPath, "simulator_screenshot", undefined, ["screenshot"]); return { content: [{ type: "text", text: `Saved simulator screenshot to ${outputPath}` }], details: { outputPath } }; } });
  pi.registerTool({ name: "simulator_focus_app", label: "Simulator Focus App", description: "Bring the Simulator app to the foreground.", parameters: Type.Object({}), async execute() { requireDarwin(); await focusSimulator(); return { content: [{ type: "text", text: "Focused the Simulator app." }], details: {} }; } });
  pi.registerTool({ name: "simulator_type_text", label: "Simulator Type Text", description: "Focus Simulator and type into the currently focused field after approval.", parameters: Type.Object({ text: Type.String(), reason: Type.String() }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const approved = await requestApproval(ctx, "Simulator typing approval", `Type into the focused simulator field?\n\nReason: ${params.reason}\n\nText preview: ${params.text.slice(0, 120)}`); if (!approved) return { content: [{ type: "text", text: "Simulator typing not approved." }], details: { approved: false }, isError: true }; await focusSimulator(); await typeText(params.text); return { content: [{ type: "text", text: "Typed text into the focused simulator field." }], details: { approved: true, length: params.text.length } }; } });
  pi.registerTool({ name: "simulator_tap", label: "Simulator Tap", description: "Focus Simulator and click a coordinate relative to the Simulator window after approval.", parameters: Type.Object({ x: Type.Number(), y: Type.Number(), reason: Type.String() }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const approved = await requestApproval(ctx, "Simulator tap approval", `Tap simulator at relative point (${params.x}, ${params.y})?\n\nReason: ${params.reason}`); if (!approved) return { content: [{ type: "text", text: "Simulator tap not approved." }], details: { approved: false }, isError: true }; const { x, y, bounds } = await getSimulatorAbsolutePoint(params.x, params.y); await simulatorClick(x, y); return { content: [{ type: "text", text: `Tapped simulator at relative (${params.x}, ${params.y}) absolute (${x}, ${y}).` }], details: { approved: true, relativeX: params.x, relativeY: params.y, absoluteX: x, absoluteY: y, bounds } }; } });
  pi.registerTool({ name: "simulator_swipe", label: "Simulator Swipe", description: "Focus Simulator and perform a swipe using coordinates relative to the Simulator window after approval.", parameters: Type.Object({ x1: Type.Number(), y1: Type.Number(), x2: Type.Number(), y2: Type.Number(), reason: Type.String() }), async execute(_id, params, _s, _u, ctx) { requireDarwin(); const approved = await requestApproval(ctx, "Simulator swipe approval", `Swipe in simulator from relative (${params.x1}, ${params.y1}) to (${params.x2}, ${params.y2})?\n\nReason: ${params.reason}`); if (!approved) return { content: [{ type: "text", text: "Simulator swipe not approved." }], details: { approved: false }, isError: true }; const start = await getSimulatorAbsolutePoint(params.x1, params.y1); const end = await getSimulatorAbsolutePoint(params.x2, params.y2); await simulatorSwipe(start.x, start.y, end.x, end.y); return { content: [{ type: "text", text: `Swiped simulator from relative (${params.x1}, ${params.y1}) to (${params.x2}, ${params.y2}).` }], details: { approved: true, start, end } }; } });
}
