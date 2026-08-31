import { config } from '../constants/config';

/**
 * Resolves any image path (full URL, relative storage URL, or TMDB path)
 * into a valid absolute URL for Image components.
 */
export function resolveImageUrl(
  path?: string | null,
  size: 'w92' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'h632' | 'original' = 'w500'
): string | null {
  if (!path) return null;
  const str = String(path).trim();
  if (!str) return null;

  // 1. Full HTTP / HTTPS URLs (e.g. Supabase, AniList CDN, TMDB CDN, external URLs)
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return str;
  }

  // 2. Relative API / Storage URLs (e.g. /api/storage/uploads/... or /storage/...)
  if (str.startsWith('/api/') || str.startsWith('/storage/') || str.startsWith('/uploads/')) {
    const base = config.getApiBase();
    return `${base}${str.startsWith('/') ? '' : '/'}${str}`;
  }

  // 3. TMDB Image Paths (starts with /...)
  if (str.startsWith('/')) {
    return `https://image.tmdb.org/t/p/${size}${str}`;
  }

  return str;
}
