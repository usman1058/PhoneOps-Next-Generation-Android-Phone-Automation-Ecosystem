import { z } from "zod";
import { stepSchema } from "./task-schema";

export const appInfoSchema = z.object({
  package: z.string().min(1),
  label: z.string(),
});

export type AppInfo = z.infer<typeof appInfoSchema>;

// ---- PC remote (phone -> Windows agent) ------------------------------------

export const pcActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({
    kind: z.literal("drag"),
    x: z.number(),
    y: z.number(),
    x2: z.number(),
    y2: z.number(),
    durationMs: z.number().int().min(50).max(5_000).default(250),
  }),
  z.object({ kind: z.literal("text"), text: z.string().max(2_000) }),
  z.object({
    kind: z.literal("key"),
    key: z.enum([
      "enter",
      "tab",
      "esc",
      "backspace",
      "delete",
      "space",
      "up",
      "down",
      "left",
      "right",
    ]),
  }),
]);

export type PcAction = z.infer<typeof pcActionSchema>;

export const agentInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type AgentInfo = z.infer<typeof agentInfoSchema>;

// Messages the Windows agent sends to the relay.
export const agentToRelaySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello_agent"),
    name: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal("pc_frame"),
    sessionId: z.string(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    data: z.string(), // base64 JPEG
  }),
]);

export type AgentToRelay = z.infer<typeof agentToRelaySchema>;

export const deviceToRelaySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    deviceId: z.string(),
    authToken: z.string(),
  }),
  z.object({
    type: z.literal("step_result"),
    runId: z.string(),
    stepIndex: z.number().int().nonnegative(),
    status: z.enum(["success", "failed"]),
  }),
  z.object({
    type: z.literal("run_complete"),
    runId: z.string(),
    status: z.enum(["success", "failed", "partial"]),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal("recording_steps"),
    sessionId: z.string(),
    steps: z.array(stepSchema),
  }),
  z.object({
    type: z.literal("task_recorded"),
    steps: z.array(stepSchema),
  }),
  z.object({
    type: z.literal("app_list"),
    requestId: z.string(),
    apps: z.array(appInfoSchema),
  }),
  z.object({
    type: z.literal("fcm_token"),
    token: z.string().min(1),
  }),
  z.object({
    type: z.literal("screen_frame"),
    sessionId: z.string(),
    seq: z.number().int().nonnegative(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    data: z.string(), // base64 JPEG
  }),
  z.object({
    type: z.literal("pc_list"),
  }),
  z.object({
    type: z.literal("pc_connect"),
    agentId: z.string().min(1),
  }),
  z.object({
    type: z.literal("pc_input"),
    agentId: z.string().min(1),
    action: pcActionSchema,
  }),
]);

export const remoteInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tap"),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    kind: z.literal("swipe"),
    x: z.number(),
    y: z.number(),
    x2: z.number(),
    y2: z.number(),
    durationMs: z.number().int().positive().max(10_000).default(300),
  }),
  z.object({ kind: z.literal("back") }),
  z.object({ kind: z.literal("home") }),
]);

export type RemoteInput = z.infer<typeof remoteInputSchema>;

export const relayToDeviceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run_task"),
    runId: z.string(),
    steps: z.array(stepSchema),
  }),
  z.object({
    type: z.literal("start_recording"),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal("stop_recording"),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal("list_apps"),
    requestId: z.string(),
  }),
  z.object({
    type: z.literal("screen_start"),
    sessionId: z.string(),
    fps: z.number().int().min(1).max(15).default(4),
    maxW: z.number().int().min(180).max(1440).default(540),
    quality: z.number().int().min(20).max(90).default(45),
  }),
  z.object({
    type: z.literal("screen_stop"),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal("remote_input"),
    input: remoteInputSchema,
  }),
  z.object({
    type: z.literal("pc_frame"),
    agentId: z.string(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    data: z.string(),
  }),
  z.object({
    type: z.literal("pc_agents"),
    agents: z.array(agentInfoSchema),
  }),
  z.object({
    type: z.literal("pc_session"),
    agentId: z.string(),
    ok: z.boolean(),
    error: z.string().optional(),
  }),
]);

export const relayToPanelSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run_update"),
    runId: z.string(),
    status: z.enum(["running", "success", "failed", "partial"]),
    stepIndex: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("device_status"),
    deviceId: z.string(),
    isOnline: z.boolean(),
  }),
  z.object({
    type: z.literal("recording_update"),
    sessionId: z.string(),
    deviceId: z.string(),
    status: z.enum(["recording", "stopped"]),
  }),
  z.object({
    type: z.literal("screen_frame"),
    deviceId: z.string(),
    sessionId: z.string(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    data: z.string(),
  }),
  z.object({
    type: z.literal("screen_state"),
    deviceId: z.string(),
    active: z.boolean(),
    error: z.string().optional(),
  }),
]);

export type DeviceToRelay = z.infer<typeof deviceToRelaySchema>;
export type RelayToDevice = z.infer<typeof relayToDeviceSchema>;
export type RelayToPanel = z.infer<typeof relayToPanelSchema>;
