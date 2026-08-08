import dgram from "node:dgram";
import os from "node:os";
import { config } from "./config";

const DISCOVERY_PORT = Number(process.env.LAN_DISCOVERY_PORT ?? 45678);
const PROBE = "pa:lan:discover";

function lanIps(): string[] {
  const out: string[] = [];
  const nets = os.networkInterfaces();
  for (const [name, ifaces] of Object.entries(nets)) {
    for (const iface of ifaces ?? []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      // Prefer Wi-Fi / wireless adapters; they are the ones a phone
      // can actually reach. Skip virtual adapters (VMware/VirtualBox
      // host-only, vEthernet, Docker) and the like.
      const n = name.toLowerCase();
      const isVirtual =
        n.includes("vethernet") ||
        n.includes("virtualbox") ||
        n.includes("vmware") ||
        n.includes("vmnet") ||
        n.includes("docker") ||
        n.includes("loopback") ||
        n.includes("vbox");
      if (isVirtual) continue;
      out.push(iface.address);
    }
  }
  // Wireless adapters first, wired second.
  const score = (ip: string): number =>
    Object.entries(nets).some(([name, ifaces]) =>
      (ifaces ?? []).some(
        (i) =>
          i.family === "IPv4" &&
          !i.internal &&
          i.address === ip &&
          /wi-?fi|wlan|wireless|wl\d/i.test(name),
      ),
    )
      ? 0
      : 1;
  return out.sort((a, b) => score(a) - score(b));
}

function subnet(ip: string): string {
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}` : "";
}

function lanIpsFor(requesterIp: string): string[] {
  const all = lanIps();
  const target = subnet(requesterIp);
  if (!target) return all;
  const same = all.filter((ip) => subnet(ip) === target);
  // Always include every candidate address: a phone on a different subnet
  // (e.g. Ethernet) must still be able to reach the Wi-Fi or wired relay.
  // Same-subnet addresses stay first, but nothing is ever dropped.
  return same.length > 0 ? [...same, ...all.filter((ip) => !same.includes(ip))] : all;
}

export function startLanDiscovery(): dgram.Socket {
  const socket = dgram.createSocket("udp4");
  socket.on("message", (msg, rinfo) => {
    if (msg.toString("utf8").trim() !== PROBE) return;
    const ips = lanIpsFor(rinfo.address);
    const urls = ips.map((ip) => `http://${ip}:${config.port}`);
    const reply = Buffer.from(
      JSON.stringify({ type: "automation-relay", urls }),
    );
    socket.send(reply, rinfo.port, rinfo.address);
    for (const ip of ips) {
      socket.send(reply, rinfo.port, ip);
    }
  });
  socket.bind(DISCOVERY_PORT, () => {
    socket.setBroadcast(true);
    console.log(`[lan] discovery UDP on :${DISCOVERY_PORT}`);
  });
  return socket;
}

export function lanUrls(): string[] {
  const urls = lanIps().map((ip) => `http://${ip}:${config.port}`);
  // A configured public URL always comes first so the panel (and QR) use it.
  return config.publicRelayUrl ? [config.publicRelayUrl, ...urls] : urls;
}
