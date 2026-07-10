import { Hono } from "hono";
import { envString } from "./env";
import { apiError, apiSuccess } from "./http";
import { requireAuth, type AppVariables } from "./session";

type PersonPayload = {
  id: string;
  name: string;
  biography: string | null;
  profilePath: string | null;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  knownForDepartment: string | null;
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
      const cached = await c.env.DB.prepare("SELECT response_json, expires_at FROM provider_cache WHERE provider = 'tmdb' AND cache_key = ?")
        .bind(cacheKey)
        .first<{ response_json: string; expires_at: string }>()
        .catch((error) => {
          console.error(`Person cache read failed for ${id}:`, error);
          return null;
        });
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        return c.json(apiSuccess(JSON.parse(cached.response_json) as PersonPayload));
      }

      const url = new URL(`https://api.themoviedb.org/3/person/${encodeURIComponent(id)}`);
      url.searchParams.set("api_key", key);
      url.searchParams.set("append_to_response", "combined_credits,external_ids");
      const response = await fetch(url.toString());
      if (!response.ok) {
        if (cached) return c.json(apiSuccess(JSON.parse(cached.response_json) as PersonPayload));
        return apiError(c, 503, "server_error", "Person details could not be refreshed right now.");
      }
      const data = await response.json() as any;
      const payload: PersonPayload = {
        id: String(data.id),
        name: data.name ?? "Unknown person",
        biography: data.biography || null,
        profilePath: tmdbImage(data.profile_path, "w342"),
        birthday: data.birthday || null,
        deathday: data.deathday || null,
        placeOfBirth: data.place_of_birth || null,
        knownForDepartment: data.known_for_department || null,
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
      c.executionCtx.waitUntil(c.env.DB.prepare(`INSERT INTO provider_cache (id, provider, cache_key, response_json, status, fetched_at, expires_at, attribution_json)
        VALUES (?, 'tmdb', ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(provider, cache_key) DO UPDATE SET response_json=excluded.response_json, status=excluded.status, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at`)
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
  return String(path).startsWith("http") ? String(path) : `https://image.tmdb.org/t/p/${size}${path}`;
}

function yearFromDate(value: string | null) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}
