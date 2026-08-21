"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { api } from "@/lib/client-api";
import type { Step } from "@automation/shared";

type FrameMsg = {
  type: "screen_frame";
  deviceId: string;
  sessionId: string;
  w: number;
  h: number;
  data: string;
};

type ScreenStateMsg = {
  type: "screen_state";
  deviceId: string;
  active: boolean;
  error?: string;
};

type PanelMsg = FrameMsg | ScreenStateMsg | { type: string } & Record<string, unknown>;

export default function LiveControlPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const deviceId = params.id;

  const [status, setStatus] = useState("Connecting…");
  const [statusKind, setStatusKind] = useState<"idle" | "ok" | "err">("idle");
  const [frame, setFrame] = useState<{ data: string; w: number; h: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<Step[]>([]);
  const [taskName, setTaskName] = useState("");
  const [saveState, setSaveState] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const recordingRef = useRef(false);
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const imgWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        const cfg = await api<{ url: string; token: string }>(
          `/api/devices/${deviceId}/live-token`,
        );
        if (disposed || !cfg.url || !cfg.token) {
          setStatusKind("err");
          setStatus(cfg.url ? "Live session unavailable" : "Relay URL is not configured");
          return;
        }
        const socket = io(`${cfg.url}/panel`, {
          path: "/socket.io",
          transports: ["websocket"],
          auth: { token: cfg.token },
          reconnectionAttempts: 5,
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          socket.emit("watch_device", { deviceId });
          setStatus("Waiting for phone to accept screen share…");
          setStatusKind("idle");
        });

        socket.on("connect_error", (err: Error) => {
          setStatusKind("err");
          setStatus(`Relay connection failed: ${err.message}`);
        });

        socket.on("disconnect", () => {
          setStatusKind("err");
          setStatus("Disconnected from relay");
        });

        socket.on("message", (raw: PanelMsg) => {
          if (raw.type === "screen_frame") {
            const msg = raw as FrameMsg;
            setFrame({ data: msg.data, w: msg.w, h: msg.h });
            if (!recordingRef.current) {
              setStatus("Live — tap or swipe on the phone screen below");
              setStatusKind("ok");
            }
          } else if (raw.type === "screen_state") {
            const msg = raw as ScreenStateMsg;
            if (msg.active) {
              setStatus("Starting mirror — accept the cast prompt on the phone");
              setStatusKind("idle");
            } else {
              setStatusKind("err");
              setStatus(msg.error ?? "Screen share stopped on the phone");
            }
          }
        });
      } catch (e) {
        setStatusKind("err");
        setStatus(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      disposed = true;
      const socket = socketRef.current;
      if (socket) {
        socket.emit("unwatch_device", { deviceId });
        socket.close();
      }
      socketRef.current = null;
    };
  }, [deviceId]);

  const sendInput = useCallback(
    (input: Record<string, unknown>, step?: Step) => {
      socketRef.current?.emit("remote_input", { deviceId, input });
      if (recordingRef.current && step) {
        setRecordedSteps((prev) => [...prev, step]);
      }
    },
    [deviceId],
  );

  function mapPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = imgWrapRef.current;
    if (!el || !frame) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * frame.w,
      y: ((clientY - rect.top) / rect.height) * frame.h,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const down = downRef.current;
    downRef.current = null;
    if (!down || !frame) return;

    const start = mapPoint(down.x, down.y);
    const end = mapPoint(e.clientX, e.clientY);
    if (!start || !end) return;

    const dxPx = e.clientX - down.x;
    const dyPx = e.clientY - down.y;
    const distance = Math.hypot(dxPx, dyPx);
    const elapsed = Math.max(100, Math.min(2000, Date.now() - down.t));

    if (distance > 24) {
      sendInput(
        {
          kind: "swipe",
          x: start.x,
          y: start.y,
          x2: end.x,
          y2: end.y,
          durationMs: elapsed,
        },
        {
          action: "swipe",
          fromX: Math.round(start.x),
          fromY: Math.round(start.y),
          toX: Math.round(end.x),
          toY: Math.round(end.y),
          durationMs: elapsed,
        },
      );
    } else {
      sendInput(
        { kind: "tap", x: start.x, y: start.y },
        {
          action: "tap_by_coordinates",
          x: Math.round(start.x),
          y: Math.round(start.y),
        },
      );
    }
  }

  async function saveTask() {
    if (!taskName.trim() || recordedSteps.length === 0) return;
    setSaveState("Saving…");
    try {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          name: taskName.trim(),
          deviceId,
          steps: recordedSteps,
        }),
      });
      setSaveState("Saved! Opening tasks…");
      setTimeout(() => router.push("/tasks"), 800);
    } catch (e) {
      setSaveState(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="container">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 style={{ marginTop: 0 }}>Live control</h1>
          <p className="muted" style={{ marginBottom: 4 }}>
            Watch the phone screen, tap or swipe to control it, and optionally
            record what you do into a reusable automation task.
          </p>
          <p
            className="badge"
            style={{
              color:
                statusKind === "ok"
                  ? "var(--ok)"
                  : statusKind === "err"
                    ? "var(--err)"
                    : "var(--text-secondary)",
            }}
          >
            {status}
          </p>
        </div>
        <Link href="/devices" className="button">
          Back to devices
        </Link>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div
          ref={imgWrapRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 420,
            margin: "0 auto",
            aspectRatio: frame ? `${frame.w} / ${frame.h}` : "9 / 19",
            background: "#000",
            borderRadius: 12,
            overflow: "hidden",
            touchAction: "none",
            cursor: frame ? "crosshair" : "wait",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {frame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/jpeg;base64,${frame.data}`}
              alt="Phone screen"
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : (
            <span className="muted" style={{ padding: 16, textAlign: "center" }}>
              No frames yet. Make sure the phone is online and accept the
              &quot;Start recording or casting&quot; prompt on it.
            </span>
          )}
        </div>

        <div
          className="row"
          style={{ justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}
        >
          <button onClick={() => sendInput({ kind: "back" }, { action: "back" })}>
            Back
          </button>
          <button onClick={() => sendInput({ kind: "home" }, { action: "home" })}>
            Home
          </button>
          <button
            className={recording ? "" : "primary"}
            onClick={() => {
              setRecording((r) => !r);
              setSaveState(null);
            }}
          >
            {recording ? "Stop recording" : "Record steps"}
          </button>
        </div>
        {recording && (
          <p className="muted" style={{ textAlign: "center", marginTop: 6 }}>
            Recording — every tap/swipe you perform here becomes an automation
            step ({recordedSteps.length} captured).
          </p>
        )}
      </section>

      {recordedSteps.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Save as task</h2>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input
              placeholder="Task name (e.g. Post morning update)"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              style={{ flex: 1, minWidth: 220 }}
            />
            <button
              className="primary"
              disabled={!taskName.trim()}
              onClick={saveTask}
            >
              Save task ({recordedSteps.length} steps)
            </button>
          </div>
          {saveState && (
            <p className="muted" style={{ marginBottom: 0 }}>
              {saveState}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
