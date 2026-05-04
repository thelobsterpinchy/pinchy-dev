import type { DashboardArtifact } from "../../../packages/shared/src/contracts.js";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { filterArtifactIndex } from "./artifact-index.js";
import { loadGeneratedToolRegistry } from "./generated-tool-registry.js";
import { loadGeneratedToolSource } from "./tool-review.js";
import type { RoutineRecord } from "./routine-store.js";
import { loadRoutines } from "./routine-store.js";

export function renderSafe(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderJson(value: unknown) {
  return renderSafe(JSON.stringify(value, null, 2));
}

export function badge(text: string, tone: "blue" | "green" | "yellow" | "red" | "slate" = "slate") {
  return `<span class="badge badge-${tone}">${renderSafe(text)}</span>`;
}

export function sectionHeader(title: string, subtitle?: string) {
  return `<div class="section-header"><div><h2>${renderSafe(title)}</h2>${subtitle ? `<p class="muted">${renderSafe(subtitle)}</p>` : ""}</div></div>`;
}

export type ListArtifactFilter = { toolName?: string; query?: string; tag?: string };

interface FilteredRecord {
  path: string;
  note?: string;
  toolName?: string;
  tags?: string[];
}

interface PreStatArtifact {
  name: string;
  path: string;
  note?: string;
  toolName?: string;
  tags?: string[];
}

export function listArtifacts(cwd: string, filter: ListArtifactFilter, limit = 24): DashboardArtifact[] {
  const records = filterArtifactIndex(cwd, filter);
  if (records.length > 0) {
    return records
      .map((record: FilteredRecord) => ({
        name: record.path.replace(/^artifacts\//, ""),
        path: resolve(cwd, record.path),
        note: record.note,
        toolName: record.toolName,
        tags: record.tags,
      }))
      .filter(function(entry) {
        return existsSync((entry as PreStatArtifact).path);
      })
      .map(function(entry) {
        const stat = statSync((entry as PreStatArtifact).path);
        return {
          name: (entry as PreStatArtifact).name,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          note: (entry as PreStatArtifact).note,
          toolName: (entry as PreStatArtifact).toolName,
          tags: (entry as PreStatArtifact).tags,
        };
      })
      .sort((a: DashboardArtifact, b: DashboardArtifact) => b.mtimeMs - a.mtimeMs)
      .slice(0, limit);
  }

  const base = resolve(cwd, "artifacts");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((name: string) => ({ name, path: join(base, name) }))
    .filter(function(entry) {
      return statSync((entry as { name: string; path: string }).path).isFile();
    })
    .map(function(entry) {
      const stat = statSync((entry as { name: string; path: string }).path);
      return {
        name: (entry as { name: string; path: string }).name,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      } satisfies DashboardArtifact;
    })
    .sort((a: DashboardArtifact, b: DashboardArtifact) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
}

export function renderArtifactGallery(cwd: string, query: string, toolName: string, tag: string) {
  const artifacts = listArtifacts(cwd, { query: query || undefined, toolName: toolName || undefined, tag: tag || undefined });
  const filterForm = `
    <form method="get" action="/" class="filters">
      <input class="input" type="text" name="artifactQuery" value="${renderSafe(query)}" placeholder="search artifacts" />
      <input class="input" type="text" name="artifactTool" value="${renderSafe(toolName)}" placeholder="tool name" />
      <input class="input" type="text" name="artifactTag" value="${renderSafe(tag)}" placeholder="tag" />
      <button class="btn" type="submit">Filter</button>
    </form>
  `;
  if (artifacts.length === 0) return `${filterForm}<p class="muted">No artifacts found.</p>`;
  return `${filterForm}<div class="gallery">${artifacts.map((artifact: DashboardArtifact) => {
    const lower = artifact.name.toLowerCase();
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/.test(lower);
    const href = `/artifact/${encodeURIComponent(artifact.name)}`;
    return `<div class="artifact">${isImage ? `<a href="${href}" target="_blank"><img src="${href}" alt="${renderSafe(artifact.name)}" /></a>` : ""}<div><strong>${renderSafe(artifact.name)}</strong><br/><span class="muted">${artifact.size} bytes</span>${artifact.toolName ? `<br/>${badge(artifact.toolName, "blue")}` : ""}${artifact.tags?.length ? `<div class="tag-row">${artifact.tags.map((tag: string) => badge(tag, "slate")).join(" ")}</div>` : ""}${artifact.note ? `<div class="muted" style="margin-top:6px;">${renderSafe(artifact.note)}</div>` : ""}</div></div>`;
  }).join("")}</div>`;
}

export function renderRoutines(cwd: string) {
  const routines = loadRoutines(cwd);
  if (routines.length === 0) return "<p class=\"muted\">No routines saved.</p>";
  return `<div class="stack">${routines.map((routine: RoutineRecord) => `<div class="routine-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><div><strong>${renderSafe(routine.name)}</strong><br/><span class="muted">${routine.steps.length} step(s)</span></div><form method="post" action="/routine-run"><input type="hidden" name="name" value="${renderSafe(routine.name)}" /><button class="btn">Queue Run</button></form></div><pre>${renderJson(routine.steps)}</pre></div>`).join("")}</div>`;
}

export function renderGeneratedTools(cwd: string, selectedTool?: string) {
  const tools = loadGeneratedToolRegistry(cwd);
  const selected = selectedTool ? loadGeneratedToolSource(cwd, selectedTool) : undefined;
  return `
    <div class="stack">
      ${tools.length === 0 ? `<p class="muted">No generated tools yet.</p>` : tools.map((tool: string) => `
        <div class="action-row">
          <div><strong>${renderSafe(tool)}</strong></div>
          <form method="get" action="/">
            <input type="hidden" name="generatedTool" value="${renderSafe(tool)}" />
            <button class="btn" type="submit">Review</button>
          </form>
        </div>
      `).join("")}
      ${selected ? `<div class="routine-card"><strong>${renderSafe(selectedTool ?? "")}</strong><pre>${renderSafe(selected.source)}</pre></div>` : ""}
    </div>
  `;
}

export function renderTaskActions(tasks: ReturnType<typeof import("./task-queue.js").loadTasks>) {
  return tasks.map((task) => `
    <div class="action-row">
      <div><strong>${renderSafe(task.title)}</strong><br/>${badge(task.status, task.status === "done" ? "green" : task.status === "blocked" ? "red" : task.status === "running" ? "yellow" : "blue")}</div>
      <form method="post" action="/task">
        <input type="hidden" name="id" value="${renderSafe(task.id)}" />
        <button class="btn" name="status" value="done">Complete</button>
        <button class="btn btn-danger" name="status" value="blocked">Block</button>
      </form>
    </div>
  `).join("");
}

export function renderQueueTaskForm() {
  return `
    <form method="post" action="/queue-task" class="stack">
      <input class="input" type="text" name="title" placeholder="Task title" required />
      <textarea class="input" name="prompt" placeholder="Task prompt" rows="5" required></textarea>
      <button class="btn" type="submit">Queue Task</button>
    </form>
  `;
}

export const DASHBOARD_HTML_STYLES = `
    :root { color-scheme: dark; }
    body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; margin: 0; background: #0f172a; color: #e5e7eb; }
    .page { max-width: 1440px; margin: 0 auto; padding: 24px; }
    h1, h2 { margin: 0; }
    textarea { width: 100%; resize: vertical; }
    .hero { display: flex; justify-content: space-between; align-items: stretch; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .hero-card { background: linear-gradient(135deg, #1e293b, #111827); border: 1px solid #334155; border-radius: 16px; padding: 20px; flex: 1; min-width: 280px; }
    .muted { color: #94a3b8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .section-header p { margin: 6px 0 0; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; background: #020617; padding: 12px; border-radius: 10px; overflow: auto; }
    .action-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #0b1220; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
    .btn, .input { border-radius: 10px; border: 1px solid #475569; font: inherit; }
    .btn { background: #1d4ed8; color: white; padding: 8px 12px; cursor: pointer; }
    .btn:hover { background: #2563eb; }
    .btn-danger { background: #b91c1c; }
    .btn-danger:hover { background: #dc2626; }
    .btn-success { background: #047857; }
    .btn-success:hover { background: #059669; }
    .input { background: #0f172a; color: #e5e7eb; padding: 8px 10px; min-width: 120px; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .artifact, .routine-card { background: #0b1220; border-radius: 12px; padding: 10px; border: 1px solid #1e293b; }
    img { width: 100%; height: 140px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; background: #1e293b; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 600; margin-right: 6px; }
    .badge-blue { background: #1d4ed8; color: #dbeafe; }
    .badge-green { background: #065f46; color: #d1fae5; }
    .badge-yellow { background: #92400e; color: #fef3c7; }
    .badge-red { background: #991b1b; color: #fee2e2; }
    .badge-slate { background: #334155; color: #e2e8f0; }
    .tag-row { margin-top: 8px; }
    .stack { display: grid; gap: 10px; }
`;
