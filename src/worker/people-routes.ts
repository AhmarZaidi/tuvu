import { Hono } from "hono";
import { externalApiEndpoints } from "@shared/constants";
import { envString } from "./env";
import { apiError, apiSuccess } from "./http";
import { requireAuth, type AppVariables } from "./session";
import { tmdbFetch } from "./providers/tmdb";

type PersonPayload = {
  id: string;
  name: string;
  biography: string | null;
  profilePath: string | null;
  images: string[];
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  knownForDepartment: string | null;
  alsoKnownAs?: string[];
  imdbId?: string | null;
  homepage?: string | null;
  credits: Array<{ id: string; type: "movie" | "show"; title: string; character: string | null; posterPath: string | null; year: number | null }>;
};

export function createPeopleRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  router.get("/:id", requireAuth(), async (c) => {
    try {
      if (!c.env.DB) return apiError(c, 503, "server_error", "Person profiles are temporarily unavailable.");
      const id = c.req.param("id");
      if (!/^\d+$/.test(id)) return apiError(c, 404, "not_found", "This person profile is not available yet.");
      const key = envString(c.env, "TMDB_API_KEY");
      if (!key) return apiError(c, 503, "server_error", "Person profiles are temporarily unavailable.");

      const cacheKey = `person:${id}`;
      const cached = await c.env.DB.prepare("SELECT response_json, expires_at FROM provider_cache WHERE (provider_code = 'tmdb' OR provider = 'tmdb') AND cache_key = ?")
        .bind(cacheKey)
        .first<{ response_json: string; expires_at: string }>()
        .catch((error) => {
          console.error(`Person cache read failed for ${id}:`, error);
          return null;
        });
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        return c.json(apiSuccess(JSON.parse(cached.response_json) as PersonPayload));
      }

      const response = await tmdbFetch(c.env, `person/${encodeURIComponent(id)}`, key, {
        append_to_response: "combined_credits,external_ids,images",
      }, c.get("user")?.id);
      if (!response.ok) {
        if (cached) return c.json(apiSuccess(JSON.parse(cached.response_json) as PersonPayload));
        return apiError(c, 503, "server_error", "Person details could not be refreshed right now.");
      }
      const data = await response.json() as any;
      const primaryProfile = tmdbImage(data.profile_path, "h632") || tmdbImage(data.profile_path, "w342");
      const profileImages: string[] = (data.images?.profiles || [])
        .slice(0, 12)
        .map((img: any) => tmdbImage(img.file_path, "h632") || tmdbImage(img.file_path, "w342"))
        .filter((url: string | null): url is string => Boolean(url));
      if (primaryProfile && !profileImages.includes(primaryProfile)) {
        profileImages.unshift(primaryProfile);
      }

      const payload: PersonPayload = {
        id: String(data.id),
        name: data.name ?? "Unknown person",
        biography: data.biography || null,
        profilePath: primaryProfile || profileImages[0] || null,
        images: profileImages,
        birthday: data.birthday || null,
        deathday: data.deathday || null,
        placeOfBirth: data.place_of_birth || null,
        knownForDepartment: data.known_for_department || null,
        alsoKnownAs: data.also_known_as || [],
        imdbId: data.imdb_id || data.external_ids?.imdb_id || null,
        homepage: data.homepage || null,
        credits: (data.combined_credits?.cast || [])
          .filter((credit: any) => credit.media_type === "movie" || credit.media_type === "tv")
          .slice(0, 24)
          .map((credit: any) => ({
            id: String(credit.id),
            type: credit.media_type === "movie" ? "movie" : "show",
            title: credit.title ?? credit.name ?? "Untitled",
            character: credit.character || null,
            posterPath: tmdbImage(credit.poster_path, "w342"),
            year: yearFromDate(credit.release_date ?? credit.first_air_date ?? null),
          })),
      };

      const now = new Date();
      const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      c.executionCtx.waitUntil(c.env.DB.prepare(`INSERT INTO provider_cache (id, provider_code, cache_key, response_json, http_status, fetched_at, expires_at)
        VALUES (?, 'tmdb', ?, ?, ?, ?, ?)
        ON CONFLICT(provider_code, cache_key) DO UPDATE SET response_json=excluded.response_json, http_status=excluded.http_status, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at`)
        .bind(`pc_tmdb_person_${id}`, cacheKey, JSON.stringify(payload), response.status, now.toISOString(), expires.toISOString())
        .run()
        .catch((error) => console.error(`Person cache write failed for ${id}:`, error)));

      return c.json(apiSuccess(payload));
    } catch (error) {
      console.error("Person profile failed:", error);
      return apiError(c, 503, "server_error", "Person details could not be loaded right now.");
    }
  });

  return router;
}

function tmdbImage(path: string | null | undefined, size: string) {
  if (!path) return null;
  return String(path).startsWith("http") ? String(path) : `${externalApiEndpoints.tmdbImage}/${size}${path}`;
}

function yearFromDate(value: string | null) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}
