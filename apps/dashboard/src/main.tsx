import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import type { DashboardArtifact as Artifact, DashboardState } from "../../../packages/shared/src/contracts.js";
type GeneratedToolDetail = { ok: true; tool: { path: string; source: string } };
type GeneratedToolDiff = { ok: true; diff: { path: string; diff: string } };

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function badgeStyle(color: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    background: color,
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
  };
}

function buttonStyle(kind: "primary" | "danger" | "success" | "ghost" = "primary"): React.CSSProperties {
  const palette = {
    primary: "#2563eb",
    danger: "#dc2626",
    success: "#059669",
    ghost: "#334155",
  } as const;
  return {
    border: 0,
    borderRadius: 10,
    padding: "8px 12px",
    background: palette[kind],
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  };
}

function cardStyle(): React.CSSProperties {
  return {
    background: "#111827",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  };
}

function formatTs(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function ActionRow(props: React.PropsWithChildren<{ title: string; subtitle?: string; actions?: React.ReactNode }>) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", background: "#0b1220", borderRadius: 12, padding: 12, marginBottom: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{props.title}</div>
        {props.subtitle ? <div style={{ color: "#94a3b8", marginTop: 4 }}>{props.subtitle}</div> : null}
        {props.children ? <div style={{ marginTop: 8 }}>{props.children}</div> : null}
      </div>
      {props.actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>{props.actions}</div> : null}
    </div>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section style={cardStyle()}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#020617", borderRadius: 10, padding: 12, overflow: "auto" }}>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

function App() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artifactQuery, setArtifactQuery] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [selectedToolSource, setSelectedToolSource] = useState<string>("");
  const [selectedToolDiff, setSelectedToolDiff] = useState<string>("");
  const [queueTaskTitle, setQueueTaskTitle] = useState("");
  const [queueTaskPrompt, setQueueTaskPrompt] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const load = async () => {
    try {
      const nextState = await fetchJson<DashboardState>("/api/state");
      setState(nextState);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
    const source = new EventSource("/api/events");
    source.addEventListener("state", (event) => {
      const message = event as MessageEvent<string>;
      setState(JSON.parse(message.data) as DashboardState);
      setError(null);
    });
    source.onerror = () => {
      setError((current) => current ?? "Live updates disconnected; retrying.");
    };
    return () => source.close();
  }, []);

  useEffect(() => {
    if (!selectedTool) return;
    void fetchJson<GeneratedToolDetail>(`/api/generated-tools/${encodeURIComponent(selectedTool)}`).then((payload) => {
      setSelectedToolSource(payload.tool.source);
    }).catch((err) => {
      setSelectedToolSource(`Unable to load generated tool: ${err instanceof Error ? err.message : String(err)}`);
    });
    void fetchJson<GeneratedToolDiff>(`/api/generated-tools/${encodeURIComponent(selectedTool)}/diff`).then((payload) => {
      setSelectedToolDiff(payload.diff.diff);
    }).catch((err) => {
      setSelectedToolDiff(`Unable to load git diff: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, [selectedTool]);

  const performAction = async (action: string, payload: Record<string, unknown>) => {
    setIsBusy(true);
    try {
      await fetchJson<{ ok: boolean }>(`/api/actions/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const filteredArtifacts = useMemo(() => {
    if (!state) return [];
    const query = artifactQuery.trim().toLowerCase();
    if (!query) return state.artifacts;
    return state.artifacts.filter((artifact) => {
      const haystack = [artifact.name, artifact.toolName, artifact.note, ...(artifact.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [artifactQuery, state]);

  if (error && !state) return <div style={{ padding: 24, color: "#fff", background: "#111" }}>Error: {error}</div>;
  if (!state) return <div style={{ padding: 24, color: "#fff", background: "#111" }}>Loading…</div>;

  const pendingApprovals = state.approvals.filter((entry) => entry.status === "pending");
  const daemonTone = state.daemonHealth?.status === "error" ? "#dc2626" : state.daemonHealth?.status === "running" ? "#2563eb" : state.daemonHealth?.status === "idle" ? "#059669" : "#475569";

  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, sans-serif", background: "#0f172a", color: "#e5e7eb", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <section style={{ ...cardStyle(), flex: 1, minWidth: 320, background: "linear-gradient(135deg, #1e293b, #111827)" }}>
          <h1 style={{ marginTop: 0 }}>Pinchy Dashboard App</h1>
          <p style={{ color: "#94a3b8" }}>Live local operator console with approvals, task queue, routines, generated tool review, artifact browsing, daemon health, and run timeline visibility.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={badgeStyle("#2563eb")}>{state.tasks.filter((entry) => entry.status === "pending").length} pending tasks</span>
            <span style={badgeStyle(pendingApprovals.length ? "#d97706" : "#059669")}>{pendingApprovals.length} pending approvals</span>
            <span style={badgeStyle("#475569")}>{state.generatedTools.length} generated tools</span>
            <span style={badgeStyle("#7c3aed")}>{state.pendingReloadRequests.length} pending reloads</span>
            <span style={badgeStyle(daemonTone)}>daemon: {state.daemonHealth?.status ?? "unknown"}</span>
          </div>
          <p style={{ color: "#cbd5e1", marginTop: 12 }}>Current run: {state.runContext ? `${state.runContext.currentRunLabel} (${state.runContext.currentRunId})` : "none"}</p>
          {error ? <p style={{ color: "#fbbf24" }}>{error}</p> : <p style={{ color: "#10b981" }}>Live updates connected.</p>}
        </section>

        <section style={{ ...cardStyle(), flex: 1, minWidth: 320 }}>
          <h2 style={{ marginTop: 0 }}>Queue Task</h2>
          <div style={{ display: "grid", gap: 8 }}>
            <input value={queueTaskTitle} onChange={(event) => setQueueTaskTitle(event.target.value)} placeholder="Task title" style={{ borderRadius: 10, border: "1px solid #475569", background: "#0f172a", color: "#e5e7eb", padding: 10 }} />
            <textarea value={queueTaskPrompt} onChange={(event) => setQueueTaskPrompt(event.target.value)} placeholder="Task prompt" rows={5} style={{ borderRadius: 10, border: "1px solid #475569", background: "#0f172a", color: "#e5e7eb", padding: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={buttonStyle("primary")}
                disabled={isBusy || !queueTaskTitle.trim() || !queueTaskPrompt.trim()}
                onClick={() => void performAction("queue-task", { title: queueTaskTitle, prompt: queueTaskPrompt }).then(() => {
                  setQueueTaskTitle("");
                  setQueueTaskPrompt("");
                })}
              >
                Queue Task
              </button>
              <button style={buttonStyle("ghost")} onClick={() => void load()}>Refresh</button>
            </div>
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0 }}>Daemon Health</h2>
          <ActionRow
            title={`status: ${state.daemonHealth?.status ?? "unknown"}`}
            subtitle={`heartbeat: ${formatTs(state.daemonHealth?.heartbeatAt)}`}
            actions={<button style={buttonStyle("primary")} disabled={isBusy} onClick={() => void performAction("reload-runtime", {})}>Reload Runtime</button>}
          >
            <div style={{ color: "#cbd5e1", display: "grid", gap: 4 }}>
              <div>pid: {state.daemonHealth?.pid ?? "—"}</div>
              <div>started: {formatTs(state.daemonHealth?.startedAt)}</div>
              <div>activity: {state.daemonHealth?.currentActivity ?? "idle"}</div>
              <div>last completed: {formatTs(state.daemonHealth?.lastCompletedAt)}</div>
              <div>pending reloads: {state.pendingReloadRequests.length}</div>
              {state.daemonHealth?.lastError ? <div style={{ color: "#fca5a5" }}>last error: {state.daemonHealth.lastError}</div> : null}
            </div>
          </ActionRow>
        </section>

        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0 }}>Run Timeline</h2>
          <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto" }}>
            {state.runHistory.length === 0 ? <p style={{ color: "#94a3b8" }}>No run history yet.</p> : state.runHistory.map((entry) => (
              <ActionRow key={entry.id} title={`${entry.kind}: ${entry.label}`} subtitle={`${entry.status} • ${formatTs(entry.ts)}`}>
                {entry.details ? <div style={{ color: "#cbd5e1", fontSize: 13, whiteSpace: "pre-wrap" }}>{entry.details}</div> : null}
              </ActionRow>
            ))}
          </div>
        </section>

        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0 }}>Tasks</h2>
          {state.tasks.map((task) => (
            <ActionRow
              key={task.id}
              title={task.title}
              subtitle={`status: ${task.status}`}
              actions={
                <>
                  <button style={buttonStyle("success")} disabled={isBusy} onClick={() => void performAction("task", { id: task.id, status: "done" })}>Done</button>
                  <button style={buttonStyle("danger")} disabled={isBusy} onClick={() => void performAction("task", { id: task.id, status: "blocked" })}>Block</button>
                </>
              }
            >
              {task.prompt ? <div style={{ color: "#cbd5e1", fontSize: 13, whiteSpace: "pre-wrap" }}>{task.prompt}</div> : null}
            </ActionRow>
          ))}
        </section>

        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0 }}>Approvals</h2>
          {pendingApprovals.length === 0 ? <p style={{ color: "#94a3b8" }}>No pending approvals.</p> : pendingApprovals.map((approval) => (
            <ActionRow
              key={approval.id}
              title={approval.toolName}
              subtitle={approval.reason}
              actions={
                <>
                  <button style={buttonStyle("success")} disabled={isBusy} onClick={() => void performAction("approval", { id: approval.id, status: "approved" })}>Approve</button>
                  <button style={buttonStyle("danger")} disabled={isBusy} onClick={() => void performAction("approval", { id: approval.id, status: "denied" })}>Deny</button>
                </>
              }
            >
              {approval.payload ? <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#020617", borderRadius: 10, padding: 10 }}>{JSON.stringify(approval.payload, null, 2)}</pre> : null}
            </ActionRow>
          ))}
        </section>

        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0 }}>Approval Scopes</h2>
          {Object.entries(state.policy.scopes ?? {}).map(([scope, enabled]) => (
            <ActionRow
              key={scope}
              title={scope}
              subtitle={enabled ? "enabled" : "disabled"}
              actions={<button style={buttonStyle(enabled ? "danger" : "success")} disabled={isBusy} onClick={() => void performAction("scope", { scope, enabled: !enabled })}>{enabled ? "Disable" : "Enable"}</button>}
            />
          ))}
        </section>

        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0 }}>Routines</h2>
          {state.routines.length === 0 ? <p style={{ color: "#94a3b8" }}>No routines saved.</p> : state.routines.map((routine) => (
            <ActionRow
              key={routine.name}
              title={routine.name}
              subtitle={`${routine.steps.length} step(s)`}
              actions={<button style={buttonStyle("primary")} disabled={isBusy} onClick={() => void performAction("routine-run", { name: routine.name })}>Queue Run</button>}
            >
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#020617", borderRadius: 10, padding: 10 }}>{JSON.stringify(routine.steps, null, 2)}</pre>
            </ActionRow>
          ))}
        </section>

        <section style={cardStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <h2 style={{ marginTop: 0, marginBottom: 0 }}>Generated Tools</h2>
            <span style={{ color: "#94a3b8" }}>Review source + git diff before one-click reload</span>
          </div>
          {state.generatedTools.length === 0 ? <p style={{ color: "#94a3b8" }}>No generated tools yet.</p> : state.generatedTools.map((tool) => (
            <ActionRow
              key={tool}
              title={tool}
              actions={
                <>
                  <button style={buttonStyle("ghost")} onClick={() => setSelectedTool(tool)}>Review</button>
                  <button style={buttonStyle("primary")} disabled={isBusy} onClick={() => void performAction("generated-tool-reload", { name: tool })}>Reload Now</button>
                </>
              }
            />
          ))}
          <div style={{ marginTop: 12, background: "#020617", borderRadius: 12, padding: 12, display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 700 }}>{selectedTool ? `Review: ${selectedTool}` : "Select a generated tool"}</div>
            <div>
              <div style={{ color: "#94a3b8", marginBottom: 6 }}>Source</div>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{selectedToolSource || "Generated tool source will appear here."}</pre>
            </div>
            <div>
              <div style={{ color: "#94a3b8", marginBottom: 6 }}>Git Diff</div>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{selectedToolDiff || "Generated tool diff will appear here."}</pre>
            </div>
          </div>
        </section>

        <section style={cardStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Artifacts</h2>
            <input value={artifactQuery} onChange={(event) => setArtifactQuery(event.target.value)} placeholder="Filter artifacts" style={{ borderRadius: 10, border: "1px solid #475569", background: "#0f172a", color: "#e5e7eb", padding: 10, minWidth: 180 }} />
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 12, maxHeight: 420, overflow: "auto" }}>
            {filteredArtifacts.map((artifact) => (
              <ActionRow
                key={artifact.name}
                title={artifact.name}
                subtitle={`${artifact.size} bytes${artifact.toolName ? ` • ${artifact.toolName}` : ""}`}
                actions={<button style={buttonStyle("ghost")} onClick={() => setSelectedArtifact(artifact)}>View</button>}
              >
                {artifact.tags?.length ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{artifact.tags.map((tag) => <span key={tag} style={badgeStyle("#475569")}>{tag}</span>)}</div> : null}
                {artifact.note ? <div style={{ color: "#cbd5e1", marginTop: 6 }}>{artifact.note}</div> : null}
              </ActionRow>
            ))}
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginTop: 16 }}>
        <JsonPanel title="Goals" value={state.goals} />
        <JsonPanel title="Watch Config" value={state.watch} />
        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0 }}>Audit Tail</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#020617", borderRadius: 10, padding: 12, overflow: "auto", maxHeight: 320 }}>{state.auditTail || "No audit entries yet."}</pre>
        </section>
      </div>

      {selectedArtifact ? (
        <div onClick={() => setSelectedArtifact(null)} style={{ position: "fixed", inset: 0, background: "rgba(2, 6, 23, 0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: "min(1000px, 100%)", maxHeight: "90vh", overflow: "auto", ...cardStyle() }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0 }}>{selectedArtifact.name}</h2>
                <p style={{ color: "#94a3b8" }}>{selectedArtifact.toolName ?? "artifact"} • {selectedArtifact.size} bytes</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={`/artifact/${encodeURIComponent(selectedArtifact.name)}`} target="_blank" rel="noreferrer" style={{ ...buttonStyle("primary"), textDecoration: "none" }}>Open</a>
                <button style={buttonStyle("ghost")} onClick={() => setSelectedArtifact(null)}>Close</button>
              </div>
            </div>
            {/\.(png|jpg|jpeg|gif|webp)$/i.test(selectedArtifact.name) ? (
              <img src={`/artifact/${encodeURIComponent(selectedArtifact.name)}`} alt={selectedArtifact.name} style={{ width: "100%", borderRadius: 12, marginTop: 12, background: "#020617" }} />
            ) : (
              <iframe title={selectedArtifact.name} src={`/artifact/${encodeURIComponent(selectedArtifact.name)}`} style={{ width: "100%", height: "70vh", border: 0, borderRadius: 12, marginTop: 12, background: "#fff" }} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
