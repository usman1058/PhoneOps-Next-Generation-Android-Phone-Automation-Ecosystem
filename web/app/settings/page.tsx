"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import Link from "next/link";

interface LanAddress {
  relayUrls: string[];
  webUrls: string[];
  ips: string[];
}

interface RelayStatus {
  devices: string[];
}

const RELAY_URL_KEY = "pa_relay_url";

function loadStoredRelayUrl(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(RELAY_URL_KEY) ?? "";
}

export default function SettingsPage() {
  const [relayInput, setRelayInput] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [lan, setLan] = useState<LanAddress | null>(null);
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = loadStoredRelayUrl();
    setSavedUrl(url);
    setRelayInput(url);
    refreshInfo();
  }, []);

  async function refreshInfo() {
    setError(null);
    try {
      const [lanData, statusData] = await Promise.all([
        api<LanAddress>("/api/lan-address"),
        api<RelayStatus>("/api/relay/status").catch(() => null),
      ]);
      setLan(lanData);
      setStatus(statusData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function save() {
    const trimmed = relayInput.trim();
    if (!trimmed) {
      setError("Enter a relay URL (or leave empty to auto-detect on LAN).");
      return;
    }
    window.localStorage.setItem(RELAY_URL_KEY, trimmed);
    setSavedUrl(trimmed);
    setMessage("Relay URL saved. New pairing QRs on the Devices page will use this address.");
    setError(null);
    setTimeout(() => setMessage(null), 6000);
  }

  function clearOverride() {
    window.localStorage.removeItem(RELAY_URL_KEY);
    setSavedUrl("");
    setRelayInput("");
    setMessage("Public relay override cleared. Pairing will fall back to auto-detected LAN addresses.");
    setError(null);
    setTimeout(() => setMessage(null), 6000);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="container">
      <div className="builder-hero">
        <div>
          <p className="eyebrow">Connection</p>
          <h1 style={{ marginTop: 0, marginBottom: 8 }}>Settings</h1>
          <p className="muted" style={{ maxWidth: 760 }}>
            Configure how the web panel and the Companion app reach the relay,
            and check live service status.
          </p>
        </div>
      </div>

      {message && (
        <div className="card notice">
          <p className="muted" style={{ marginBottom: 0, color: "var(--ok)" }}>
            {message}
          </p>
        </div>
      )}
      {error && (
        <div className="card notice warn">
          <p className="muted" style={{ marginBottom: 0, color: "var(--warn)" }}>
            {error}
          </p>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Relay URL for pairing</h2>
        <p className="muted">
          This is the address encoded into pairing QR codes. On a local network it
          is detected automatically. If your phone uses mobile data, set this to
          your server&apos;s public relay URL (e.g.{" "}
          <code>https://relay.example.com</code>).
        </p>
        <div className="row" style={{ gap: 8 }}>
          <input
            value={relayInput}
            onChange={(e) => setRelayInput(e.target.value)}
            placeholder="https://relay.example.com or http://192.168.1.10:4001"
            style={{ flex: 1 }}
          />
          <button className="primary" onClick={save} disabled={!relayInput.trim()}>
            Save URL
          </button>
        </div>
        {savedUrl && (
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Currently used: <code>{savedUrl}</code>{" "}
            <button onClick={clearOverride} style={{ marginLeft: 8 }}>Clear override</button>
          </div>
        )}
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Saved locally in this browser. The Devices page reads the same value.
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <h2 style={{ marginTop: 0 }}>Relay service</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                Detected addresses the relay is reachable on.
              </p>
            </div>
            <button onClick={refreshInfo} disabled={loading}>
              {loading ? "Checking..." : "Refresh"}
            </button>
          </div>
          {lan ? (
            <ul style={{ margin: "12px 0 0", paddingLeft: 20 }}>
              {(lan.relayUrls.length ? lan.relayUrls : lan.ips).map((u) => (
                <li key={u} style={{ fontSize: 13 }}>
                  <code>{u}</code>{" "}
                  <button onClick={() => copy(u)} style={{ marginLeft: 6, fontSize: 12 }}>
                    Copy
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Could not reach the relay service.</p>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Connected devices</h2>
          {status ? (
            status.devices.length ? (
              <p className="muted">
                <strong>{status.devices.length}</strong> device(s) currently
                connected to the relay.
              </p>
            ) : (
              <p className="muted">No device is connected right now.</p>
            )
          ) : (
            <p className="muted">Relay status unavailable.</p>
          )}
          <Link href="/devices">Manage devices →</Link>
        </div>
      </div>

      <div className="card soft-card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Having trouble pairing?</h2>
        <ol className="feature-list ordered">
          <li>On the same Wi-Fi: tap <b>Find relay</b> in the app, or scan the QR from the Devices page.</li>
          <li>On mobile data: set the public relay URL above, then scan the QR.</li>
          <li>Lost a key? Use <b>Reconnect / Reset key</b> on the Devices page to get a fresh QR.</li>
          <li>The app must be granted the camera permission and Accessibility must be enabled.</li>
        </ol>
      </div>
    </div>
  );
}