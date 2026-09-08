import { Hono } from "hono";
import { z } from "zod";
import { randomId } from "./crypto";
import { apiError, apiSuccess } from "./http";
import { requireAuth, requireCsrf, type AppVariables } from "./session";

import { PROVIDER_CATALOG, getProviderCatalogItem } from "@shared/providers-config";
import { pingProvider } from "./providers/ping";
import { activeProviderCredentialKeys, configuredProviderCredentialKeys, hasAppFallback, hasRequiredProviderCredentials, providerConfigurationSource } from "./providers/provider-credentials";

const providerCodeSchema = z.string().trim().refine((val) => getProviderCatalogItem(val) !== undefined, "Unknown provider.");
const providerCredentialSchema = z.object({
  label: z.string().trim().max(80).optional(),
  secrets: z.record(z.string().trim().min(1), z.string().trim()).refine((value) => Object.keys(value).length > 0, "At least one credential value is required."),
});
const navigationSchema = z.object({
  items: z.array(z.enum(["shows", "anime", "movies", "books", "youtube", "games", "explore"])).min(1),
  showLabelsMobile: z.boolean().optional(),
});

const appearanceSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  gradientIntensity: z.number().min(0).max(1).optional(),
});

type ProviderCredentialRow = {
  id: string;
  provider: string;
  label: string | null;
  status: string;
  last_validated_at: string | null;
  last_tested_at: string | null;
  last_test_status: string | null;
  updated_at: string;
  encrypted_secret_json: string;
};

export function createSettingsRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  router.get("/providers", requireAuth(), async (c) => {
    const auth = c.get("auth");
    let rows: ProviderCredentialRow[] = [];
    if (c.env.DB) {
      const dbResult = await c.env.DB.prepare(`SELECT id, provider, label, status, last_validated_at, last_tested_at, last_test_status, updated_at, encrypted_secret_json
        FROM user_provider_credentials
        WHERE user_id = ?
        ORDER BY provider, updated_at DESC`)
        .bind(auth.user.id)
        .all<ProviderCredentialRow>();
      rows = dbResult.results ?? [];
    }

    const rowMap = new Map<string, ProviderCredentialRow>();
    for (const row of rows) {
      if (!rowMap.has(row.provider)) {
        rowMap.set(row.provider, row);
      }
    }

    const providers = PROVIDER_CATALOG.map((item) => {
      const userRow = rowMap.get(item.code);
      const appFallback = hasAppFallback(c.env, item.code);
      const configurationSource = providerConfigurationSource({
        keyless: item.keyless,
        personalStatus: userRow?.status,
        personalCredentialsConfigured: hasRequiredProviderCredentials(item.code, userRow?.encrypted_secret_json),
        appFallbackConfigured: appFallback.configured,
      });
      const isConfigured = configurationSource === "personal" || configurationSource === "app" || configurationSource === "keyless";
      const status = userRow?.status ?? (item.keyless ? "active" : item.defaultStatus === "disabled" ? "disabled" : "not_configured");
      return {
        id: userRow?.id ?? null,
        provider: item.code,
        name: item.name,
        category: item.category,
        description: item.description,
        keyless: item.keyless,
        label: userRow?.label ?? (item.keyless ? "Keyless" : null),
        status,
        configured: isConfigured,
        configurationSource,
        // Disabled credentials remain removable but must never appear configured.
        configuredFields: activeProviderCredentialKeys(userRow?.status, userRow?.encrypted_secret_json),
        hasSavedPersonalCredentials: Boolean(userRow && configuredProviderCredentialKeys(userRow.encrypted_secret_json).length),
        lastValidatedAt: userRow?.last_validated_at ?? null,
        lastTestedAt: userRow?.last_tested_at ?? null,
        connectionStatus: userRow?.last_test_status ?? null,
        updatedAt: userRow?.updated_at ?? null,
        fields: item.fields,
        attribution: item.attribution,
        docUrl: item.docUrl,
        appFallback,
      };
    });

    return c.json(apiSuccess({ providers }));
  });

  router.post("/providers/:provider/ping", requireAuth(), async (c) => {
    const providerParam = c.req.param("provider");
    const catalogItem = getProviderCatalogItem(providerParam);
    if (!catalogItem) return apiError(c, 400, "validation_failed", `Unknown provider '${providerParam}'.`);

    const auth = c.get("auth");
    const body = await c.req.json().catch(() => ({}));
    const scope = c.req.query("scope") || body?.scope || "user";
    const pingResult = await pingProvider(c.env, providerParam, scope === "app" ? null : auth.user.id);
    return c.json(apiSuccess({ ping: { ...pingResult, scope } }));
  });

  router.put("/providers/:provider", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Settings storage is unavailable.");
    const providerParsed = providerCodeSchema.safeParse(c.req.param("provider"));
    if (!providerParsed.success) return apiError(c, 400, "validation_failed", "Unknown provider.");
    const body = providerCredentialSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Provider credential details are invalid.", body.error.flatten());
    const auth = c.get("auth");
    const now = new Date().toISOString();
    const label = body.data.label || "Default";
    await c.env.DB.prepare(`INSERT INTO user_provider_credentials
        (id, user_id, provider, label, encrypted_secret_json, status, last_validated_at, last_tested_at, last_test_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', NULL, NULL, NULL, ?, ?)
      ON CONFLICT(user_id, provider, label) DO UPDATE SET
        encrypted_secret_json=excluded.encrypted_secret_json,
        status='active',
        last_tested_at=NULL,
        last_test_status=NULL,
        updated_at=excluded.updated_at`)
      .bind(randomId("upc"), auth.user.id, providerParsed.data, label, JSON.stringify(body.data.secrets), now, now)
      .run();
    return c.json(apiSuccess({ provider: providerParsed.data, label, status: "active", updatedAt: now }));
  });

  router.delete("/providers/:provider", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Settings storage is unavailable.");
    const providerParsed = providerCodeSchema.safeParse(c.req.param("provider"));
    if (!providerParsed.success) return apiError(c, 400, "validation_failed", "Unknown provider.");
    const auth = c.get("auth");
    await c.env.DB.prepare("DELETE FROM user_provider_credentials WHERE user_id = ? AND provider = ?")
      .bind(auth.user.id, providerParsed.data)
      .run();
    return c.json(apiSuccess({ provider: providerParsed.data, status: "not_configured" }));
  });

  router.get("/navigation", requireAuth(), async (c) => {
    const stored = await readUserSetting(c.env.DB, c.get("auth").user.id, "navigation");
    const navigation = stored ? { showLabelsMobile: false, ...stored } : { items: ["shows", "anime", "movies", "books", "games"], showLabelsMobile: false };
    return c.json(apiSuccess({ navigation }));
  });

  router.put("/navigation", requireAuth(), requireCsrf(), async (c) => {
    const raw = await c.req.json().catch(() => null);
    const rawItems = Array.isArray(raw?.items) ? raw.items : [];
    const items = rawItems.includes("explore") ? rawItems : [...rawItems, "explore"];
    const body = navigationSchema.safeParse({ ...raw, items });
    if (!body.success) return apiError(c, 400, "validation_failed", "Invalid navigation settings.", body.error.flatten());
    await writeUserSetting(c.env.DB, c.get("auth").user.id, "navigation", body.data);
    return c.json(apiSuccess({ navigation: body.data }));
  });

  router.get("/appearance", requireAuth(), async (c) => {
    const stored = await readUserSetting(c.env.DB, c.get("auth").user.id, "appearance");
    const appearance = stored ? { theme: "system", gradientIntensity: 0.2, ...stored } : { theme: "system", gradientIntensity: 0.2 };
    return c.json(apiSuccess({ appearance }));
  });

  router.put("/appearance", requireAuth(), requireCsrf(), async (c) => {
    const body = appearanceSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, 400, "validation_failed", "Appearance preference is invalid.", body.error.flatten());
    await writeUserSetting(c.env.DB, c.get("auth").user.id, "appearance", body.data);
    return c.json(apiSuccess({ appearance: body.data }));
  });

  router.get("/storage", requireAuth(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Storage estimates are unavailable.");
    const auth = c.get("auth");
    const [library, uploads, media, backups] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM user_media WHERE user_id = ?").bind(auth.user.id).first<{ count: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS bytes FROM uploads WHERE user_id = ?").bind(auth.user.id).first<{ count: number; bytes: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM media_items").first<{ count: number }>(),
      c.env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(byte_size), 0) AS bytes FROM user_backups WHERE user_id = ? AND status != 'deleted'").bind(auth.user.id).first<{ count: number; bytes: number }>(),
    ]);
    return c.json(apiSuccess({
      storage: {
        libraryItems: library?.count ?? 0,
        userUploads: uploads?.count ?? 0,
        userUploadBytes: uploads?.bytes ?? 0,
        globalMediaItems: media?.count ?? 0,
        backups: backups?.count ?? 0,
        backupBytes: backups?.bytes ?? 0,
        databaseBytes: null,
        supabaseBytes: null,
      },
    }));
  });

  router.get("/backups", requireAuth(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Backup storage is unavailable.");
    const rows = await c.env.DB.prepare("SELECT id, label, status, byte_size, created_at, updated_at FROM user_backups WHERE user_id = ? AND status != 'deleted' ORDER BY created_at DESC LIMIT 20")
      .bind(c.get("auth").user.id)
      .all<{ id: string; label: string | null; status: string; byte_size: number; created_at: string; updated_at: string }>();
    return c.json(apiSuccess({ backups: rows.results.map((row) => ({ id: row.id, label: row.label, status: row.status, byteSize: row.byte_size, createdAt: row.created_at, updatedAt: row.updated_at })) }));
  });

  router.post("/backups", requireAuth(), requireCsrf(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Backup storage is unavailable.");
    const auth = c.get("auth");
    const now = new Date().toISOString();
    const payload = await buildBackupPayload(c.env.DB, auth.user.id, now);
    const payloadJson = JSON.stringify(payload);
    const id = randomId("bak");
    const chunks = chunkText(payloadJson, 180_000);
    const byteSize = new TextEncoder().encode(payloadJson).byteLength;
    const manifest = JSON.stringify({ version: 1, storage: "chunks", chunkCount: chunks.length, exportedAt: now });
    await c.env.DB.prepare("INSERT INTO user_backups (id, user_id, label, status, payload_json, byte_size, created_at, updated_at) VALUES (?, ?, ?, 'failed', ?, ?, ?, ?)")
      .bind(id, auth.user.id, `Backup ${now.slice(0, 10)}`, manifest, byteSize, now, now)
      .run();
    if (chunks.length) {
      await c.env.DB.batch(chunks.map((chunk, index) => c.env.DB.prepare("INSERT INTO user_backup_chunks (id, backup_id, chunk_index, payload_chunk, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(randomId("bch"), id, index, chunk, new TextEncoder().encode(chunk).byteLength, now)));
    }
    await c.env.DB.prepare("UPDATE user_backups SET status = 'complete', updated_at = ? WHERE id = ? AND user_id = ?")
      .bind(now, id, auth.user.id)
      .run();
    return c.json(apiSuccess({ backup: { id, label: `Backup ${now.slice(0, 10)}`, status: "complete", byteSize, createdAt: now, updatedAt: now, chunkCount: chunks.length } }), 201);
  });

  router.get("/backups/:id/export", requireAuth(), async (c) => {
    if (!c.env.DB) return apiError(c, 503, "server_error", "Backup storage is unavailable.");
    const row = await c.env.DB.prepare("SELECT id, label, payload_json, byte_size, created_at FROM user_backups WHERE id = ? AND user_id = ? AND status = 'complete'")
      .bind(c.req.param("id"), c.get("auth").user.id)
      .first<{ id: string; label: string | null; payload_json: string; byte_size: number; created_at: string }>();
    if (!row) return apiError(c, 404, "not_found", "Backup not found.");
    const payload = await readBackupPayload(c.env.DB, row);
    return c.json(apiSuccess({ backup: { id: row.id, label: row.label, byteSize: row.byte_size, createdAt: row.created_at, payload } }));
  });

  return router;
}

function chunkText(value: string, size: number) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size));
  }
  return chunks;
}

async function readBackupPayload(db: D1Database, row: { id: string; payload_json: string }) {
  const manifest = JSON.parse(row.payload_json) as { storage?: string; chunkCount?: number };
  if (manifest.storage !== "chunks") return manifest;
  const chunks = await db.prepare("SELECT payload_chunk FROM user_backup_chunks WHERE backup_id = ? ORDER BY chunk_index ASC")
    .bind(row.id)
    .all<{ payload_chunk: string }>();
  if ((manifest.chunkCount ?? 0) !== chunks.results.length) {
    throw new Error("Backup is incomplete.");
  }
  return JSON.parse(chunks.results.map((chunk) => chunk.payload_chunk).join(""));
}

async function buildBackupPayload(db: D1Database, userId: string, exportedAt: string) {
  const [profile, userMedia, episodeActivity, unitActivity, uploads] = await Promise.all([
    db.prepare("SELECT users.id, users.email, users.username, users.display_name, user_profiles.bio, user_profiles.visibility, user_profiles.preferred_language, user_profiles.preferred_region FROM users JOIN user_profiles ON user_profiles.user_id = users.id WHERE users.id = ?")
      .bind(userId)
      .first(),
    db.prepare("SELECT * FROM user_media WHERE user_id = ? ORDER BY updated_at DESC").bind(userId).all(),
    db.prepare("SELECT * FROM episode_activity WHERE user_id = ? ORDER BY updated_at DESC").bind(userId).all(),
    db.prepare("SELECT * FROM unit_activity WHERE user_id = ? ORDER BY updated_at DESC").bind(userId).all(),
    db.prepare("SELECT id, bucket, object_path, public_url, content_type, byte_size, kind, status, created_at, updated_at FROM uploads WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all(),
  ]);
  return {
    version: 1,
    exportedAt,
    userId,
    profile,
    userMedia: userMedia.results,
    episodeActivity: episodeActivity.results,
    unitActivity: unitActivity.results,
    uploads: uploads.results,
  };
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
