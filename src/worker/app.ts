import { Hono } from "hono";
import type { HealthResponse } from "@shared/api";

export const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => {
  const body: HealthResponse = {
    data: {
      ok: true,
      service: "tuvu-api",
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(body);
});

app.notFound((c) =>
  c.json(
    {
      error: {
        code: "not_found",
        message: "The requested API route does not exist.",
      },
    },
    404,
  ),
);
