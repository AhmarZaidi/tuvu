import { z } from "zod";

export const healthResponseSchema = z.object({
  data: z.object({
    ok: z.literal(true),
    service: z.literal("tuvu-api"),
    timestamp: z.string().datetime(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
