import { DASHBOARD_PAGES, type DashboardPage } from "../apps/dashboard/src/dashboard-model.js";

export type DashboardSmokeSelector = {
  name: string;
  selector: string;
};

export type DashboardSmokePageSpec = {
  page: DashboardPage;
  selectors: DashboardSmokeSelector[];
};

function testIdSelector(testId: string) {
  return `[data-testid='${testId}']`;
}

export const DASHBOARD_SMOKE_SPECS: DashboardSmokePageSpec[] = [
  {
    page: "overview",
    selectors: [
      { name: "nav-overview", selector: testIdSelector("nav-page-overview") },
      { name: "reload-runtime", selector: testIdSelector("reload-runtime") },
      { name: "quick-prompt-input", selector: testIdSelector("quick-prompt-input") },
    ],
  },
  {
    page: "conversations",
    selectors: [
      { name: "nav-conversations", selector: testIdSelector("nav-page-conversations") },
      { name: "workspace-select", selector: testIdSelector("workspace-select") },
      { name: "conversation-shell-sidebar-toggle", selector: testIdSelector("conversation-shell-sidebar-toggle") },
      { name: "conversation-shell-utility-toggle", selector: testIdSelector("conversation-shell-utility-toggle") },
      { name: "conversation-title-input", selector: testIdSelector("conversation-title-input") },
      { name: "conversation-create", selector: testIdSelector("conversation-create") },
      { name: "conversation-composer-input", selector: testIdSelector("conversation-composer-input") },
      { name: "conversation-composer-submit", selector: testIdSelector("conversation-composer-submit") },
      { name: "chat-tools-toggle", selector: testIdSelector("chat-tools-toggle") },
      { name: "chat-workflows-toggle", selector: testIdSelector("chat-workflows-toggle") },
      { name: "onboarding-preset-debug-current-issue", selector: testIdSelector("onboarding-preset-debug-current-issue") },
    ],
  },
  {
    page: "memory",
    selectors: [
      { name: "nav-memory", selector: testIdSelector("nav-page-memory") },
      { name: "memory-title-input", selector: testIdSelector("memory-title-input") },
      { name: "memory-kind-select", selector: testIdSelector("memory-kind-select") },
      { name: "memory-content-input", selector: testIdSelector("memory-content-input") },
      { name: "memory-submit", selector: testIdSelector("memory-submit") },
      { name: "memory-search", selector: testIdSelector("memory-search") },
    ],
  },
  {
    page: "operations",
    selectors: [
      { name: "nav-operations", selector: testIdSelector("nav-page-operations") },
      { name: "workspace-path-input", selector: testIdSelector("workspace-path-input") },
      { name: "workspace-name-input", selector: testIdSelector("workspace-name-input") },
      { name: "workspace-add", selector: testIdSelector("workspace-add") },
      { name: "queue-task-title-input", selector: testIdSelector("queue-task-title-input") },
      { name: "queue-task-prompt-input", selector: testIdSelector("queue-task-prompt-input") },
      { name: "queue-task-submit", selector: testIdSelector("queue-task-submit") },
    ],
  },
  {
    page: "tools",
    selectors: [
      { name: "nav-tools", selector: testIdSelector("nav-page-tools") },
      { name: "artifact-search", selector: testIdSelector("artifact-search") },
      { name: "tools-agent-resource-skill", selector: testIdSelector("tools-agent-resource-skill") },
    ],
  },
  {
    page: "tasks",
    selectors: [
      { name: "nav-tasks", selector: testIdSelector("nav-page-tasks") },
      { name: "tasks-queue-title-input", selector: testIdSelector("tasks-queue-title-input") },
      { name: "tasks-queue-prompt-input", selector: testIdSelector("tasks-queue-prompt-input") },
      { name: "tasks-queue-submit", selector: testIdSelector("tasks-queue-submit") },
      { name: "tasks-search", selector: testIdSelector("tasks-search") },
      { name: "tasks-clear-completed", selector: testIdSelector("tasks-clear-completed") },
      { name: "tasks-status-filter-all", selector: testIdSelector("tasks-status-filter-all") },
    ],
  },
  {
    page: "settings",
    selectors: [
      { name: "nav-settings", selector: testIdSelector("nav-page-settings") },
      { name: "settings-provider-select", selector: testIdSelector("settings-provider-select") },
      { name: "settings-provider-api-key-input", selector: testIdSelector("settings-provider-api-key-input") },
      { name: "settings-model-input", selector: testIdSelector("settings-model-input") },
      { name: "settings-base-url-input", selector: testIdSelector("settings-base-url-input") },
      { name: "settings-detected-model", selector: testIdSelector("settings-detected-model") },
      { name: "settings-thinking-select", selector: testIdSelector("settings-thinking-select") },
      { name: "settings-danger-mode-enabled", selector: testIdSelector("settings-danger-mode-enabled") },
      { name: "settings-tool-retry-warning-threshold", selector: testIdSelector("settings-tool-retry-warning-threshold") },
      { name: "settings-tool-retry-hard-stop-threshold", selector: testIdSelector("settings-tool-retry-hard-stop-threshold") },
      { name: "settings-save", selector: testIdSelector("settings-save") },
    ],
  },
];

export function collectSmokeSelectors(specs: DashboardSmokePageSpec[]) {
  return specs.flatMap((spec) => spec.selectors.map((selector) => ({ page: spec.page, ...selector })));
}

export function validateDashboardSmokeSpecs(specs: DashboardSmokePageSpec[]) {
  const errors: string[] = [];
  const seenPages = new Set<DashboardPage>();
  const seenNames = new Set<string>();

  for (const spec of specs) {
    if (seenPages.has(spec.page)) {
      errors.push(`duplicate page spec: ${spec.page}`);
    }
    seenPages.add(spec.page);

    for (const selector of spec.selectors) {
      if (seenNames.has(selector.name)) {
        errors.push(`duplicate selector name: ${selector.name}`);
      }
      seenNames.add(selector.name);

      if (!selector.selector.startsWith("[data-testid")) {
        errors.push(`selector must use data-testid: ${selector.name}`);
      }
    }
  }

  for (const page of DASHBOARD_PAGES) {
    if (!seenPages.has(page)) {
      errors.push(`missing smoke page spec: ${page}`);
    }
  }

  return errors;
}
