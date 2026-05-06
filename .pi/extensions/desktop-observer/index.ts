import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildArtifactMetadata, mergeArtifactTags } from "../../../apps/host/src/artifact-metadata.js";
import { appendArtifactRecord } from "../../../apps/host/src/artifact-index.js";
import { requestScopedApproval } from "../../../apps/host/src/approval-policy.js";

const execFileAsync = promisify(execFile);

type ActiveAppInfo = {
  appName: string;
  windowTitle: string;
};

type DesktopUiSnapshot = {
  appName: string;
  windowTitle: string;
  buttonNames: string[];
};

type DesktopObserverDeps = {
  now?: () => number;
  platform?: NodeJS.Platform;
  captureMacScreenshot?: (targetPath: string) => Promise<void>;
  activeMacAppInfo?: () => Promise<ActiveAppInfo>;
  openMacApp?: (appName: string) => Promise<void>;
  macUiSnapshot?: () => Promise<DesktopUiSnapshot>;
  requestScopedApproval?: typeof requestScopedApproval;
};

const DESKTOP_FIELD_SEPARATOR = "\u001f";

function normalizePath(cwd: string, filePath: string) {
  return resolve(cwd, filePath.replace(/^@/, ""));
}

function splitDesktopFields(output: string, expectedParts: number) {
  return output.trim().split(DESKTOP_FIELD_SEPARATOR, expectedParts);
}

export function parseActiveAppInfoOutput(output: string): ActiveAppInfo {
  const [appName = "", windowTitle = ""] = splitDesktopFields(output, 2);
  return { appName, windowTitle };
}

export function parseDesktopUiSnapshotOutput(output: string): DesktopUiSnapshot {
  const [appName = "", windowTitle = "", buttonsRaw = ""] = splitDesktopFields(output, 3);
  const buttonNames = buttonsRaw.split(",").map((value) => value.trim()).filter(Boolean);
  return { appName, windowTitle, buttonNames };
}

async function captureMacScreenshot(targetPath: string) {
  await execFileAsync("screencapture", ["-x", targetPath]);
}

async function activeMacAppInfo() {
  const script = [
    'set fieldSeparator to ASCII character 31',
    'tell application "System Events"',
    'set frontApp to name of first application process whose frontmost is true',
    'set frontWindowName to ""',
    'try',
    'set frontWindowName to name of front window of first application process whose frontmost is true',
    'end try',
    'end tell',
    'return frontApp & fieldSeparator & frontWindowName',
  ].join("\n");

  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  return parseActiveAppInfoOutput(stdout);
}

async function openMacApp(appName: string) {
  await execFileAsync("open", ["-a", appName]);
}

async function macUiSnapshot() {
  const script = [
    'set fieldSeparator to ASCII character 31',
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
    'return frontApp & fieldSeparator & windowTitle & fieldSeparator & (buttonNames as string)',
    'end tell',
  ].join("\n");

  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  return parseDesktopUiSnapshotOutput(stdout);
}

function recordArtifact(cwd: string, path: string, toolName: string, mediaType?: string, note?: string, tags?: string[]) {
  appendArtifactRecord(cwd, {
    path,
    mediaType,
    ...buildArtifactMetadata(cwd, toolName, note, mergeArtifactTags(tags, ["desktop", toolName])),
  });
}

async function saveJsonArtifact(cwd: string, outputPath: string, value: unknown) {
  const absolutePath = normalizePath(cwd, outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(value, null, 2), "utf8");
}

export function registerDesktopObserverTools(pi: ExtensionAPI, deps: DesktopObserverDeps = {}) {
  const now = deps.now ?? Date.now;
  const platform = deps.platform ?? process.platform;
  const captureScreenshotImpl = deps.captureMacScreenshot ?? captureMacScreenshot;
  const activeAppInfoImpl = deps.activeMacAppInfo ?? activeMacAppInfo;
  const openMacAppImpl = deps.openMacApp ?? openMacApp;
  const uiSnapshotImpl = deps.macUiSnapshot ?? macUiSnapshot;
  const requestApprovalImpl = deps.requestScopedApproval ?? requestScopedApproval;

  pi.registerTool({
    name: "desktop_screenshot",
    label: "Desktop Screenshot",
    description: "Capture a screenshot of the local desktop for debugging.",
    promptSnippet: "Capture the local desktop to inspect app state.",
    parameters: Type.Object({ outputPath: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (platform !== "darwin") {
        return { content: [{ type: "text", text: "desktop_screenshot currently has a macOS implementation only." }], details: {} };
      }
      const outputPath = params.outputPath ?? `artifacts/desktop-${now()}.png`;
      const absolutePath = normalizePath(ctx.cwd, outputPath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await captureScreenshotImpl(absolutePath);
      recordArtifact(ctx.cwd, outputPath, "desktop_screenshot", "image/png", undefined, ["screenshot"]);
      return { content: [{ type: "text", text: `Captured desktop screenshot to ${outputPath}` }], details: { outputPath } };
    },
  });

  pi.registerTool({
    name: "active_app_info",
    label: "Active App Info",
    description: "Return the frontmost local application and window for desktop debugging.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      if (platform !== "darwin") {
        return { content: [{ type: "text", text: "active_app_info currently has a macOS implementation only." }], details: {} };
      }
      const info = await activeAppInfoImpl();
      const outputPath = `artifacts/active-app-${now()}.json`;
      await saveJsonArtifact(ctx.cwd, outputPath, info);
      recordArtifact(ctx.cwd, outputPath, "active_app_info", "application/json", undefined, ["inspection", "json"]);
      return {
        content: [{ type: "text", text: `Frontmost app: ${info.appName}\nWindow: ${info.windowTitle || "(unknown)"}\nArtifact: ${outputPath}` }],
        details: { ...info, outputPath },
      };
    },
  });

  pi.registerTool({
    name: "desktop_ui_snapshot",
    label: "Desktop UI Snapshot",
    description: "Capture a lightweight accessibility-style snapshot of the frontmost app window.",
    promptSnippet: "Inspect the frontmost app window and visible controls before taking action.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      if (platform !== "darwin") {
        return { content: [{ type: "text", text: "desktop_ui_snapshot currently has a macOS implementation only." }], details: {} };
      }
      const snapshot = await uiSnapshotImpl();
      const outputPath = `artifacts/desktop-ui-${now()}.json`;
      await saveJsonArtifact(ctx.cwd, outputPath, snapshot);
      recordArtifact(ctx.cwd, outputPath, "desktop_ui_snapshot", "application/json", undefined, ["inspection", "json"]);
      return {
        content: [{ type: "text", text: [`Frontmost app: ${snapshot.appName}`, `Window: ${snapshot.windowTitle || "(unknown)"}`, `Buttons: ${snapshot.buttonNames.length > 0 ? snapshot.buttonNames.join(", ") : "(none detected)"}`, `Artifact: ${outputPath}`].join("\n") }],
        details: { ...snapshot, outputPath },
      };
    },
  });

  pi.registerTool({
    name: "desktop_open_app",
    label: "Desktop Open App",
    description: "Open a local application after explicit approval.",
    promptSnippet: "Open a local application only after operator approval.",
    promptGuidelines: ["Do not use this tool unless opening the app is clearly helpful and safe."],
    parameters: Type.Object({ appName: Type.String(), reason: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (platform !== "darwin") {
        return { content: [{ type: "text", text: "desktop_open_app currently has a macOS implementation only." }], details: {} };
      }
      const approved = await requestApprovalImpl(ctx, {
        scope: "desktop.actions",
        title: "Desktop action approval",
        message: `Open app "${params.appName}"?\n\nReason: ${params.reason}`,
        envVar: "PINCHY_ALLOW_DESKTOP_ACTIONS",
      });
      if (!approved) {
        return { content: [{ type: "text", text: `Opening ${params.appName} was not approved.` }], details: { approved: false }, isError: true };
      }
      await openMacAppImpl(params.appName);
      return { content: [{ type: "text", text: `Opened ${params.appName}.` }], details: { approved: true, appName: params.appName } };
    },
  });
}

export default function desktopObserver(pi: ExtensionAPI) {
  registerDesktopObserverTools(pi);
}
