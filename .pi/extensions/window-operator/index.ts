import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getFrontWindowBounds, relativeToAbsolute } from "../../../apps/host/src/window-utils.js";
import { requestScopedApproval } from "../../../apps/host/src/approval-policy.js";

const execFileAsync = promisify(execFile);

type ToolCtx = {
  cwd: string;
  hasUI: boolean;
  ui: { confirm(title: string, message: string): Promise<boolean> };
};

function requireDarwin() {
  if (process.platform !== "darwin") throw new Error("window-operator currently ships with macOS implementations only.");
}

async function ensureCliclick() {
  try {
    await execFileAsync("bash", ["-lc", "command -v cliclick"]);
  } catch {
    throw new Error("window-relative click helpers require cliclick. Install with: brew install cliclick");
  }
}

async function clickAt(x: number, y: number) {
  await ensureCliclick();
  await execFileAsync("cliclick", [`c:${Math.round(x)},${Math.round(y)}`]);
}

async function requestApproval(ctx: ToolCtx, title: string, message: string) {
  return requestScopedApproval(ctx, {
    scope: "desktop.actions",
    title,
    message,
    envVar: "PINCHY_ALLOW_DESKTOP_ACTIONS",
  });
}

export default function windowOperator(pi: ExtensionAPI) {
  pi.registerTool({
    name: "window_bounds",
    label: "Window Bounds",
    description: "Get the bounds of the frontmost window or a named app window.",
    parameters: Type.Object({
      appName: Type.Optional(Type.String({ description: "Optional app name, e.g. Simulator or Safari." })),
    }),
    async execute(_toolCallId, params) {
      requireDarwin();
      const bounds = await getFrontWindowBounds(params.appName);
      if (!bounds) {
        return { content: [{ type: "text", text: `Could not determine bounds for ${params.appName ?? "frontmost window"}.` }], details: {}, isError: true };
      }
      return { content: [{ type: "text", text: `${bounds.appName}: x=${bounds.x} y=${bounds.y} width=${bounds.width} height=${bounds.height}` }], details: bounds };
    },
  });

  pi.registerTool({
    name: "window_click_relative",
    label: "Window Click Relative",
    description: "Click coordinates relative to a frontmost or named app window after approval.",
    promptSnippet: "Use this to click inside a specific app window more safely than raw screen coordinates.",
    parameters: Type.Object({
      x: Type.Number({ description: "Relative X inside the window." }),
      y: Type.Number({ description: "Relative Y inside the window." }),
      reason: Type.String({ description: "Why the click is needed." }),
      appName: Type.Optional(Type.String({ description: "Optional app name." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      requireDarwin();
      const bounds = await getFrontWindowBounds(params.appName);
      if (!bounds) {
        return { content: [{ type: "text", text: `Could not determine bounds for ${params.appName ?? "frontmost window"}.` }], details: {}, isError: true };
      }
      const point = relativeToAbsolute(bounds, params.x, params.y);
      const approved = await requestApproval(ctx, "Window click approval", `Click ${bounds.appName} at relative (${params.x}, ${params.y}) absolute (${point.x}, ${point.y})?\n\nReason: ${params.reason}`);
      if (!approved) {
        return { content: [{ type: "text", text: "Window-relative click not approved." }], details: { approved: false, bounds, point }, isError: true };
      }
      await clickAt(point.x, point.y);
      return { content: [{ type: "text", text: `Clicked ${bounds.appName} at relative (${params.x}, ${params.y}).` }], details: { approved: true, bounds, point } };
    },
  });
}
