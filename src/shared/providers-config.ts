export type ProviderCategory =
  | "audiovisual"
  | "books"
  | "games"
  | "music"
  | "news"
  | "subtitles"
  | "video";

export type ProviderFieldConfig = {
  key: string;
  label: string;
  placeholder: string;
  secure?: boolean;
};

export type ProviderCatalogItem = {
  code: string;
  name: string;
  category: ProviderCategory;
  description: string;
  keyless: boolean;
  defaultStatus: "active" | "disabled";
  fields: ProviderFieldConfig[];
  attribution: string;
  docUrl: string;
};

export const PROVIDER_CATEGORIES: Array<{ id: ProviderCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "audiovisual", label: "Movies & Shows" },
  { id: "books", label: "Books" },
  { id: "games", label: "Games" },
  { id: "music", label: "Music" },
  { id: "news", label: "News" },
  { id: "subtitles", label: "Subtitles" },
  { id: "video", label: "Video" },
];

export const PROVIDER_CATALOG: ProviderCatalogItem[] = [
  // ── Audiovisual ──
  {
    code: "tmdb",
    name: "The Movie Database (TMDB)",
    category: "audiovisual",
    description: "Primary metadata, credits, posters, and availability for movies, shows, and anime.",
    keyless: false,
    defaultStatus: "active",
    fields: [
      { key: "TMDB_API_KEY", label: "API Key / Read Token", placeholder: "TMDB v3 API key or v4 Read Access Token", secure: true },
      { key: "TMDB_API_ENDPOINT", label: "Custom API Endpoint (Optional)", placeholder: "Default: https://api.themoviedb.org/3 (or custom proxy)", secure: false },
    ],
    attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    docUrl: "https://developer.themoviedb.org/docs",
  },
  {
    code: "tvmaze",
    name: "TVmaze",
    category: "audiovisual",
    description: "Keyless broadcast schedules, air dates, runtimes, cast, and exact IMDb/TVDB cross-lookups.",
    keyless: true,
    defaultStatus: "active",
    fields: [],
    attribution: "Television data provided by TVmaze under CC BY-SA.",
    docUrl: "https://www.tvmaze.com/api",
  },
  {
    code: "wikidata",
    name: "Wikidata & Wikimedia",
    category: "audiovisual",
    description: "Keyless factual enrichment, cross-identifiers, and Wikimedia Commons licensed media.",
    keyless: true,
    defaultStatus: "active",
    fields: [],
    attribution: "Structured data from Wikidata under CC0; media subject to file-specific licenses.",
    docUrl: "https://www.wikidata.org/wiki/Wikidata:Data_access",
  },
  {
    code: "thetvdb",
    name: "TheTVDB",
    category: "audiovisual",
    description: "Television series metadata, season art, and episode orders.",
    keyless: false,
    defaultStatus: "disabled",
    fields: [
      { key: "THETVDB_API_KEY", label: "Project API Key", placeholder: "TheTVDB v4 Project API key", secure: true },
      { key: "THETVDB_USER_PIN", label: "Subscriber PIN", placeholder: "Optional subscriber PIN", secure: true },
    ],
    attribution: "Metadata provided by TheTVDB.com under project license.",
    docUrl: "https://thetvdb.com/api-information",
  },
  {
    code: "jikan",
    name: "MyAnimeList (Jikan)",
    category: "audiovisual",
    description: "Community anime and manga catalog indexing.",
    keyless: true,
    defaultStatus: "disabled",
    fields: [
      { key: "MAL_JIKAN_API_ENDPOINT", label: "API Endpoint", placeholder: "https://api.jikan.moe/v4/" },
    ],
    attribution: "Unofficial MyAnimeList data via Jikan REST API.",
    docUrl: "https://docs.api.jikan.moe/",
  },
  {
    code: "anilist",
    name: "AniList",
    category: "audiovisual",
    description: "Community anime and manga GraphQL metadata and relations.",
    keyless: true,
    defaultStatus: "disabled",
    fields: [
      { key: "ANILIST_API_ENDPOINT", label: "GraphQL Endpoint", placeholder: "https://graphql.anilist.co" },
    ],
    attribution: "Data provided by AniList GraphQL API.",
    docUrl: "https://docs.anilist.co/guide/graphql/",
  },

  // ── Books ──
  {
    code: "googlebooks",
    name: "Google Books",
    category: "books",
    description: "Book editions, ISBNs, page counts, descriptions, preview, and access metadata.",
    keyless: false,
    defaultStatus: "active",
    fields: [
      { key: "GOOGLE_BOOKS_API_KEY", label: "API Key", placeholder: "Google Cloud API Key with Books API enabled", secure: true },
    ],
    attribution: "Book information provided by Google Books.",
    docUrl: "https://developers.google.com/books/docs/v1/using",
  },
  {
    code: "openlibrary",
    name: "Open Library",
    category: "books",
    description: "Open, keyless book work/edition reconciliation and bibliographic data by Internet Archive.",
    keyless: true,
    defaultStatus: "active",
    fields: [
      { key: "OPEN_LIBRARY_CONTACT_EMAIL", label: "Contact Email (Polite User-Agent)", placeholder: "your@email.com" },
    ],
    attribution: "Book data from Open Library by Internet Archive under CC0 / ODC-BY.",
    docUrl: "https://openlibrary.org/developers/api",
  },

  // ── Games ──
  {
    code: "igdb",
    name: "IGDB (via Twitch)",
    category: "games",
    description: "Primary video game database for releases, platforms, companies, cover art, and ratings.",
    keyless: false,
    defaultStatus: "active",
    fields: [
      { key: "TWITCH_IGDB_CLIENT_ID", label: "Client ID", placeholder: "Twitch Developer Client ID" },
      { key: "TWITCH_IGDB_CLIENT_SECRET", label: "Client Secret", placeholder: "Twitch Developer Client Secret", secure: true },
    ],
    attribution: "Video game data powered by IGDB.com via Twitch.",
    docUrl: "https://api-docs.igdb.com/",
  },
  {
    code: "rawg",
    name: "RAWG Video Games",
    category: "games",
    description: "Game store links, screenshots, player ratings, and PC hardware requirements.",
    keyless: false,
    defaultStatus: "active",
    fields: [
      { key: "RAWG_API_KEY", label: "API Key", placeholder: "RAWG.io API key", secure: true },
    ],
    attribution: "Game metadata powered by RAWG.io database.",
    docUrl: "https://rawg.io/apidocs",
  },

  // ── Music ──
  {
    code: "musicbrainz",
    name: "MusicBrainz",
    category: "music",
    description: "Open music encyclopedia for artists, release groups, albums, tracks, and relationships.",
    keyless: true,
    defaultStatus: "active",
    fields: [
      { key: "MUSICBRAINZ_CONTACT_EMAIL", label: "Contact Email (User-Agent)", placeholder: "your@email.com" },
    ],
    attribution: "Music data from MusicBrainz open database under CC0.",
    docUrl: "https://musicbrainz.org/doc/MusicBrainz_API",
  },
  {
    code: "coverartarchive",
    name: "Cover Art Archive",
    category: "music",
    description: "High-resolution music album and single artwork linked to MusicBrainz identifiers.",
    keyless: true,
    defaultStatus: "active",
    fields: [],
    attribution: "Cover art provided by Cover Art Archive (MusicBrainz & Internet Archive).",
    docUrl: "https://musicbrainz.org/doc/Cover_Art_Archive/API",
  },
  {
    code: "listenbrainz",
    name: "ListenBrainz",
    category: "music",
    description: "Listening history scrobbles, playlists, and open music recommendations.",
    keyless: true,
    defaultStatus: "active",
    fields: [
      { key: "LISTENBRAINZ_TOKEN", label: "User Token", placeholder: "Optional personal ListenBrainz user token", secure: true },
    ],
    attribution: "Listening data provided by ListenBrainz by MetaBrainz Foundation.",
    docUrl: "https://listenbrainz.readthedocs.io/",
  },
  {
    code: "theaudiodb",
    name: "TheAudioDB",
    category: "music",
    description: "Community music metadata, artist biographies, album discographies, and reviews.",
    keyless: false,
    defaultStatus: "active",
    fields: [
      { key: "THEAUDIODB_API_KEY", label: "API Key", placeholder: "TheAudioDB API key (defaults to test key '2')", secure: true },
    ],
    attribution: "Music biographies and artwork from TheAudioDB.com.",
    docUrl: "https://www.theaudiodb.com/api_guide.php",
  },
  {
    code: "lrclib",
    name: "LRCLIB Lyrics",
    category: "music",
    description: "Synchronized (.lrc) and plain-text song lyrics lookup (client-cached, not stored).",
    keyless: true,
    defaultStatus: "active",
    fields: [],
    attribution: "Lyrics provided by LRCLIB open lyrics database.",
    docUrl: "https://lrclib.net/docs",
  },

  // ── News ──
  {
    code: "gdelt",
    name: "GDELT Project",
    category: "news",
    description: "Keyless global events, headline monitoring, and cross-lingual news article discovery.",
    keyless: true,
    defaultStatus: "active",
    fields: [],
    attribution: "News discovery via GDELT Project Doc 2.0 API.",
    docUrl: "https://blog.gdeltproject.org/announcing-the-gdelt-doc-2-0-api-full-text-search-of-global-news-in-65-languages/",
  },
  {
    code: "guardian",
    name: "The Guardian",
    category: "news",
    description: "Full archive search, editorial sections, and article discovery from The Guardian.",
    keyless: false,
    defaultStatus: "active",
    fields: [
      { key: "GUARDIAN_API_KEY", label: "Developer API Key", placeholder: "The Guardian Open Platform API key", secure: true },
    ],
    attribution: "Articles and content provided by Guardian News & Media Limited.",
    docUrl: "https://open-platform.theguardian.com/access/",
  },
  {
    code: "newsapi",
    name: "NewsAPI",
    category: "news",
    description: "Live breaking headlines and articles from over 80,000 news outlets and blogs.",
    keyless: false,
    defaultStatus: "active",
    fields: [
      { key: "NEWSAPI_KEY", label: "API Key", placeholder: "NewsAPI.org developer key", secure: true },
    ],
    attribution: "Powered by NewsAPI.org.",
    docUrl: "https://newsapi.org/",
  },

  // ── Subtitles ──
  {
    code: "opensubtitles",
    name: "OpenSubtitles",
    category: "subtitles",
    description: "Subtitle availability, languages, and release matching (metadata only).",
    keyless: false,
    defaultStatus: "active",
    fields: [
      { key: "OPENSUBTITLES_API_KEY", label: "API Key", placeholder: "OpenSubtitles.com REST API key", secure: true },
    ],
    attribution: "Subtitle availability metadata from OpenSubtitles.com.",
    docUrl: "https://ai.opensubtitles.com/docs",
  },

  // ── Video ──
  {
    code: "youtube",
    name: "YouTube Data API",
    category: "video",
    description: "Trailers, teaser videos, and creator channels.",
    keyless: false,
    defaultStatus: "active",
    fields: [
      { key: "YOUTUBE_API_KEY", label: "API Key", placeholder: "Google Cloud YouTube Data API v3 Key", secure: true },
    ],
    attribution: "Video trailers and metadata powered by YouTube.",
    docUrl: "https://developers.google.com/youtube/v3",
  },
];

export const VALID_PROVIDER_CODES = PROVIDER_CATALOG.map((p) => p.code) as [string, ...string[]];

export function getProviderCatalogItem(code: string): ProviderCatalogItem | undefined {
  return PROVIDER_CATALOG.find((p) => p.code === code);
}
