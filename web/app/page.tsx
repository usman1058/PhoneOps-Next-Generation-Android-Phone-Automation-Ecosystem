"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TaskBuilderForm from "@/components/TaskBuilderForm";
import DownloadAppCard from "@/components/DownloadAppCard";
import { getToken } from "@/lib/client-api";

export default function Home() {
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(getToken());
  }, []);

  return (
    <div className="container">
      <div className="builder-hero">
        <div>
          <p className="eyebrow">Remote phone automation</p>
          <h1 style={{ marginTop: 0, marginBottom: 10 }}>Build and run detailed phone tasks.</h1>
          <p className="muted" style={{ maxWidth: 760 }}>
            Record taps directly from your Android device, edit the captured steps, and run them over Wi-Fi or mobile data with the relay service.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
            {token ? (
              <>
                <Link href="/dashboard" className="primary-link">
                  Open dashboard
                </Link>
                <Link href="/task-builder" className="secondary-link">
                  Open builder
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="primary-link">
                  Open login
                </Link>
                <Link href="/devices" className="secondary-link">
                  Register device
                </Link>
              </>
            )}
            <a
              href="/api/download/android"
              className="secondary-link"
              download="mobile-task-automation.apk"
            >
              Download Android app
            </a>
          </div>
        </div>
        <div className="hero-stats">
          <div>
            <strong>1</strong>
            <span className="muted">user, single account</span>
          </div>
          <div>
            <strong>24/7</strong>
            <span className="muted">relay connection</span>
          </div>
          <div>
            <strong>No cable</strong>
            <span className="muted">wireless-first setup</span>
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card soft-card">
          <h2 style={{ marginTop: 0 }}>What you can do</h2>
          <ul className="feature-list">
            <li>Record taps from the phone and turn them into reusable automation steps.</li>
            <li>Edit, reorder, and run tasks from the web panel.</li>
            <li>Inspect run history, device status, and live relay events in one place.</li>
          </ul>
        </div>
        <div className="card soft-card">
          <h2 style={{ marginTop: 0 }}>Setup flow</h2>
          <ol className="feature-list ordered">
            <li>Log in to the web panel.</li>
            <li>Register a device and copy the API key.</li>
            <li>Paste the relay URL and key into the Android app.</li>
            <li>Enable Accessibility, then record and run tasks.</li>
          </ol>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <DownloadAppCard />
      </div>

      <div style={{ marginTop: 16 }}>
        {token ? (
          <TaskBuilderForm
            title="Quick task builder"
            description="Create a detailed task right from the home page, or start click recording from the connected Android device and save the captured steps immediately."
            saveLabel="Save from home"
          />
        ) : (
          <div className="card auth-card">
            <p className="eyebrow">Quick task builder</p>
            <h2 style={{ marginTop: 0 }}>Sign in to add tasks here</h2>
            <p className="muted">
              The inline builder on this page uses your account and device list, so it is available after login. Once signed in, you can build detailed tasks without leaving the home page.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/login" className="primary-link">
                Sign in
              </Link>
              <Link href="/task-builder" className="secondary-link">
                Open builder page
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
