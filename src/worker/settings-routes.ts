import { Hono } from "hono";
import { z } from "zod";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { requireAuth, requireCsrf, type AppVariables } from "./session";

const providerSchema = z.enum(["tmdb", "igdb", "rawg", "openlibrary", "jikan", "youtube"]);
const providerCredentialSchema = z.object({
  label: z.string().trim().max(80).optional(),
  secrets: z.record(z.string().trim().min(1), z.string().trim().min(1)).refine((value) => Object.keys(value).length > 0, "At least one credential value is required."),
});
const navigationSchema = z.object({
  items: z.array(z.enum(["shows", "anime", "movies", "books", "youtube", "games"])).min(2).max(6),
});

type ProviderCredentialRow = {
  id: string;
  provider: string;
  label: string | null;
  status: string;
  last_validated_at: string | null;
  updated_at: string;
};

export function createSettingsRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  router.get("/providers", requireAuth(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Settings storage is unavailable.");
    const auth = c.get("auth");
    const rows = await c.env.DB.prepare(`SELECT id, provider, label, status, last_validated_at, updated_at
      FROM user_provider_credentials
      WHERE user_id = ?
      ORDER BY provider, updated_at DESC`)
      .bind(auth.user.id)
      .all<ProviderCredentialRow>();
    return c.json(apiSuccess({ providers: rows.results.map((row) => ({
      id: row.id,
      provider: row.provider,
      label: row.label,
      status: row.status,
      lastValidatedAt: row.last_validated_at,
      updatedAt: row.updated_at,
      configured: row.status === "active",
    })) }));
  });

  router.put("/providers/:provider", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Settings storage is unavailable.");
    const provider = providerSchema.safeParse(c.req.param("provider"));
    if (!provider.success) return apiError(c, 400, "validation_failed", "Unknown provider.");
    const body = providerCredentialSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Provider credential details are invalid.", body.error.flatten());
    const auth = c.get("auth");
    const now = new Date().toISOString();
    const label = body.data.label || "Default";
    await c.env.DB.prepare(`INSERT INTO user_provider_credentials
        (id, user_id, provider, label, encrypted_secret_json, status, last_validated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', NULL, ?, ?)
      ON CONFLICT(user_id, provider, label) DO UPDATE SET
        encrypted_secret_json=excluded.encrypted_secret_json,
        status='active',
        updated_at=excluded.updated_at`)
      .bind(randomId("upc"), auth.user.id, provider.data, label, JSON.stringify(body.data.secrets), now, now)
      .run();
    return c.json(apiSuccess({ provider: provider.data, label, status: "active", updatedAt: now }));
  });

  router.delete("/providers/:provider", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Settings storage is unavailable.");
    const provider = providerSchema.safeParse(c.req.param("provider"));
    if (!provider.success) return apiError(c, 400, "validation_failed", "Unknown provider.");
    const auth = c.get("auth");
    const now = new Date().toISOString();
    await c.env.DB.prepare("UPDATE user_provider_credentials SET status = 'disabled', updated_at = ? WHERE user_id = ? AND provider = ?")
      .bind(now, auth.user.id, provider.data)
      .run();
    return c.json(apiSuccess({ provider: provider.data, status: "disabled", updatedAt: now }));
  });

  router.get("/navigation", requireAuth(), async (c) => {
    const stored = await readUserSetting(c.env.DB, c.get("auth").user.id, "navigation");
    return c.json(apiSuccess({ navigation: stored ?? { items: ["shows", "anime", "movies", "books", "games"] } }));
  });

  router.put("/navigation", requireAuth(), requireCsrf(), async (c) => {
    const body = navigationSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Choose between 2 and 6 navigation items.", body.error.flatten());
    await writeUserSetting(c.env.DB, c.get("auth").user.id, "navigation", body.data);
    return c.json(apiSuccess({ navigation: body.data }));
  });

  router.get("/storage", requireAuth(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Storage estimates are unavailable.");
    const auth = c.get("auth");
    const [library, uploads, media] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM user_media WHERE user_id = ?").bind(auth.user.id).first<{ count: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS bytes FROM uploads WHERE user_id = ?").bind(auth.user.id).first<{ count: number; bytes: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM media_items").first<{ count: number }>(),
    ]);
    return c.json(apiSuccess({
      storage: {
        libraryItems: library?.count ?? 0,
        userUploads: uploads?.count ?? 0,
        userUploadBytes: uploads?.bytes ?? 0,
        globalMediaItems: media?.count ?? 0,
        databaseBytes: null,
        supabaseBytes: null,
      },
    }));
  });

  return router;
}

async function readUserSetting(db: D1Database | undefined, userId: string, key: string) {
  if (!db) return null;
  try {
    const row = await db.prepare("SELECT value_json FROM user_settings WHERE user_id = ? AND key = ?").bind(userId, key).first<{ value_json: string }>();
    return row?.value_json ? JSON.parse(row.value_json) : null;
  } catch {
    return null;
  }
}

async function writeUserSetting(db: D1Database | undefined, userId: string, key: string, value: unknown) {
  if (!db) return;
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO user_settings (id, user_id, key, value_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`)
    .bind(randomId("ust"), userId, key, JSON.stringify(value), now, now)
    .run();
}
