import { healthResponseSchema } from "@shared/api";
import { app } from "@worker/app";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns the standard success envelope", async () => {
    const response = await app.request("http://localhost/api/health");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(() => healthResponseSchema.parse(body)).not.toThrow();
  });
});
