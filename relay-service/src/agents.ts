import type { WebSocket } from "ws";
import type { RelayToDevice } from "@automation/shared";
import type { AgentInfo } from "@automation/shared";
import { sendToDevice } from "./sockets/state";

interface Agent {
  id: string;
  name: string;
  ws: WebSocket;
}

const agents = new Map<string, Agent>();
let agentSeq = 0;

// agentId -> deviceId currently viewing that PC
const pcSessions = new Map<string, string>();

export function registerAgent(ws: WebSocket, name: string): string {
  const id = `pc-${++agentSeq}`;
  agents.set(id, { id, name, ws });
  broadcastAgentList();
  return id;
}

export function removeAgent(id: string): void {
  const existed = agents.delete(id);
  if (!existed) return;
  const deviceId = endPcSessionByAgent(id);
  if (deviceId) {
    sendToDevice(deviceId, {
      type: "pc_session",
      agentId: id,
      ok: false,
      error: "PC disconnected",
    });
  }
  broadcastAgentList();
}

export function getAgentWs(id: string): WebSocket | null {
  return agents.get(id)?.ws ?? null;
}

export function listAgents(): AgentInfo[] {
  return [...agents.values()].map(({ id, name }) => ({ id, name }));
}

export function broadcastAgentList(): void {
  // Pushed lazily: phones request via pc_list; keep this hook for future push.
}

export function startPcSession(agentId: string, deviceId: string): boolean {
  if (!agents.has(agentId)) return false;
  pcSessions.set(agentId, deviceId);
  return true;
}

export function endPcSessionByAgent(agentId: string): string | null {
  const deviceId = pcSessions.get(agentId) ?? null;
  pcSessions.delete(agentId);
  return deviceId;
}

export function endPcSessionsForDevice(deviceId: string): string[] {
  const ended: string[] = [];
  for (const [agentId, owner] of pcSessions) {
    if (owner === deviceId) {
      pcSessions.delete(agentId);
      ended.push(agentId);
    }
  }
  return ended;
}

export function isPcSessionOwner(agentId: string, deviceId: string): boolean {
  return pcSessions.get(agentId) === deviceId;
}

export function getPcSessionOwner(agentId: string): string | null {
  return pcSessions.get(agentId) ?? null;
}
