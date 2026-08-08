import { z } from "zod";

export const stepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open_app"), package: z.string().min(1) }),
  z.object({
    action: z.literal("tap_by_text"),
    text: z.string().min(1),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.object({
    action: z.literal("tap_by_coordinates"),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    action: z.literal("swipe"),
    fromX: z.number(),
    fromY: z.number(),
    toX: z.number(),
    toY: z.number(),
    durationMs: z.number().int().positive().optional(),
  }),
  z.object({ action: z.literal("wait"), ms: z.number().int().positive() }),
  z.object({ action: z.literal("back") }),
  z.object({ action: z.literal("home") }),
]);

export type Step = z.infer<typeof stepSchema>;

export const taskSchema = z.object({
  id: z.string(),
  name: z.string(),
  steps: z.array(stepSchema),
});

export type Task = z.infer<typeof taskSchema>;

export const stepsArraySchema = z.array(stepSchema);

export function isSteps(value: unknown): value is Step[] {
  return stepsArraySchema.safeParse(value).success;
}

export function parseSteps(value: unknown): Step[] {
  return stepsArraySchema.parse(value);
}
