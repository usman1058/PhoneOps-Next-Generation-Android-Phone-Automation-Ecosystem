"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import StepView from "@/components/StepView";
import type { Step } from "@automation/shared";

interface Device {
  id: string;
  name: string;
  isOnline: boolean;
  lastSeenAt?: string | null;
}

interface TaskPayload {
  id: string;
  name: string;
  deviceId: string;
  steps: Step[];
  schedule: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

type DraftStep = Record<string, string> & { action: Step["action"] };

interface AppInfo {
  package: string;
  label: string;
}

type FieldDef = {
  key: keyof DraftStep;
  label: string;
  type: "text" | "number";
  placeholder?: string;
};

type StepMeta = {
  label: string;
  description: string;
  fields: FieldDef[];
};

const stepMeta: Record<Step["action"], StepMeta> = {
  open_app: {
    label: "Open app",
    description: "Launch an app by package name before tapping inside it.",
    fields: [{ key: "package", label: "Package name", type: "text", placeholder: "com.whatsapp" }],
  },
  tap_by_text: {
    label: "Tap by text",
    description: "Tap a visible label from the current screen.",
    fields: [
      { key: "text", label: "Visible text", type: "text", placeholder: "Continue" },
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", placeholder: "5000" },
    ],
  },
  tap_by_coordinates: {
    label: "Tap by coordinates",
    description: "Fallback for icon-only buttons or hard-to-detect controls.",
    fields: [
      { key: "x", label: "X", type: "number", placeholder: "540" },
      { key: "y", label: "Y", type: "number", placeholder: "960" },
    ],
  },
  swipe: {
    label: "Swipe",
    description: "Drag across the screen from one point to another.",
    fields: [
      { key: "fromX", label: "From X", type: "number", placeholder: "540" },
      { key: "fromY", label: "From Y", type: "number", placeholder: "1600" },
      { key: "toX", label: "To X", type: "number", placeholder: "540" },
      { key: "toY", label: "To Y", type: "number", placeholder: "500" },
      { key: "durationMs", label: "Duration (ms)", type: "number", placeholder: "300" },
    ],
  },
  wait: {
    label: "Wait",
    description: "Pause briefly for the phone UI to settle.",
    fields: [{ key: "ms", label: "Milliseconds", type: "number", placeholder: "1000" }],
  },
  back: {
    label: "Back",
    description: "Trigger the Android back action.",
    fields: [],
  },
  home: {
    label: "Home",
    description: "Return to the home screen.",
    fields: [],
  },
};

const actionOrder: Step["action"][] = [
  "open_app",
  "tap_by_text",
  "tap_by_coordinates",
  "swipe",
  "wait",
  "back",
  "home",
];

function emptyDraft(action: Step["action"]): DraftStep {
  return { action } as DraftStep;
}

function toDraft(step: Step): DraftStep {
  return { ...step } as DraftStep;
}

function toStep(draft: DraftStep): Step {
  switch (draft.action) {
    case "open_app":
      return { action: "open_app", package: draft.package.trim() };
    case "tap_by_text": {
      const step: Step = { action: "tap_by_text", text: draft.text.trim() };
      const timeoutMs = Number(draft.timeoutMs ?? "");
      if (!Number.isNaN(timeoutMs) && draft.timeoutMs?.trim()) {
        (step as { timeoutMs?: number }).timeoutMs = timeoutMs;
      }
      return step;
    }
    case "tap_by_coordinates":
      return {
        action: "tap_by_coordinates",
        x: Number(draft.x),
        y: Number(draft.y),
      };
    case "swipe": {
      const step: Step = {
        action: "swipe",
        fromX: Number(draft.fromX),
        fromY: Number(draft.fromY),
        toX: Number(draft.toX),
        toY: Number(draft.toY),
      };
      const durationMs = Number(draft.durationMs ?? "");
      if (!Number.isNaN(durationMs) && draft.durationMs?.trim()) {
        (step as { durationMs?: number }).durationMs = durationMs;
      }
      return step;
    }
    case "wait":
      return { action: "wait", ms: Number(draft.ms) };
    case "back":
      return { action: "back" };
    case "home":
      return { action: "home" };
    default:
      throw new Error(`Unsupported action: ${draft.action}`);
  }
}

function validateDraft(draft: DraftStep): string | null {
  const meta = stepMeta[draft.action];
  for (const field of meta.fields) {
    const raw = draft[field.key] ?? "";
    if (field.type === "text") {
      if (!raw.trim()) {
        return `${field.label} is required`;
      }
      continue;
    }
    if (raw.trim() === "" || Number.isNaN(Number(raw))) {
      return `${field.label} must be a number`;
    }
  }
  return null;
}

function displayAction(action: Step["action"]): string {
  return stepMeta[action].label;
}

interface TaskBuilderProps {
  title: string;
  description: string;
  saveLabel: string;
  taskId?: string | null;
}

export default function TaskBuilderForm({
  title,
  description,
  saveLabel,
  taskId = null,
}: TaskBuilderProps) {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadedTask, setLoadedTask] = useState<TaskPayload | null>(null);
  const [loadingTask, setLoadingTask] = useState(Boolean(taskId));
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [schedule, setSchedule] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [action, setAction] = useState<Step["action"]>("open_app");
  const [draft, setDraft] = useState<DraftStep>(emptyDraft("open_app"));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<Step[]>([]);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === deviceId) ?? null,
    [devices, deviceId],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const ds = await api<Device[]>("/api/devices");
        if (!active) return;
        setDevices(ds);
        setDeviceId((prev) => prev || ds[0]?.id || "");
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!taskId) return;
    let active = true;
    setLoadingTask(true);
    (async () => {
      try {
        const task = await api<TaskPayload>(`/api/tasks/${taskId}`);
        if (!active) return;
        setLoadedTask(task);
        setName(task.name);
        setDeviceId(task.deviceId);
        setSchedule(task.schedule ?? "");
        setSteps(task.steps);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoadingTask(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [taskId]);

  useEffect(() => {
    setDraft((current) => {
      if (current.action === action) return current;
      return emptyDraft(action);
    });
    setEditingIndex(null);
  }, [action]);

  useEffect(() => {
    if (action !== "open_app" || !deviceId) {
      setApps([]);
      return;
    }
    let active = true;
    setAppsLoading(true);
    setAppsError(null);
    (async () => {
      try {
        const res = await api<{ apps: AppInfo[] }>(`/api/devices/${deviceId}/apps`);
        if (!active) return;
        setApps(res.apps ?? []);
      } catch (e) {
        if (!active) return;
        setAppsError(e instanceof Error ? e.message : String(e));
        setApps([]);
      } finally {
        if (active) setAppsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [action, deviceId]);

  function updateDraftField(key: keyof DraftStep, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function clearComposer() {
    setDraft(emptyDraft(action));
    setEditingIndex(null);
  }

  function addOrUpdateStep() {
    const problem = validateDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }

    const nextStep = toStep(draft);
    setSteps((prev) => {
      if (editingIndex === null) {
        return [...prev, nextStep];
      }
      return prev.map((step, idx) => (idx === editingIndex ? nextStep : step));
    });
    clearComposer();
    setError(null);
  }

  function editStep(index: number) {
    const step = steps[index];
    setAction(step.action);
    setDraft(toDraft(step));
    setEditingIndex(index);
  }

  function moveStep(index: number, delta: number) {
    setSteps((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== index));
    if (editingIndex === index) {
      clearComposer();
    }
  }

  async function startRecording() {
    setError(null);
    if (!deviceId) {
      setError("Select a device first");
      return;
    }
    if (!selectedDevice?.isOnline) {
      setError("The selected device must be online to record clicks");
      return;
    }
    try {
      const res = await api<{ sessionId: string }>("/api/recordings/start", {
        method: "POST",
        body: JSON.stringify({ deviceId }),
      });
      setRecordingSessionId(res.sessionId);
      setRecording(true);
      setRecordedSteps([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function stopRecording() {
    if (!recordingSessionId) return;
    setError(null);
    try {
      const res = await api<{ sessionId: string; steps: Step[] }>(
        `/api/recordings/${recordingSessionId}/stop`,
        { method: "POST" },
      );
      setRecordedSteps(res.steps);
      setSteps((prev) => [...prev, ...res.steps]);
      setRecordingSessionId(null);
      setRecording(false);
      if (res.steps.length === 0) {
        setError("Recording captured no steps. Try enabling Accessibility and tap visible UI labels.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRecordingSessionId(null);
      setRecording(false);
    }
  }

  async function importLatestRecording() {
    setError(null);
    if (!deviceId) {
      setError("Select a device first");
      return;
    }
    try {
      const res = await api<{ steps: Step[] }>(
        `/api/devices/${deviceId}/recordings/latest`,
      );
      if (!res.steps || res.steps.length === 0) {
        setError("No recording found for this device yet. Open the app on the phone and record one first.");
        return;
      }
      setRecordedSteps(res.steps);
      setSteps((prev) => [...prev, ...res.steps]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save() {
    setError(null);
    if (!name.trim() || !deviceId || steps.length === 0) {
      setError("Task name, device and at least one step are required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        deviceId,
        steps,
        schedule: schedule.trim() || null,
      };
      const result = taskId
        ? await api<TaskPayload>(`/api/tasks/${taskId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await api<{ id: string }>("/api/tasks", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      router.push(`/tasks/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loadingTask) {
    return (
      <div className="card">
        <h1 style={{ marginTop: 0 }}>{title}</h1>
        <p className="muted">Loading existing task...</p>
      </div>
    );
  }

  return (
    <div className="builder-shell">
      <div className="builder-hero">
        <div>
          <p className="eyebrow">Detailed tasking</p>
          <h1 style={{ marginTop: 0, marginBottom: 8 }}>{title}</h1>
          <p className="muted" style={{ maxWidth: 780 }}>
            {description}
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{steps.length}</strong>
            <span className="muted">steps in task</span>
          </div>
          <div>
            <strong>{recording ? "Live" : loadedTask ? "Editing" : "New"}</strong>
            <span className="muted">builder mode</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="card notice warn">
          <strong>Heads up</strong>
          <p className="muted" style={{ marginBottom: 0, color: "var(--warn)" }}>
            {error}
          </p>
        </div>
      )}

      <div className="builder-grid">
        <section className="card builder-panel">
          <h2 style={{ marginTop: 0 }}>Task details</h2>
          <div className="field">
            <label>Task name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Open WhatsApp and check inbox"
            />
          </div>
          <div className="field">
            <label>Device</label>
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              <option value="">Select a device</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.isOnline ? "online" : "offline"})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Schedule, optional</label>
            <input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 9 * * *"
            />
          </div>

          <div className="card soft-card">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div>
                <strong>Click recording</strong>
                <p className="muted" style={{ marginBottom: 0 }}>
                  Record real taps on the phone. The accessibility service will capture visible labels and fall back to coordinates when needed.
                </p>
              </div>
              {recording ? <span className="badge run">recording</span> : null}
            </div>
            {recording ? (
              <div style={{ marginTop: 12 }}>
                <p className="muted" style={{ color: "var(--warn)" }}>
                  Recording active. Use the phone, then stop when the full flow is captured.
                </p>
                <button className="danger" onClick={stopRecording}>
                  Stop recording
                </button>
              </div>
            ) : (
              <div className="row" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                <button
                  className="primary"
                  onClick={startRecording}
                  disabled={!deviceId || !selectedDevice?.isOnline}
                >
                  Record clicks from device
                </button>
                <button
                  onClick={importLatestRecording}
                  disabled={!deviceId}
                >
                  Import latest from phone
                </button>
              </div>
            )}
            {recordedSteps.length > 0 && !recording && (
              <p className="muted" style={{ marginTop: 12 }}>
                Imported {recordedSteps.length} captured step{recordedSteps.length === 1 ? "" : "s"} into the task.
              </p>
            )}
          </div>
        </section>

        <section className="card builder-panel">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <h2 style={{ marginTop: 0, marginBottom: 4 }}>Step editor</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                Build or refine the task one action at a time.
              </p>
            </div>
            <span className="badge enabled">{steps.length} steps</span>
          </div>

          <div className="field" style={{ marginTop: 18 }}>
            <label>Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value as Step["action"])}>
              {actionOrder.map((a) => (
                <option key={a} value={a}>
                  {displayAction(a)}
                </option>
              ))}
            </select>
          </div>
          <p className="muted" style={{ marginTop: -4 }}>
            {stepMeta[action].description}
          </p>

          {action === "open_app" ? (
            <div className="field">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ marginBottom: 0 }}>App</label>
                {!appsLoading && apps.length > 0 && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {apps.length} installed
                  </span>
                )}
                <button
                  type="button"
                  style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 12 }}
                  onClick={() => updateDraftField("package", "")}
                >
                  Clear
                </button>              </div>
              {appsLoading ? (
                <input value="Loading installed apps..." disabled />
              ) : (
                <select
                  value={draft.package ?? ""}
                  onChange={(e) => updateDraftField("package", e.target.value)}
                >
                  <option value="">
                    {apps.length === 0
                      ? "No apps found — is the device online?"
                      : "Select an installed app"}
                  </option>
                  {apps.map((app) => (
                    <option key={app.package} value={app.package}>
                      {app.label} ({app.package})
                    </option>
                  ))}
                </select>
              )}
              {appsError && (
                <p className="muted" style={{ color: "var(--warn)", marginTop: 6, marginBottom: 0 }}>
                  Could not load apps: {appsError}
                </p>
              )}
              {!appsLoading && !appsError && apps.length === 0 && (
                <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
                  Make sure the phone app is connected and online, then pick the app again.
                </p>
              )}
            </div>
          ) : (
            stepMeta[action].fields.map((field) => (
              <div className="field" key={field.key}>
                <label>{field.label}</label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={draft[field.key] ?? ""}
                  onChange={(e) => updateDraftField(field.key, e.target.value)}
                />
              </div>
            ))
          )}

          <div className="row" style={{ justifyContent: "flex-start" }}>
            <button className="primary" onClick={addOrUpdateStep}>
              {editingIndex === null ? "Add step" : "Update step"}
            </button>
            {editingIndex !== null && (
              <button onClick={clearComposer}>Cancel edit</button>
            )}
          </div>

          <div className="card soft-card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Preview</h3>
            <StepView steps={steps} />
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Detailed steps</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Reorder, edit, or delete anything the recorder captured before you save.
            </p>
          </div>
          <button className="primary" onClick={save} disabled={busy || !deviceId || steps.length === 0}>
            {busy ? "Saving..." : saveLabel}
          </button>
        </div>

        {steps.length === 0 ? (
          <p className="muted" style={{ marginTop: 16 }}>
            No steps yet. Use recording or add one manually above.
          </p>
        ) : (
          <div className="step-builder-list">
            {steps.map((step, index) => (
              <div className="step-builder-item" key={`${step.action}-${index}`}>
                <div>
                  <strong>{index + 1}. {stepMeta[step.action].label}</strong>
                  <div className="muted">{JSON.stringify(step)}</div>
                </div>
                <div className="step-actions">
                  <button onClick={() => moveStep(index, -1)} disabled={index === 0}>Up</button>
                  <button onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1}>Down</button>
                  <button onClick={() => editStep(index)}>Edit</button>
                  <button className="danger" onClick={() => removeStep(index)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}




