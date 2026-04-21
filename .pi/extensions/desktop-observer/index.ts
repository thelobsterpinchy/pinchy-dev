import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildArtifactMetadata, mergeArtifactTags } from "../../../apps/host/src/artifact-metadata.js";
import { appendArtifactRecord } from "../../../apps/host/src/artifact-index.js";
import { requestScopedApproval } from "../../../apps/host/src/approval-policy.js";

const execFileAsync = promisify(execFile);

function normalizePath(cwd: string, filePath: string) {
  return resolve(cwd, filePath.replace(/^@/, ""));
}

async function captureMacScreenshot(targetPath: string) {
  await execFileAsync("screencapture", ["-x", targetPath]);
}

async function activeMacAppInfo() {
  const script = [
    'tell application "System Events"',
    'set frontApp to name of first application process whose frontmost is true',
    'set frontWindowName to ""',
    'try',
    'set frontWindowName to name of front window of first application process whose frontmost is true',
    'end try',
    'end tell',
    'return frontApp & "|" & frontWindowName',
  ].join("\n");

  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  const [appName, windowTitle] = stdout.trim().split("|");
  return { appName, windowTitle: windowTitle ?? "" };
}

async function openMacApp(appName: string) {
  await execFileAsync("open", ["-a", appName]);
}

async function macUiSnapshot() {
  const script = [
    'tell application "System Events"',
    'set frontProc to first application process whose frontmost is true',
    'set frontApp to name of frontProc',
    'set windowTitle to ""',
    'try',
    'set windowTitle to name of front window of frontProc',
    'end try',
    'set buttonNames to {}',
    'try',
    'repeat with b in buttons of front window of frontProc',
    'set end of buttonNames to name of b',
    'end repeat',
    'end try',
    'return frontApp & "|" & windowTitle & "|" & buttonNames as string',
    'end tell',
  ].join("\n");

  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  const [appName, windowTitle, buttonsRaw] = stdout.trim().split("|");
  const buttonNames = buttonsRaw ? buttonsRaw.split(",").map((value) => value.trim()).filter(Boolean) : [];
  return { appName, windowTitle: windowTitle ?? "", buttonNames };
}

function recordArtifact(cwd: string, path: string, toolName: string, note?: string, tags?: string[]) {
  appendArtifactRecord(cwd, {
    path,
    mediaType: path.endsWith(".png") ? "image/png" : undefined,
    ...buildArtifactMetadata(cwd, toolName, note, mergeArtifactTags(tags, ["desktop", toolName])),
  });
}

export default function desktopObserver(pi: ExtensionAPI) {
  pi.registerTool({
    name: "desktop_screenshot",
    label: "Desktop Screenshot",
    description: "Capture a screenshot of the local desktop for debugging.",
    promptSnippet: "Capture the local desktop to inspect app state.",
    parameters: Type.Object({ outputPath: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const outputPath = params.outputPath ?? `artifacts/desktop-${Date.now()}.png`;
      const absolutePath = normalizePath(ctx.cwd, outputPath);
      await mkdir(dirname(absolutePath), { recursive: true });
      if (process.platform === "darwin") {
        await captureMacScreenshot(absolutePath);
      } else {
        throw new Error("desktop_screenshot currently ships with a macOS implementation only.");
      }
      recordArtifact(ctx.cwd, outputPath, "desktop_screenshot", undefined, ["screenshot"]);
      return { content: [{ type: "text", text: `Captured desktop screenshot to ${outputPath}` }], details: { outputPath } };
    },
  });

  pi.registerTool({ name: "active_app_info", label: "Active App Info", description: "Return the frontmost local application and window for desktop debugging.", parameters: Type.Object({}), async execute() { if (process.platform !== "darwin") return { content: [{ type: "text", text: "active_app_info currently has a macOS implementation only." }], details: {} }; const info = await activeMacAppInfo(); return { content: [{ type: "text", text: `Frontmost app: ${info.appName}\nWindow: ${info.windowTitle || "(unknown)"}` }], details: info }; } });

  pi.registerTool({ name: "desktop_ui_snapshot", label: "Desktop UI Snapshot", description: "Capture a lightweight accessibility-style snapshot of the frontmost app window.", promptSnippet: "Inspect the frontmost app window and visible controls before taking action.", parameters: Type.Object({}), async execute() { if (process.platform !== "darwin") return { content: [{ type: "text", text: "desktop_ui_snapshot currently has a macOS implementation only." }], details: {} }; const snapshot = await macUiSnapshot(); return { content: [{ type: "text", text: [`Frontmost app: ${snapshot.appName}`, `Window: ${snapshot.windowTitle || "(unknown)"}`, `Buttons: ${snapshot.buttonNames.length > 0 ? snapshot.buttonNames.join(", ") : "(none detected)"}`].join("\n") }], details: snapshot }; } });

  pi.registerTool({ name: "desktop_open_app", label: "Desktop Open App", description: "Open a local application after explicit approval.", promptSnippet: "Open a local application only after operator approval.", promptGuidelines: ["Do not use this tool unless opening the app is clearly helpful and safe."], parameters: Type.Object({ appName: Type.String(), reason: Type.String() }), async execute(_toolCallId, params, _signal, _onUpdate, ctx) { if (process.platform !== "darwin") throw new Error("desktop_open_app currently ships with a macOS implementation only."); const approved = await requestScopedApproval(ctx, { scope: "desktop.actions", title: "Desktop action approval", message: `Open app \"${params.appName}\"?\n\nReason: ${params.reason}`, envVar: "PINCHY_ALLOW_DESKTOP_ACTIONS" }); if (!approved) return { content: [{ type: "text", text: `Opening ${params.appName} was not approved.` }], details: { approved: false }, isError: true }; await openMacApp(params.appName); return { content: [{ type: "text", text: `Opened ${params.appName}.` }], details: { approved: true, appName: params.appName } }; } });
}
