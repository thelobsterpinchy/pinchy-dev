import React from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { RootLayout } from "./components/RootLayout.js";
import { ChatPage } from "./components/ChatPage.js";
import { OverviewPage } from "./components/OverviewPage.js";
import { MemoryPage } from "./components/MemoryPage.js";
import { OrchestrationPage } from "./components/OrchestrationPage.js";
import { ToolsPage } from "./components/ToolsPage.js";
import { TasksPage } from "./components/TasksPage.js";
import { SettingsPage } from "./components/SettingsPage.js";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: ChatPage },
      { path: "c/:conversationId/agents/:taskId", Component: ChatPage },
      { path: "c/:conversationId", Component: ChatPage },
      { path: "overview", Component: OverviewPage },
      { path: "memory", Component: MemoryPage },
      { path: "operations", Component: OrchestrationPage },
      { path: "orchestration", element: <Navigate to="/operations" replace /> },
      { path: "tools", Component: ToolsPage },
      { path: "tasks", Component: TasksPage },
      { path: "settings", Component: SettingsPage },
    ],
  },
]);
