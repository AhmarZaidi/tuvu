import { externalApiEndpoints } from "@shared/constants";
import { providerCredential } from "./provider-credentials";
import { cachedJson } from "./provider-cache-service";
import { isProviderResult, numberOrString, stringValue } from "./normalizers";
import { providerAttributions, type ProviderResult } from "./types";

/**
 * Google Books — Book editions, page counts, descriptions, covers.
 */
export async function googleBooksPing(env: Env, userId?: string | null): Promise<{ ok: boolean; message: string }> {
  const key = await providerCredential(env, { userId, provider: "googlebooks", key: "GOOGLE_BOOKS_API_KEY" });
  if (!key) {
    return { ok: false, message: "No Google Books API key configured." };
  }
  const url = `${externalApiEndpoints.googleBooksApi}/volumes?q=isbn:9780140328721&maxResults=1&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      return { ok: true, message: "Google Books API connected successfully." };
    }
    if (res.status === 400 || res.status === 403) {
      return { ok: false, message: `Invalid Google Books API key (HTTP ${res.status}).` };
    }
    return { ok: false, message: `Google Books responded with HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to reach Google Books API." };
  }
}

export async function googleBooksSearch(env: Env, query: string, limit = 8, userId?: string | null): Promise<ProviderResult[]> {
  const key = await providerCredential(env, { userId, provider: "googlebooks", key: "GOOGLE_BOOKS_API_KEY" });
  if (!key) return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = `${externalApiEndpoints.googleBooksApi}/volumes?q=${encodeURIComponent(trimmed)}&maxResults=${limit}&key=${encodeURIComponent(key)}`;
  const data = await cachedJson<{ items?: Array<{ id: string; volumeInfo?: Record<string, unknown> }> }>(
    env,
    "googlebooks",
    `search:${trimmed.toLowerCase()}`,
    3600 * 6,
    () => fetch(url)
  );

  return (data?.items ?? [])
    .slice(0, limit)
    .map((item) => {
      const info = item.volumeInfo;
      if (!info) return null;
      const title = stringValue(info.title);
      if (!title) return null;

      const publishedDate = stringValue(info.publishedDate);
      const year = publishedDate ? Number.parseInt(publishedDate.slice(0, 4), 10) : null;
      const imageLinks = info.imageLinks as { thumbnail?: string; smallThumbnail?: string } | undefined;
      const posterPath = imageLinks?.thumbnail?.replace("http://", "https://") ?? imageLinks?.smallThumbnail?.replace("http://", "https://") ?? null;

      const result: ProviderResult = {
        provider: "googlebooks",
        providerId: item.id,
        type: "book",
        title,
        overview: stringValue(info.description) ?? null,
        posterPath,
        backdropPath: null,
        releaseDate: publishedDate,
        year: Number.isFinite(year) ? year : null,
        sourceUrl: stringValue(info.infoLink) ?? `https://books.google.com/books?id=${item.id}`,
        rating: typeof info.averageRating === "number" ? info.averageRating * 2 : null,
        popularity: null,
        attribution: providerAttributions.googlebooks,
        extendedDataJson: JSON.stringify({
          pageCount: typeof info.pageCount === "number" ? info.pageCount : null,
          authors: Array.isArray(info.authors) ? info.authors : [],
          publisher: stringValue(info.publisher) ?? null,
          industryIdentifiers: Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [],
        }),
      };
      return result;
    })
    .filter(isProviderResult);
}
