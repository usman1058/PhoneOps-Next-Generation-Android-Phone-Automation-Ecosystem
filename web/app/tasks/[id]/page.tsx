"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/client-api";
import StepView from "@/components/StepView";
import type { Step } from "@automation/shared";

interface TaskDetail {
  id: string;
  name: string;
  deviceId: string;
  steps: Step[];
  schedule: string | null;
  isEnabled: boolean;
  createdAt: string;
  device: { id: string; name: string; isOnline: boolean } | null;
}

interface TaskRun {
  id: string;
  triggeredBy: "manual" | "schedule";
  status: string;
  stepResults: Array<{ stepIndex: number; status: string; error?: string }>;
  startedAt: string;
  finishedAt: string | null;
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(() => {
    api<TaskDetail>(`/api/tasks/${id}`)
      .then(setTask)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    api<TaskRun[]>(`/api/tasks/${id}/runs`)
      .then(setRuns)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function toggleEnabled() {
    if (!task) return;
    try {
      const updated = await api<TaskDetail>(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: !task.isEnabled }),
      });
      setTask(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runNow() {
    setError(null);
    setRunning(true);
    try {
      const res = await api<{ runId: string }>(`/api/tasks/${id}/run`, {
        method: "POST",
      });
      setError(`Run started: ${res.runId}`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!task && !error) return <div className="container">Loading...</div>;

  return (
    <div className="container">
      {error && (
        <p className="muted" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}
      {task && (
        <>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <p className="eyebrow">Task details</p>
              <h1 style={{ marginTop: 0 }}>{task.name}</h1>
              <p className="muted">
                Device: {task.device?.name ?? task.deviceId} - {task.schedule ? `schedule ${task.schedule}` : "manual trigger"} - created {new Date(task.createdAt).toLocaleString()}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Link href={`/task-builder?taskId=${task.id}`}>Edit task</Link>
              <button onClick={toggleEnabled}>{task.isEnabled ? "Disable" : "Enable"}</button>
              <button className="primary" onClick={runNow} disabled={running}>
                {running ? "Running..." : "Run now"}
              </button>
            </div>
          </div>

          <div className="grid2" style={{ marginTop: 16 }}>
            <div className="card soft-card">
              <h2 style={{ marginTop: 0 }}>Steps</h2>
              <StepView steps={task.steps} />
            </div>
            <div className="card soft-card">
              <h2 style={{ marginTop: 0 }}>Execution notes</h2>
              <p className="muted">
                This task is wired to the connected Android phone. Use the builder to record taps directly from the screen, then save the edited steps back here.
              </p>
              <div className={`badge ${task.device?.isOnline ? "online" : "offline"}`} style={{ marginTop: 8 }}>
                {task.device?.isOnline ? "device online" : "device offline"}
              </div>
            </div>
          </div>

          <h2>Run history</h2>
          {runs.length === 0 && <p className="muted">No runs yet.</p>}
          {runs.map((r) => (
            <div className="card" key={r.id}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div>
                  <strong>{r.id.slice(0, 8)}...</strong>
                  <span className="muted">
                    - {r.triggeredBy} - {new Date(r.startedAt).toLocaleString()}

                  </span>
                </div>
                <span className={`badge ${r.status}`}>{r.status}</span>
              </div>
              {r.stepResults.length > 0 ? (
                <div className="step-list" style={{ marginTop: 8 }}>
                  {r.stepResults.map((s) => (
                    <div className="step" key={s.stepIndex}>
                      <span className="muted">step {s.stepIndex}:</span>{" "}
                      <span style={{ color: s.status === "success" ? "var(--ok)" : "var(--err)" }}>
                        {s.status}
                      </span>
                      {s.error && <span className="muted"> - {s.error}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ marginBottom: 0 }}>
                  No step details reported yet.
                </p>
              )}
              {r.finishedAt && (
                <div className="muted" style={{ marginTop: 8 }}>
                  finished {new Date(r.finishedAt).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
