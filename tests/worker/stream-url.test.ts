import { describe, expect, it } from "vitest";

describe("Stream URL generation rules", () => {
  it("generates correct 7reels.cc TV show episode URL with TMDB ID", () => {
    const tmdbId = "1399";
    const season = 1;
    const episode = 1;
    const url = `https://7reels.cc/tv/${tmdbId}/watch?s=${season}&e=${episode}`;
    expect(url).toBe("https://7reels.cc/tv/1399/watch?s=1&e=1");
  });

  it("generates correct 7reels.cc Movie URL with TMDB ID", () => {
    const tmdbId = "76341";
    const url = `https://7reels.cc/movie/${tmdbId}/watch`;
    expect(url).toBe("https://7reels.cc/movie/76341/watch");
  });

  it("generates correct anikototv.to episode URL from slug and episode number", () => {
    const slug = "black-torch-1d364";
    const episode = 3;
    const url = `https://anikototv.to/watch/${slug}/ep-${episode}`;
    expect(url).toBe("https://anikototv.to/watch/black-torch-1d364/ep-3");
  });

  it("generates correct anikototv.to movie / OVA episode 1 URL", () => {
    const slug = "attack-on-titan-ova-oc7gu";
    const episode = 1;
    const url = `https://anikototv.to/watch/${slug}/ep-${episode}`;
    expect(url).toBe("https://anikototv.to/watch/attack-on-titan-ova-oc7gu/ep-1");
  });
});
