import { externalApiEndpoints } from "@shared/constants";
import { providerCredential } from "./provider-credentials";
import { cachedJson } from "./provider-cache-service";
import { providerTtls } from "./provider-ttls";
import { arrayNames, firstString, isProviderResult, numberValue, stringValue, yearFromDate } from "./normalizers";
import { providerAttributions, type ProviderResult } from "./types";

export async function openLibrarySearch(env: Env, query: string, limit: number) {
  const email = await providerCredential(env, { provider: "openlibrary", key: "OPEN_LIBRARY_CONTACT_EMAIL" });
  const data = await cachedJson<{ docs?: unknown[] }>(env, "openlibrary", `search:${query.toLowerCase()}`, providerTtls.openLibrarySearch, () => fetch(`${externalApiEndpoints.openLibrary}/search.json?q=${encodeURIComponent(query)}&limit=${limit}`, openLibraryHeaders(email ?? undefined)));
  return (data?.docs ?? []).slice(0, limit).map(normalizeOpenLibrary).filter(isProviderResult);
}

export async function openLibrarySubject(env: Env, subject: string, limit: number) {
  const email = await providerCredential(env, { provider: "openlibrary", key: "OPEN_LIBRARY_CONTACT_EMAIL" });
  const data = await cachedJson<{ works?: unknown[] }>(env, "openlibrary", `subject:${subject.toLowerCase()}`, providerTtls.openLibrarySubject, () => fetch(`${externalApiEndpoints.openLibrary}/subjects/${encodeURIComponent(subject)}.json?limit=${limit}`, openLibraryHeaders(email ?? undefined)));
  return (data?.works ?? []).slice(0, limit).map(normalizeOpenLibrarySubject).filter(isProviderResult);
}

export async function openLibraryFetchDetails(env: Env, providerId: string) {
  const email = await providerCredential(env, { provider: "openlibrary", key: "OPEN_LIBRARY_CONTACT_EMAIL" });
  const headers = openLibraryHeaders(email ?? undefined);
  const [workData, editionsData] = await Promise.all([
    cachedJson<any>(env, "openlibrary", `work:${providerId}`, providerTtls.openLibraryDetail, () => fetch(`${externalApiEndpoints.openLibrary}/works/${providerId}.json`, headers)),
    cachedJson<any>(env, "openlibrary", `editions:${providerId}`, providerTtls.openLibraryDetail, () => fetch(`${externalApiEndpoints.openLibrary}/works/${providerId}/editions.json`, headers)),
  ]);
  if (!workData) return null;
  const description = typeof workData.description === "string" ? workData.description : (workData.description?.value ?? null);
  const subjects = arrayNames(workData.subjects?.map((s: string) => ({ name: s })));
  let pageCount = null;
  let isbn10 = null;
  let isbn13 = null;
  if (editionsData && Array.isArray(editionsData.entries)) {
    const best = editionsData.entries.find((e: any) => e.number_of_pages || e.isbn_10 || e.isbn_13);
    if (best) {
      pageCount = numberValue(best.number_of_pages);
      isbn10 = firstString(best.isbn_10);
      isbn13 = firstString(best.isbn_13);
    }
  }
  return { description, subjects, pageCount, isbn10, isbn13 };
}

function openLibraryHeaders(email?: string) {
  return { headers: { "User-Agent": `Tuvu (${email || "local-dev@example.invalid"})` } };
}

function normalizeOpenLibrary(item: unknown): ProviderResult | null {
  const record = item as Record<string, unknown>;
  const key = stringValue(record.key);
  const title = stringValue(record.title);
  if (!key || !title) return null;
  const coverId = numberValue(record.cover_i) ?? numberValue(record.cover_id);
  const firstPublishYear = numberValue(record.first_publish_year) ?? yearFromDate(stringValue(record.first_publish_date));
  return {
    provider: "openlibrary",
    providerId: key.replace(/^\/works\//, ""),
    type: "book",
    title,
    overview: Array.isArray(record.author_name) ? `By ${record.author_name.slice(0, 3).join(", ")}` : null,
    posterPath: coverId ? `${externalApiEndpoints.openLibraryCovers}/b/id/${coverId}-M.jpg` : null,
    backdropPath: null,
    releaseDate: firstPublishYear ? `${firstPublishYear}-01-01` : null,
    year: firstPublishYear,
    sourceUrl: `${externalApiEndpoints.openLibrary}${key}`,
    rating: null,
    popularity: numberValue(record.edition_count),
    attribution: providerAttributions.openlibrary,
    extendedDataJson: JSON.stringify({
      book: {
        isbn10: firstString(record.isbn)?.length === 10 ? firstString(record.isbn) : undefined,
        isbn13: firstString(record.isbn)?.length === 13 ? firstString(record.isbn) : undefined,
        authors: Array.isArray(record.author_name) ? record.author_name.slice(0, 6).map((name) => ({ name: String(name), job: "Author" })) : [],
        languages: Array.isArray(record.language) ? record.language.slice(0, 8).map(String) : [],
        publisher: firstString(record.publisher),
        pageCount: numberValue(record.number_of_pages_median),
        editionCount: numberValue(record.edition_count),
        rating: numberValue(record.ratings_average),
      },
    }),
  };
}

function normalizeOpenLibrarySubject(item: unknown): ProviderResult | null {
  const record = item as Record<string, unknown>;
  const key = stringValue(record.key);
  const title = stringValue(record.title);
  if (!key || !title) return null;
  const coverId = numberValue(record.cover_id);
  const firstPublishYear = numberValue(record.first_publish_year);
  return { provider: "openlibrary", providerId: key.replace(/^\/works\//, ""), type: "book", title, overview: Array.isArray(record.authors) ? `By ${record.authors.slice(0, 3).map((a: any) => a.name).join(", ")}` : null, posterPath: coverId ? `${externalApiEndpoints.openLibraryCovers}/b/id/${coverId}-M.jpg` : null, backdropPath: null, releaseDate: firstPublishYear ? `${firstPublishYear}-01-01` : null, year: firstPublishYear, sourceUrl: `${externalApiEndpoints.openLibrary}${key}`, rating: null, popularity: numberValue(record.edition_count), attribution: providerAttributions.openlibrary, extendedDataJson: null };
}
