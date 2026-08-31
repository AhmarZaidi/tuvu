import { Hono } from "hono";
import { apiError, apiSuccess } from "./http";
import { requireAuth, type AppVariables } from "./session";
import { anilistCharacterDetails } from "./providers/anilist";

export type CharacterPayload = {
  id: string;
  name: string;
  nativeName: string | null;
  alternativeNames: string[];
  image: string | null;
  description: string | null;
  gender: string | null;
  age: string | null;
  dateOfBirth: string | null;
  media: Array<{
    id: string;
    title: string;
    posterPath: string | null;
    format: string | null;
    type: string;
  }>;
  voiceActors?: Array<{
    id: string;
    name: string;
    language: string;
    image: string | null;
  }>;
};

export function createCharacterRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  router.get("/:id", requireAuth(), async (c) => {
    try {
      const id = c.req.param("id");
      if (!id) return apiError(c, 400, "validation_failed", "Character ID is required.");

      const cacheKey = `char:${id}`;
      if (c.env.DB) {
        const cached = await c.env.DB.prepare(
          "SELECT response_json, expires_at FROM provider_cache WHERE (provider_code = 'anilist' OR provider = 'anilist') AND cache_key = ?"
        )
          .bind(cacheKey)
          .first<{ response_json: string; expires_at: string }>()
          .catch(() => null);

        if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
          return c.json(apiSuccess(JSON.parse(cached.response_json) as CharacterPayload));
        }
      }

      // Query AniList
      let charData = await anilistCharacterDetails(c.env, id, c.get("auth")?.user?.id).catch(() => null);

      // If AniList didn't find it or failed, try Jikan character endpoint
      if (!charData) {
        try {
          const jikanRes = await fetch(`https://api.jikan.moe/v4/characters/${encodeURIComponent(id)}/full`);
          if (jikanRes.ok) {
            const jikanJson = (await jikanRes.json()) as any;
            const jData = jikanJson.data;
            if (jData) {
              const payload: CharacterPayload = {
                id: String(jData.mal_id),
                name: jData.name,
                nativeName: jData.name_kanji || null,
                alternativeNames: jData.nicknames || [],
                image: jData.images?.jpg?.image_url || null,
                description: jData.about || null,
                gender: null,
                age: null,
                dateOfBirth: null,
                media: (jData.anime || []).slice(0, 12).map((a: any) => ({
                  id: String(a.anime?.mal_id),
                  title: a.anime?.title,
                  posterPath: a.anime?.images?.jpg?.large_image_url || a.anime?.images?.jpg?.image_url || null,
                  format: "Anime",
                  type: "anime",
                })),
                voiceActors: (jData.voices || []).slice(0, 8).map((v: any) => ({
                  id: String(v.person?.mal_id),
                  name: v.person?.name,
                  language: v.language,
                  image: v.person?.images?.jpg?.image_url || null,
                })),
              };

              if (c.env.DB) {
                const expiresAt = new Date(Date.now() + 604800000).toISOString();
                await c.env.DB.prepare(
                  `INSERT INTO provider_cache (id, provider_code, cache_key, response_json, http_status, fetched_at, expires_at)
                   VALUES (?, 'jikan', ?, ?, 200, datetime('now'), ?)
                   ON CONFLICT(provider_code, cache_key) DO UPDATE SET response_json = excluded.response_json, expires_at = excluded.expires_at`
                )
                  .bind(`pc_jikan_char_${id}`, cacheKey, JSON.stringify(payload), expiresAt)
                  .run()
                  .catch(() => {});
              }

              return c.json(apiSuccess(payload));
            }
          }
        } catch {}
      }

      if (!charData) {
        return apiError(c, 404, "not_found", "Character details could not be found.");
      }

      const cleanDesc = (charData.description || "")
        .replace(/~![\s\S]*?!~/g, "") // strip spoiler blocks
        .replace(/<[^>]*>/g, "")
        .trim();

      const dob = charData.dateOfBirth?.year
        ? `${charData.dateOfBirth.year}-${String(charData.dateOfBirth.month || 1).padStart(2, "0")}-${String(charData.dateOfBirth.day || 1).padStart(2, "0")}`
        : null;

      const payload: CharacterPayload = {
        id: String(charData.id),
        name: charData.name?.full || "Unknown Character",
        nativeName: charData.name?.native || null,
        alternativeNames: charData.name?.alternative || [],
        image: charData.image?.large || null,
        description: cleanDesc || null,
        gender: charData.gender || null,
        age: charData.age || null,
        dateOfBirth: dob,
        media: (charData.media?.nodes || []).slice(0, 12).map((m: any) => ({
          id: String(m.id),
          title: m.title?.english || m.title?.userPreferred || m.title?.romaji,
          posterPath: m.coverImage?.large || null,
          format: m.format || "Anime",
          type: "anime",
        })),
      };

      if (c.env.DB) {
        const expiresAt = new Date(Date.now() + 604800000).toISOString();
        await c.env.DB.prepare(
          `INSERT INTO provider_cache (id, provider_code, cache_key, response_json, http_status, fetched_at, expires_at)
           VALUES (?, 'anilist', ?, ?, 200, datetime('now'), ?)
           ON CONFLICT(provider_code, cache_key) DO UPDATE SET response_json = excluded.response_json, expires_at = excluded.expires_at`
        )
          .bind(`pc_anilist_char_${id}`, cacheKey, JSON.stringify(payload), expiresAt)
          .run()
          .catch(() => {});
      }

      return c.json(apiSuccess(payload));
    } catch (err: any) {
      console.error("Character route error:", err);
      return apiError(c, 500, "server_error", "Failed to fetch character details.");
    }
  });

  return router;
}
