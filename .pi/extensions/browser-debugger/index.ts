import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { compareArtifacts } from "../../../apps/host/src/browser-artifacts.js";
import { compareImagesFuzzy } from "../../../apps/host/src/image-compare.js";
import { appendArtifactRecord } from "../../../apps/host/src/artifact-index.js";
import { buildArtifactMetadata } from "../../../apps/host/src/artifact-metadata.js";

type BrowserPage = import("playwright").Page;

function normalizePath(cwd: string, filePath: string) {
  return resolve(cwd, filePath.replace(/^@/, ""));
}

function recordArtifact(cwd: string, path: string, toolName: string, note?: string, tags?: string[]) {
  appendArtifactRecord(cwd, {
    path,
    mediaType: path.endsWith(".png") ? "image/png" : path.endsWith(".html") ? "text/html" : undefined,
    ...buildArtifactMetadata(cwd, toolName, note, tags),
  });
}

async function withPage<T>(url: string, signal: AbortSignal | undefined, fn: (page: BrowserPage) => Promise<T>) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    if (signal) signal.addEventListener("abort", () => void browser.close(), { once: true });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function executeStep(page: BrowserPage, step: { action: string; selector?: string; value?: string; key?: string; waitMs?: number }) {
  switch (step.action) {
    case "click": if (!step.selector) throw new Error("click step requires selector"); await page.locator(step.selector).first().click(); return `clicked ${step.selector}`;
    case "fill": if (!step.selector) throw new Error("fill step requires selector"); await page.locator(step.selector).first().fill(step.value ?? ""); return `filled ${step.selector}`;
    case "press": if (!step.selector) throw new Error("press step requires selector"); await page.locator(step.selector).first().press(step.key ?? "Enter"); return `pressed ${step.key ?? "Enter"} on ${step.selector}`;
    case "wait": await page.waitForTimeout(step.waitMs ?? 1000); return `waited ${step.waitMs ?? 1000}ms`;
    default: throw new Error(`Unsupported action: ${step.action}`);
  }
}

export default function browserDebugger(pi: ExtensionAPI) {
  pi.registerTool({ name: "browser_debug_scan", label: "Browser Debug Scan", description: "Open a URL in Chromium, collect console errors, network failures, title, and a screenshot.", promptSnippet: "Inspect a local or remote webpage and collect debugging evidence.", promptGuidelines: ["Use this before guessing at website bugs.", "Capture screenshot, console messages, and failed requests before proposing a fix."], parameters: Type.Object({ url: Type.String(), screenshotPath: Type.Optional(Type.String()), waitMs: Type.Optional(Type.Number({ default: 1500 })) }), async execute(_id, params, signal, _u, ctx) { const consoleMessages: string[] = []; const failingRequests: string[] = []; const screenshotPath = params.screenshotPath ?? `artifacts/browser-scan-${Date.now()}.png`; return withPage(params.url, signal, async (page) => { page.on("console", (message) => { const type = message.type(); if (["error", "warning"].includes(type)) consoleMessages.push(`[${type}] ${message.text()}`); }); page.on("response", (response) => { if (response.status() >= 400) failingRequests.push(`${response.status()} ${response.url()}`); }); await page.waitForTimeout(params.waitMs ?? 1500); const title = await page.title(); const absolutePath = normalizePath(ctx.cwd, screenshotPath); await mkdir(dirname(absolutePath), { recursive: true }); await page.screenshot({ path: absolutePath, fullPage: true }); recordArtifact(ctx.cwd, screenshotPath, "browser_debug_scan", `url=${params.url}`, ["browser", "screenshot"]); return { content: [{ type: "text", text: [`URL: ${params.url}`, `Title: ${title || "(none)"}`, `Screenshot: ${screenshotPath}`, `Console issues: ${consoleMessages.length}`, `Failing requests: ${failingRequests.length}`].join("\n") }], details: { title, screenshotPath, consoleMessages, failingRequests } }; }); } });

  pi.registerTool({ name: "browser_dom_snapshot", label: "Browser DOM Snapshot", description: "Capture the current page HTML and visible text summary for debugging.", promptSnippet: "Capture DOM and visible text from a webpage under inspection.", parameters: Type.Object({ url: Type.String(), outputPath: Type.Optional(Type.String()), waitMs: Type.Optional(Type.Number({ default: 1000 })) }), async execute(_id, params, signal, _u, ctx) { return withPage(params.url, signal, async (page) => { await page.waitForTimeout(params.waitMs ?? 1000); const html = await page.content(); const text = await page.locator("body").innerText().catch(() => ""); const outputPath = params.outputPath ?? `artifacts/dom-snapshot-${Date.now()}.html`; const absolutePath = normalizePath(ctx.cwd, outputPath); await mkdir(dirname(absolutePath), { recursive: true }); await writeFile(absolutePath, html, "utf8"); recordArtifact(ctx.cwd, outputPath, "browser_dom_snapshot", `url=${params.url}`, ["browser", "dom"]); return { content: [{ type: "text", text: [`URL: ${params.url}`, `Saved DOM snapshot: ${outputPath}`, `Visible text preview: ${text.slice(0, 1000) || "(empty)"}`].join("\n") }], details: { outputPath, textPreview: text.slice(0, 4000) } }; }); } });

  pi.registerTool({ name: "browser_run_probe", label: "Browser Run Probe", description: "Run lightweight page checks such as selector existence and text presence.", promptSnippet: "Probe a page for selectors, text, and document metadata.", parameters: Type.Object({ url: Type.String(), selector: Type.Optional(Type.String()), text: Type.Optional(Type.String()), waitMs: Type.Optional(Type.Number({ default: 1000 })) }), async execute(_id, params, signal) { return withPage(params.url, signal, async (page) => { await page.waitForTimeout(params.waitMs ?? 1000); const title = await page.title(); const selectorFound = params.selector ? await page.locator(params.selector).count().then((count) => count > 0) : null; const bodyText = await page.locator("body").innerText().catch(() => ""); const textFound = params.text ? bodyText.includes(params.text) : null; return { content: [{ type: "text", text: [`URL: ${params.url}`, `Title: ${title || "(none)"}`, `Selector found: ${selectorFound === null ? "n/a" : String(selectorFound)}`, `Text found: ${textFound === null ? "n/a" : String(textFound)}`].join("\n") }], details: { title, selectorFound, textFound, bodyPreview: bodyText.slice(0, 2000) } }; }); } });

  pi.registerTool({ name: "browser_execute_steps", label: "Browser Execute Steps", description: "Run a bounded multi-step browser reproduction flow with click/fill/press/wait actions and capture a screenshot.", promptSnippet: "Run explicit browser repro steps before and after a fix.", promptGuidelines: ["Use this for multi-step website reproduction flows.", "Keep steps minimal and explicit."], parameters: Type.Object({ url: Type.String(), steps: Type.Array(Type.Object({ action: Type.String(), selector: Type.Optional(Type.String()), value: Type.Optional(Type.String()), key: Type.Optional(Type.String()), waitMs: Type.Optional(Type.Number()) })), screenshotPath: Type.Optional(Type.String()) }), async execute(_id, params, signal, _u, ctx) { const screenshotPath = params.screenshotPath ?? `artifacts/browser-steps-${Date.now()}.png`; return withPage(params.url, signal, async (page) => { const executed: string[] = []; for (const step of params.steps) executed.push(await executeStep(page, step)); const absolutePath = normalizePath(ctx.cwd, screenshotPath); await mkdir(dirname(absolutePath), { recursive: true }); await page.screenshot({ path: absolutePath, fullPage: true }); const title = await page.title(); recordArtifact(ctx.cwd, screenshotPath, "browser_execute_steps", `url=${params.url}`, ["browser", "steps", "screenshot"]); return { content: [{ type: "text", text: [`URL: ${params.url}`, `Executed steps: ${executed.length}`, `Title: ${title || "(none)"}`, `Screenshot: ${screenshotPath}`].join("\n") }], details: { executed, screenshotPath, title } }; }); } });

  pi.registerTool({ name: "browser_compare_artifacts", label: "Browser Compare Artifacts", description: "Compare two saved browser artifacts such as screenshots or DOM snapshots.", promptSnippet: "Compare before/after browser artifacts to verify whether a fix changed the observed output.", parameters: Type.Object({ leftPath: Type.String(), rightPath: Type.String(), fuzzyImageThreshold: Type.Optional(Type.Number({ default: 0.01 })) }), async execute(_id, params, _s, _u, ctx) { const basic = compareArtifacts(ctx.cwd, params.leftPath, params.rightPath); const pngComparison = params.leftPath.endsWith(".png") && params.rightPath.endsWith(".png") ? compareImagesFuzzy(ctx.cwd, params.leftPath, params.rightPath, params.fuzzyImageThreshold ?? 0.01) : undefined; return { content: [{ type: "text", text: [`Left: ${params.leftPath}`, `Right: ${params.rightPath}`, `Both exist: ${String(basic.leftExists && basic.rightExists)}`, `Identical: ${String(basic.identical)}`, pngComparison ? `Fuzzy image diff ratio: ${String(pngComparison.differenceRatio)}` : "", pngComparison ? `Within threshold: ${String(pngComparison.matchesWithinThreshold)}` : "", basic.textDiffPreview ? `Diff preview:\n${basic.textDiffPreview}` : ""].filter(Boolean).join("\n") }], details: { basic, pngComparison } }; } });
}
