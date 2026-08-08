
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { subscribeLive } from "@/lib/live";
import DownloadAppCard from "@/components/DownloadAppCard";

interface DashboardDevice {
  id: string;
  name: string;
  isOnline: boolean;
  lastSeenAt: string | null;
}

interface DashboardTask {
  id: string;
  name: string;
  deviceId: string;
  isEnabled: boolean;
  schedule: string | null;
  createdAt: string;
  steps: unknown[];
}

interface DashboardRun {
  id: string;
  taskId: string;
  deviceId: string;
  status: string;
  triggeredBy: "manual" | "schedule";
  startedAt: string;
  finishedAt: string | null;
  task: { name: string };
  device: { name: string };
  stepResults: Array<{ stepIndex: number; status: string; error?: string }>;
}

interface DashboardPayload {
  counts: {
    devices: number;
    tasks: number;
    runs: number;
  };
  devices: DashboardDevice[];
  tasks: DashboardTask[];
  runs: DashboardRun[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  const counts = useMemo(
    () => data?.counts ?? { devices: 0, tasks: 0, runs: 0 },
    [data],
  );

  useEffect(() => {
    let active = true;

    api<DashboardPayload>("/api/dashboard")
      .then((payload) => {
        if (!active) return;
        setData(payload);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      });

    const unsub = subscribeLive(
      (ev: Record<string, unknown>) => {
        setEvents((prev) => [...prev.slice(-19), JSON.stringify(ev)]);

        if (ev.type === "device_status") {
          setData((prev) => {
            if (!prev) return prev;
            const deviceId = String(ev.deviceId ?? "");
            return {
              ...prev,
              devices: prev.devices.map((device) =>
                device.id === deviceId
                  ? {
                      ...device,
                      isOnline: !!ev.isOnline,
                      lastSeenAt: new Date().toISOString(),
                    }
                  : device,
              ),
            };
          });
        }

        if (ev.type === "run_update") {
          const runId = String(ev.runId ?? "");
          setData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              runs: prev.runs.map((run) =>
                run.id === runId
                  ? {
                      ...run,
                      status: String(ev.status ?? run.status),
                      stepResults: run.stepResults,
                      finishedAt:
                        ev.status === "running"
                          ? run.finishedAt
                          : run.finishedAt ?? new Date().toISOString(),
                    }
                  : run,
              ),
            };
          });
        }
      },
      (message) => setError(message),
    );

    return () => {
      active = false;
      unsub();
    };
  }, []);

  return (
    <div className="container dashboard-layout">
      <div className="builder-hero">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h1 style={{ marginTop: 0, marginBottom: 8 }}>Control center</h1>
          <p className="muted" style={{ maxWidth: 760 }}>
            See devices, tasks, and recent runs in one place. This is the main operational view for the automation system.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{counts.devices}</strong>
            <span className="muted">devices</span>
          </div>
          <div>
            <strong>{counts.tasks}</strong>
            <span className="muted">tasks</span>
          </div>
          <div>
            <strong>{counts.runs}</strong>
            <span className="muted">recent runs</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="card notice warn">
          <strong>Dashboard issue</strong>
          <p className="muted" style={{ marginBottom: 0, color: "var(--warn)" }}>
            {error}
          </p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <DownloadAppCard />
      </div>

      <div className="dashboard-grid" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <h2 style={{ marginTop: 0 }}>Devices</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                Phone connection status and last seen time.
              </p>
            </div>
            <Link href="/devices">Manage</Link>
          </div>
          {!data || data.devices.length === 0 ? (
            <p className="muted">No devices registered yet.</p>
          ) : (
            <div className="stacked-list">
              {data.devices.map((device) => (
                <div className="list-row" key={device.id}>
                  <div>
                    <strong>{device.name}</strong>
                    <div className="muted">
                      {device.id.slice(0, 8)} - last seen {timeAgo(device.lastSeenAt)}
                    </div>
                  </div>
                  <span className={`badge ${device.isOnline ? "online" : "offline"}`}>
                    {device.isOnline ? "online" : "offline"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <h2 style={{ marginTop: 0 }}>Tasks</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                Create, edit, and run detailed automations.
              </p>
            </div>
            <Link href="/task-builder">New task</Link>
          </div>
          {!data || data.tasks.length === 0 ? (
            <p className="muted">No tasks created yet.</p>
          ) : (
            <div className="stacked-list">
              {data.tasks.map((task) => (
                <div className="list-row" key={task.id}>
                  <div>
                    <strong>{task.name}</strong>
                    <div className="muted">
                      {task.steps.length} steps - {task.schedule ? task.schedule : "manual"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className={`badge ${task.isEnabled ? "enabled" : "disabled"}`}>
                      {task.isEnabled ? "enabled" : "disabled"}
                    </span>
                    <Link href={`/tasks/${task.id}`}>Open</Link>
                    <Link href={`/task-builder?taskId=${task.id}`}>Edit</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Recent runs</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Latest execution results across your tasks.
            </p>
          </div>
        </div>
        {!data || data.runs.length === 0 ? (
          <p className="muted">No runs yet.</p>
        ) : (
          <div className="stacked-list">
            {data.runs.map((run) => (
              <div className="list-row" key={run.id}>
                <div>
                  <strong>{run.task.name}</strong>
                  <div className="muted">
                    {run.device.name} - {run.triggeredBy} - started {new Date(run.startedAt).toLocaleString()}
                  </div>
                  {run.stepResults.length > 0 && (
                    <div className="muted">{run.stepResults.length} reported steps</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`badge ${run.status}`}>{run.status}</span>
                  <Link href={`/tasks/${run.taskId}`}>Details</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Live events</h2>
        <div className="log">
          {events.length === 0 ? <span className="muted">Waiting for live updates...</span> : events.join("\n")}
        </div>
      </section>
    </div>
  );
}
