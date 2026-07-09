import { describe, expect, it } from "vitest";
import { sha256Hex } from "@worker/crypto";
import { createSession } from "@worker/session";
import { MemoryAuthRepository } from "./memory-repository";

describe("D1-backed session helpers", () => {
  it("creates hashed sessions and looks them up before expiry", async () => {
    const repository = new MemoryAuthRepository();
    const { token, session } = await createSession(repository, "usr_1", "vitest", new Date("2026-07-09T00:00:00.000Z"));

    expect(token).not.toBe(session.tokenHash);
    expect(session.tokenHash).toBe(await sha256Hex(token));
    await expect(repository.findSessionByTokenHash(session.tokenHash, "2026-07-10T00:00:00.000Z")).resolves.toMatchObject({
      id: session.id,
      userId: "usr_1",
    });
  });

  it("does not return expired sessions", async () => {
    const repository = new MemoryAuthRepository();
    const { session } = await createSession(repository, "usr_1", null, new Date("2026-07-09T00:00:00.000Z"));

    await expect(repository.findSessionByTokenHash(session.tokenHash, "2026-09-01T00:00:00.000Z")).resolves.toBeNull();
  });
});
