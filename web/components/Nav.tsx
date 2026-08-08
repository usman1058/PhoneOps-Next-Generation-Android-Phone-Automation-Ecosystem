"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { clearToken, getToken } from "@/lib/client-api";

export default function Nav() {
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(getToken());
  }, []);

  if (pathname === "/login") return null;

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/devices", label: "Devices" },
    { href: "/tasks", label: "Tasks" },
    { href: "/task-builder", label: "Task Builder" },
    { href: "/settings", label: "Settings" },
  ];

  function signOut() {
    clearToken();
    window.location.href = "/login";
  }

  return (
    <nav className="nav">
      <Link href="/dashboard" className="brand">
        Phone Automation
      </Link>
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname.startsWith(l.href) ? "active" : ""}
          >
            {l.label}
          </Link>
        ))}
        {token ? (
          <button className="nav-signout" onClick={signOut}>
            Sign out
          </button>
        ) : null}
      </div>
    </nav>
  );
}
