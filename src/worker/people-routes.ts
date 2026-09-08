import { Hono } from "hono";
import { externalApiEndpoints } from "@shared/constants";
import { envString } from "./env";
import { apiError, apiSuccess } from "./http";
import { requireAuth, type AppVariables } from "./session";
import { tmdbFetch } from "./providers/tmdb";
import { anilistStaffDetails } from "./providers/anilist";

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
      const rawId = c.req.param("id");
      const providerParam = c.req.query("provider");
      const nameParam = c.req.query("name");
      const cleanId = rawId.replace(/^(anilist|tmdb|mal):/, "");

      const cacheKey = `person:${rawId}`;
      const cached = await c.env.DB.prepare("SELECT response_json, expires_at FROM provider_cache WHERE provider_code IN ('tmdb', 'anilist') AND cache_key = ?")
        .bind(cacheKey)
        .first<{ response_json: string; expires_at: string }>()
        .catch((error) => {
          console.error(`Person cache read failed for ${rawId}:`, error);
          return null;
        });
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        return c.json(apiSuccess(JSON.parse(cached.response_json) as PersonPayload));
      }

      // If explicitly anilist or non-numeric or provider=anilist, try AniList first
      if (rawId.startsWith("anilist:") || providerParam === "anilist" || !/^\d+$/.test(cleanId)) {
        const staff = await anilistStaffDetails(c.env, cleanId || nameParam || rawId, c.get("user")?.id).catch(() => null);
        if (staff) {
          const payload = mapAnilistStaffPayload(staff);
          savePersonCache(c, cacheKey, payload, "anilist");
          return c.json(apiSuccess(payload));
        }
      }

      const key = envString(c.env, "TMDB_API_KEY");
      if (key && /^\d+$/.test(cleanId)) {
        const response = await tmdbFetch(c.env, `person/${encodeURIComponent(cleanId)}`, key, {
          append_to_response: "combined_credits,external_ids,images",
        }, c.get("user")?.id).catch(() => null);

        if (response && response.ok) {
          const data = await response.json() as any;

          // If a name was expected (e.g. from anime cast) and TMDB returned a completely different person,
          // it means this ID belongs to AniList/MAL, not TMDB.
          const nameMismatch = nameParam && data.name && !isNameMatch(data.name, nameParam);

          if (!nameMismatch) {
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

            savePersonCache(c, cacheKey, payload, "tmdb");
            return c.json(apiSuccess(payload));
          }
        }
      }

      // If TMDB failed, was 404, or had a name mismatch, fallback to AniList Staff lookup
      const staffFallback = await anilistStaffDetails(c.env, cleanId || nameParam || rawId, c.get("user")?.id).catch(() => null);
      if (staffFallback) {
        const payload = mapAnilistStaffPayload(staffFallback);
        savePersonCache(c, cacheKey, payload, "anilist");
        return c.json(apiSuccess(payload));
      }

      if (nameParam) {
        const staffByName = await anilistStaffDetails(c.env, nameParam, c.get("user")?.id).catch(() => null);
        if (staffByName) {
          const payload = mapAnilistStaffPayload(staffByName);
          savePersonCache(c, cacheKey, payload, "anilist");
          return c.json(apiSuccess(payload));
        }
      }

      if (cached) return c.json(apiSuccess(JSON.parse(cached.response_json) as PersonPayload));
      return apiError(c, 404, "not_found", "Person details could not be found.");
    } catch (error) {
      console.error("Person profile failed:", error);
      return apiError(c, 503, "server_error", "Person details could not be loaded right now.");
    }
  });

  return router;
}

function isNameMatch(a: string, b: string): boolean {
  const normA = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normB = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normA || !normB) return false;
  return normA.includes(normB) || normB.includes(normA);
}

function mapAnilistStaffPayload(staff: any): PersonPayload {
  const cleanBio = (staff.description || "")
    .replace(/~![\s\S]*?!~/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();

  const dob = staff.dateOfBirth?.year
    ? `${staff.dateOfBirth.year}-${String(staff.dateOfBirth.month || 1).padStart(2, "0")}-${String(staff.dateOfBirth.day || 1).padStart(2, "0")}`
    : null;

  const dod = staff.dateOfDeath?.year
    ? `${staff.dateOfDeath.year}-${String(staff.dateOfDeath.month || 1).padStart(2, "0")}-${String(staff.dateOfDeath.day || 1).padStart(2, "0")}`
    : null;

  const primaryImage = staff.image?.large || staff.image?.medium || null;
  const images = primaryImage ? [primaryImage] : [];

  const credits = (staff.characters?.edges || []).slice(0, 24).map((edge: any) => {
    const char = edge.node;
    const media = char?.media?.nodes?.[0];
    return {
      id: String(media?.id || char?.id),
      type: (media?.format === "MOVIE" ? "movie" : "show") as "movie" | "show",
      title: media?.title?.english || media?.title?.userPreferred || media?.title?.romaji || "Untitled",
      character: char?.name?.full || null,
      posterPath: media?.coverImage?.large || null,
      year: media?.startDate?.year || null,
    };
  });

  return {
    id: String(staff.id),
    name: staff.name?.full || "Unknown Staff",
    biography: cleanBio || null,
    profilePath: primaryImage,
    images,
    birthday: dob,
    deathday: dod,
    placeOfBirth: staff.homeTown || null,
    knownForDepartment: staff.primaryOccupations?.[0] || "Voice Acting",
    alsoKnownAs: [staff.name?.native, ...(staff.name?.alternative || [])].filter(Boolean),
    credits,
  };
}

function savePersonCache(c: any, cacheKey: string, payload: PersonPayload, providerCode: string) {
  if (!c.env.DB) return;
  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      `INSERT INTO provider_cache (id, provider_code, cache_key, response_json, http_status, fetched_at, expires_at)
       VALUES (?, ?, ?, ?, 200, ?, ?)
       ON CONFLICT(provider_code, cache_key) DO UPDATE SET response_json=excluded.response_json, http_status=excluded.http_status, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at`
    )
      .bind(`pc_${providerCode}_${payload.id}`, providerCode, cacheKey, JSON.stringify(payload), now.toISOString(), expires.toISOString())
      .run()
      .catch((error: any) => console.error(`Person cache write failed for ${payload.id}:`, error))
  );
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
