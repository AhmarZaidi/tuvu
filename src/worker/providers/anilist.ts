import { externalApiEndpoints } from "@shared/constants";
import { cachedJson } from "./provider-cache-service";
import { providerTtls } from "./provider-ttls";
import { isProviderResult, normalizeDate, numberOrString, numberValue, stringValue, yearFromDate } from "./normalizers";
import { providerAttributions, type ProviderResult } from "./types";

const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";

export async function anilistPing(env: Env, userId?: string | null): Promise<{ ok: boolean; message: string }> {
  const query = `query { Page(page: 1, perPage: 1) { media(type: ANIME) { id } } }`;
  try {
    const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (res.ok) {
      return { ok: true, message: "AniList GraphQL API online." };
    }
    return { ok: false, message: `AniList returned HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach AniList endpoint." };
  }
}

export async function anilistSearchProvider(env: Env, query: string, limit = 8, userId?: string | null): Promise<ProviderResult[]> {
  const results = await anilistSearchAnime(env, query, limit, userId);
  return results.map(normalizeAnilistAnime).filter(isProviderResult);
}

export async function anilistSearchAnime(env: Env, query: string, limit = 8, userId?: string | null) {
  const graphqlQuery = `
    query ($search: String, $limit: Int) {
      Page(page: 1, perPage: $limit) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          format
          status
          episodes
          duration
          seasonYear
          startDate {
            year
            month
            day
          }
          coverImage {
            large
            extraLarge
          }
          bannerImage
          genres
          averageScore
          popularity
          studios(isMain: true) {
            nodes {
              name
            }
          }
          characters(perPage: 12, sort: ROLE) {
            edges {
              role
              node {
                id
                name {
                  full
                  native
                }
                image {
                  large
                }
              }
              voiceActors(language: JAPANESE) {
                id
                name {
                  full
                }
                image {
                  large
                }
                languageV2
              }
            }
          }
        }
      }
    }
  `;

  const data = await cachedJson<{ data?: { Page?: { media?: any[] } } }>(
    env,
    "anilist",
    `search:${query.toLowerCase()}:${limit}`,
    providerTtls.jikanSearch || 86400,
    () =>
      fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query: graphqlQuery, variables: { search: query, limit } }),
      })
  );

  return data?.data?.Page?.media ?? [];
}

export async function anilistTrendingAnime(env: Env, limit = 20, userId?: string | null) {
  const graphqlQuery = `
    query ($limit: Int) {
      Page(page: 1, perPage: $limit) {
        media(type: ANIME, sort: TRENDING_DESC) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          format
          status
          episodes
          coverImage {
            large
            extraLarge
          }
          bannerImage
          averageScore
          popularity
          genres
        }
      }
    }
  `;

  const data = await cachedJson<{ data?: { Page?: { media?: any[] } } }>(
    env,
    "anilist",
    `trending:${limit}`,
    providerTtls.tmdbList || 43200,
    () =>
      fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query: graphqlQuery, variables: { limit } }),
      })
  );

  return (data?.data?.Page?.media ?? []).map(normalizeAnilistAnime).filter(isProviderResult);
}

export async function anilistCharacterDetails(env: Env, characterId: number | string, userId?: string | null) {
  const graphqlQuery = `
    query ($id: Int) {
      Character(id: $id) {
        id
        name {
          full
          native
          alternative
        }
        image {
          large
        }
        description
        gender
        age
        dateOfBirth {
          year
          month
          day
        }
        media(type: ANIME, perPage: 12, sort: POPULARITY_DESC) {
          nodes {
            id
            title {
              romaji
              english
              userPreferred
            }
            coverImage {
              large
            }
            format
            type
          }
        }
      }
    }
  `;

  const data = await cachedJson<{ data?: { Character?: any } }>(
    env,
    "anilist",
    `character:${characterId}`,
    providerTtls.jikanCharacters || 604800,
    () =>
      fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query: graphqlQuery, variables: { id: Number(characterId) } }),
      })
  );

  return data?.data?.Character ?? null;
}

function normalizeAnilistAnime(record: any): ProviderResult | null {
  if (!record || !record.id) return null;
  const id = String(record.id);
  const title = stringValue(record.title?.english) || stringValue(record.title?.romaji) || stringValue(record.title?.native);
  if (!title) return null;

  const startDate = record.startDate;
  const releaseDate = startDate?.year && startDate?.month && startDate?.day
    ? `${startDate.year}-${String(startDate.month).padStart(2, "0")}-${String(startDate.day).padStart(2, "0")}`
    : startDate?.year
      ? `${startDate.year}-01-01`
      : null;

  const poster = record.coverImage?.extraLarge || record.coverImage?.large || null;
  const backdrop = record.bannerImage || poster;
  const isMovie = record.format === "MOVIE";
  const studios = (record.studios?.nodes || []).map((s: any) => ({ name: s.name }));

  const characters = (record.characters?.edges || []).map((edge: any) => {
    const node = edge.node;
    const jaVa = edge.voiceActors?.find((va: any) => va.languageV2 === "Japanese" || !va.languageV2);
    return {
      id: node?.id ? String(node.id) : null,
      name: node?.name?.full,
      nativeName: node?.name?.native,
      image: node?.image?.large,
      role: edge.role === "MAIN" ? "Main" : "Supporting",
      subVoiceActor: jaVa ? { id: String(jaVa.id), name: jaVa.name?.full, image: jaVa.image?.large } : null,
    };
  }).filter((c: any) => c.id && c.name);

  return {
    provider: "anilist",
    providerId: id,
    type: "anime",
    title,
    overview: null,
    posterPath: poster,
    backdropPath: backdrop,
    releaseDate,
    year: yearFromDate(releaseDate) ?? record.seasonYear ?? null,
    sourceUrl: `https://anilist.co/anime/${id}`,
    rating: record.averageScore ? record.averageScore / 10 : null,
    popularity: numberValue(record.popularity),
    attribution: providerAttributions.anilist || { provider: "anilist", label: "AniList", url: "https://anilist.co" },
    extendedDataJson: JSON.stringify({
      category: "anime",
      animeFormat: isMovie ? "movie" : "series",
      originalLanguage: "Japanese",
      anime: {
        anilistId: Number(id),
        malId: record.idMal ? Number(record.idMal) : null,
        originalLanguage: "Japanese",
        studios,
        status: record.status,
        episodesCount: record.episodes,
        format: record.format,
        characters,
        titles: {
          english: record.title?.english,
          romaji: record.title?.romaji,
          native: record.title?.native,
        },
      },
      genres: (record.genres || []).map((name: string) => ({ name })),
    }),
  };
}
