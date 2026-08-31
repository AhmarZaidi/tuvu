import { afterEach, describe, expect, it, vi } from "vitest";
import { providerSearch } from "@worker/providers";

describe("provider search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses Jikan fallback results for anime search", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("jikan.moe")) {
        return new Response(JSON.stringify({
          data: [
            {
              mal_id: 53507,
              title: "Witch Hat Atelier",
              title_english: "Witch Hat Atelier",
              synopsis: "A girl discovers a world of magic.",
              url: "https://myanimelist.net/anime/53507",
              images: { jpg: { image_url: "https://cdn.example/witch-hat.jpg" } },
              aired: { from: "2025-01-01T00:00:00+00:00" },
              year: 2025,
              score: 8.4,
              popularity: 1000,
              genres: [{ name: "Adventure" }, { name: "Fantasy" }],
              studios: [{ name: "Bug Films" }],
              status: "Not yet aired",
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const results = await providerSearch({} as Env, "Witch Hat Atelier", ["anime"], 8);

    expect(fetchMock).toHaveBeenCalledWith("https://api.jikan.moe/v4/anime?q=Witch%20Hat%20Atelier&limit=8");
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        provider: "jikan",
        providerId: "53507",
        type: "anime",
        title: "Witch Hat Atelier",
        attribution: expect.objectContaining({ label: "MyAnimeList (Jikan)" }),
      }),
    ]));
  });
});
