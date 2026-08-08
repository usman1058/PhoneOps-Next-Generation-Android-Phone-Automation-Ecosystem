import { z } from "zod";
import { stepSchema } from "./task-schema";

export const appInfoSchema = z.object({
  package: z.string().min(1),
  label: z.string(),
});

export type AppInfo = z.infer<typeof appInfoSchema>;

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
]);

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
]);

export type DeviceToRelay = z.infer<typeof deviceToRelaySchema>;
export type RelayToDevice = z.infer<typeof relayToDeviceSchema>;
export type RelayToPanel = z.infer<typeof relayToPanelSchema>;
