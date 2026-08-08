import { NextResponse } from "next/server";
import os from "node:os";
import { requireAuth } from "@/lib/auth";
import { relayRequest } from "@/lib/relay-client";

function localLanIps(): string[] {
  const out: string[] = [];
  const nets = os.networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        out.push(iface.address);
      }
    }
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let relayUrls: string[] = [];
  try {
    const res = await relayRequest("/internal/lan-urls");
    if (res.ok) {
      const data = (await res.json()) as { urls?: string[] };
      relayUrls = Array.isArray(data.urls)
        ? data.urls.filter((u): u is string => typeof u === "string")
        : [];
    }
  } catch {
    relayUrls = [];
  }

  const ips = localLanIps();

  return NextResponse.json({
    relayUrls,
    webUrls: ips.map((ip) => `http://${ip}:3000`),
    ips,
  });
}
