import { envString } from "../env";
import type { ProviderName } from "./types";

type CredentialLookup = {
  userId?: string | null;
  provider: ProviderName;
  key: string;
};

export async function providerCredential(env: Env, lookup: CredentialLookup): Promise<string | null> {
  const userCredential = await userProviderCredential(env, lookup);
  if (userCredential) return userCredential;
  return envString(env, lookup.key) ?? null;
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
