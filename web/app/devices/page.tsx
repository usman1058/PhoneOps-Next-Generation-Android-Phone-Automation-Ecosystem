"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import QRCode from "qrcode";

interface Device {
  id: string;
  name: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

interface LanAddress {
  relayUrls: string[];
  webUrls: string[];
  ips: string[];
}

// The panel stores the relay address a phone should use to pair. It defaults to
// the best LAN address, but a user on a deployed server (phone on mobile data)
// can set a public https:// URL here so pairing works over the internet.
const RELAY_URL_KEY = "pa_relay_url";

function loadRelayUrl(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(RELAY_URL_KEY) ?? "";
}

function saveRelayUrl(value: string): void {
  window.localStorage.setItem(RELAY_URL_KEY, value);
}

function bestRelayUrl(urls: string[]): string {
  const scored = urls
    .map((u) => {
      const host = u.replace(/^https?:\/\//, "").split(":")[0];
      let score = 0;
      if (host.startsWith("192.168.")) score = 3;
      else if (host.startsWith("10.")) score = 2;
      else if (host.startsWith("172.16.") || host.startsWith("172.17.")) score = 1;
      return { u, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.u ?? urls[0] ?? "";
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; apiKey: string } | null>(null);
  const [lan, setLan] = useState<LanAddress | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [relayUrl, setRelayUrl] = useState("");
  const [relayInput, setRelayInput] = useState("");
  const [pairingQr, setPairingQr] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);

  async function refresh() {
    try {
      const ds = await api<Device[]>("/api/devices");
      setDevices(ds);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    refresh();
    detectRelay();
  }, []);

  // Whenever the URL changes (from detection or user edit), auto-refresh the QR
  // if there is a live pairing key on screen.
  useEffect(() => {
    if (created && relayUrl) {
      renderPairingQr(relayUrl, created.apiKey);
    } else {
      setPairingQr(null);
    }
  }, [relayUrl, created]);

  async function detectRelay() {
    setError(null);
    setDetecting(true);
    try {
      const data = await api<LanAddress>("/api/lan-address");
      setLan(data);
      const url = bestRelayUrl(data.relayUrls);
      data.ips.forEach((ip) => url || null); // keep ip list available
      if (url) {
        setRelayUrl(url);
        setRelayInput(url);
      } else {
        setPairingQr(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  }

  async function renderPairingQr(url: string, key: string) {
    const payload = JSON.stringify({ url, key });
    const qr = await QRCode.toDataURL(payload, {
      width: 340,
      margin: 2,
      errorCorrectionLevel: "M",
      scale: 8,
    });
    setPairingQr(qr);
  }

  async function createDevice() {
    setError(null);
    setBusy(true);
    try {
      const result = await api<{ id: string; name: string; apiKey: string }>("/api/devices", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setCreated({ id: result.id, apiKey: result.apiKey });
      setName("");
      // If we already know a relay URL, the QR renders immediately.
      if (!relayUrl) await detectRelay();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Rotate the key for an existing (reconnected) device and show its fresh QR.
  async function rotateKey(device: Device) {
    if (
      !confirm(
        `Reset the pairing key for "${device.name}"?\n\nThe old key and QR will stop working immediately. You will need to re-scan the new QR in the Companion App. Tasks already assigned to this device are kept.`,
      )
    )
      return;
    setError(null);
    setRotatingId(device.id);
    try {
      const result = await api<{ id: string; apiKey: string }>(
        `/api/devices/${device.id}/reset-key`,
        { method: "POST" },
      );
      setCreated({ id: result.id, apiKey: result.apiKey });
      setRotatingId(null);
      await refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setRotatingId(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeDevice(id: string) {
    if (!confirm("Remove this device? Its tasks and run history are deleted too.")) return;
    setError(null);
    try {
      await api(`/api/devices/${id}`, { method: "DELETE" });
      setDevices((prev) => prev.filter((d) => d.id !== id));
      if (created?.id === id) setCreated(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const applyRelayOverride = () => {
    const trimmed = relayInput.trim();
    saveRelayUrl(trimmed);
    setRelayUrl(trimmed);
  };

  const copy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
  }, []);

  return (
    <div className="container">
      <div className="builder-hero">
        <div>
          <p className="eyebrow">Wireless setup</p>
          <h1 style={{ marginTop: 0, marginBottom: 8 }}>Devices</h1>
          <p className="muted" style={{ maxWidth: 800 }}>
            Register a phone here, then scan the pairing QR from the Companion
            app to connect wirelessly — no cables, no typing.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{devices.length}</strong>
            <span className="muted">registered</span>
          </div>
          <div>
            <strong>{devices.filter((d) => d.isOnline).length}</strong>
            <span className="muted">online</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="card notice warn">
          <p className="muted" style={{ marginBottom: 0, color: "var(--warn)" }}>
            {error}
          </p>
        </div>
      )}

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Register device</h2>
          <div className="field">
            <label>Device name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pixel 8"
            />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <button className="primary" onClick={createDevice} disabled={busy || !name.trim()}>
              {busy ? "Registering..." : "Register device"}
            </button>
            <button onClick={detectRelay} disabled={detecting}>
              {detecting ? "Detecting..." : "Detect relay address"}
            </button>
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label>
              Relay URL used for pairing
              <span className="muted" style={{ fontSize: 12 }}> — leave for LAN, or set a public URL for internet/mobile-data pairing.</span>
            </label>
            <div className="row" style={{ gap: 8 }}>
              <input
                value={relayInput || relayUrl}
                onChange={(e) => setRelayInput(e.target.value)}
                placeholder="http://192.168.1.10:4001"
                style={{ flex: 1 }}
              />
              <button onClick={applyRelayOverride} disabled={!relayInput.trim()}>
                Apply
              </button>
            </div>
          </div>

          {lan && (
            <div className="muted" style={{ marginTop: 10 }}>
              Detected relay addresses:
              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                {(lan.relayUrls.length ? lan.relayUrls : lan.ips).map((ip) => (
                  <li key={ip} style={{ fontSize: 12 }}>
                    {ip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card soft-card">
          <h2 style={{ marginTop: 0 }}>Cable-free pairing</h2>
          <p className="muted">
            Open the Automation Companion app and tap <b>Scan QR</b>. Point it at
            the pairing code — the relay URL and API key are filled in and the
            app connects automatically.
          </p>
          <p className="muted">
            The Relay URL box above lets you choose which address the QR encodes.
            On the same Wi-Fi this is auto-detected. If your phone is on mobile
            data, set it to your server&apos;s public relay URL.
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            On the phone, <b>Find relay</b> also discovers the relay on your LAN
            and works over both Wi-Fi and Ethernet automatically.
          </p>
        </div>
      </div>

      <Link href="/settings" style={{ display: "inline-block", marginTop: 16 }}>
        Manage connection settings →
      </Link>

      {created && (
        <div className="card" id="pairing">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <h2 style={{ marginTop: 0 }}>Pairing key</h2>
            <button onClick={() => setCreated(null)}>Dismiss</button>
          </div>
          <p className="muted">
            This key works until you reset it. Scan the QR from the phone now, or
            paste the values into the Companion app.
          </p>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ textAlign: "center" }}>
              {pairingQr ? (
                <img
                  src={pairingQr}
                  alt="Pairing QR code"
                  style={{ width: 260, height: 260, borderRadius: 8, border: "1px solid var(--border, #333)" }}
                />
              ) : (
                <div className="muted" style={{ padding: 40, border: "1px dashed var(--border, #444)", borderRadius: 8 }}>
                  Detect a relay address to generate the QR.
                </div>
              )}
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Scan to connect this phone
              </div>
            </div>

            <div style={{ minWidth: 280, flex: 1 }}>
              <div className="field">
                <label>Relay URL</label>
                <div className="row" style={{ gap: 8 }}>
                  <code style={{ wordBreak: "break-all" }}>{relayUrl || "(not set)"}</code>
                  {relayUrl && <button onClick={() => copy(relayUrl)}>Copy</button>}
                </div>
              </div>
              <div className="field">
                <label>API key</label>
                <div className="row" style={{ gap: 8 }}>
                  <code style={{ wordBreak: "break-all" }}>{created.apiKey}</code>
                  <button onClick={() => copy(created.apiKey)}>Copy</button>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                Keep this key private — it grants full control of this device.
              </p>
            </div>
          </div>
        </div>
      )}

      <h2 style={{ marginTop: 24 }}>Registered devices</h2>
      {devices.length === 0 && (
        <p className="muted">No devices yet. Register one above to get your pairing QR.</p>
      )}
      {devices.map((device) => (
        <div className="card" key={device.id}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <strong>{device.name}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{device.id}</div>
              <div className="muted">
                Last seen:{" "}
                {device.lastSeenAt
                  ? new Date(device.lastSeenAt).toLocaleString()
                  : "never"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`badge ${device.isOnline ? "online" : "offline"}`}>
                {device.isOnline ? "online" : "offline"}
              </span>
              <button
                className="primary"
                onClick={() => rotateKey(device)}
                disabled={rotatingId === device.id}
              >
                {rotatingId === device.id ? "Resetting..." : "Reconnect / Reset key"}
              </button>
              <button className="danger" onClick={() => removeDevice(device.id)}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}