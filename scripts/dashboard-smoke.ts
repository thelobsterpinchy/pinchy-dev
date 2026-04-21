import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { DASHBOARD_SMOKE_SPECS } from "./dashboard-smoke-spec.js";

type WorkspaceEntry = { id: string; name: string; path: string };
type DashboardState = {
  activeWorkspaceId?: string;
  tasks: Array<{ id: string; status: string }>;
  memories: Array<{ id: string }>;
};

type ConversationSummary = { id: string; title: string };

const baseUrl = process.env.PINCHY_DASHBOARD_BASE_URL ?? "http://127.0.0.1:4310";
const headless = process.env.PINCHY_SMOKE_HEADLESS !== "false";

function log(message: string) {
  console.log(`[dashboard-smoke] ${message}`);
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${path}`);
  }
  return response.json() as Promise<T>;
}

async function waitFor<T>(label: string, read: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 15000, intervalMs = 250): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function seedWorkspace(name: string) {
  const path = mkdtempSync(join(tmpdir(), `pinchy-dashboard-smoke-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-`));
  return fetchJson<WorkspaceEntry>("/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, name }),
  });
}

async function activateWorkspace(workspaceId: string) {
  await fetchJson<{ ok: true }>(`/api/workspaces/${workspaceId}/activate`, {
    method: "POST",
  });
}

async function readState() {
  return fetchJson<DashboardState>("/api/state");
}

async function readConversations() {
  return fetchJson<ConversationSummary[]>("/api/control-plane/conversations");
}

async function openPage(page: Page, pageName: string) {
  await page.click(`[data-testid='nav-page-${pageName}']`);
  await page.waitForTimeout(400);
}

async function expectVisible(page: Page, selector: string) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout: 15000 });
}

async function verifySpec(page: Page, pageName: string) {
  const spec = DASHBOARD_SMOKE_SPECS.find((entry) => entry.page === pageName);
  if (!spec) throw new Error(`Missing smoke spec for page ${pageName}`);
  log(`verifying ${pageName} selectors`);
  if (pageName !== "conversations") {
    await openPage(page, pageName);
  }
  if (pageName === "conversations") {
    await expectVisible(page, "[data-testid='conversation-shell-sidebar-toggle']");
    await page.click("[data-testid='conversation-shell-sidebar-toggle']");
    await page.waitForTimeout(300);
    await expectVisible(page, "[data-testid='conversation-shell-utility-toggle']");
    await page.click("[data-testid='conversation-shell-utility-toggle']");
    await page.waitForTimeout(300);
  }
  for (const selector of spec.selectors) {
    await expectVisible(page, selector.selector);
  }
}

async function main() {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  try {
    log(`baseUrl=${baseUrl}`);

    const workspaceA = await seedWorkspace("Smoke A");
    const workspaceB = await seedWorkspace("Smoke B");
    await activateWorkspace(workspaceA.id);
    log(`seeded workspaces A=${workspaceA.id} B=${workspaceB.id}`);

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await expectVisible(page, "[data-testid='nav-page-conversations']");

    await verifySpec(page, "conversations");
    await verifySpec(page, "overview");

    log("creating a conversation from the empty-workspace preset");
    await openPage(page, "conversations");
    await page.click("[data-testid='onboarding-preset-debug-current-issue']");

    const conversations = await waitFor(
      "conversation creation",
      readConversations,
      (items) => items.length > 0,
    );
    const createdConversation = conversations[0]!;
    log(`created conversation ${createdConversation.id}`);

    await expectVisible(page, `[data-testid='conversation-row-${createdConversation.id}']`);
    await expectVisible(page, `[data-testid='conversation-delete-${createdConversation.id}']`);
    await expectVisible(page, "[data-testid='conversation-composer-input']");

    log("creating a saved memory through the Memory page");
    await verifySpec(page, "memory");
    await page.fill("[data-testid='memory-title-input']", "Smoke memory");
    await page.fill("[data-testid='memory-content-input']", "Smoke-tested memory creation through the dashboard UI.");
    await waitFor(
      "memory submit enabled",
      async () => page.locator("[data-testid='memory-submit']").isEnabled(),
      Boolean,
      5000,
      100,
    );
    await page.click("[data-testid='memory-submit']");
    const memoryState = await waitFor(
      "memory creation",
      readState,
      (state) => state.memories.length > 0,
    );
    log(`memory count=${memoryState.memories.length}`);

    log("queueing and completing a task through Operations");
    await verifySpec(page, "operations");
    await page.fill("[data-testid='queue-task-title-input']", "Smoke task");
    await page.fill("[data-testid='queue-task-prompt-input']", "Verify the operations queue task form remains wired.");
    const taskCountBefore = (await readState()).tasks.length;
    await page.click("[data-testid='queue-task-submit']");
    const taskState = await waitFor(
      "queued task",
      readState,
      (state) => state.tasks.length > taskCountBefore,
    );
    const queuedTask = taskState.tasks.find((task) => task.status === "pending");
    if (!queuedTask) throw new Error("Expected a pending queued task after queue-task-submit");
    await expectVisible(page, `[data-testid='task-done-${queuedTask.id}']`);
    await page.click(`[data-testid='task-done-${queuedTask.id}']`);
    await waitFor(
      "task completion",
      readState,
      (state) => state.tasks.some((task) => task.id === queuedTask.id && task.status === "done"),
    );

    log("switching workspaces through Operations and verifying sticky thread restore");
    await expectVisible(page, `[data-testid='workspace-activate-${workspaceB.id}']`);
    await page.click(`[data-testid='workspace-activate-${workspaceB.id}']`);
    await waitFor(
      "workspace B activation",
      readState,
      (state) => state.activeWorkspaceId === workspaceB.id,
    );
    await openPage(page, "conversations");
    await page.getByText("No saved conversations in this workspace yet.").waitFor({ state: "visible", timeout: 15000 });

    await openPage(page, "operations");
    await expectVisible(page, `[data-testid='workspace-activate-${workspaceA.id}']`);
    await page.click(`[data-testid='workspace-activate-${workspaceA.id}']`);
    await waitFor(
      "workspace A re-activation",
      readState,
      (state) => state.activeWorkspaceId === workspaceA.id,
    );
    await openPage(page, "conversations");
    await page.getByText(`Current thread: ${createdConversation.title}`).waitFor({ state: "visible", timeout: 15000 });

    log("verifying tools page selectors and conditional modal controls");
    await verifySpec(page, "tools");
    const firstArtifactView = page.locator("[data-testid^='artifact-view-']").first();
    if (await firstArtifactView.count()) {
      await firstArtifactView.click();
      await expectVisible(page, "[data-testid='artifact-modal']");
      await page.click("[data-testid='artifact-modal-close']");
    } else {
      log("no artifact view button present; skipping artifact modal interaction");
    }

    log("dashboard smoke test passed");
  } catch (error) {
    const screenshotPath = `/tmp/pinchy-dashboard-smoke-failure-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    log(`failure screenshot: ${screenshotPath}`);
    throw error;
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(`[dashboard-smoke] failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
