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

export function parseWindowBoundsOutput(stdout: string): WindowBounds | undefined {
  const [resolvedAppName, x, y, width, height, ...extra] = stdout.trim().split("|");
  if (!resolvedAppName || extra.length > 0) return undefined;

  const numericValues = [x, y, width, height].map((value) => Number(value));
  if (numericValues.some((value) => !Number.isFinite(value))) return undefined;

  const [parsedX, parsedY, parsedWidth, parsedHeight] = numericValues;
  if (parsedWidth <= 0 || parsedHeight <= 0) return undefined;
  return {
    appName: resolvedAppName,
    x: parsedX,
    y: parsedY,
    width: parsedWidth,
    height: parsedHeight,
  };
}

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
    return parseWindowBoundsOutput(stdout);
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
