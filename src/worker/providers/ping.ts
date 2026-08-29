import { externalApiEndpoints } from "@shared/constants";
import { getProviderCatalogItem } from "@shared/providers-config";
import { providerCredential, recordProviderValidation } from "./provider-credentials";
import { tmdbPing } from "./tmdb";
import { tvmazePing, wikidataPing } from "./tvmaze-wikidata";
import { googleBooksPing } from "./google-books";
import { openLibraryPing } from "./open-library";
import { igdbPing, rawgPing } from "./igdb-rawg";
import {
  coverArtArchivePing,
  listenBrainzPing,
  lrclibPing,
  musicBrainzPing,
  theAudioDbPing,
} from "./music";
import { gdeltPing, guardianPing, newsApiPing } from "./news";
import { openSubtitlesPing } from "./subtitles";
import { jikanPing } from "./jikan";
import { youtubePing } from "./youtube";

export type PingResult = {
  provider: string;
  ok: boolean;
  status: "healthy" | "rate_limited" | "invalid" | "unavailable" | "disabled" | "not_configured";
  latencyMs: number;
  message: string;
};

export async function pingProvider(env: Env, providerCode: string, userId?: string | null): Promise<PingResult> {
  const catalogItem = getProviderCatalogItem(providerCode);
  if (!catalogItem) {
    return {
      provider: providerCode,
      ok: false,
      status: "unavailable",
      latencyMs: 0,
      message: `Unknown provider '${providerCode}'.`,
    };
  }

  const start = performance.now();
  let result: { ok: boolean; message: string; status?: PingResult["status"] };

  try {
    switch (providerCode) {
      case "tmdb":
        result = await tmdbPing(env, userId);
        break;
      case "tvmaze":
        result = await tvmazePing(env);
        break;
      case "wikidata":
        result = await wikidataPing(env);
        break;
      case "thetvdb": {
        const key = await providerCredential(env, { userId, provider: "thetvdb", key: "THETVDB_API_KEY" });
        const pin = await providerCredential(env, { userId, provider: "thetvdb", key: "THETVDB_USER_PIN" });
        if (!key) {
          result = { ok: false, status: "not_configured", message: "No TheTVDB project API key configured." };
        } else {
          try {
            const res = await fetch(`${externalApiEndpoints.theTvDbApi}/login`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({ apikey: key, ...(pin ? { pin } : {}) }),
            });
            const payload = res.ok ? await res.json().catch(() => null) as { data?: { token?: unknown } } | null : null;
            const tokenReceived = typeof payload?.data?.token === "string" && payload.data.token.length > 0;
            result = {
              ok: res.ok && tokenReceived,
              status: res.ok && tokenReceived ? "healthy" : "invalid",
              message: res.ok && tokenReceived ? "TheTVDB credentials verified and active." : res.ok ? "TheTVDB returned an invalid login response." : `TheTVDB returned HTTP ${res.status}.`,
            };
          } catch (e: any) {
            result = { ok: false, status: "unavailable", message: e?.message || "Failed to reach TheTVDB." };
          }
        }
        break;
      }
      case "jikan":
        result = await jikanPing(env, userId);
        break;
      case "anilist": {
        try {
          const res = await fetch(externalApiEndpoints.aniListGraphQL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ query: "{ Page(page: 1, perPage: 1) { media(type: ANIME) { id } } }" }),
          });
          result = {
            ok: res.ok,
            status: res.ok ? "healthy" : (res.status === 429 ? "rate_limited" : "unavailable"),
            message: res.ok ? "AniList GraphQL service reachable." : `AniList returned HTTP ${res.status}.`,
          };
        } catch (e: any) {
          result = { ok: false, status: "unavailable", message: e?.message || "Failed to reach AniList." };
        }
        break;
      }
      case "googlebooks":
        result = await googleBooksPing(env, userId);
        break;
      case "openlibrary":
        result = await openLibraryPing(env, userId);
        break;
      case "igdb":
        result = await igdbPing(env, userId);
        break;
      case "rawg":
        result = await rawgPing(env, userId);
        break;
      case "musicbrainz":
        result = await musicBrainzPing(env);
        break;
      case "coverartarchive":
        result = await coverArtArchivePing(env);
        break;
      case "listenbrainz":
        result = await listenBrainzPing(env, userId);
        break;
      case "theaudiodb":
        result = await theAudioDbPing(env, userId);
        break;
      case "lrclib":
        result = await lrclibPing(env);
        break;
      case "gdelt":
        result = await gdeltPing(env);
        break;
      case "guardian":
        result = await guardianPing(env, userId);
        break;
      case "newsapi":
        result = await newsApiPing(env, userId);
        break;
      case "opensubtitles":
        result = await openSubtitlesPing(env, userId);
        break;
      case "youtube":
        result = await youtubePing(env, userId);
        break;
      default:
        result = { ok: false, status: "unavailable", message: "Ping not supported for this provider." };
    }
  } catch (err: any) {
    result = { ok: false, status: "unavailable", message: err?.message || "Ping failed." };
  }

  const elapsed = Math.round(performance.now() - start);

  const finalStatus: PingResult["status"] = result.status
    ?? (result.ok ? "healthy" : (result.message.toLowerCase().includes("not configured") ? "not_configured" : "invalid"));

  if (userId) {
    await recordProviderValidation(env, userId, providerCode, finalStatus, result.ok);
  }

  return {
    provider: providerCode,
    ok: result.ok,
    status: finalStatus,
    latencyMs: elapsed,
    message: result.message,
  };
}
