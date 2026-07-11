import { describe, expect, it } from "vitest";
import { classifyMedia } from "@shared/media-classification";

describe("media classification", () => {
  it("classifies Japanese animation as anime", () => {
    const result = classifyMedia({ type: "tv", genreIds: [16], originalLanguage: "ja" });
    expect(result.isAnime).toBe(true);
    expect(result.isCartoon).toBe(false);
    expect(result.suggestedType).toBe("anime");
    expect(result.tags).toContain("anime");
  });

  it("classifies English animation as cartoon without changing the primary type", () => {
    const result = classifyMedia({ type: "movie", genres: ["Animation"], originalLanguage: "en" });
    expect(result.isAnime).toBe(false);
    expect(result.isCartoon).toBe(true);
    expect(result.suggestedType).toBe("movie");
    expect(result.tags).toContain("cartoon");
  });

  it("keeps non-animated shows as shows", () => {
    const result = classifyMedia({ type: "show", genres: ["Drama"], originalLanguage: "ja" });
    expect(result.isAnimated).toBe(false);
    expect(result.isAnime).toBe(false);
    expect(result.suggestedType).toBe("show");
  });
});
