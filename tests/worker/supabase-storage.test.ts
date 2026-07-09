import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadProfileImageToSupabase } from "@worker/supabase-storage";
import { testEnv } from "./memory-repository";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Supabase Storage adapter", () => {
  it("uploads profile images with server-side credentials", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadProfileImageToSupabase({
      env: {
        ...testEnv(),
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      } as Env,
      userId: "usr_123",
      kind: "avatar",
      file: {
        type: "image/png",
        arrayBuffer: async () => new ArrayBuffer(3),
      } as File,
    });

    expect(result.bucket).toBe("tuvu-avatars");
    expect(result.objectPath).toContain("avatars/usr_123/");
    expect(result.publicUrl).toContain("https://example.supabase.co/storage/v1/object/public/tuvu-avatars/avatars/usr_123/");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://example.supabase.co/storage/v1/object/tuvu-avatars/avatars/usr_123/"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer service-role",
          apikey: "service-role",
          "content-type": "image/png",
        }),
      }),
    );
  });
});
