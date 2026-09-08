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
          description
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
              voiceActors {
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

export async function anilistCharacterDetails(env: Env, idOrSearch: number | string, userId?: string | null) {
  const isNumeric = /^\d+$/.test(String(idOrSearch));
  const variables = isNumeric ? { id: Number(idOrSearch) } : { search: String(idOrSearch) };
  const graphqlQuery = `
    query ($id: Int, $search: String) {
      Character(id: $id, search: $search) {
        id
        name {
          full
          native
          alternative
          alternativeSpoiler
        }
        image {
          large
          medium
        }
        description
        gender
        age
        dateOfBirth {
          year
          month
          day
        }
        bloodType
        media(sort: POPULARITY_DESC, perPage: 16) {
          edges {
            node {
              id
              title {
                english
                romaji
                userPreferred
              }
              coverImage {
                large
              }
              format
              type
              startDate {
                year
              }
            }
            voiceActors {
              id
              name {
                full
              }
              languageV2
              image {
                large
              }
            }
          }
        }
      }
    }
  `;

  const cacheKey = `character:${String(idOrSearch).toLowerCase()}`;
  const data = await cachedJson<{ data?: { Character?: any } }>(
    env,
    "anilist",
    cacheKey,
    providerTtls.jikanCharacters || 604800,
    () =>
      fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query: graphqlQuery, variables }),
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

  const cleanOverview = record.description
    ? record.description.replace(/<[^>]*>/g, "").replace(/\n+/g, " ").trim()
    : null;

  const characters: any[] = [];
  const japaneseCast: any[] = [];
  const dubCast: any[] = [];

  for (const edge of record.characters?.edges || []) {
    const node = edge.node;
    if (!node?.id || !node?.name?.full) continue;

    const jaVa = edge.voiceActors?.find((va: any) => va.languageV2 === "Japanese" || !va.languageV2);
    const enVa = edge.voiceActors?.find((va: any) => va.languageV2 === "English");

    const charItem = {
      id: String(node.id),
      name: node.name.full,
      nativeName: node.name.native || null,
      image: node.image?.large || null,
      role: edge.role === "MAIN" ? "Main" : "Supporting",
      subVoiceActor: jaVa ? { id: String(jaVa.id), name: jaVa.name?.full, image: jaVa.image?.large } : null,
      dubVoiceActor: enVa ? { id: String(enVa.id), name: enVa.name?.full, image: enVa.image?.large } : null,
    };
    characters.push(charItem);

    if (jaVa) {
      japaneseCast.push({
        id: String(jaVa.id),
        name: jaVa.name?.full || "Unknown VA",
        role: node.name.full,
        profilePath: jaVa.image?.large || node.image?.large || null,
      });
    }

    if (enVa) {
      dubCast.push({
        id: String(enVa.id),
        name: enVa.name?.full || "Unknown VA",
        role: node.name.full,
        profilePath: enVa.image?.large || node.image?.large || null,
      });
    }
  }

  const hasDub = dubCast.length > 0;

  return {
    provider: "anilist",
    providerId: id,
    type: "anime",
    title,
    overview: cleanOverview,
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
      hasDub,
      originalLanguage: "Japanese",
      anime: {
        anilistId: Number(id),
        malId: record.idMal ? Number(record.idMal) : null,
        originalLanguage: "Japanese",
        studios,
        status: record.status,
        episodesCount: record.episodes,
        format: record.format,
        hasDub,
        characters,
        japaneseCast,
        dubCast,
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

export async function anilistFetchMediaByIdMal(env: Env, idMal: number, userId?: string | null) {
  const graphqlQuery = `
    query ($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        format
        status
        description
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
        characters(perPage: 16, sort: ROLE) {
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
            voiceActors {
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
  `;

  const data = await cachedJson<{ data?: { Media?: any } }>(
    env,
    "anilist",
    `media:mal:${idMal}`,
    providerTtls.jikanSearch || 86400,
    () =>
      fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query: graphqlQuery, variables: { idMal } }),
      })
  );

  return data?.data?.Media ?? null;
}

export async function anilistStaffDetails(env: Env, idOrSearch: string | number, userId?: string | null) {
  const isNumeric = /^\d+$/.test(String(idOrSearch));
  const variables = isNumeric ? { id: Number(idOrSearch) } : { search: String(idOrSearch) };
  const query = `
    query ($id: Int, $search: String) {
      Staff(id: $id, search: $search) {
        id
        name {
          full
          native
          alternative
        }
        image {
          large
          medium
        }
        description
        gender
        age
        dateOfBirth {
          year
          month
          day
        }
        dateOfDeath {
          year
          month
          day
        }
        homeTown
        primaryOccupations
        characters(sort: FAVOURITES_DESC, perPage: 24) {
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
              media(sort: POPULARITY_DESC, perPage: 1) {
                nodes {
                  id
                  title {
                    english
                    romaji
                    userPreferred
                  }
                  coverImage {
                    large
                  }
                  format
                  startDate {
                    year
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const cacheKey = `staff:${String(idOrSearch).toLowerCase()}`;
  const data = await cachedJson<{ data?: { Staff?: any } }>(
    env,
    "anilist",
    cacheKey,
    86400 * 7,
    () =>
      fetch(ANILIST_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query, variables }),
      })
  );

  return data?.data?.Staff ?? null;
}


