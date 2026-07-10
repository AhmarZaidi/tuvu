import Papa from "papaparse";
import JSZip from "jszip";
import {
  compareTvTimeCounts,
  emptyTvTimeCounts,
  type TvTimeCounts,
  type TvTimeImportItem,
  type TvTimeImportSummary,
  type TvTimeMovieItem,
  type TvTimeShowItem,
  type TvTimeWarning,
} from "@shared/tv-time-import";

type FileText = { name: string; text: string };
type CsvRow = Record<string, string | undefined>;

export async function parseTvTimeFiles(files: File[]): Promise<TvTimeImportSummary> {
  const expanded = await expandFiles(files);
  const byName = new Map(expanded.map((file) => [file.name.toLowerCase(), file]));
  const warnings: TvTimeWarning[] = [{
    severity: "info",
    code: "timezone_warning",
    message: "TV Time exports mix UTC timestamps and local-looking timestamps. Tuvu preserves raw dates and normalizes display later.",
  }];

  const seriesJson = parseJsonArray(findFile(byName, "tvtime-series", ".json"), warnings);
  const moviesJson = parseJsonArray(findFile(byName, "tvtime-movies", ".json"), warnings);
  const seriesCsv = parseCsv(findFile(byName, "tvtime-series", ".csv"), warnings);
  const episodesCsv = parseCsv(findFile(byName, "tvtime-series-episodes", ".csv"), warnings);
  const watchedSeriesCsv = parseCsv(findFile(byName, "watched-series", ".csv"), warnings);
  const moviesCsv = parseCsv(findFile(byName, "tvtime-movies", ".csv"), warnings);

  const shows = seriesJson.length > 0
    ? normalizeShowsFromJson(seriesJson)
    : normalizeShowsFromCsv(seriesCsv, episodesCsv, watchedSeriesCsv);
  const movies = moviesJson.length > 0 ? normalizeMoviesFromJson(moviesJson) : normalizeMoviesFromCsv(moviesCsv);
  const items: TvTimeImportItem[] = [...shows, ...movies];
  const counts = countItems(shows, movies);

  warnings.push(...missingFileWarnings(byName));
  warnings.push(...compareTvTimeCounts(counts));
  warnings.push(...findDuplicateWarnings(items));

  return {
    counts,
    warnings,
    items,
    fileNames: expanded.map((file) => file.name).sort((a, b) => a.localeCompare(b)),
  };
}

export function countItems(shows: TvTimeShowItem[], movies: TvTimeMovieItem[]): TvTimeCounts {
  const counts = emptyTvTimeCounts();
  counts.shows = shows.length;
  counts.movies = movies.length;
  counts.seasons = shows.reduce((total, show) => total + show.seasons.length, 0);
  const episodes = shows.flatMap((show) => show.seasons.flatMap((season) => season.episodes));
  counts.episodeRows = episodes.length;
  counts.watchedEpisodes = episodes.filter((episode) => episode.isWatched).length;
  counts.watchedSpecials = episodes.filter((episode) => episode.isWatched && episode.isSpecial).length;
  counts.rewatchedEpisodeRows = episodes.filter((episode) => episode.rewatchCount > 0).length;
  counts.watchedMovies = movies.filter((movie) => movie.isWatched).length;
  return counts;
}

async function expandFiles(files: File[]): Promise<FileText[]> {
  const expanded: FileText[] = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((entry) => !entry.dir);
      for (const entry of entries) {
        expanded.push({ name: entry.name.split("/").pop() ?? entry.name, text: await entry.async("text") });
      }
    } else {
      expanded.push({ name: file.name, text: await readFileText(file) });
    }
  }
  return expanded;
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsText(file);
  });
}

function findFile(files: Map<string, FileText>, startsWith: string, endsWith: string) {
  return [...files.values()].find((file) => file.name.toLowerCase().startsWith(startsWith) && file.name.toLowerCase().endsWith(endsWith)) ?? null;
}

function parseJsonArray(file: FileText | null, warnings: TvTimeWarning[]) {
  if (!file) return [];
  try {
    const parsed = JSON.parse(file.text);
    if (Array.isArray(parsed)) return parsed as unknown[];
    warnings.push({ severity: "error", code: "json_not_array", message: `${file.name} is not a JSON array.` });
  } catch (error) {
    warnings.push({ severity: "error", code: "json_parse_failed", message: `${file.name} could not be parsed as JSON.`, details: String(error) });
  }
  return [];
}

function parseCsv(file: FileText | null, warnings: TvTimeWarning[]) {
  if (!file) return [];
  const result = Papa.parse<CsvRow>(file.text, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0) {
    warnings.push({ severity: "warning", code: "csv_parse_warning", message: `${file.name} had ${result.errors.length} CSV parse warning(s).`, details: result.errors.slice(0, 5) });
  }
  return result.data;
}

function normalizeShowsFromJson(rows: unknown[]): TvTimeShowItem[] {
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const id = record.id as Record<string, unknown> | undefined;
    const seasons = Array.isArray(record.seasons) ? record.seasons : [];
    const item: TvTimeShowItem = {
      kind: "show",
      itemKey: stringValue(record.uuid) ?? stringValue(id?.tvdb) ?? `show:${stringValue(record.title) ?? "untitled"}`,
      sourceUuid: stringValue(record.uuid),
      tvdbId: stringValue(id?.tvdb),
      imdbId: stringValue(id?.imdb),
      title: stringValue(record.title) ?? "Untitled show",
      status: stringValue(record.status) ?? "watch_later",
      rawStatus: stringValue(record.status),
      createdAt: stringValue(record.created_at),
      isFavorite: booleanValue(record.is_favorite),
      seasons: seasons.map((season) => normalizeSeason(season as Record<string, unknown>)),
    };
    return item;
  });
}

function normalizeSeason(season: Record<string, unknown>) {
  const number = numberValue(season.number) ?? 0;
  const episodes = Array.isArray(season.episodes) ? season.episodes : [];
  return {
    number,
    isSpecial: booleanValue(season.is_specials) || number === 0,
    episodes: episodes.map((episode) => normalizeEpisode(episode as Record<string, unknown>, number)),
  };
}

function normalizeEpisode(episode: Record<string, unknown>, seasonNumber: number) {
  const id = episode.id as Record<string, unknown> | undefined;
  const episodeNumber = numberValue(episode.number) ?? 1;
  const watchedCount = numberValue(episode.watched_count);
  const isWatched = booleanValue(episode.is_watched) || Boolean(episode.watched_at) || Boolean(watchedCount && watchedCount > 0);
  const rewatchCount = numberValue(episode.rewatch_count) ?? Math.max(0, (watchedCount ?? (isWatched ? 1 : 0)) - 1);
  return {
    tvdbId: stringValue(id?.tvdb),
    imdbId: stringValue(id?.imdb),
    seasonNumber,
    episodeNumber,
    name: stringValue(episode.name),
    isSpecial: booleanValue(episode.special) || seasonNumber === 0,
    isWatched,
    watchedAt: stringValue(episode.watched_at),
    rewatchCount,
    watchedCount: watchedCount ?? (isWatched ? 1 + rewatchCount : 0),
  };
}

function normalizeShowsFromCsv(seriesRows: CsvRow[], episodeRows: CsvRow[], watchedRows: CsvRow[]): TvTimeShowItem[] {
  const statusByTvdb = new Map(watchedRows.map((row) => [row.tvdb_id ?? "", row.status ?? "watch_later"]));
  const shows = new Map<string, TvTimeShowItem>();
  for (const row of seriesRows) {
    const key = row.uuid || row.tvdb_id || `show:${row.title}`;
    if (!key) continue;
    shows.set(key, {
      kind: "show",
      itemKey: key,
      sourceUuid: row.uuid ?? null,
      tvdbId: row.tvdb_id ?? null,
      imdbId: row.imdb_id ?? null,
      title: row.title ?? "Untitled show",
      status: statusByTvdb.get(row.tvdb_id ?? "") ?? row.status ?? "watch_later",
      rawStatus: row.status ?? null,
      createdAt: row.created_at ?? null,
      isFavorite: false,
      seasons: [],
    });
  }
  const seasonMaps = new Map<string, Map<number, TvTimeShowItem["seasons"][number]>>();
  for (const row of episodeRows) {
    const key = row.series_uuid || row.series_tvdb_id || `show:${row.title}`;
    if (!key) continue;
    if (!shows.has(key)) {
      shows.set(key, {
        kind: "show", itemKey: key, sourceUuid: row.series_uuid ?? null, tvdbId: row.series_tvdb_id ?? null, imdbId: row.series_imdb_id ?? null,
        title: row.title ?? "Untitled show", status: "watch_later", rawStatus: null, createdAt: null, isFavorite: false, seasons: [],
      });
    }
    const show = shows.get(key)!;
    const seasonNumber = numberValue(row.season) ?? 0;
    let seasonMap = seasonMaps.get(key);
    if (!seasonMap) {
      seasonMap = new Map();
      seasonMaps.set(key, seasonMap);
    }
    if (!seasonMap.has(seasonNumber)) {
      const season = { number: seasonNumber, isSpecial: booleanValue(row.special) || seasonNumber === 0, episodes: [] };
      seasonMap.set(seasonNumber, season);
      show.seasons.push(season);
    }
    seasonMap.get(seasonNumber)!.episodes.push({
      tvdbId: row.tvdb_id ?? null,
      imdbId: null,
      seasonNumber,
      episodeNumber: numberValue(row.episode) ?? 1,
      name: null,
      isSpecial: booleanValue(row.special) || seasonNumber === 0,
      isWatched: booleanValue(row.is_watched),
      watchedAt: row.watched_at || null,
      rewatchCount: numberValue(row.rewatch_count) ?? 0,
      watchedCount: booleanValue(row.is_watched) ? 1 + (numberValue(row.rewatch_count) ?? 0) : 0,
    });
  }
  return [...shows.values()].map((show) => ({ ...show, seasons: show.seasons.sort((a, b) => a.number - b.number) }));
}

function normalizeMoviesFromJson(rows: unknown[]): TvTimeMovieItem[] {
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const id = record.id as Record<string, unknown> | undefined;
    return {
      kind: "movie",
      itemKey: stringValue(record.uuid) ?? stringValue(id?.tvdb) ?? `movie:${stringValue(record.title) ?? "untitled"}`,
      sourceUuid: stringValue(record.uuid),
      tvdbId: stringValue(id?.tvdb),
      imdbId: stringValue(id?.imdb),
      title: stringValue(record.title) ?? "Untitled movie",
      year: numberValue(record.year),
      createdAt: stringValue(record.created_at),
      watchedAt: stringValue(record.watched_at),
      isWatched: booleanValue(record.is_watched),
      isFavorite: booleanValue(record.is_favorite),
      rewatchCount: numberValue(record.rewatch_count) ?? 0,
    };
  });
}

function normalizeMoviesFromCsv(rows: CsvRow[]): TvTimeMovieItem[] {
  return rows.map((row) => ({
    kind: "movie",
    itemKey: row.uuid || row.tvdb_id || `movie:${row.title}`,
    sourceUuid: row.uuid ?? null,
    tvdbId: row.tvdb_id ?? null,
    imdbId: row.imdb_id ?? null,
    title: row.title ?? "Untitled movie",
    year: numberValue(row.year),
    createdAt: row.created_at ?? null,
    watchedAt: row.watched_at ?? null,
    isWatched: booleanValue(row.is_watched),
    isFavorite: false,
    rewatchCount: numberValue(row.rewatch_count) ?? 0,
  }));
}

function missingFileWarnings(files: Map<string, FileText>): TvTimeWarning[] {
  const expected = ["tvtime-series", "tvtime-movies", "tvtime-series-episodes", "watched-series", "tvtime-summary"];
  return expected
    .filter((prefix) => ![...files.keys()].some((name) => name.startsWith(prefix)))
    .map((prefix) => ({ severity: "warning" as const, code: "missing_export_file", message: `No ${prefix} file was selected. Import will use the available files only.` }));
}

function findDuplicateWarnings(items: TvTimeImportItem[]): TvTimeWarning[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.itemKey)) duplicates.add(item.itemKey);
    seen.add(item.itemKey);
  }
  return [...duplicates].slice(0, 20).map((itemKey) => ({ severity: "warning" as const, code: "duplicate_item_key", itemKey, message: `Duplicate TV Time item key detected: ${itemKey}. Last uploaded chunk wins.` }));
}

function stringValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}
