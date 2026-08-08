"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

interface ApkInfo {
  available: boolean;
  kind: string;
  fileName: string;
  sizeBytes: number;
  builtAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function DownloadAppCard() {
  const [qr, setQr] = useState<string | null>(null);
  const [info, setInfo] = useState<ApkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const origin =
      typeof window === "undefined" ? "" : window.location.origin;
    const downloadUrl = `${origin}/api/download/android`;

    QRCode.toDataURL(downloadUrl, { width: 220, margin: 2 })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => undefined);

    fetch("/api/download/android/info")
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (active && data && data.available) setInfo(data);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const copyUrl = useCallback(() => {
    const origin = window.location.origin;
    navigator.clipboard
      .writeText(`${origin}/api/download/android`)
      .then(() => setError(null))
      .catch(() => setError("Could not copy. Tap the link directly."));
  }, []);

  return (
    <div className="card soft-card">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow" style={{ marginTop: 0 }}>
            Companion app
          </p>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Install on your phone</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Scan the QR code with your phone camera to download the latest
            Android app. No cable or LAN knowledge needed — the code points to
            this exact panel address.
          </p>
        </div>
        <a href="/api/download/android" download className="primary-link">
          Download APK
        </a>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
        {qr ? (
          <img
            src={qr}
            alt="QR code linking to the Android app download"
            style={{ width: 220, height: 220, borderRadius: 8, border: "1px solid var(--border, #333)" }}
          />
        ) : (
          <div
            className="muted"
            style={{ width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            Generating QR...
          </div>
        )}

        <div style={{ minWidth: 220 }}>
          <div className="field">
            <label>Direct link</label>
            <div className="row" style={{ gap: 8 }}>
              <code style={{ wordBreak: "break-all" }}>
                {typeof window === "undefined"
                  ? "/api/download/android"
                  : `${window.location.origin}/api/download/android`}
              </code>
              <button onClick={copyUrl}>Copy</button>
            </div>
          </div>

          {info && (
            <div className="muted" style={{ marginTop: 4 }}>
              Latest build: {info.sizeBytes ? formatBytes(info.sizeBytes) : "Available now"}
              {info.builtAt ? ` (${info.kind}, built ${new Date(info.builtAt).toLocaleString()})` : ""}
            </div>
          )}
          {error && (
            <div className="muted" style={{ color: "var(--warn)", marginTop: 4 }}>
              {error}
            </div>
          )}

          <ol className="feature-list ordered" style={{ marginTop: 10, marginBottom: 0 }}>
            <li>Scan or download to your Android phone.</li>
            <li>Paste the relay URL and API key when pairing.</li>
            <li>Enable Accessibility, then record and run tasks.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
