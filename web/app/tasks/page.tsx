"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";

interface Task {
  id: string;
  name: string;
  deviceId: string;
  steps: unknown[];
  schedule: string | null;
  isEnabled: boolean;
  createdAt: string;
}

interface Device {
  id: string;
  name: string;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [devices, setDevices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function refresh() {
    api<Task[]>("/api/tasks").then(setTasks).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    api<Device[]>("/api/devices")
      .then((ds) =>
        setDevices(Object.fromEntries(ds.map((d) => [d.id, d.name]))),
      )
      .catch(() => undefined);
  }

  useEffect(refresh, []);

  async function runNow(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await api<{ runId: string; error?: string }>(
        `/api/tasks/${id}/run`,
        { method: "POST" },
      );
      setError(`Run started: ${res.runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this task?")) return;
    try {
      await api(`/api/tasks/${id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="container">
      <div className="row">
        <h1>Tasks</h1>
        <Link href="/tasks/new">
          <button className="primary">New task</button>
        </Link>
      </div>
      {error && (
        <p className="muted" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}

      {tasks.length === 0 && (
        <p className="muted">No tasks yet. Create one to automate your phone.</p>
      )}

      {tasks.map((t) => (
        <div className="card" key={t.id}>
          <div className="row">
            <div>
              <Link href={`/tasks/${t.id}`}>
                <strong>{t.name}</strong>
              </Link>
              <div className="muted">
                {devices[t.deviceId] ?? t.deviceId.slice(0, 8)} -{" "}
                {t.steps.length} steps
                {t.schedule ? ` - ${t.schedule}` : " - manual"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className={`badge ${t.isEnabled ? "enabled" : "disabled"}`}>
                {t.isEnabled ? "enabled" : "disabled"}
              </span>
              <button onClick={() => runNow(t.id)} disabled={busy === t.id}>
                {busy === t.id ? "Running..." : "Run now"}
              </button>
              <button className="danger" onClick={() => remove(t.id)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
