import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseActiveAppInfoOutput,
  parseDesktopUiSnapshotOutput,
  registerDesktopObserverTools,
} from "../.pi/extensions/desktop-observer/index.js";
import { loadArtifactIndex } from "../apps/host/src/artifact-index.js";
import type { ApprovalRequest } from "../apps/host/src/approval-policy.js";

function createHarness() {
  const tools = new Map<string, any>();
  const pi = {
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
  };

  return { pi: pi as never, tools };
}

test("active_app_info saves a JSON artifact for durable inspection evidence", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-desktop-observer-info-"));
  try {
    const harness = createHarness();
    registerDesktopObserverTools(harness.pi, {
      now: () => 111,
      platform: "darwin",
      activeMacAppInfo: async () => ({ appName: "Safari", windowTitle: "Pinchy Dashboard" }),
    });

    const tool = harness.tools.get("active_app_info");
    const response = await tool.execute("call-1", {}, undefined, undefined, { cwd });

    assert.equal(response.details.outputPath, "artifacts/active-app-111.json");
    const saved = JSON.parse(readFileSync(join(cwd, "artifacts/active-app-111.json"), "utf8"));
    assert.deepEqual(saved, { appName: "Safari", windowTitle: "Pinchy Dashboard" });

    assert.deepEqual(loadArtifactIndex(cwd).map((record) => ({
      path: record.path,
      toolName: record.toolName,
      mediaType: record.mediaType,
      tags: [...(record.tags ?? [])].sort(),
    })), [
      {
        path: "artifacts/active-app-111.json",
        toolName: "active_app_info",
        mediaType: "application/json",
        tags: ["active_app_info", "desktop", "inspection", "json"],
      },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("desktop_ui_snapshot saves a JSON artifact for lightweight UI evidence", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-desktop-observer-ui-"));
  try {
    const harness = createHarness();
    registerDesktopObserverTools(harness.pi, {
      now: () => 222,
      platform: "darwin",
      macUiSnapshot: async () => ({ appName: "Finder", windowTitle: "Downloads", buttonNames: ["Back", "Next"] }),
    });

    const tool = harness.tools.get("desktop_ui_snapshot");
    const response = await tool.execute("call-2", {}, undefined, undefined, { cwd });

    assert.equal(response.details.outputPath, "artifacts/desktop-ui-222.json");
    const saved = JSON.parse(readFileSync(join(cwd, "artifacts/desktop-ui-222.json"), "utf8"));
    assert.deepEqual(saved, { appName: "Finder", windowTitle: "Downloads", buttonNames: ["Back", "Next"] });

    assert.deepEqual(loadArtifactIndex(cwd).map((record) => ({
      path: record.path,
      toolName: record.toolName,
      mediaType: record.mediaType,
      tags: [...(record.tags ?? [])].sort(),
    })), [
      {
        path: "artifacts/desktop-ui-222.json",
        toolName: "desktop_ui_snapshot",
        mediaType: "application/json",
        tags: ["desktop", "desktop_ui_snapshot", "inspection", "json"],
      },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("desktop_screenshot stores an image artifact for later debugging review", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-desktop-observer-shot-"));
  try {
    const harness = createHarness();
    registerDesktopObserverTools(harness.pi, {
      now: () => 333,
      platform: "darwin",
      captureMacScreenshot: async (targetPath) => {
        writeFileSync(targetPath, "png-bytes", "utf8");
      },
    });

    const tool = harness.tools.get("desktop_screenshot");
    const response = await tool.execute("call-3", {}, undefined, undefined, { cwd });

    assert.equal(response.details.outputPath, "artifacts/desktop-333.png");
    assert.equal(existsSync(join(cwd, "artifacts/desktop-333.png")), true);
    assert.deepEqual(loadArtifactIndex(cwd).map((record) => ({
      path: record.path,
      toolName: record.toolName,
      mediaType: record.mediaType,
      tags: [...(record.tags ?? [])].sort(),
    })), [
      {
        path: "artifacts/desktop-333.png",
        toolName: "desktop_screenshot",
        mediaType: "image/png",
        tags: ["desktop", "desktop_screenshot", "screenshot"],
      },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("parseActiveAppInfoOutput preserves window titles containing separators", () => {
  assert.deepEqual(parseActiveAppInfoOutput("Preview\u001fQuarterly Report | Draft"), {
    appName: "Preview",
    windowTitle: "Quarterly Report | Draft",
  });
});

test("parseDesktopUiSnapshotOutput preserves window titles containing separators", () => {
  assert.deepEqual(parseDesktopUiSnapshotOutput("Finder\u001fDownloads | Archive\u001fBack, Next"), {
    appName: "Finder",
    windowTitle: "Downloads | Archive",
    buttonNames: ["Back", "Next"],
  });
});

test("desktop observer tools stay read-only on non-mac platforms", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-desktop-non-darwin-"));
  try {
    const harness = createHarness();
    let screenshotCalls = 0;
    let activeInfoCalls = 0;
    let uiSnapshotCalls = 0;
    registerDesktopObserverTools(harness.pi, {
      platform: "linux",
      captureMacScreenshot: async () => {
        screenshotCalls += 1;
      },
      activeMacAppInfo: async () => {
        activeInfoCalls += 1;
        return { appName: "Should not run", windowTitle: "" };
      },
      macUiSnapshot: async () => {
        uiSnapshotCalls += 1;
        return { appName: "Should not run", windowTitle: "", buttonNames: [] };
      },
    });

    const screenshotTool = harness.tools.get("desktop_screenshot");
    const screenshotResponse = await screenshotTool.execute("call-3", {}, undefined, undefined, { cwd });
    assert.deepEqual(screenshotResponse.details, {});
    assert.match(screenshotResponse.content[0]?.text ?? "", /macos implementation only/i);

    const activeAppTool = harness.tools.get("active_app_info");
    const activeAppResponse = await activeAppTool.execute("call-4", {}, undefined, undefined, { cwd });
    assert.deepEqual(activeAppResponse.details, {});
    assert.match(activeAppResponse.content[0]?.text ?? "", /macos implementation only/i);

    const uiSnapshotTool = harness.tools.get("desktop_ui_snapshot");
    const uiSnapshotResponse = await uiSnapshotTool.execute("call-5", {}, undefined, undefined, { cwd });
    assert.deepEqual(uiSnapshotResponse.details, {});
    assert.match(uiSnapshotResponse.content[0]?.text ?? "", /macos implementation only/i);

    assert.equal(screenshotCalls, 0);
    assert.equal(activeInfoCalls, 0);
    assert.equal(uiSnapshotCalls, 0);
    assert.equal(existsSync(join(cwd, "artifacts")), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("desktop_open_app requests approval with desktop guardrails before launching", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-desktop-open-app-approved-"));
  try {
    const harness = createHarness();
    let openedAppName: string | undefined;
    let approvalRequest: ApprovalRequest | undefined;
    registerDesktopObserverTools(harness.pi, {
      platform: "darwin",
      openMacApp: async (appName) => {
        openedAppName = appName;
      },
      requestScopedApproval: async (_ctx, request) => {
        approvalRequest = request;
        return true;
      },
    });

    const tool = harness.tools.get("desktop_open_app");
    const response = await tool.execute(
      "call-4",
      { appName: "Safari", reason: "Inspect a local dashboard issue" },
      undefined,
      undefined,
      { cwd },
    );

    assert.deepEqual(approvalRequest, {
      scope: "desktop.actions",
      title: "Desktop action approval",
      message: 'Open app "Safari"?\n\nReason: Inspect a local dashboard issue',
      envVar: "PINCHY_ALLOW_DESKTOP_ACTIONS",
    });
    assert.equal(response.isError, undefined);
    assert.deepEqual(response.details, { approved: true, appName: "Safari" });
    assert.equal(openedAppName, "Safari");
    assert.match(response.content[0]?.text ?? "", /opened safari/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("desktop_open_app stops before launching when approval is denied", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-desktop-open-app-"));
  try {
    const harness = createHarness();
    let openedAppName: string | undefined;
    registerDesktopObserverTools(harness.pi, {
      platform: "darwin",
      openMacApp: async (appName) => {
        openedAppName = appName;
      },
      requestScopedApproval: async () => false,
    });

    const tool = harness.tools.get("desktop_open_app");
    const response = await tool.execute(
      "call-5",
      { appName: "Safari", reason: "Inspect a local dashboard issue" },
      undefined,
      undefined,
      { cwd },
    );

    assert.equal(response.isError, true);
    assert.equal(response.details.approved, false);
    assert.equal(openedAppName, undefined);
    assert.match(response.content[0]?.text ?? "", /not approved/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("desktop_open_app stays non-interactive on non-mac platforms", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-desktop-open-app-non-darwin-"));
  try {
    const harness = createHarness();
    let openedAppName: string | undefined;
    let approvalRequested = false;
    registerDesktopObserverTools(harness.pi, {
      platform: "linux",
      openMacApp: async (appName) => {
        openedAppName = appName;
      },
      requestScopedApproval: async () => {
        approvalRequested = true;
        return true;
      },
    });

    const tool = harness.tools.get("desktop_open_app");
    const response = await tool.execute(
      "call-6",
      { appName: "Safari", reason: "Inspect a local dashboard issue" },
      undefined,
      undefined,
      { cwd },
    );

    assert.equal(response.isError, undefined);
    assert.deepEqual(response.details, {});
    assert.equal(openedAppName, undefined);
    assert.equal(approvalRequested, false);
    assert.match(response.content[0]?.text ?? "", /macos implementation only/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
