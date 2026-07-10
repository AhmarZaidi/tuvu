import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseTvTimeFiles } from "@client/tv-time-parser";

function textFile(name: string, text: string) {
  return new File([text], name, { type: "text/plain" });
}

describe("TV Time import parser", () => {
  it("normalizes JSON exports and counts watched history", async () => {
    const shows = JSON.stringify([
      {
        uuid: "show-1",
        id: { tvdb: 100, imdb: "ttshow" },
        title: "Example Show",
        status: "up_to_date",
        created_at: "2024-01-01T00:00:00Z",
        is_favorite: true,
        seasons: [
          {
            number: 1,
            is_specials: false,
            episodes: [
              { id: { tvdb: 1 }, number: 1, name: "Pilot", special: false, is_watched: true, watched_at: "2024-01-02 10:00:00", rewatch_count: 1, watched_count: 2 },
              { id: { tvdb: 2 }, number: 2, name: "Next", special: false, is_watched: false, watched_at: null, rewatch_count: 0, watched_count: 0 },
            ],
          },
          { number: 0, is_specials: true, episodes: [{ id: { tvdb: 3 }, number: 1, name: "Special", special: true, is_watched: true, watched_at: "2024-01-03 10:00:00", rewatch_count: 0, watched_count: 1 }] },
        ],
      },
    ]);
    const movies = JSON.stringify([{ uuid: "movie-1", id: { tvdb: 200, imdb: "ttmovie" }, title: "Example Movie", year: 2020, is_watched: true, watched_at: "2024-01-04T00:00:00Z", is_favorite: false, rewatch_count: 0 }]);

    const summary = await parseTvTimeFiles([
      textFile("tvtime-series-2026-05-07.json", shows),
      textFile("tvtime-movies-2026-05-07.json", movies),
    ]);

    expect(summary.items).toHaveLength(2);
    expect(summary.counts).toMatchObject({ shows: 1, seasons: 2, episodeRows: 3, watchedEpisodes: 2, watchedSpecials: 1, rewatchedEpisodeRows: 1, movies: 1, watchedMovies: 1 });
  });

  it("falls back to CSV exports when JSON is absent", async () => {
    const seriesCsv = "uuid,tvdb_id,imdb_id,title,status,created_at\nshow-1,100,,Example Show,watch_later,2024-01-01T00:00:00Z\n";
    const episodesCsv = "series_tvdb_id,series_imdb_id,series_uuid,title,season,episode,tvdb_id,is_watched,watched_at,rewatch_count,special\n100,,show-1,Example Show,1,1,1,true,2024-01-02 10:00:00,0,false\n";
    const moviesCsv = "uuid,tvdb_id,imdb_id,title,year,created_at,watched_at,is_watched,rewatch_count\nmovie-1,200,ttmovie,Example Movie,2020,2024-01-01T00:00:00Z,,false,0\n";

    const summary = await parseTvTimeFiles([
      textFile("tvtime-series-2026-05-07.csv", seriesCsv),
      textFile("tvtime-series-episodes-2026-05-07.csv", episodesCsv),
      textFile("tvtime-movies-2026-05-07.csv", moviesCsv),
    ]);

    expect(summary.items.map((item) => item.kind)).toEqual(["show", "movie"]);
    expect(summary.counts.watchedEpisodes).toBe(1);
    expect(summary.counts.watchedMovies).toBe(0);
  });

  it("expands zip files before parsing", async () => {
    const zip = new JSZip();
    zip.file("tvtime-movies-2026-05-07.json", JSON.stringify([{ uuid: "movie-1", id: { tvdb: 200, imdb: null }, title: "Zip Movie", year: 2021, is_watched: true, watched_at: "2024-01-01T00:00:00Z", is_favorite: false, rewatch_count: 0 }]));
    const blob = await zip.generateAsync({ type: "blob" });
    const file = new File([blob], "tv time backup data.zip", { type: "application/zip" });

    const summary = await parseTvTimeFiles([file]);

    expect(summary.fileNames).toEqual(["tvtime-movies-2026-05-07.json"]);
    expect(summary.counts.movies).toBe(1);
    expect(summary.counts.watchedMovies).toBe(1);
  });
});
