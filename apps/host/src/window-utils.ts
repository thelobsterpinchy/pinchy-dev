import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WindowBounds = {
  appName: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function getFrontWindowBounds(appName?: string): Promise<WindowBounds | undefined> {
  const targetClause = appName
    ? `whose frontmost is true and name is ${JSON.stringify(appName)}`
    : "whose frontmost is true";
  const script = [
    'tell application "System Events"',
    `set targetProc to first application process ${targetClause}`,
    'set appName to name of targetProc',
    'set p to position of front window of targetProc',
    'set s to size of front window of targetProc',
    'return appName & "|" & (item 1 of p) & "|" & (item 2 of p) & "|" & (item 1 of s) & "|" & (item 2 of s)',
    'end tell',
  ].join("\n");

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    const [resolvedAppName, x, y, width, height] = stdout.trim().split("|");
    return {
      appName: resolvedAppName,
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
    };
  } catch {
    return undefined;
  }
}

export function relativeToAbsolute(bounds: WindowBounds, rx: number, ry: number) {
  return {
    x: Math.round(bounds.x + rx),
    y: Math.round(bounds.y + ry),
  };
}
