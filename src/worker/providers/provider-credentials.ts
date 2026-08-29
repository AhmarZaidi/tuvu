import { envString } from "../env";
import type { ProviderName } from "./types";

export type CredentialLookup = {
  userId?: string | null;
  provider: ProviderName | string;
  key: string;
};

export type ProviderConfigurationSource = "personal" | "app" | "keyless" | "disabled" | "none";

const requiredCredentialKeys: Record<string, string[]> = {
  tmdb: ["TMDB_API_KEY"],
  thetvdb: ["THETVDB_API_KEY"],
  googlebooks: ["GOOGLE_BOOKS_API_KEY"],
  igdb: ["TWITCH_IGDB_CLIENT_ID", "TWITCH_IGDB_CLIENT_SECRET"],
  rawg: ["RAWG_API_KEY"],
  guardian: ["GUARDIAN_API_KEY"],
  newsapi: ["NEWSAPI_KEY"],
  opensubtitles: ["OPENSUBTITLES_API_KEY"],
  youtube: ["YOUTUBE_API_KEY"],
};

export function hasRequiredProviderCredentials(provider: string, secretsJson?: string | null): boolean {
  const requiredKeys = requiredCredentialKeys[provider];
  if (!requiredKeys?.length || !secretsJson) return false;
  try {
    const secrets = JSON.parse(secretsJson) as Record<string, unknown>;
    return requiredKeys.every((key) => typeof secrets[key] === "string" && secrets[key].trim().length > 0);
  } catch {
    return false;
  }
}

/** Returns configured field names only; it never returns secret values. */
export function configuredProviderCredentialKeys(secretsJson?: string | null): string[] {
  if (!secretsJson) return [];
  try {
    const secrets = JSON.parse(secretsJson) as Record<string, unknown>;
    return Object.entries(secrets)
      .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
      .map(([key]) => key);
  } catch {
    return [];
  }
}

/** Produces a secret-free description of the credentials the Worker will use. */
export function providerConfigurationSource(options: {
  keyless: boolean;
  personalStatus?: string | null;
  personalCredentialsConfigured?: boolean;
  appFallbackConfigured: boolean;
}): ProviderConfigurationSource {
  if (options.keyless) return "keyless";
  if (options.personalStatus === "active" && options.personalCredentialsConfigured !== false) return "personal";
  if (options.appFallbackConfigured) return "app";
  if (options.personalStatus === "disabled") return "disabled";
  return "none";
}

export async function providerCredential(env: Env, lookup: CredentialLookup): Promise<string | null> {
  const userCredential = await userProviderCredential(env, lookup);
  if (userCredential) return userCredential;
  return envString(env, lookup.key) ?? null;
}

export async function getUserProviderSecrets(env: Env, userId?: string | null, provider?: string): Promise<Record<string, string> | null> {
  if (!env.DB || !userId || !provider) return null;
  try {
    const row = await env.DB.prepare(`SELECT encrypted_secret_json FROM user_provider_credentials
      WHERE user_id = ? AND provider = ? AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1`)
      .bind(userId, provider)
      .first<{ encrypted_secret_json: string }>();
    if (!row?.encrypted_secret_json) return null;
    const parsed = JSON.parse(row.encrypted_secret_json) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) result[k] = v.trim();
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

export async function recordProviderValidation(env: Env, userId: string | null | undefined, provider: string | undefined, status: string, ok: boolean): Promise<void> {
  if (!env.DB || !userId || !provider) return;
  try {
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE user_provider_credentials SET last_tested_at = ?, last_test_status = ?, last_validated_at = CASE WHEN ? THEN ? ELSE last_validated_at END, updated_at = ? WHERE user_id = ? AND provider = ?")
      .bind(now, status, ok ? 1 : 0, now, now, userId, provider)
      .run();
  } catch {
    // Ignore DB update errors during ping; the probe result is still returned.
  }
}

async function userProviderCredential(env: Env, lookup: CredentialLookup): Promise<string | null> {
  if (!env.DB || !lookup.userId) return null;
  try {
    const row = await env.DB.prepare(`SELECT encrypted_secret_json FROM user_provider_credentials
      WHERE user_id = ? AND provider = ? AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 1`)
      .bind(lookup.userId, lookup.provider)
      .first<{ encrypted_secret_json: string }>();
    if (!row?.encrypted_secret_json) return null;
    const parsed = JSON.parse(row.encrypted_secret_json) as Record<string, unknown>;
    const value = parsed[lookup.key] ?? parsed.apiKey ?? parsed.token ?? parsed.clientId;
    return typeof value === "string" && value.trim() ? value : null;
  } catch {
    // The settings phase creates this table. Until then, app-level secrets remain the fallback.
    return null;
  }
}

export function hasAppFallback(env: Env, provider: string): { configured: boolean; message: string } {
  switch (provider) {
    case "tvmaze":
    case "wikidata":
    case "jikan":
    case "anilist":
    case "openlibrary":
    case "musicbrainz":
    case "coverartarchive":
    case "listenbrainz":
    case "theaudiodb":
    case "lrclib":
    case "gdelt":
      return { configured: true, message: "Keyless public API (always ready)" };
    case "tmdb":
      return envString(env, "TMDB_API_KEY")
        ? { configured: true, message: "Set in server environment" }
        : { configured: false, message: "No TMDB_API_KEY in server env" };
    case "googlebooks":
      return envString(env, "GOOGLE_BOOKS_API_KEY")
        ? { configured: true, message: "Set in server environment" }
        : { configured: false, message: "No GOOGLE_BOOKS_API_KEY in server env" };
    case "igdb":
      return envString(env, "TWITCH_IGDB_CLIENT_ID") && envString(env, "TWITCH_IGDB_CLIENT_SECRET")
        ? { configured: true, message: "Set in server environment" }
        : { configured: false, message: "No Twitch credentials in server env" };
    case "rawg":
      return envString(env, "RAWG_API_KEY")
        ? { configured: true, message: "Set in server environment" }
        : { configured: false, message: "No RAWG_API_KEY in server env" };
    case "thetvdb":
      return envString(env, "THETVDB_API_KEY")
        ? { configured: true, message: "Set in server environment" }
        : { configured: false, message: "No THETVDB_API_KEY in server env" };
    case "guardian":
      return envString(env, "GUARDIAN_API_KEY")
        ? { configured: true, message: "Set in server environment" }
        : { configured: false, message: "No GUARDIAN_API_KEY in server env" };
    case "newsapi":
      return envString(env, "NEWSAPI_KEY")
        ? { configured: true, message: "Set in server environment" }
        : { configured: false, message: "No NEWSAPI_KEY in server env" };
    case "opensubtitles":
      return envString(env, "OPENSUBTITLES_API_KEY")
        ? { configured: true, message: "Set in server environment" }
        : { configured: false, message: "No OPENSUBTITLES_API_KEY in server env" };
    case "youtube":
      return envString(env, "YOUTUBE_API_KEY")
        ? { configured: true, message: "Set in server environment" }
        : { configured: false, message: "No YOUTUBE_API_KEY in server env" };
    default:
      return { configured: false, message: "No fallback configured" };
  }
}

