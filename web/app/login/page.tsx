"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/client-api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      if (data.token) {
        setToken(data.token);
        router.replace("/dashboard");
      } else {
        setMode("login");
        setError("Account created. Sign in to continue.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container auth-page">
      <div className="auth-hero card soft-card">
        <p className="eyebrow">Automation panel</p>
        <h1 style={{ marginTop: 0 }}>Sign in to the control center.</h1>
        <p className="muted" style={{ maxWidth: 440 }}>
          Manage devices, record detailed click-based tasks, and run them wirelessly from a single dashboard.
        </p>
        <ul className="feature-list">
          <li>Single-user account</li>
          <li>Task recording and replay</li>
          <li>Wireless-first phone setup</li>
        </ul>
      </div>

      <div className="card auth-card">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow" style={{ marginTop: 0 }}>Account access</p>
            <h1 style={{ marginTop: 0 }}>{mode === "login" ? "Sign in" : "Create account"}</h1>
          </div>
          <span className="badge run">secure JWT</span>
        </div>
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="me@example.com"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Your password"
            />
          </div>
          {error && (
            <p className="muted" style={{ color: "var(--err)" }}>
              {error}
            </p>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          {mode === "login" ? "No account yet?" : "Already registered?"} {" "}
          <button onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Create one" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
