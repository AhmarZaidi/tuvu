import {
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Compass,
  Film,
  Gamepad2,
  Heart,
  Library,
  LayoutGrid,
  List as ListIcon,
  Mail,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Clock3,
  Play,
  Plus,
  RefreshCw,
  Pause,
  Play as PlayIcon,
  Square,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tv,
  Upload,
  User,
  X,
  Flame,
  Youtube,
  Camera,
  LogOut,
  Trash2,
  AlertTriangle,
  Activity,
  ExternalLink,
  Wifi,
  Server,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Navigate, Outlet, Route, Routes, useParams, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { DashboardEntry, DashboardKind, DashboardSection } from "@shared/dashboard";
import type { MediaType } from "@shared/media";
import { allMediaStatuses, dashboardKinds, formatStatusLabel, mediaConfigForType, navPageConfigs, searchableMediaTypes, statusOptionsForMediaType, trackableMediaTypes } from "@shared/media-config";
import { classifyMedia } from "@shared/media-classification";
import { tvTimeExpectedCounts, type TvTimeImportItem, type TvTimeImportSummary } from "@shared/tv-time-import";
import { providerNames, uiConstants } from "@shared/constants";
import { PROVIDER_CATALOG, PROVIDER_CATEGORIES, type ProviderCategory } from "@shared/providers-config";
import { queryCache, queryKeys } from "./api/query-cache";
import {
  EmptyState,
  IconButton,
  LoadingPanel,
  MediaCard,
  Modal,
  PosterGrid,
  ProgressBar,
  ResponsivePoster,
  SearchField,
  SegmentedControl,
  SkeletonGrid,
  StatusChip,
  Tabs,
  type MediaCardItem,
  type StatusTone,
} from "./components/ui";
import { parseTvTimeFiles } from "./tv-time-parser";

export { EmptyState, IconButton, MediaCard, Modal, PosterGrid, ProgressBar, ResponsivePoster, SegmentedControl, SkeletonGrid, StatusChip, Tabs } from "./components/ui";

type MePayload = {
  user: {
    id: string;
    email: string | null;
    username: string;
    displayName: string;
  };
  profile: {
    bio: string;
    visibility: "public" | "connections" | "private";
    preferredLanguage: string;
    preferredRegion: string;
    avatarUploadId: string | null;
    bannerUploadId: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
  };
  appearance: {
    theme: "light" | "dark" | "system";
  };
  csrfToken: string;
  libraryVersion?: number;
};

type AuthState = {
  me: MePayload;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type NoticeTone = "info" | "success" | "error";
type AppNotice = { id: string; tone: NoticeTone; message: string; dismissible?: boolean };
const noticeEventName = uiConstants.noticeEventName;

function notify(message: string, tone: NoticeTone = "info", dismissible = true) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Omit<AppNotice, "id">>(noticeEventName, { detail: { message, tone, dismissible } }));
}

type ImportJob = {
  id: string;
  status: string;
  counts_json?: string;
  error_message?: string;
  errorMessage?: string;
};

type ImportState = {
  activeJob: ImportJob | null;
  importProgress: { processed: number; total: number; done: boolean } | null;
  startBackgroundCommit: (jobId: string, csrfToken: string) => void;
  startBackgroundRollback: (jobId: string, csrfToken: string) => void;
  dismissActiveJob: () => void;
  abandonJob: (jobId: string, csrfToken: string) => Promise<void>;
};

const ImportContext = createContext<ImportState | null>(null);

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error("useImport outside ImportProvider");
  return ctx;
}

export function ImportProvider({ children }: { children: ReactNode }) {
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number; done: boolean } | null>(null);
  // Abort flag — incremented whenever we want to stop the current polling loop
  const abortCountRef = useRef(0);

  const authContext = useContext(AuthContext);
  const me = authContext?.me;

  const startBackgroundCommit = (jobId: string, csrfToken: string) => {
    abortCountRef.current += 1;
    const myAbort = abortCountRef.current;
    setActiveJob({ id: jobId, status: "committing" });
    setImportProgress({ processed: 0, total: 100, done: false });

    const runChunk = async () => {
      if (abortCountRef.current !== myAbort) return; // aborted
      try {
        const response = await fetch(`/api/imports/tv-time/jobs/${jobId}/commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }
        });
        if (abortCountRef.current !== myAbort) return;
        const res = await response.json() as { data?: { done?: boolean; processed?: number; total?: number }; error?: { message?: string } };

        if (!response.ok || !res.data) {
          setActiveJob({ id: jobId, status: "failed", error_message: safeNoticeText(res.error?.message, "Import could not continue right now.") });
          return;
        }

        if (res.data?.done) {
          if (me) clearDashboardCaches(me.user.id);
          setActiveJob(null);
          setImportProgress(null);
          window.location.assign(`/profile/merge?sourceJob=${encodeURIComponent(jobId)}`);
        } else {
          setImportProgress({ processed: res.data?.processed ?? 0, total: res.data?.total ?? 100, done: false });
          setTimeout(runChunk, 300);
        }
      } catch (err) {
        if (abortCountRef.current !== myAbort) return;
        console.error("Background commit failed:", err);
        setActiveJob({ id: jobId, status: "failed", error_message: friendlyErrorMessage(err, "Import could not continue right now.") });
      }
    };
    runChunk();
  };

  const startBackgroundRollback = (jobId: string, csrfToken: string) => {
    abortCountRef.current += 1;
    const myAbort = abortCountRef.current;
    setActiveJob({ id: jobId, status: "rolling_back" });
    setImportProgress({ processed: 0, total: 100, done: false });

    const runChunk = async () => {
      if (abortCountRef.current !== myAbort) return;
      try {
        const response = await fetch(`/api/imports/tv-time/jobs/${jobId}/rollback`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }
        });
        if (abortCountRef.current !== myAbort) return;
        const res = await response.json() as { data?: { done?: boolean; remaining?: number }; error?: { message?: string } };

        if (!response.ok || !res.data) {
          setActiveJob({ id: jobId, status: "failed", error_message: safeNoticeText(res.error?.message, "Rollback could not continue right now.") });
          return;
        }

        if (res.data?.done) {
          if (me) clearDashboardCaches(me.user.id);
          setActiveJob(null);
          setImportProgress(null);
        } else {
          const remaining = res.data?.remaining ?? 0;
          setImportProgress((prev) => ({
            processed: (prev?.total ?? remaining + 50) - remaining,
            total: prev?.total ? Math.max(prev.total, remaining) : remaining + 50,
            done: false
          }));
          setTimeout(runChunk, 300);
        }
      } catch (err) {
        if (abortCountRef.current !== myAbort) return;
        console.error("Background rollback failed:", err);
        setActiveJob({ id: jobId, status: "failed", error_message: friendlyErrorMessage(err, "Rollback could not continue right now.") });
      }
    };
    runChunk();
  };

  const abandonJob = async (jobId: string, csrfToken: string) => {
    // Stop the local polling loop first
    abortCountRef.current += 1;
    setActiveJob(null);
    setImportProgress(null);
    try {
      await fetch(`/api/imports/tv-time/jobs/${jobId}/abandon`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      });
    } catch (err) {
      console.error("Abandon failed:", err);
    }
  };

  const dismissActiveJob = () => {
    setActiveJob(null);
    setImportProgress(null);
  };

  useEffect(() => {
    if (!me) return;
    const checkActiveJob = async () => {
      try {
        const res = await apiJson<{ jobs: any[] }>("/api/imports/tv-time/jobs");
        const active = res.jobs.find((j) => j.status === "committing" || j.status === "rolling_back");
        if (active) {
          if (active.status === "committing") {
            let processed = 0;
            let total = 0;
            if (active.itemStats && Array.isArray(active.itemStats)) {
              for (const stat of active.itemStats) {
                total += stat.count;
                if (stat.status === "committed") {
                  processed += stat.count;
                }
              }
            }
            if (total === 0 && active.counts) {
              total = (active.counts.shows ?? 0) + (active.counts.movies ?? 0);
            }
            setActiveJob({ id: active.id, status: "committing", counts_json: JSON.stringify(active.counts), errorMessage: active.error_message });
            setImportProgress({ processed, total: Math.max(total, 1), done: false });
            startBackgroundCommit(active.id, me.csrfToken);
          } else if (active.status === "rolling_back") {
            let total = 100;
            if (active.counts) {
              total = (active.counts.shows ?? 0) + (active.counts.movies ?? 0);
            }
            const remaining = active.remainingCreatedRecords ?? 0;
            setActiveJob({ id: active.id, status: "rolling_back", counts_json: JSON.stringify(active.counts), errorMessage: active.error_message });
            setImportProgress({ processed: Math.max(0, total - remaining), total: Math.max(total, 1), done: false });
            startBackgroundRollback(active.id, me.csrfToken);
          }
        }
      } catch (e) {
        console.error("Error checking active import job:", e);
      }
    };
    void checkActiveJob();
  }, [me]);

  return (
    <ImportContext.Provider value={{ activeJob, importProgress, startBackgroundCommit, startBackgroundRollback, dismissActiveJob, abandonJob }}>
      {children}
    </ImportContext.Provider>
  );
}

const mediaItems: MediaCardItem[] = [
  {
    id: "severance",
    title: "Severance",
    meta: "S2 E4 next",
    type: "show",
    progress: 68,
    status: "Watching",
    tone: "watching",
    accent: "linear-gradient(145deg, #f7c948, #2b2f36 58%, #0f1115)",
  },
  {
    id: "dune-two",
    title: "Dune: Part Two",
    meta: "Movie watchlist",
    type: "movie",
    progress: 0,
    status: "Watch later",
    tone: "planned",
    accent: "linear-gradient(145deg, #e08e45, #54483b 45%, #101014)",
  },
  {
    id: "frieren",
    title: "Frieren",
    meta: "Anime S1 E18",
    type: "anime",
    progress: 76,
    status: "Up to date",
    tone: "complete",
    accent: "linear-gradient(145deg, #8fd3ff, #52636f 48%, #111318)",
  },
  {
    id: "hades",
    title: "Hades",
    meta: "Game backlog",
    type: "game",
    progress: 35,
    status: "Playing",
    tone: "watching",
    accent: "linear-gradient(145deg, #e44f3a, #50272b 55%, #121212)",
  },
  {
    id: "left-hand",
    title: "The Left Hand of Darkness",
    meta: "Book reading",
    type: "book",
    progress: 42,
    status: "Reading",
    tone: "paused",
    accent: "linear-gradient(145deg, #a8d672, #354638 54%, #101312)",
  },
];

const mediaIconMap = {
  tv: Tv,
  flame: Flame,
  film: Film,
  compass: Compass,
  book: BookOpen,
  youtube: Youtube,
  gamepad: Gamepad2,
} satisfies Record<(typeof navPageConfigs)[number]["icon"], LucideIcon>;

const navItems = navPageConfigs.map((item) => ({
  id: item.id,
  to: item.route,
  label: item.label,
  icon: mediaIconMap[item.icon],
}));

const defaultNavigationPreference = ["shows", "anime", "movies", "books", "games"];
const navigationUpdatedEventName = "tuvu:navigation-updated";

function navItemsForPreference(items: string[]) {
  const byId = new Map<string, (typeof navItems)[number]>(navItems.map((item) => [item.id, item]));
  const selected = items.map((id) => byId.get(id)).filter((item): item is (typeof navItems)[number] => Boolean(item && item.id !== "explore"));
  const fallback = selected.length >= 2 ? selected.slice(0, 6) : defaultNavigationPreference.map((id) => byId.get(id)).filter((item): item is (typeof navItems)[number] => Boolean(item));
  const explore = byId.get("explore")!;
  const midpoint = Math.ceil(fallback.length / 2);
  return [...fallback.slice(0, midpoint), explore, ...fallback.slice(midpoint)];
}

const profileNav = [
  { to: "/library", label: "All library", icon: Library },
  { to: "/profile/merge", label: "Merge media", icon: Library },
  { to: "/profile/messages", label: "Messages", icon: Mail },
  { to: "/profile/settings", label: "Settings", icon: Settings },
] as const;

const exploreFilters = trackableMediaTypes.map((type) => {
  const config = mediaConfigForType(type);
  return { type, label: config.pluralLabel, icon: mediaIconMap[config.icon] };
});

const mergeTypeFilters: Array<{ value: "all" | MediaType; label: string; icon: LucideIcon }> = [
  { value: "all", label: "All", icon: Library },
  ...trackableMediaTypes.map((type) => {
    const config = mediaConfigForType(type);
    return { value: type, label: config.pluralLabel, icon: mediaIconMap[config.icon] };
  }),
];

type ThemePreference = "light" | "dark" | "system";

function normalizeThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function resolvedTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return preference;
}

function applyThemePreference(preference: ThemePreference) {
  document.documentElement.dataset.theme = resolvedTheme(preference);
}

export function App() {
  useEffect(() => {
    const preference = normalizeThemePreference(localStorage.getItem(uiConstants.themeStorageKey));
    applyThemePreference(preference);
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (normalizeThemePreference(localStorage.getItem(uiConstants.themeStorageKey)) === "system") {
        applyThemePreference("system");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <SnackbarProvider>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<ProtectedShell />}>
          <Route index element={<Navigate to="/shows" replace />} />
          <Route path="/library" element={<AllLibraryPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/shows" element={<ShowsPage />} />
          <Route path="/anime" element={<AnimePage />} />
          <Route path="/movies" element={<MoviesPage />} />
          <Route path="/youtube" element={<YouTubePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/explore/type/:type" element={<ExploreTypePage />} />
          <Route path="/explore/search" element={<ExploreSearchPage />} />
          <Route path="/profile/explore" element={<Navigate to="/explore" replace />} />
          <Route path="/profile/messages" element={<MessagesPage />} />
          <Route path="/profile/settings" element={<SettingsPage />} />
          <Route path="/profile/import/tv-time" element={<ImportPage />} />
          <Route path="/profile/merge" element={<MergePage />} />
          <Route path="/profile/:username?" element={<ProfilePage />} />
          <Route path="/media/:type/:id" element={<MediaDetailPage />} />
          <Route path="/media/:type/:id/episodes/:episodeId" element={<EpisodeDetailPage />} />
          <Route path="/media/:type/:id/units/:unitId" element={<UnitDetailPage />} />
          <Route path="/people/:id" element={<PersonPlaceholderPage />} />
          <Route path="/lists/:id" element={<ListPage />} />
        </Route>
      </Routes>
    </SnackbarProvider>
  );
}

function SnackbarProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const recentNoticeRef = useRef(new Map<string, number>());

  useEffect(() => {
    const onNotice = (event: Event) => {
      const detail = (event as CustomEvent<Omit<AppNotice, "id">>).detail;
      if (!detail?.message) return;
      const tone = detail.tone ?? "info";
      const dedupeKey = `${tone}:${detail.message}`;
      const now = Date.now();
      const lastShown = recentNoticeRef.current.get(dedupeKey) ?? 0;
      if (now - lastShown < 4500) return;
      recentNoticeRef.current.set(dedupeKey, now);
      for (const [key, timestamp] of recentNoticeRef.current) {
        if (now - timestamp > 15_000) recentNoticeRef.current.delete(key);
      }
      const notice: AppNotice = { id: `${now}-${Math.random().toString(36).slice(2)}`, tone, message: detail.message, dismissible: detail.dismissible ?? true };
      setNotices((current) => [...current.slice(-3), notice]);
      window.setTimeout(() => {
        setNotices((current) => current.filter((item) => item.id !== notice.id));
      }, notice.tone === "error" ? 6500 : 4200);
    };
    window.addEventListener(noticeEventName, onNotice);
    return () => window.removeEventListener(noticeEventName, onNotice);
  }, []);

  return (
    <>
      {children}
      {createPortal(
        <div className="snackbar-stack" role="status" aria-live="polite">
          {notices.map((notice) => (
            <div className={`snackbar ${notice.tone}`} key={notice.id}>
              <span>{notice.message}</span>
              {notice.dismissible !== false && <button aria-label="Dismiss notice" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))}><X size={15} /></button>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

const MediaCreationContext = createContext<{ openCreateModal: (type?: MediaType) => void } | null>(null);
export function useMediaCreation() {
  const value = useContext(MediaCreationContext);
  if (!value) {
    throw new Error("useMediaCreation must be used inside a ProtectedShell/AppShell.");
  }
  return value;
}

function CreateMediaModal({ open, onClose, defaultType }: { open: boolean; onClose: () => void; defaultType?: MediaType }) {
  const { me } = useAuth();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MediaType>(defaultType ?? "show");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [posterPath, setPosterPath] = useState("");
  const [overview, setOverview] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [runtimeMinutes, setRuntimeMinutes] = useState("");
  const [language, setLanguage] = useState("");
  const [source, setSource] = useState("manual");
  const [sourceId, setSourceId] = useState("");
  const [seasonsCount, setSeasonsCount] = useState(1);
  const [seasonEpisodeCounts, setSeasonEpisodeCounts] = useState([10]);
  const [unitCount, setUnitCount] = useState(0);
  const [unitKind, setUnitKind] = useState<"chapter" | "act" | "mission" | "quest">("chapter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open && defaultType) { setType(defaultType); setUnitKind(defaultType === "book" ? "chapter" : "mission"); } }, [open, defaultType]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    try {
      setBusy(true);
      setError(null);

      // 1. Create media
      const mediaRes = await apiJson<{ media: { id: string } }>("/api/media", {
        method: "POST",
        csrfToken: me.csrfToken,
        body: JSON.stringify({
          type,
          title: title.trim(),
          year,
          overview: overview.trim() || undefined,
          posterPath: posterPath.trim() || undefined,
          releaseDate: releaseDate || undefined,
          runtimeMinutes: runtimeMinutes ? Number(runtimeMinutes) : undefined,
          language: language.trim() || undefined,
          source,
          sourceId: sourceId.trim() || undefined,
        }),
      });
      const mediaId = mediaRes.media.id;

      // 2. Create seasons & episodes (only if show or anime)
      if (type === "show" || type === "anime") {
        for (let s = 1; s <= seasonsCount; s++) {
          await apiJson(`/api/media/${mediaId}/seasons`, {
            method: "POST",
            csrfToken: me.csrfToken,
            body: JSON.stringify({ seasonNumber: s, name: `Season ${s}`, isSpecial: false }),
          });

          for (let ep = 1; ep <= (seasonEpisodeCounts[s - 1] ?? 0); ep++) {
            await apiJson(`/api/media/${mediaId}/episodes`, {
              method: "POST",
              csrfToken: me.csrfToken,
              body: JSON.stringify({
                seasonNumber: s,
                episodeNumber: ep,
                name: `Episode ${ep}`,
                isSpecial: false,
              }),
            });
          }
        }
      } else if ((type === "book" || type === "game") && unitCount > 0) {
        for (let position = 1; position <= unitCount; position++) {
          await apiJson(`/api/media/${mediaId}/units`, { method: "POST", csrfToken: me.csrfToken, body: JSON.stringify({ kind: unitKind, position, title: `${unitKind[0]!.toUpperCase()}${unitKind.slice(1)} ${position}` }) });
        }
      }

      // 3. Add to library
      await apiJson(`/api/library/${mediaId}`, {
        method: "POST",
        csrfToken: me.csrfToken,
      });
      clearDashboardCaches(me.user.id);

      onClose();
      // Redirect to detail page
      window.location.assign(`/media/${type}/${mediaId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create media.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add Custom Media" open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="settings-form" style={{ display: "grid", gap: "1rem" }}>
        <label>
          Title
          <input required value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} placeholder="e.g. Severance" />
        </label>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as MediaType)} disabled={busy}>
            <option value="show">Show</option>
            <option value="movie">Movie</option>
            <option value="anime">Anime</option>
            <option value="game">Game</option>
            <option value="book">Book</option>
          </select>
        </label>
        <label>
          Release Year
          <input type="number" min={1888} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={busy} />
        </label>
        <label>
          Cover Image URL (optional)
          <input value={posterPath} onChange={(e) => setPosterPath(e.target.value)} disabled={busy} placeholder="https://example.com/cover.jpg" />
        </label>
        <label>
          Summary (optional)
          <textarea value={overview} onChange={(e) => setOverview(e.target.value)} disabled={busy} placeholder="Plot, premise, or a short description" />
        </label>
        <div className="form-grid">
          <label>Release date<input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} disabled={busy} /></label>
          <label>Runtime (minutes)<input type="number" min={1} value={runtimeMinutes} onChange={(e) => setRuntimeMinutes(e.target.value)} disabled={busy} placeholder="Optional" /></label>
          <label>Language<input value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy} placeholder="e.g. en" /></label>
          <label>Source<select value={source} onChange={(e) => setSource(e.target.value)} disabled={busy}><option value="manual">Manual</option><option value="tmdb">TMDB</option><option value="tvdb">TVDB</option><option value="rawg">RAWG</option><option value="openlibrary">Open Library</option></select></label>
          {source !== "manual" && <label>Source ID<input value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={busy} placeholder="Provider identifier" /></label>}
        </div>
        {(type === "show" || type === "anime") && (
          <div className="season-builder">
            <label>
              Seasons
              <input type="number" min={1} max={50} value={seasonsCount} onChange={(e) => {
                const count = Math.max(1, Math.min(50, Number(e.target.value)));
                setSeasonsCount(count);
                setSeasonEpisodeCounts((current) => Array.from({ length: count }, (_, index) => current[index] ?? 10));
              }} disabled={busy} />
            </label>
            <div className="season-count-grid">
              {seasonEpisodeCounts.map((count, index) => <label key={index}>Season {index + 1}<input aria-label={`Season ${index + 1} episode count`} type="number" min={0} max={100} value={count} onChange={(e) => setSeasonEpisodeCounts((current) => current.map((value, position) => position === index ? Math.max(0, Number(e.target.value)) : value))} disabled={busy} /></label>)}
            </div>
          </div>
        )}
        {(type === "book" || type === "game") && <div className="form-grid"><label>Trackable unit<select value={unitKind} onChange={(event) => setUnitKind(event.target.value as typeof unitKind)}>{type === "book" ? <><option value="chapter">Chapter</option><option value="act">Part / act</option></> : <><option value="mission">Mission</option><option value="quest">Quest</option><option value="act">Act</option></>}</select></label><label>How many (optional)<input type="number" min={0} max={200} value={unitCount} onChange={(event) => setUnitCount(Math.max(0, Number(event.target.value)))} /></label></div>}        {error && <span className="input-error">{error}</span>}
        <div className="action-row">
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Creating..." : "Create & Track"}
          </button>
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AppShell() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<MediaType>("show");
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [globalSearch, setGlobalSearch] = useState("");
  const [shellNavItems, setShellNavItems] = useState(() => navItemsForPreference(defaultNavigationPreference));
  const [showLabelsMobile, setShowLabelsMobile] = useState(false);
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);

  const openCreateModal = (type: MediaType = "show") => {
    setDefaultType(type);
    setIsCreateOpen(true);
  };

  const contextValue = useMemo(() => ({ openCreateModal }), []);

  useEffect(() => {
    const handleFocus = () => {
      globalSearchInputRef.current?.focus();
    };
    window.addEventListener("tuvu:focus-search-input", handleFocus);
    return () => window.removeEventListener("tuvu:focus-search-input", handleFocus);
  }, []);

  useLibraryVersionRevalidator(me, refresh, location.pathname);

  useEffect(() => {
    let cancelled = false;
    const loadNavigation = async () => {
      try {
        const data = await apiJson<{ navigation: { items: string[]; showLabelsMobile?: boolean } }>("/api/settings/navigation");
        if (!cancelled) {
          setShellNavItems(navItemsForPreference(data.navigation.items));
          setShowLabelsMobile(data.navigation.showLabelsMobile ?? false);
        }
      } catch {
        if (!cancelled) {
          setShellNavItems(navItemsForPreference(defaultNavigationPreference));
          setShowLabelsMobile(false);
        }
      }
    };
    const onNavigationUpdated = () => { void loadNavigation(); };
    window.addEventListener(navigationUpdatedEventName, onNavigationUpdated);
    window.addEventListener("focus", onNavigationUpdated);
    void loadNavigation();
    return () => {
      cancelled = true;
      window.removeEventListener(navigationUpdatedEventName, onNavigationUpdated);
      window.removeEventListener("focus", onNavigationUpdated);
    };
  }, [me.user.id]);

  return (
    <MediaCreationContext.Provider value={contextValue}>
      <div className="app-shell">
        <aside className="desktop-rail">
          <BrandMark />
          <nav className="rail-nav" aria-label="Primary">
            {shellNavItems.map((item) => (
              <ShellNavLink key={item.to} {...item} />
            ))}
          </nav>
        </aside>

        <div className="app-frame">
          <header className="topbar">
            <BrandMark compact />
            <SearchField
              variant="pill"
              className="search-box"
              inputRef={globalSearchInputRef}
              icon={<Search size={18} aria-hidden="true" />}
              label="Search media"
              placeholder="Search any media"
              value={globalSearch}
              onChange={setGlobalSearch}
              onClear={() => { setGlobalSearch(""); globalSearchInputRef.current?.blur(); }}
              onSubmit={() => {
                const query = globalSearch.trim();
                if (query.length >= 2) {
                  globalSearchInputRef.current?.blur();
                  (document.activeElement as HTMLElement | null)?.blur();
                  navigate(`/explore/search?q=${encodeURIComponent(query)}`);
                }
              }}
            />
            <ProfileTopButton me={me} hasNotification={false} />
          </header>

          <Outlet />
        </div>

        <nav className={showLabelsMobile ? "bottom-nav show-labels" : "bottom-nav"} aria-label="Primary" style={{ gridTemplateColumns: `repeat(${shellNavItems.length}, minmax(0, 1fr))` }}>
          {shellNavItems.map((item) => (
            <ShellNavLink key={item.to} {...item} compact />
          ))}
          </nav>
      </div>

      <CreateMediaModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} defaultType={defaultType} />
      <GlobalImportProgress />
    </MediaCreationContext.Provider>
  );
}

function GlobalImportProgress() {
  const importState = useImport();
  const location = useLocation();
  const { me } = useAuth();

  if (!importState || !importState.activeJob || (importState.activeJob.status !== "committing" && importState.activeJob.status !== "rolling_back" && importState.activeJob.status !== "failed") || !importState.importProgress) return null;
  if (location.pathname === "/profile/import/tv-time") return null;

  const percentage = Math.round((importState.importProgress.processed / importState.importProgress.total) * 100) || 0;
  const isFailed = importState.activeJob.status === "failed";
  const isActive = importState.activeJob.status === "committing" || importState.activeJob.status === "rolling_back";
  const isRollingBack = importState.activeJob.status === "rolling_back";
  const label = isFailed ? "Failed" : isRollingBack ? "Rolling back..." : "Importing library...";
  const fillColor = isFailed ? "rgba(255,107,107,0.2)" : isRollingBack ? "rgba(255,207,92,0.1)" : undefined;
  const jobId = importState.activeJob.id;

  return (
    <div className="global-import-progress">
      <div className="progress-pill" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div className="progress-pill-fill" style={{ width: `${isFailed ? 100 : percentage}%`, backgroundColor: fillColor }} />
        <NavLink to="/profile/import/tv-time" className="progress-pill-info" style={{ flex: 1, textDecoration: "none" }}>
          <span className="progress-pill-label" style={{ color: isFailed ? "#ff6b6b" : undefined }}>{label}</span>
          {!isFailed && <span className="progress-pill-count">{importState.importProgress.processed} / {importState.importProgress.total}</span>}
        </NavLink>
        {isActive && (
          <button
            aria-label="Stop import"
            title="Stop import"
            onClick={(e) => { e.stopPropagation(); void importState.abandonJob(jobId, me.csrfToken); }}
            style={{ position: "relative", zIndex: 2, background: "rgba(255,107,107,0.15)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: "6px", cursor: "pointer", color: "#ff8080", fontSize: "0.72rem", fontWeight: 600, lineHeight: 1, padding: "0.2rem 0.45rem", flexShrink: 0 }}
          >Stop</button>
        )}
        <button
          aria-label="Dismiss"
          onClick={(e) => { e.stopPropagation(); importState.dismissActiveJob(); }}
          style={{ position: "relative", zIndex: 2, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: "1.1rem", lineHeight: 1, padding: "0.25rem", flexShrink: 0 }}
        >✕</button>
      </div>
      {(isFailed && (importState.activeJob.error_message || importState.activeJob.errorMessage)) && (
        <div className="progress-pill" style={{ marginTop: "0.25rem", background: "rgba(255, 107, 107, 0.07)", border: "1px solid rgba(255, 107, 107, 0.2)" }}>
          <div className="progress-pill-error" style={{ padding: "0.25rem 0" }}>{importState.activeJob.error_message || importState.activeJob.errorMessage}</div>
          <button aria-label="Dismiss error" onClick={() => importState.dismissActiveJob()} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: "1.1rem", padding: "0.25rem" }}>✕</button>
        </div>
      )}
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <NavLink to="/" className={compact ? "brand brand-compact" : "brand"} aria-label="Tuvu home">
      <img src="/app-icon.png" alt="" />
      <span>Tuvu</span>
    </NavLink>
  );
}

function ProfileTopButton({ me, hasNotification }: { me: MePayload; hasNotification: boolean }) {
  return (
    <NavLink className="profile-top-button" to="/profile" aria-label="Open profile">
      <img src={me.profile.avatarUrl ?? "/app-icon.png"} alt="" />
      <span className={hasNotification ? "notification-dot active" : "notification-dot"} aria-hidden="true" />
    </NavLink>
  );
}

function ShellNavLink({
  to,
  label,
  icon: Icon,
  compact = false,
}: {
  to: string;
  label: string;
  icon: typeof Tv;
  compact?: boolean;
}) {
  const location = useLocation();
  const currentPath = location.pathname;

  let active = false;
  if (to === "/books") {
    active = currentPath === "/books" || currentPath.startsWith("/media/book/");
  } else if (to === "/games") {
    active = currentPath === "/games" || currentPath.startsWith("/media/game/");
  } else if (to === "/movies") {
    active = currentPath === "/movies" || currentPath.startsWith("/media/movie/");
  } else if (to === "/shows") {
    active = currentPath === "/shows" || currentPath.startsWith("/media/show/");
  } else if (to === "/anime") {
    active = currentPath === "/anime" || currentPath.startsWith("/media/anime/");
  } else if (to === "/explore") {
    active = currentPath.startsWith("/explore");
  } else {
    active = currentPath === to;
  }

  const handleClick = (event: React.MouseEvent) => {
    if (to === "/explore" && currentPath === "/explore") {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("tuvu:focus-search-input"));
    }
  };

  return (
    <NavLink to={to} className={active ? "nav-link active" : "nav-link"} onClick={handleClick}>
      <Icon size={compact ? 21 : 19} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

function AuthPage() {
  const { me, loading } = useMe();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [mode, setMode] = useState<"register" | "login">("register");
  const [message, setMessage] = useState("Create an account or log in from any device.");
  const [busy, setBusy] = useState(false);
  const [showPasskeyPrompt, setShowPasskeyPrompt] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<MePayload | null>(null);

  if (!loading && me) {
    return <Navigate to="/shows" replace />;
  }

  async function handlePasswordAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Contacting auth service...");
    setErrors({});

    try {
      let payload: MePayload;
      if (mode === "register") {
        payload = await apiJson<MePayload>("/api/auth/password/register", {
          method: "POST",
          body: JSON.stringify({ email: email.trim(), username: username.trim(), displayName: displayName.trim(), password }),
        });
        setMessage("Registered successfully!");
      } else {
        payload = await apiJson<MePayload>("/api/auth/password/login", {
          method: "POST",
          body: JSON.stringify({ email: email.trim(), password }),
        });
        setMessage("Logged in successfully!");
      }

      setRegisteredUser(payload);
      if (window.PublicKeyCredential) {
        setShowPasskeyPrompt(true);
      } else {
        window.location.assign("/profile");
      }
    } catch (error: any) {
      setMessage("Create an account or log in from any device.");
      if (error.code === "validation_failed" && error.details?.fieldErrors) {
        setErrors(error.details.fieldErrors);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePasskey() {
    if (!registeredUser) return;
    setBusy(true);
    setMessage("Generating passkey options...");
    try {
      const options = await apiJson<any>("/api/auth/passkey/register/options", {
        method: "POST",
        csrfToken: registeredUser.csrfToken,
        body: JSON.stringify({}),
      });

      setMessage("Please complete the passkey prompt on your device...");
      const credential = await startRegistration({ optionsJSON: options.publicKey });

      await apiJson("/api/auth/passkey/register/verify", {
        method: "POST",
        csrfToken: registeredUser.csrfToken,
        body: JSON.stringify({
          challengeId: options.challengeId,
          credential,
        }),
      });

      setMessage("Passkey saved successfully! Redirecting...");
      setTimeout(() => {
        window.location.assign("/profile");
      }, 1000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey registration failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleSkipPasskey() {
    window.location.assign("/profile");
  }

  async function handlePasskeyLogin() {
    setBusy(true);
    setMessage("Initializing passkey login...");
    setErrors({});
    try {
      const options = await apiJson<any>("/api/auth/passkey/login/options", {
        method: "POST",
        body: JSON.stringify({}),
      });

      setMessage("Please authenticate using your passkey...");
      const credential = await startAuthentication({ optionsJSON: options.publicKey });

      await apiJson("/api/auth/passkey/login/verify", {
        method: "POST",
        body: JSON.stringify({
          challengeId: options.challengeId,
          credentialId: credential.id,
          credential,
        }),
      });

      setMessage("Logged in successfully! Opening your profile...");
      window.location.assign("/profile");
    } catch (error) {
      setMessage("Create an account or log in from any device.");
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth() {
    setBusy(true);
    try {
      const result = await apiJson<{ authorizationUrl: string }>("/api/auth/oauth/github/start");
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setMessage("Create an account or log in from any device.");
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <img src="/app-icon.png" alt="" className="auth-icon" />
        <p className="eyebrow">Personal media tracking</p>
        <h1 id="auth-heading">Tuvu</h1>
        <p className="auth-copy">
          Keep shows, movies, anime, games, and books in one quiet place.
        </p>

        <form className="auth-form" onSubmit={handlePasswordAuth}>
            <label className="full-width">
              Email
              <input value={email} type="email" placeholder="you@example.com" autoComplete="email" onChange={(event) => setEmail(event.target.value)} />
              {errors.email && <span className="input-error">{errors.email[0]}</span>}
            </label>
            {mode === "register" ? (
              <>
                <label className="half-width">
                  Username
                  <input value={username} placeholder="your_username" autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
                  {errors.username && <span className="input-error">{errors.username[0]}</span>}
                </label>
                <label className="half-width">
                  Display name
                  <input value={displayName} placeholder="Your display name" autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} />
                  {errors.displayName && <span className="input-error">{errors.displayName[0]}</span>}
                </label>
              </>
            ) : null}
            <label className="full-width">
              Password
              <input value={password} placeholder="At least 8 characters" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} onChange={(event) => setPassword(event.target.value)} />
              {errors.password && <span className="input-error">{errors.password[0]}</span>}
            </label>
            <div className="segmented-control" aria-label="Auth mode">
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
              Register
            </button>
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
              Login
            </button>
          </div>

          <div style={{ display: "grid", gap: "0.8rem", marginTop: "1rem" }}>
            <div className="auth-actions">
              <button className="primary-button" disabled={busy}>
                <ShieldCheck size={18} aria-hidden="true" />
                {mode === "register" ? "Create account" : "Log in"}
              </button>
              {mode === "login" && (
                <button className="secondary-button" type="button" onClick={handlePasskeyLogin} disabled={busy}>
                  <ShieldCheck size={18} aria-hidden="true" />
                  Log in with Passkey
                </button>
              )}
              <button className="secondary-button" type="button" onClick={handleOAuth} disabled={busy}>
                <Sparkles size={18} aria-hidden="true" />
                Continue with OAuth
              </button>
            </div>
            <p className="form-message" role="status" style={{ textAlign: "center", margin: 0 }}>{message}</p>
          </div>
        </form>
      </section>

      <Modal title="Enable Passkey?" open={showPasskeyPrompt} onClose={handleSkipPasskey}>
        <div className="passkey-prompt-content">
          <p>
            Create a passkey for this device. Next time, you can log in securely using your fingerprint, face scan, or device PIN instead of typing your password.
          </p>
          <div className="prompt-actions">
            <button className="primary-button" onClick={handleCreatePasskey} disabled={busy}>
              Create passkey
            </button>
            <button className="secondary-button" onClick={handleSkipPasskey} disabled={busy}>
              Skip for now
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}

function ProtectedShell() {
  const { me, refresh, loading } = useMe();
  const value = useMemo(() => (me ? { me, refresh } : null), [me, refresh]);

  if (loading) {
    return (
      <main className="auth-page">
        <section className="auth-panel" aria-live="polite">
          <img src="/app-icon.png" alt="" className="auth-icon" />
          <p className="eyebrow">Checking session</p>
          <h1>Tuvu</h1>
          <p className="auth-copy">Opening your library...</p>
        </section>
      </main>
    );
  }

  if (!value) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <AuthContext.Provider value={value}>
      <ImportProvider>
        <AppShell />
      </ImportProvider>
    </AuthContext.Provider>
  );
}

type LibraryEntry = {
  item: {
    id: string;
    userId: string;
    mediaId: string;
    status: string;
    isFavorite: boolean;
    rating: number | null;
    notes: string | null;
    watchedAt: string | null;
    rewatchCount: number;
    progressEpisodes: number;
    progressValue: number | null;
    progressTotal: number | null;
    progressUnit: string | null;
    platform: string | null;
    visibility: string;
    createdAt: string;
    updatedAt: string;
  };
  media: {
    id: string;
    type: MediaType;
    title: string;
    overview: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    airStatus: string | null;
    runtimeMinutes: number | null;
    releaseDate: string | null;
    year: number | null;
    language: string | null;
    country: string | null;
    source: string;
    sourceId: string | null;
    totalEpisodes: number | null;
    totalSeasons: number | null;
  };
};

function useLibrary() {
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLibrary = async () => {
    try {
      const data = await apiJson<{ library: LibraryEntry[] }>("/api/library");
      setLibrary(data.library);
    } catch (err) {
      console.error("Failed to load library items", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  return { library, loading, refresh: fetchLibrary };
}

function mergeMediaItems(staticItems: MediaCardItem[], library: LibraryEntry[]): MediaCardItem[] {
  const merged: MediaCardItem[] = [];
  const processedMediaIds = new Set<string>();

  for (const staticItem of staticItems) {
    const matchingLib = library.find(
      (entry) => entry.media.title.toLowerCase() === staticItem.title.toLowerCase()
    );

    if (matchingLib) {
      processedMediaIds.add(matchingLib.media.id);

      let tone: StatusTone = "planned";
      if (matchingLib.item.status === "watching" || matchingLib.item.status === "playing" || matchingLib.item.status === "reading") {
        tone = "watching";
      } else if (matchingLib.item.status === "completed" || matchingLib.item.status === "watched" || matchingLib.item.status === "finished") {
        tone = "complete";
      } else if (matchingLib.item.status === "dropped" || matchingLib.item.status === "stopped") {
        tone = "stopped";
      }

      let progress = 0;
      if (matchingLib.media.type === "show" || matchingLib.media.type === "anime") {
        const totalEps = staticItem.id === "severance" ? 9 : staticItem.id === "frieren" ? 28 : 5;
        progress = Math.min(100, Math.round((matchingLib.item.progressEpisodes / totalEps) * 100));
      } else if (matchingLib.media.type === "movie") {
        progress = matchingLib.item.status === "watched" ? 100 : 0;
      }

      merged.push({
        ...staticItem,
        id: matchingLib.media.id,
        status: matchingLib.item.status.replace("_", " "),
        progress,
        tone,
        posterPath: matchingLib.media.posterPath,
      });
    } else {
      merged.push(staticItem);
    }
  }

  for (const entry of library) {
    if (!processedMediaIds.has(entry.media.id)) {
      let tone: StatusTone = "planned";
      if (entry.item.status === "watching" || entry.item.status === "playing" || entry.item.status === "reading") {
        tone = "watching";
      } else if (entry.item.status === "completed" || entry.item.status === "watched" || entry.item.status === "finished") {
        tone = "complete";
      } else if (entry.item.status === "dropped" || entry.item.status === "stopped") {
        tone = "stopped";
      }

      let progress = 0;
      if (entry.media.type === "show" || entry.media.type === "anime") {
        if (entry.item.status === "completed") {
          progress = 100;
        } else {
          progress = entry.item.progressEpisodes > 0 ? 50 : 0;
        }
      } else if (entry.media.type === "movie") {
        progress = entry.item.status === "watched" ? 100 : 0;
      }

      merged.push({
        id: entry.media.id,
        title: entry.media.title,
        meta: entry.media.year ? `Released in ${entry.media.year}` : entry.media.type,
        type: entry.media.type,
        progress,
        status: entry.item.status.replace("_", " "),
        tone,
        accent: "linear-gradient(145deg, #2b2f36, #0f1115)",
        posterPath: entry.media.posterPath,
      });
    }
  }

  return merged;
}

function ShowsPage() {
  return <DashboardPage kind="shows" mediaType="show" title="Shows" description="Pick up the next episode, catch up, or reorganize what you want to watch." />;
}

function AnimePage() {
  return <DashboardPage kind="anime" mediaType="anime" title="Anime" description="Manage, track, and discover your anime collections." />;
}

function useLibraryVersionRevalidator(me: MePayload, refresh: () => Promise<void>, pathname: string) {
  const lastVersionRef = useRef(libraryVersion(me));
  const checkingRef = useRef(false);

  useEffect(() => {
    const current = libraryVersion(me);
    if (current !== lastVersionRef.current) {
      queryCache.invalidatePrefix(["dashboard", me.user.id]);
      queryCache.invalidatePrefix(["media-detail", me.user.id]);
      queryCache.invalidatePrefix(["explore-rows", me.user.id]);
      queryCache.invalidatePrefix(["explore-search", me.user.id]);
      queryCache.invalidatePrefix(["profile", me.user.id]);
      queryCache.invalidatePrefix(["settings", me.user.id]);
      lastVersionRef.current = current;
    }
  }, [me.user.id, me.libraryVersion]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        await refresh();
      } finally {
        if (!cancelled) checkingRef.current = false;
      }
    };

    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setTimeout(() => { void check(); }, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname, refresh]);
}

function YouTubePage() {
  return (
    <AppPage eyebrow="YouTube" title="YouTube" description="Track video series, channels, and content creators." mobileHelp>
      <EmptyState
        icon={<Youtube size={24} />}
        title="YouTube Tracker coming soon"
        message="YouTube channel subscriptions, series tracking, and creator updates are coming in the next phase."
      />
    </AppPage>
  );
}

function MoviesPage() {
  return <DashboardPage kind="movies" mediaType="movie" title="Movies" description="Your watchlist, watched movies, favorites, and upcoming releases." />;
}

function BooksPage() {
  return <DashboardPage kind="books" mediaType="book" title="Books & Manga" description="Keep reading, plan the next book, and revisit finished favorites." />;
}

function GamesPage() {
  return <DashboardPage kind="games" mediaType="game" title="Games" description="Move between your backlog, current games, completed titles, and upcoming releases." />;
}

type LibraryItemPayload = {
  item: NonNullable<MediaDetailData["userMedia"]>;
  media: MediaDetailData["media"];
};

function AllLibraryPage() {
  const [type, setType] = useState<"all" | MediaType>("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LibraryItemPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("limit", "5000");
    if (type !== "all") params.set("type", type);
    if (status !== "all") params.set("status", status);
    setLoading(true);
    apiJson<{ library: LibraryItemPayload[] }>(`/api/library?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setItems(data.library);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(friendlyErrorMessage(reason, "Library could not be loaded."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [type, status]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((entry) => !normalized || entry.media.title.toLowerCase().includes(normalized));
  }, [items, query]);

  const statusChoices = type === "all" ? allMediaStatuses : statusOptionsForMediaType(type);

  return (
    <AppPage eyebrow="Library" title="All Library" description="Filter everything you track across shows, movies, anime, books, and games." mobileHelp>
      <div className="dashboard-toolbar">
        <SearchField className="dashboard-search" inputRef={searchRef} icon={<Search size={16} />} value={query} onChange={setQuery} onClear={() => { setQuery(""); searchRef.current?.blur(); }} placeholder="Filter library" label="Filter all library" />
      </div>
      <div className="filter-row">
        {(["all", ...trackableMediaTypes] as Array<"all" | MediaType>).map((option) => <button key={option} className={type === option ? "chip-button active" : "chip-button"} onClick={() => { setType(option); setStatus("all"); }}>{option === "all" ? "All" : mediaConfigForType(option).label}</button>)}
      </div>
      <div className="filter-row">
        <button className={status === "all" ? "chip-button active" : "chip-button"} onClick={() => setStatus("all")}>All statuses</button>
        {statusChoices.map((option) => <button key={option} className={status === option ? "chip-button active" : "chip-button"} onClick={() => setStatus(option)}>{formatStatusLabel(option)}</button>)}
      </div>
      {loading && <SkeletonGrid />}
      {!loading && filtered.length === 0 && <EmptyState icon={<Library size={24} />} title="No library matches" message="Try a different media type, status, or search term." />}
      <section className="search-results-list" aria-label="All library results">
        {filtered.map(({ item, media }) => <NavLink className="explore-result-card" key={media.id} to={`/media/${media.type}/${media.id}`}>
          <div className="explore-result-poster" style={media.posterPath ? { backgroundImage: `url(${media.posterPath})` } : undefined}>{!media.posterPath && <span>{media.title.slice(0, 2).toUpperCase()}</span>}</div>
          <div className="explore-result-copy">
            <div><span className="status-chip planned">{displayMediaType(media)}</span><span className="muted-copy"> {formatStatusLabel(item.status)}</span></div>
            <h2>{media.title}</h2>
            {media.overview && <p>{media.overview}</p>}
            <span className="muted-copy">{media.year ?? "Year TBA"}{item.rating ? ` - ${Math.min(5, item.rating)}/5` : ""}</span>
          </div>
          <ChevronRight size={18} />
        </NavLink>)}
      </section>
    </AppPage>
  );
}

function displayMediaType(media: MediaDetailData["media"]) {
  return isAnimeMedia(media) ? "anime" : media.type;
}

type DashboardPayload = {
  entries: DashboardEntry[];
  sections: DashboardSection[];
  totalTracked?: number;
  statusCounts?: Record<string, number>;
  sectionCounts?: Record<string, number>;
  page: { limit: number; offset: number; hasMore: boolean };
};

type DashboardCacheEntry = {
  payload: DashboardPayload;
  activeSection: string;
  query: string;
  sort: string;
  view: "grid" | "compact";
  scrollY: number;
  savedAt: number;
};

const dashboardCacheTtlMs = 10 * 60_000;

function libraryVersion(me: MePayload) {
  return me.libraryVersion ?? 1;
}

function readDashboardCache(userId: string, version: number, kind: DashboardKind) {
  return queryCache.get<DashboardCacheEntry>(queryKeys.dashboard(userId, version, kind));
}

function writeDashboardCache(userId: string, version: number, kind: DashboardKind, entry: DashboardCacheEntry, persist = true) {
  queryCache.set(queryKeys.dashboard(userId, version, kind), entry, { ttlMs: dashboardCacheTtlMs, persist });
}

function clearDashboardCaches(userId: string) {
  queryCache.invalidatePrefix(["dashboard", userId]);
  queryCache.invalidatePrefix(["media-detail", userId]);
  queryCache.invalidatePrefix(["explore-rows", userId]);
  queryCache.invalidatePrefix(["explore-search", userId]);
  queryCache.invalidatePrefix(["profile", userId]);
  queryCache.invalidatePrefix(["settings", userId]);
}

function DashboardPage({ kind, mediaType, title, description }: { kind: DashboardKind; mediaType: MediaType; title: string; description: string }) {
  const { me } = useAuth();
  const { openCreateModal } = useMediaCreation();
  const version = libraryVersion(me);
  const initialCache = useMemo(() => readDashboardCache(me.user.id, version, kind), [me.user.id, version, kind]);
  const [payload, setPayload] = useState<DashboardPayload | null>(() => initialCache?.payload ?? null);
  const [searchPayload, setSearchPayload] = useState<DashboardPayload | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeSection, setActiveSection] = useState(() => initialCache?.activeSection ?? "all");
  const [query, setQuery] = useState(() => initialCache?.query ?? "");
  const [sort, setSort] = useState(() => initialCache?.sort ?? "updated");
  const [view, setView] = useState<"grid" | "compact">(() => initialCache?.view ?? "grid");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const restoredScrollRef = useRef(false);

  const load = async (nextOffset = 0) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const next = await apiJson<DashboardPayload>(`/api/library/dashboard/${kind}?limit=50&offset=${nextOffset}`);
      const normalized: DashboardPayload = {
        entries: Array.isArray(next.entries) ? next.entries : [],
        sections: Array.isArray(next.sections) ? next.sections : [{ id: "all", label: `All ${title}`, entries: [] }],
        totalTracked: next.totalTracked,
        statusCounts: next.statusCounts,
        sectionCounts: next.sectionCounts,
        page: next.page ?? { limit: 50, offset: nextOffset, hasMore: false },
      };

      setPayload((prev) => {
        if (nextOffset === 0 || !prev) {
          return normalized;
        }

        // Merge entries
        const mergedEntries = [...prev.entries, ...normalized.entries];

        // Merge sections
        const mergedSections = prev.sections.map((prevSec) => {
          const nextSec = normalized.sections.find((s) => s.id === prevSec.id);
          return {
            ...prevSec,
            entries: [...prevSec.entries, ...(nextSec ? nextSec.entries : [])],
          };
        });

        // Add any new sections
        for (const nextSec of normalized.sections) {
          if (!mergedSections.some((s) => s.id === nextSec.id)) {
            mergedSections.push(nextSec);
          }
        }

        return {
          entries: mergedEntries,
          sections: mergedSections,
          totalTracked: normalized.totalTracked ?? prev.totalTracked,
          statusCounts: normalized.statusCounts ?? prev.statusCounts,
          sectionCounts: normalized.sectionCounts ?? prev.sectionCounts,
          page: normalized.page,
        };
      });

      if (nextOffset === 0) {
        setActiveSection((current) => normalized.sections.some((section) => section.id === current && section.entries.length) ? current : (normalized.sections.find((section) => section.entries.length)?.id ?? "all"));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dashboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (searchPayload || loading || !payload?.page.hasMore) return;
    const nextOffset = (payload.page.offset ?? 0) + 50;
    await load(nextOffset);
  };

  useEffect(() => {
    const cached = readDashboardCache(me.user.id, version, kind);
    restoredScrollRef.current = false;
      if (cached) {
        setPayload(cached.payload);
        setActiveSection(cached.activeSection);
        setQuery(cached.query);
        setSort(cached.sort);
      setView(cached.view);
      window.requestAnimationFrame(() => {
        window.scrollTo(0, cached.scrollY);
        restoredScrollRef.current = true;
      });
      void load(0);
      return;
    }
    setPayload(null);
    setActiveSection("all");
    setQuery("");
    setSort("updated");
    setView("grid");
    void load(0);
  }, [me.user.id, version, kind]);

  useEffect(() => {
    if (!payload) return;
    const entry = { payload, activeSection, query, sort, view, scrollY: window.scrollY, savedAt: Date.now() };
    writeDashboardCache(me.user.id, version, kind, entry);
  }, [me.user.id, version, kind, payload, activeSection, query, sort, view]);

  useEffect(() => {
    const saveScroll = () => {
      if (!payload) return;
      writeDashboardCache(me.user.id, version, kind, { payload, activeSection, query, sort, view, scrollY: window.scrollY, savedAt: Date.now() }, false);
    };
    const persistScroll = () => {
      if (!payload) return;
      writeDashboardCache(me.user.id, version, kind, { payload, activeSection, query, sort, view, scrollY: window.scrollY, savedAt: Date.now() }, true);
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("pagehide", persistScroll);
    return () => {
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("pagehide", persistScroll);
    };
  }, [me.user.id, version, kind, payload, activeSection, query, sort, view]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (searchPayload || !payload?.page.hasMore || loading) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        void loadMore();
      }
    }, { rootMargin: "250px" });

    const currentSentinel = sentinelRef.current;
    if (currentSentinel) {
      observer.observe(currentSentinel);
    }

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [searchPayload, payload?.page.hasMore, loading, payload?.page.offset]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchPayload(null);
      setSearching(false);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      apiJson<DashboardPayload>(`/api/library/dashboard/${kind}?limit=5000&offset=0&q=${encodeURIComponent(trimmed)}`)
        .then((next) => {
          setSearchPayload({
            entries: Array.isArray(next.entries) ? next.entries : [],
            sections: Array.isArray(next.sections) ? next.sections : [],
            totalTracked: next.totalTracked,
            statusCounts: next.statusCounts,
            sectionCounts: next.sectionCounts,
            page: next.page ?? { limit: 5000, offset: 0, hasMore: false },
          });
          setError(null);
        })
        .catch((reason) => setError(friendlyErrorMessage(reason, "Search could not be completed.")))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [kind, query]);

  const visiblePayload = searchPayload ?? payload;
  const section = visiblePayload?.sections.find((candidate) => candidate.id === activeSection) ?? visiblePayload?.sections.at(-1);

  const entries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = (section?.entries ?? []).filter((entry) => !normalized || entry.title.toLowerCase().includes(normalized));
    return [...filtered].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "year") return (b.year ?? 0) - (a.year ?? 0);
      if (sort === "progress") return b.progressEpisodes - a.progressEpisodes;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [section, query, sort]);

  const markNextWatched = async (episodeId: string) => {
    try {
      await apiJson(`/api/episodes/${episodeId}/watched`, { method: "POST", csrfToken: me.csrfToken, body: JSON.stringify({}) });
      clearDashboardCaches(me.user.id);
      await load(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Episode could not be updated.");
    }
  };

  const sectionTabs = (payload?.sections ?? []).map((candidate) => {
    let count = payload?.sectionCounts?.[candidate.id] ?? candidate.entries.length;
    if (candidate.id === "all" && payload?.totalTracked !== undefined) {
      count = payload.totalTracked;
    }
    return {
      id: candidate.id,
      label: candidate.label,
      count,
    };
  });

  return (
    <AppPage eyebrow="Library" title={title} description={description} mobileHelp action={<IconButton label={`Add ${mediaType}`} onClick={() => openCreateModal(mediaType)}><Plus size={18} /></IconButton>}>
      {payload && <DashboardStats entries={payload.entries} kind={kind} totalTracked={payload.totalTracked} statusCounts={payload.statusCounts} />}
      <div className="dashboard-toolbar">
        <SortMenu value={sort} onChange={setSort} />
        <SearchField className="dashboard-search" inputRef={searchInputRef} icon={<Search size={16} />} value={query} onChange={setQuery} onClear={() => { setQuery(""); searchInputRef.current?.blur(); }} placeholder={`Filter ${title.toLowerCase()}`} label={`Filter ${title}`} />
        <div className="view-toggle" aria-label="View mode">
          <IconButton label="Poster grid" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={17} /></IconButton>
          <IconButton label="Compact list" aria-pressed={view === "compact"} onClick={() => setView("compact")}><ListIcon size={17} /></IconButton>
        </div>
      </div>
      {sectionTabs.length > 0 && <DashboardTabs tabs={sectionTabs} active={activeSection} onChange={setActiveSection} />}
      {(!payload || searching) ? <SkeletonGrid /> : entries.length === 0 ? (
        <EmptyState icon={kind === "shows" ? <Clapperboard size={24} /> : kind === "movies" ? <Film size={24} /> : kind === "books" ? <BookOpen size={24} /> : <Gamepad2 size={24} />} title={query ? "No matching titles" : `Nothing in ${section?.label ?? title} yet`} message={query ? "Try a different title or clear the filter." : `Add a ${mediaType} and choose a tracking status to fill this section.`}>
          {!query && <button className="primary-button" onClick={() => openCreateModal(mediaType)}><Plus size={18} />Add {mediaType}</button>}
        </EmptyState>
      ) : (
        <>
          <section className={view === "compact" ? "media-results compact" : "media-results poster-grid"} aria-label={section?.label}>
            {entries.map((entry) => <DashboardMediaCard key={entry.mediaId} entry={entry} compact={view === "compact"} onMarkNext={markNextWatched} />)}
          </section>
          {!searchPayload && payload.page.hasMore && (
            <div ref={sentinelRef} style={{ height: "60px", display: "flex", alignItems: "center", justifyContent: "center", margin: "1.5rem 0" }}>
              <div className="import-spinner" style={{ width: "24px", height: "24px", borderColor: "rgba(255,207,92,0.2)", borderTopColor: "#ffcf5c" }} />
            </div>
          )}
        </>
      )}
    </AppPage>
  );
}

type ProviderAttribution = {
  provider: "tmdb" | "rawg" | "openlibrary" | "local";
  label: string;
  url: string;
};

type ExploreResult = {
  provider: ProviderAttribution["provider"];
  providerId: string;
  type: MediaType;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  year: number | null;
  sourceUrl: string | null;
  rating: number | null;
  popularity: number | null;
  attribution: ProviderAttribution;
  alreadyTracked?: boolean;
  localMediaId?: string | null;
  extendedDataJson?: string | null;
};

type ExploreRow = {
  id: string;
  title: string;
  subtitle: string;
  results: ExploreResult[];
};

const exploreRowsCacheTtlMs = 15 * 60_000;
const exploreSearchCacheTtlMs = 10 * 60_000;

function ExplorePage() {
  const { me } = useAuth();
  const version = libraryVersion(me);
  const [rows, setRows] = useState<ExploreRow[]>(() => queryCache.get<{ rows: ExploreRow[] }>(queryKeys.exploreRows(me.user.id, version))?.rows ?? []);
  const [loading, setLoading] = useState(rows.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = queryCache.get<{ rows: ExploreRow[] }>(queryKeys.exploreRows(me.user.id, version));
    if (cached) {
      setRows(cached.rows);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiJson<{ rows: ExploreRow[] }>("/api/explore")
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        queryCache.set(queryKeys.exploreRows(me.user.id, version), { rows: data.rows }, { ttlMs: exploreRowsCacheTtlMs, persist: true });
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Explore could not load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [me.user.id, version]);

  return (
    <AppPage eyebrow="Explore" title="Find something good" description="Search across shows, movies, books, and games, or browse cached discovery rows." mobileHelp>
      <div className="filter-row">
        {exploreFilters.map(({ type, label, icon: Icon }) => (
          <NavLink className="chip-button" key={type} to={`/explore/type/${type}`}>
            <Icon size={16} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </div>
      {loading && <SkeletonGrid />}
      {!loading && rows.length === 0 && <EmptyState icon={<Compass size={24} />} title="No provider rows yet" message="Add provider API keys and reload Explore to fetch cached discovery rows." />}
      <div className="explore-row-stack">
        {rows.map((row) => (
          <section className="explore-row" key={row.id}>
            <div className="section-heading"><div><p className="eyebrow">Discover</p><h2>{row.title}</h2><p>{row.subtitle}</p></div></div>
            <div className="explore-scroll">
              {row.results.map((result) => <ExploreResultCard result={result} key={`${result.provider}:${result.providerId}:${result.type}`} />)}
            </div>
          </section>
        ))}
      </div>
    </AppPage>
  );
}

function ExploreSearchPage() {
  const { me } = useAuth();
  const version = libraryVersion(me);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [types, setTypes] = useState<MediaType[]>(() => parseExploreTypes(searchParams.get("types")));
  const [results, setResults] = useState<ExploreResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (types.length !== searchableMediaTypes.length) next.set("types", types.join(","));
    setSearchParams(next, { replace: true });
  }, [query, types, setSearchParams]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const cacheKey = queryKeys.exploreSearch(me.user.id, version, trimmed, types);
    const cached = queryCache.get<{ results: ExploreResult[] }>(cacheKey);
    if (cached) {
      setResults(cached.results);
      return;
    }
    const handle = window.setTimeout(() => {
      setLoading(true);
      apiJson<{ results: ExploreResult[] }>(`/api/explore/search?q=${encodeURIComponent(trimmed)}&types=${encodeURIComponent(types.join(","))}`)
        .then((data) => {
          setResults(data.results);
          queryCache.set(cacheKey, { results: data.results }, { ttlMs: exploreSearchCacheTtlMs, persist: true });
          setError(null);
        })
        .catch((reason) => setError(reason instanceof Error ? reason.message : "Search failed."))
        .finally(() => setLoading(false));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [me.user.id, version, query, types]);

  return (
    <AppPage eyebrow="Explore" title="Search" description="Results update live and use local cache before provider APIs." mobileHelp>
      <div className="dashboard-toolbar">
        <SearchField className="dashboard-search" icon={<Search size={16} />} value={query} onChange={setQuery} placeholder="Search shows, movies, books, games" label="Search all media" />
      </div>
      <div className="filter-row">
        {searchableMediaTypes.map((type) => (
          <button className={types.includes(type) ? "chip-button active" : "chip-button"} key={type} onClick={() => setTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])}>{type}</button>
        ))}
      </div>
      {loading && <SkeletonGrid />}
      {!loading && query.trim().length >= 2 && results.length === 0 && <EmptyState icon={<Search size={24} />} title="No matches yet" message="Try a different title or enable more media types." />}
      <section className="search-results-list" aria-label="Search results">
        {results.map((result) => <ExploreResultCard result={result} key={`${result.provider}:${result.providerId}:${result.type}`} />)}
      </section>
    </AppPage>
  );
}

function ExploreTypePage() {
  const { type } = useParams();
  const { me } = useAuth();
  const [results, setResults] = useState<ExploreResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiJson<{ results: ExploreResult[] }>(`/api/explore/type/${type}`)
      .then((data) => {
        if (cancelled) return;
        setResults(data.results);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Explore could not load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [me.user.id, type]);

  const filtered = query.trim().length > 0
    ? results.filter((r) => r.title.toLowerCase().includes(query.toLowerCase()) || r.overview?.toLowerCase().includes(query.toLowerCase()))
    : results;

  const displayType = type === "anime" ? "anime" : type ? type.charAt(0).toUpperCase() + type.slice(1) + "s" : "Explore";

  return (
    <AppPage eyebrow="Explore" title={displayType} description={`Discover popular ${displayType.toLowerCase()}.`} mobileHelp>
      <div className="dashboard-toolbar">
        <SearchField className="dashboard-search" icon={<Search size={16} />} value={query} onChange={setQuery} placeholder={`Search discovered ${displayType.toLowerCase()}...`} label={`Search ${type}`} />
      </div>
      {loading && <SkeletonGrid />}
      {!loading && filtered.length === 0 && <EmptyState icon={<Compass size={24} />} title="No results" message="Try a different search." />}
      <section className="search-results-list" aria-label="Explore results">
        {filtered.map((result) => <ExploreResultCard result={result} key={`${result.provider}:${result.providerId}:${result.type}`} />)}
      </section>
    </AppPage>
  );
}

function ExploreResultCard({ result }: { result: ExploreResult }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [tracked, setTracked] = useState(Boolean(result.alreadyTracked));
  async function addResult() {
    if (tracked) {
      if (result.localMediaId) navigate(`/media/${result.type}/${result.localMediaId}`);
      return;
    }
    setBusy(true);
    try {
      const response = await apiJson<{ media: { id: string; type: MediaType }; alreadyTracked: boolean }>("/api/explore/add", {
        method: "POST",
        csrfToken: me.csrfToken,
        body: JSON.stringify(result),
      });
      setTracked(true);
      clearDashboardCaches(me.user.id);
      navigate(`/media/${response.media.type}/${response.media.id}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="explore-result-card">
      <div className="explore-result-poster" style={result.posterPath ? { backgroundImage: `url(${result.posterPath})` } : undefined}>{!result.posterPath && <span>{result.title.slice(0, 2).toUpperCase()}</span>}</div>
      <div className="explore-result-copy">
        <div><span className="status-chip planned">{result.type}</span>{result.year && <span className="muted-copy"> {result.year}</span>}</div>
        <h2>{result.title}</h2>
        {result.overview && <p>{result.overview}</p>}
        <a href={result.attribution.url} target="_blank" rel="noreferrer">{result.attribution.label}</a>
      </div>
      <button className={tracked ? "secondary-button" : "primary-button"} disabled={busy} onClick={() => void addResult()}>{tracked ? "Open" : busy ? "Adding..." : "Add"}</button>
    </article>
  );
}

function parseExploreTypes(value: string | null): MediaType[] {
  const allowed: MediaType[] = [...searchableMediaTypes];
  if (!value) return allowed;
  const parsed = value.split(",").filter((item): item is MediaType => allowed.includes(item as MediaType));
  return parsed.length ? parsed : allowed;
}

function ProfilePage() {
  const { username } = useParams();
  const { me } = useAuth();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogoutConfirm() {
    try {
      await apiJson("/api/auth/logout", { method: "POST", csrfToken: me.csrfToken });
      window.location.assign("/auth");
    } catch (error) {
      setMessage("Logout failed.");
    } finally {
      setShowLogoutModal(false);
    }
  }

  return (
    <AppPage eyebrow="Profile" title={username ? `@${username}` : "Your profile"} description="Stats, recent activity, favorites, and public lists will gather here." mobileHelp>
      <section className="profile-hero">
        <div className="profile-banner" style={me.profile.bannerUrl ? { backgroundImage: `url(${me.profile.bannerUrl})` } : undefined} />
        <div className="profile-row">
          <div className="avatar">{me.profile.avatarUrl ? <img src={me.profile.avatarUrl} alt="" /> : initials(me.user.displayName)}</div>
          <div>
            <h2>{me.user.displayName}</h2>
            <p>@{me.user.username}</p>
          </div>
        </div>
      </section>
      <section className="profile-actions" aria-label="Profile tools">
        <button className="profile-action" type="button">
          <Bell size={20} aria-hidden="true" />
          <span>Notifications</span>
        </button>
        {profileNav.map(({ to, label, icon: Icon }) => (
          <NavLink className="profile-action" key={to} to={to}>
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </section>
      <EmptyState
        icon={<ShieldCheck size={24} />}
        title="Session active"
        message={`Profile visibility is ${me.profile.visibility}.`}
      />
      <DashboardStats />

      {/* Logout Section */}
      <section className="settings-list" style={{ marginTop: "1.5rem" }}>
        <article className="setting-row">
          <div className="setting-icon"><LogOut size={20} /></div>
          <div>
            <h2>Session Management</h2>
            <p>Log out of your current session on this device.</p>
          </div>
          <button className="danger-button" type="button" onClick={() => setShowLogoutModal(true)}>
            Log out
          </button>
        </article>
      </section>

      {/* Logout Confirmation Modal */}
      <Modal title="Confirm Logout" open={showLogoutModal} onClose={() => setShowLogoutModal(false)}>
        <div style={{ padding: "1.25rem", display: "grid", gap: "1rem" }}>
          <p>Are you sure you want to log out? You will need to sign back in to access your media library.</p>
          {message && <p className="form-message error-message" style={{ color: "var(--color-danger)" }}>{message}</p>}
          <div className="action-row" style={{ marginTop: "0.5rem" }}>
            <button className="secondary-button" type="button" onClick={() => setShowLogoutModal(false)}>
              Cancel
            </button>
            <button className="danger-button" type="button" onClick={() => void handleLogoutConfirm()}>
              Log out
            </button>
          </div>
        </div>
      </Modal>
    </AppPage>
  );
}

type MergeCandidate = {
  source: ExploreResult & { localMediaId: string; source: string };
  candidate: ExploreResult | null;
  confidence: "external_id_exact" | "title_year_strong" | "title_only_review" | "ambiguous";
  reason: string;
};

type MergeStats = {
  total: number;
  unmerged: number;
  merged: number;
  exact: number;
  review: number;
};

function MergePage() {
  const { me } = useAuth();
  const [searchParams] = useSearchParams();
  const [type, setType] = useState<"all" | MediaType>("all");
  const [stats, setStats] = useState<MergeStats | null>(null);
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [mergeQuery, setMergeQuery] = useState("");
  const [message, setMessage] = useState(searchParams.get("sourceJob") ? "Import complete. Review possible merges before continuing." : "Review imported/manual media that may match provider records.");

  // Progressive resolution state
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState(0);
  const [resolveTotal, setResolveTotal] = useState(0);

  // Bulk accept state
  const [bulkAccepting, setBulkAccepting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopped, setIsStopped] = useState(false);

  const pausedRef = useRef(isPaused);
  const stoppedRef = useRef(isStopped);
  useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { stoppedRef.current = isStopped; }, [isStopped]);

  async function load(forceRefresh = false) {
    setBusy(true);
    setLoadingCandidates(true);
    setLoadedCount(0);
    try {
      const baseParams = new URLSearchParams();
      if (type !== "all") baseParams.set("type", type);
      if (mergeQuery.trim()) baseParams.set("q", mergeQuery.trim());
      const statsQuery = type === "all" ? "" : `?type=${type}`;
      const statsResponse = await apiJson<MergeStats>(`/api/merge/stats${statsQuery}`);
      setStats(statsResponse);

      const pageSize = 50;
      let offset = 0;
      let allCandidates: MergeCandidate[] = [];
      for (;;) {
        const params = new URLSearchParams(baseParams);
        params.set("limit", String(pageSize));
        params.set("offset", String(offset));
        const page = await apiJson<{ candidates: MergeCandidate[] }>(`/api/merge/candidates?${params.toString()}`);
        const pageCandidates = forceRefresh ? page.candidates.map(c => ({ ...c, reason: "Needs resolution." })) : page.candidates;
        allCandidates = [...allCandidates, ...pageCandidates];
        setCandidates(allCandidates);
        setLoadedCount(allCandidates.length);
        if (page.candidates.length < pageSize) break;
        offset += pageSize;
      }

      const unresolved = allCandidates.filter(c => c.reason === "Needs resolution.");
      if (unresolved.length > 0) {
        setResolving(true);
        setResolveTotal(unresolved.length);
        setResolveProgress(0);
        void processResolveQueue(unresolved);
      } else {
        setResolving(false);
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Merge candidates could not be loaded.");
    } finally {
      setBusy(false);
      setLoadingCandidates(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 350);
    return () => window.clearTimeout(timeout);
  }, [type, mergeQuery]);

  async function processResolveQueue(unresolved: MergeCandidate[]) {
    let processed = 0;
    const batchSize = 3;

    for (let i = 0; i < unresolved.length; i += batchSize) {
      if (stoppedRef.current) break;
      const batch = unresolved.slice(i, i + batchSize);
      try {
        const response = await apiJson<{ results: MergeCandidate[]; errors?: Array<{ mediaId: string; message: string }> }>("/api/merge/resolve-batch", {
          method: "POST",
          csrfToken: me.csrfToken,
          body: JSON.stringify({ mediaIds: batch.map(c => c.source.localMediaId) }),
        });

        setCandidates(prev => {
          const map = new Map(response.results.map(r => [r.source.localMediaId, r]));
          return prev.map(c => map.get(c.source.localMediaId) || c);
        });
        if (response.errors?.length) {
          console.warn("Some merge candidates could not be resolved", response.errors);
        }
      } catch (err) {
        console.error("Batch resolve failed", err);
      }
      processed += batch.length;
      setResolveProgress(processed);
    }
    setResolving(false);
    const query = type === "all" ? "" : `?type=${type}`;
    const statsResponse = await apiJson<MergeStats>(`/api/merge/stats${query}`).catch(() => null);
    if (statsResponse) setStats(statsResponse);
  }

  async function accept(candidate: MergeCandidate, providerResult?: ExploreResult) {
    if (bulkAccepting) return;
    setBusy(true);
    try {
      await apiJson("/api/merge/accept", {
        method: "POST",
        csrfToken: me.csrfToken,
        body: JSON.stringify({
          sourceMediaId: candidate.source.localMediaId,
          targetMediaId: providerResult?.localMediaId ?? candidate.candidate?.localMediaId ?? undefined,
          providerResult: providerResult ?? candidate.candidate ?? undefined,
          confidence: candidate.confidence,
          reason: candidate.reason,
        }),
      });
      clearDashboardCaches(me.user.id);
      setMessage(`Merged ${candidate.source.title}.`);
      notify(`Merged ${candidate.source.title}.`, "success");
      setCandidates(prev => prev.filter(c => c.source.localMediaId !== candidate.source.localMediaId));

      const query = type === "all" ? "" : `?type=${type}`;
      const statsResponse = await apiJson<MergeStats>(`/api/merge/stats${query}`).catch(() => null);
      if (statsResponse) setStats(statsResponse);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Merge failed.");
    } finally {
      setBusy(false);
    }
  }

  async function acceptExact() {
    const query = type === "all" ? "" : `?type=${type}`;
    let exact = candidates.filter(c => c.confidence === "external_id_exact" && c.candidate);
    if (exact.length === 0) {
      notify("No exact ID matches are ready. Resolve candidates first or review title matches manually.", "info");
      return;
    }

    setBulkAccepting(true);
    setIsPaused(false);
    setIsStopped(false);
    setBulkTotal(exact.length);
    setBulkProgress(0);

    let count = 0;
    for (const candidate of exact) {
      while (pausedRef.current && !stoppedRef.current) {
        await new Promise(r => setTimeout(r, 200));
      }
      if (stoppedRef.current) {
        break;
      }

      try {
        await apiJson("/api/merge/accept", {
          method: "POST",
          csrfToken: me.csrfToken,
          body: JSON.stringify({
            sourceMediaId: candidate.source.localMediaId,
            targetMediaId: candidate.candidate!.localMediaId ?? undefined,
            providerResult: candidate.candidate!,
            confidence: candidate.confidence,
            reason: candidate.reason,
          }),
        });
        count++;
        setBulkProgress(count);
        setCandidates(prev => prev.filter(c => c.source.localMediaId !== candidate.source.localMediaId));
      } catch (err) {
        console.error("Failed to merge", candidate.source.title);
      }
    }

    setBulkAccepting(false);
    clearDashboardCaches(me.user.id);
    setMessage(stoppedRef.current ? `Merge stopped. Merged ${count} items.` : `Merged ${count} exact match${count === 1 ? "" : "es"}.`);
    notify(stoppedRef.current ? `Merge stopped after ${count} item${count === 1 ? "" : "s"}.` : `Merged ${count} exact match${count === 1 ? "" : "es"}.`, stoppedRef.current ? "info" : "success");

    const statsResponse = await apiJson<MergeStats>(`/api/merge/stats${query}`).catch(() => null);
    if (statsResponse) setStats(statsResponse);
  }

  const exactReady = candidates.some((candidate) => candidate.confidence === "external_id_exact" && candidate.candidate);
  const visibleExactCount = candidates.filter((candidate) => candidate.confidence === "external_id_exact").length;
  const visibleReviewCount = candidates.length - visibleExactCount;

  return (
    <AppPage eyebrow="Profile" title="Merge media" description="Combine imported/manual entries with provider-backed canonical media without losing tracking history." mobileHelp>
      {bulkAccepting && (
        <div className="merge-progress-panel active">
          <div className="merge-progress-header">
            <span>Merging {bulkTotal} matches...</span>
            <div className="merge-progress-actions">
              <IconButton label={isPaused ? "Resume" : "Pause"} onClick={() => setIsPaused(!isPaused)}>
                {isPaused ? <PlayIcon size={16} /> : <Pause size={16} />}
              </IconButton>
              <IconButton label="Stop" onClick={() => setIsStopped(true)} style={{ color: "#ff6b6b" }}>
                <Square size={16} />
              </IconButton>
            </div>
          </div>
          <div className="merge-progress-row">
            <span>{isPaused ? "Paused" : "In progress"}</span>
            <span>{bulkProgress} / {bulkTotal}</span>
          </div>
          <ProgressBar value={bulkTotal > 0 ? (bulkProgress / bulkTotal) * 100 : 0} label="Merge progress" />
        </div>
      )}

      {(loadingCandidates || resolving) && (
        <LoadingPanel
          title={loadingCandidates ? "Loading merge candidates" : "Searching provider matches"}
          message={loadingCandidates ? `${loadedCount}${stats?.unmerged ? ` / ${stats.unmerged}` : ""} loaded` : `${resolveProgress} / ${resolveTotal} checked`}
          progress={loadingCandidates && stats?.unmerged ? Math.min(100, Math.round((loadedCount / stats.unmerged) * 100)) : resolveTotal > 0 ? Math.round((resolveProgress / resolveTotal) * 100) : null}
        />
      )}

      <section className="merge-toolbar">
        <div className="merge-type-filter" aria-label="Filter merge candidates by type">
          {mergeTypeFilters.map(({ value, label, icon: Icon }) => (
            <IconButton className={type === value ? "merge-type-button active" : "merge-type-button"} label={label} aria-pressed={type === value} key={value} onClick={() => setType(value)}>
              <Icon size={18} />
            </IconButton>
          ))}
        </div>
        <div className="merge-toolbar-actions">
          <IconButton label="Reload candidates" onClick={() => void load(true)} disabled={resolving || bulkAccepting}>
            <RefreshCw size={18} />
          </IconButton>
          <button className="primary-button" disabled={busy || resolving || bulkAccepting || !exactReady} onClick={() => void acceptExact()}>Accept all exact</button>
        </div>
      </section>
      <SearchField className="dashboard-search merge-page-search" icon={<Search size={16} />} value={mergeQuery} onChange={setMergeQuery} placeholder="Search imported title, source ID, IMDb, TVDB..." label="Search merge candidates by title or ID" />
      {stats && (
        <section className="stats-grid" aria-label="Merge stats">
          <article className="stat-card"><strong>{stats.unmerged}</strong><span>Unmerged</span></article>
          <article className="stat-card"><strong>{stats.exact}</strong><span>Exact</span></article>
          <article className="stat-card"><strong>{stats.review}</strong><span>Review</span></article>
          <article className="stat-card"><strong>{candidates.length}</strong><span>Loaded</span></article>
          <article className="stat-card"><strong>{visibleExactCount}</strong><span>Visible exact</span></article>
          <article className="stat-card"><strong>{visibleReviewCount}</strong><span>Visible review</span></article>
        </section>
      )}
      {(busy && !resolving) && candidates.length === 0 && <SkeletonGrid />}
      {(!busy && !resolving) && candidates.length === 0 && <EmptyState icon={<Library size={24} />} title="No merge candidates" message="New imports or manual placeholder media will appear here when they can be matched." />}
      <section className="merge-list" aria-label="Merge candidates">
        {candidates.map((candidate) => <MergeCandidateCard key={candidate.source.localMediaId} candidate={candidate} busy={busy || bulkAccepting} onAccept={accept} />)}
      </section>
    </AppPage>
  );
}

function MergeCandidateCard({ candidate, busy, onAccept }: { candidate: MergeCandidate; busy: boolean; onAccept: (candidate: MergeCandidate, providerResult?: ExploreResult) => Promise<void> }) {
  const [manualQuery, setManualQuery] = useState(candidate.source.title);
  const [manualResults, setManualResults] = useState<ExploreResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  async function searchManual() {
    if (manualQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const response = await apiJson<{ results: ExploreResult[] }>(`/api/merge/search?q=${encodeURIComponent(manualQuery.trim())}&type=${candidate.source.type}`);
      setManualResults(response.results);
    } finally {
      setSearching(false);
    }
  }

  async function acceptManual(result: ExploreResult) {
    setManualOpen(false);
    await onAccept(candidate, result);
  }

  return (
    <article className={`merge-card ${candidate.candidate ? "has-match" : "needs-match"}`}>
      <div className="merge-card-main">
        <div className="merge-side">
          <p className="eyebrow">Imported/local</p>
          <ExploreResultMini result={candidate.source} />
        </div>
        <div className="merge-connector" aria-hidden="true"><ChevronRight size={18} /></div>
        <div className="merge-side">
          <div className="merge-confidence-row">
            <span className={`merge-confidence ${candidate.confidence}`}>{mergeConfidenceLabel(candidate.confidence)}</span>
          </div>
          {candidate.candidate ? <ExploreResultMini result={candidate.candidate} /> : <p className="muted-copy">No suggested match yet.</p>}
          <p className="muted-copy">{candidate.reason}</p>
        </div>
      </div>
      <div className="merge-card-actions">
        <button className="primary-button" disabled={busy || !candidate.candidate} onClick={() => void onAccept(candidate)}>Accept match</button>
        <button className="secondary-button" disabled={busy} onClick={() => setManualOpen(true)}>Search manually</button>
      </div>
      <Modal title={`Find match for ${candidate.source.title}`} open={manualOpen} onClose={() => setManualOpen(false)}>
        <div className="manual-search-sheet">
          <ExploreResultMini result={candidate.source} />
          <SearchField className="dashboard-search" icon={<Search size={16} />} value={manualQuery} onChange={setManualQuery} onClear={() => { setManualQuery(""); setManualResults([]); }} placeholder="Search provider matches" label={`Manual search for ${candidate.source.title}`} onSubmit={() => void searchManual()} />
          <button className="primary-button" disabled={searching || manualQuery.trim().length < 2} onClick={() => void searchManual()}>{searching ? "Searching..." : "Search provider matches"}</button>
          {manualResults.length > 0 ? (
            <div className="manual-match-list">
              {manualResults.map((result) => (
                <button key={`${result.provider}:${result.providerId}`} className="manual-match" onClick={() => void acceptManual(result)}>
                  <ExploreResultMini result={result} />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted-copy">Search for the provider-backed record to merge into this imported item.</p>
          )}
        </div>
      </Modal>
    </article>
  );
}

function mergeConfidenceLabel(confidence: MergeCandidate["confidence"]) {
  if (confidence === "external_id_exact") return "ID match";
  if (confidence === "title_year_strong") return "Title + year";
  if (confidence === "title_only_review") return "Title search";
  return "Needs review";
}

function ExploreResultMini({ result }: { result: ExploreResult }) {
  return (
    <div className="merge-mini">
      <div className="explore-result-poster" style={result.posterPath ? { backgroundImage: `url(${result.posterPath})` } : undefined}>{!result.posterPath && <span>{result.title.slice(0, 2).toUpperCase()}</span>}</div>
      <div>
        <h2>{result.title}</h2>
        <p>{result.type}{result.year ? ` · ${result.year}` : ""}</p>
        <span>{result.attribution.label}</span>
      </div>
    </div>
  );
}

type MediaDetailData = {
  media: {
    id: string;
    type: MediaType;
    title: string;
    overview: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    airStatus: string | null;
    runtimeMinutes: number | null;
    releaseDate: string | null;
    year: number | null;
    language: string | null;
    country: string | null;
    source: string;
    sourceId: string | null;
    totalEpisodes: number | null;
    totalSeasons: number | null;
    extendedDataJson: string | null;
  };
  userMedia: {
    id: string;
    userId: string;
    mediaId: string;
    status: string;
    isFavorite: boolean;
    rating: number | null;
    notes: string | null;
    watchedAt: string | null;
    rewatchCount: number;
    progressEpisodes: number;
    progressValue: number | null;
    progressTotal: number | null;
    progressUnit: string | null;
    platform: string | null;
    startedAt: string | null;
    purchaseLibrary: string | null;
    visibility: string;
  } | null;
};

type MediaNewsArticle = {
  sourceName: string;
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  publishedAt: string | null;
};

type EpisodeWithActivity = {
  id: string;
  mediaId: string;
  seasonId: string | null;
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtimeMinutes: number | null;
  isSpecial: boolean;
  externalId: string | null;
  extendedDataJson: string | null;
  activity: {
    id: string;
    userId: string;
    episodeId: string;
    mediaId: string;
    watched: boolean;
    watchedAt: string | null;
    rewatchCount: number;
    rating: number | null;
    notes: string | null;
  } | null;
};

type TrackableUnit = {
  id: string; mediaId: string; parentId: string | null; kind: "part" | "chapter" | "act" | "mission" | "quest";
  position: number; title: string | null; overview: string | null; imagePath: string | null; releaseDate: string | null;
  activity: { id: string; completed: boolean; completedAt: string | null; rating: number | null; notes: string | null } | null;
};

type HydrationProgress = {
  status: "refreshing" | "needs_retry" | "complete" | "idle";
  totalEpisodes: number;
  hydratedEpisodes: number;
  percent: number;
  queuedJobs: number;
  runningJobs: number;
  failedJobs: number;
  activeJobs: number;
  lastUpdatedAt: string | null;
};

type MediaDetailCacheEntry = {
  detail: MediaDetailData;
  episodes: EpisodeWithActivity[];
  units: TrackableUnit[];
  notesText: string;
  collapsedSeasons: number[];
  scrollY: number;
  savedAt: number;
};

const mediaDetailCacheTtlMs = 10 * 60_000;

function readMediaDetailCache(userId: string, version: number, mediaId?: string) {
  if (!mediaId) return null;
  return queryCache.get<MediaDetailCacheEntry>(queryKeys.mediaDetail(userId, version, mediaId));
}

function writeMediaDetailCache(userId: string, version: number, mediaId: string, entry: MediaDetailCacheEntry, persist = false) {
  queryCache.set(queryKeys.mediaDetail(userId, version, mediaId), entry, { ttlMs: mediaDetailCacheTtlMs, persist });
}

function clearMediaDetailCache(userId: string, mediaId?: string) {
  if (!mediaId) return;
  queryCache.invalidatePrefix(["media-detail", userId]);
}

function MediaDetailPage() {
  const { type, id } = useParams();
  const { me } = useAuth();
  const version = libraryVersion(me);
  const initialCache = useMemo(() => readMediaDetailCache(me.user.id, version, id), [me.user.id, version, id]);
  const [loading, setLoading] = useState(!initialCache);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<MediaDetailData | null>(() => initialCache?.detail ?? null);
  const [episodes, setEpisodes] = useState<EpisodeWithActivity[]>(() => initialCache?.episodes ?? []);
  const [units, setUnits] = useState<TrackableUnit[]>(() => initialCache?.units ?? []);
  const [notesText, setNotesText] = useState(initialCache?.notesText ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [collapsedSeasons, setCollapsedSeasons] = useState<Set<number>>(() => new Set(initialCache?.collapsedSeasons ?? []));
  const [mediaSettingsOpen, setMediaSettingsOpen] = useState(false);
  const [episodeAction, setEpisodeAction] = useState<{ type: "episode"; episode: EpisodeWithActivity } | { type: "season"; seasonNumber: number; watchedCount: number; totalCount: number } | null>(null);
  const [movieActionOpen, setMovieActionOpen] = useState(false);
  const [hydrationProgress, setHydrationProgress] = useState<HydrationProgress | null>(null);
  const [newsArticles, setNewsArticles] = useState<MediaNewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsWarning, setNewsWarning] = useState<string | null>(null);
  const [animeDateMode, setAnimeDateMode] = useState<"sub" | "dub">("sub");
  const autoHydrateRef = useRef(new Set<string>());
  const hydrationNoticeRef = useRef<string | null>(null);
  const wasHydratingRef = useRef(false);

  const triggerToast = (msg: string, tone: NoticeTone = "info") => notify(msg, tone);

  const loadData = async (options: { background?: boolean } = {}) => {
    try {
      if (!options.background) setLoading(true);
      setError(null);
      const mediaData = await apiJson<MediaDetailData>(`/api/media/${id}`);
      setDetail(mediaData);
      setNotesText(mediaData.userMedia?.notes ?? "");

      if (mediaData.media.type === "show" || mediaData.media.type === "anime") {
        const epData = await apiJson<{ episodes: EpisodeWithActivity[] }>(`/api/media/${id}/episodes`);
        setEpisodes(epData.episodes);
        setCollapsedSeasons((current) => current.size && options.background ? current : new Set(epData.episodes.map((episode) => episode.seasonNumber)));
        setUnits([]);
      } else if (mediaData.media.type === "book" || mediaData.media.type === "game") {
        const unitData = await apiJson<{ units: TrackableUnit[] }>(`/api/media/${id}/units`);
        setUnits(unitData.units);
        setEpisodes([]);
      } else {
        setEpisodes([]);
        setUnits([]);
      }
    } catch (err) {
      console.error(err);
      if (options.background) {
        triggerToast(friendlyErrorMessage(err, "Saved details are visible, but fresh metadata could not be loaded right now."), "info");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load media.");
      }
    } finally {
      if (!options.background) setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      const cached = readMediaDetailCache(me.user.id, version, id);
      if (cached) {
        setDetail(cached.detail);
        setEpisodes(cached.episodes);
        setUnits(cached.units);
        setNotesText(cached.notesText);
        setCollapsedSeasons(new Set(cached.collapsedSeasons));
        setLoading(false);
        window.requestAnimationFrame(() => window.scrollTo(0, cached.scrollY));
      } else {
        void loadData();
      }
    }
  }, [me.user.id, version, id]);

  const loadNews = async (manual = false) => {
    if (!id) return;
    try {
      setNewsLoading(true);
      setNewsWarning(null);
      const data = await apiJson<{ articles: MediaNewsArticle[]; warning?: string | null; cached?: boolean }>(`/api/media/${id}/news${manual ? "?refresh=1" : ""}`);
      setNewsArticles(data.articles ?? []);
      setNewsWarning(data.warning ?? null);
      if (manual && data.warning) notify(data.warning, "info");
      if (manual && !data.warning) notify(data.articles?.length ? "News refreshed." : "No news articles found yet.", "info");
    } catch (reason) {
      const message = friendlyErrorMessage(reason, "News could not be loaded right now.");
      setNewsWarning(message);
      if (manual) notify(message, "info");
    } finally {
      setNewsLoading(false);
    }
  };

  useEffect(() => {
    void loadNews(false);
  }, [id]);

  useEffect(() => {
    if (!id || !detail) return;
    writeMediaDetailCache(me.user.id, version, id, {
      detail,
      episodes,
      units,
      notesText,
      collapsedSeasons: [...collapsedSeasons],
      scrollY: window.scrollY,
      savedAt: Date.now(),
    });
  }, [me.user.id, version, id, detail, episodes, units, notesText, collapsedSeasons]);

  useEffect(() => {
    const saveScroll = () => {
      if (!id || !detail) return;
      writeMediaDetailCache(me.user.id, version, id, {
        detail,
        episodes,
        units,
        notesText,
        collapsedSeasons: [...collapsedSeasons],
        scrollY: window.scrollY,
        savedAt: Date.now(),
      }, true);
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("pagehide", saveScroll);
    return () => {
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("pagehide", saveScroll);
    };
  }, [me.user.id, version, id, detail, episodes, units, notesText, collapsedSeasons]);

  const addToLibrary = async (status?: string) => {
    if (!id || !detail) return;
    try {
      const result = await apiJson<{ userMedia: MediaDetailData["userMedia"] }>(`/api/library/${id}`, {
        method: "POST",
        csrfToken: me.csrfToken,
        body: JSON.stringify({ status }),
      });
      setDetail({ ...detail, userMedia: result.userMedia });
      setNotesText(result.userMedia?.notes ?? "");
      clearDashboardCaches(me.user.id);
      triggerToast("Added to library.", "success");
      if (detail.media.type === "show" || detail.media.type === "anime") {
        const epData = await apiJson<{ episodes: EpisodeWithActivity[] }>(`/api/media/${id}/episodes`);
        setEpisodes(epData.episodes);
      }
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Failed to add to library.");
    }
  };

  const removeFromLibrary = async () => {
    if (!id || !detail) return;
    if (!window.confirm("Remove from library? This deletes all watched history and notes.")) return;
    try {
      await apiJson(`/api/library/${id}`, {
        method: "DELETE",
        csrfToken: me.csrfToken,
      });
      setDetail({ ...detail, userMedia: null });
      setEpisodes(episodes.map(ep => ({ ...ep, activity: null })));
      clearDashboardCaches(me.user.id);
      clearMediaDetailCache(me.user.id, id);
      triggerToast("Removed from library.", "success");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Failed to remove.");
    }
  };

  const updateStatus = async (status: string) => {
    if (!id || !detail || !detail.userMedia) return;
    try {
      const result = await apiJson<{ userMedia: MediaDetailData["userMedia"] }>(`/api/library/${id}/status`, {
        method: "PATCH",
        csrfToken: me.csrfToken,
        body: JSON.stringify({ status }),
      });
      setDetail({ ...detail, userMedia: result.userMedia });
      clearDashboardCaches(me.user.id);
      triggerToast(`Status: ${status.replace("_", " ")}`);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Failed to update status.");
    }
  };

  const toggleFavorite = async () => {
    if (!id || !detail || !detail.userMedia) return;
    const nextFavorite = !detail.userMedia.isFavorite;
    try {
      const result = await apiJson<{ userMedia: MediaDetailData["userMedia"] }>(`/api/library/${id}/favorite`, {
        method: "PATCH",
        csrfToken: me.csrfToken,
        body: JSON.stringify({ isFavorite: nextFavorite }),
      });
      setDetail({ ...detail, userMedia: result.userMedia });
      clearDashboardCaches(me.user.id);
      triggerToast(nextFavorite ? "Favorite added" : "Favorite removed", "success");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Failed to favorite.");
    }
  };

  const updateRating = async (rating: number | null) => {
    if (!id || !detail || !detail.userMedia) return;
    try {
      const result = await apiJson<{ userMedia: MediaDetailData["userMedia"] }>(`/api/library/${id}/rating`, {
        method: "PATCH",
        csrfToken: me.csrfToken,
        body: JSON.stringify({ rating }),
      });
      setDetail({ ...detail, userMedia: result.userMedia });
      triggerToast(rating ? `Rated ${rating}/5` : "Rating cleared");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Failed to rate.");
    }
  };

  const saveNotes = async () => {
    if (!id || !detail || !detail.userMedia) return;
    if (notesText === detail.userMedia.notes) return;
    try {
      setSavingNotes(true);
      const result = await apiJson<{ userMedia: MediaDetailData["userMedia"] }>(`/api/library/${id}/notes`, {
        method: "PATCH",
        csrfToken: me.csrfToken,
        body: JSON.stringify({ notes: notesText || null }),
      });
      setDetail({ ...detail, userMedia: result.userMedia });
      triggerToast("Notes saved", "success");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Failed to save notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  const markMovieWatched = async (mode: "not_watched" | "watched_once" | "rewatched" = "watched_once") => {
    if (!id || !detail || !detail.userMedia) return;
    try {
      const result = await apiJson<{ userMedia: MediaDetailData["userMedia"] }>(`/api/library/${id}/watched`, {
        method: "PATCH",
        csrfToken: me.csrfToken,
        body: JSON.stringify({ mode }),
      });
      setDetail({ ...detail, userMedia: result.userMedia });
      clearDashboardCaches(me.user.id);
      setMovieActionOpen(false);
      triggerToast(mode === "not_watched" ? "Movie marked not watched." : mode === "rewatched" ? "Movie rewatch logged." : "Movie marked watched.", "success");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Movie watch state could not be saved.");
    }
  };

  const toggleEpisodeWatched = async (episodeId: string, currentWatched: boolean) => {
    if (!id || !detail) return;
    if (!detail.userMedia) {
      await addToLibrary();
    }
    try {
      const path = `/api/episodes/${episodeId}/watched`;
      const result = await apiJson<{ activity: EpisodeWithActivity["activity"]; progress: { watched: number } }>(path, {
        method: currentWatched ? "DELETE" : "POST",
        csrfToken: me.csrfToken,
      });
      setEpisodes(episodes.map(ep => ep.id === episodeId ? { ...ep, activity: result.activity } : ep));
      clearDashboardCaches(me.user.id);
      if (detail.userMedia) {
        setDetail({
          ...detail,
          userMedia: {
            ...detail.userMedia,
            progressEpisodes: result.progress.watched,
          }
        });
      } else {
        await loadData();
      }
      triggerToast(currentWatched ? "Episode unwatched" : "Episode watched", "success");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Failed to log episode.");
    }
  };

  const setSeasonWatched = async (seasonNumber: number, watched: boolean) => {
    if (!id) return;
    try {
      await apiJson(`/api/episodes/media/${id}/seasons/${seasonNumber}`, { method: "PATCH", csrfToken: me.csrfToken, body: JSON.stringify({ watched, mode: watched ? "watched_once" : "not_watched" }) });
      const refreshed = await apiJson<{ episodes: EpisodeWithActivity[] }>(`/api/media/${id}/episodes`);
      setEpisodes(refreshed.episodes);
      clearDashboardCaches(me.user.id);
      triggerToast(watched ? `Season ${seasonNumber} watched` : `Season ${seasonNumber} reset`);
    } catch (reason) {
      triggerToast(reason instanceof Error ? reason.message : "Season could not be updated.");
    }
  };

  const applySeasonAction = async (seasonNumber: number, action: "not_watched" | "watched_once" | "rewatched") => {
    if (!id) return;
    try {
      await apiJson(`/api/episodes/media/${id}/seasons/${seasonNumber}`, {
        method: "PATCH",
        csrfToken: me.csrfToken,
        body: JSON.stringify({ watched: action !== "not_watched", mode: action }),
      });
      const refreshed = await apiJson<{ episodes: EpisodeWithActivity[] }>(`/api/media/${id}/episodes`);
      setEpisodes(refreshed.episodes);
      setEpisodeAction(null);
      clearDashboardCaches(me.user.id);
      triggerToast(action === "not_watched" ? `Season ${seasonNumber} reset` : action === "rewatched" ? `Season ${seasonNumber} rewatched` : `Season ${seasonNumber} watched`);
    } catch (reason) {
      triggerToast(reason instanceof Error ? reason.message : "Season could not be updated.");
    }
  };

  const applyEpisodeAction = async (episode: EpisodeWithActivity, action: "not_watched" | "watched_once" | "rewatched") => {
    try {
      if (action === "not_watched") {
        await toggleEpisodeWatched(episode.id, true);
      } else if (action === "rewatched") {
        await apiJson(`/api/episodes/${episode.id}/watched`, { method: "POST", csrfToken: me.csrfToken, body: JSON.stringify({}) });
        const refreshed = await apiJson<{ episodes: EpisodeWithActivity[] }>(`/api/media/${id}/episodes`);
        setEpisodes(refreshed.episodes);
      } else {
        await apiJson(`/api/episodes/${episode.id}/activity`, { method: "PATCH", csrfToken: me.csrfToken, body: JSON.stringify({ watched: true, rewatchCount: 0 }) });
        const refreshed = await apiJson<{ episodes: EpisodeWithActivity[] }>(`/api/media/${id}/episodes`);
        setEpisodes(refreshed.episodes);
      }
      setEpisodeAction(null);
      clearDashboardCaches(me.user.id);
    } catch (reason) {
      triggerToast(reason instanceof Error ? reason.message : "Episode could not be updated.");
    }
  };

  const uploadMediaCover = async (file: File | undefined) => {
    if (!file || !detail) return;
    const form = new FormData();
    form.set("file", file);
    try {
      triggerToast("Uploading cover...");
      const res = await apiJson<{ posterPath: string }>(`/api/media/${detail.media.id}/cover`, {
        method: "POST",
        csrfToken: me.csrfToken,
        body: form,
        contentType: null,
      });
      setDetail({
        ...detail,
        media: {
          ...detail.media,
          posterPath: res.posterPath,
        },
      });
      setMediaSettingsOpen(false);
      triggerToast("Cover updated successfully!", "success");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  const setAnimeClassification = async (anime: boolean) => {
    if (!id || !detail) return;
    try {
      const result = await apiJson<{ media: MediaDetailData["media"] }>(`/api/media/${id}/classification`, {
        method: "PATCH",
        csrfToken: me.csrfToken,
        body: JSON.stringify({ anime }),
      });
      setDetail({ ...detail, media: result.media });
      clearDashboardCaches(me.user.id);
      clearMediaDetailCache(me.user.id, id);
      triggerToast(anime ? "Marked as anime." : "Anime tag removed.", "success");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Anime classification could not be saved.");
    }
  };

  const refreshInfo = async () => {
    if (!id) return;
    try {
      await apiJson(`/api/merge/${id}/refresh`, { method: "POST", csrfToken: me.csrfToken });
      markHydrationTried(id);
      setMediaSettingsOpen(false);
      triggerToast("Refreshing extra details in the background.");
    } catch (err) {
      triggerToast(friendlyErrorMessage(err, "Extra details could not be refreshed right now."));
    }
  };

  const loadHydrationProgress = async () => {
    if (!id) return null;
    try {
      const status = await apiJson<{ job: { id: string; status: string; last_error: string | null; updated_at: string } | null; progress: HydrationProgress }>(`/api/merge/${id}/refresh-status`);
      const isActive = status.progress.status === "refreshing" || status.progress.activeJobs > 0 || status.progress.runningJobs > 0 || status.progress.queuedJobs > 0;
      setHydrationProgress(isActive ? status.progress : null);
      if (!isActive && status.progress.status === "needs_retry" && hydrationNoticeRef.current !== status.progress.status) {
        hydrationNoticeRef.current = status.progress.status;
        notify("Some details could not be refreshed. You can retry from media settings.", "info");
      }
      return status.progress;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!id || !detail) return;
    if (!mediaNeedsHydration(detail.media, episodes)) return;
    if (autoHydrateRef.current.has(detail.media.id)) return;
    if (recentlyTriedHydration(detail.media.id)) return;
    autoHydrateRef.current.add(detail.media.id);
    markHydrationTried(detail.media.id);
    void (async () => {
      try {
        await apiJson(`/api/merge/${detail.media.id}/refresh`, { method: "POST", csrfToken: me.csrfToken });
        window.setTimeout(() => {
          clearMediaDetailCache(me.user.id, id);
          void (async () => {
            await loadData({ background: true });
            await reportHydrationIfStillMissing(detail.media.id, detail.media.title);
          })();
        }, 4500);
      } catch (reason) {
        notify(friendlyErrorMessage(reason, "Extra details could not be refreshed right now."), "info");
      }
    })();
  }, [id, detail?.media.id, detail?.media.extendedDataJson, detail?.media.posterPath, detail?.media.backdropPath, episodes.length, me.csrfToken, me.user.id]);

  useEffect(() => {
    if (!id || !detail || (detail.media.type !== "show" && detail.media.type !== "anime")) return;
    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      const progress = await loadHydrationProgress();
      if (cancelled) return;
      if (progress?.activeJobs || progress?.status === "refreshing") {
        wasHydratingRef.current = true;
        timeoutId = window.setTimeout(poll, 5000);
      } else if (wasHydratingRef.current) {
        wasHydratingRef.current = false;
        clearMediaDetailCache(me.user.id, id);
        await loadData({ background: true });
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [id, detail?.media.id, detail?.media.type]);
  const initializeMockMedia = async () => {
    try {
      setLoading(true);
      setError(null);
      const fallbackMedia = mediaItems.find((m) => m.id === id);
      const title = fallbackMedia?.title ?? "Custom Show";
      const mediaRes = await apiJson<{ media: { id: string } }>("/api/media", {
        method: "POST",
        csrfToken: me.csrfToken,
        body: JSON.stringify({
          type: type as MediaType,
          title,
          source: "manual",
          overview: "Manual placeholder created for tracking.",
        }),
      });
      const newMediaId = mediaRes.media.id;

      if (type === "show" || type === "anime") {
        await apiJson(`/api/media/${newMediaId}/seasons`, {
          method: "POST",
          csrfToken: me.csrfToken,
          body: JSON.stringify({ seasonNumber: 1, name: "Season 1", isSpecial: false }),
        });
        for (let i = 1; i <= 5; i++) {
          await apiJson(`/api/media/${newMediaId}/episodes`, {
            method: "POST",
            csrfToken: me.csrfToken,
            body: JSON.stringify({
              seasonNumber: 1,
              episodeNumber: i,
              name: `Episode ${i}`,
              isSpecial: false,
            }),
          });
        }
      }

      await apiJson(`/api/library/${newMediaId}`, {
        method: "POST",
        csrfToken: me.csrfToken,
      });

      window.location.assign(`/media/${type}/${newMediaId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize media item.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppPage eyebrow={type ?? "Media"} title="Loading..." description="Reading media records...">
        <LoadingPanel title="Loading media" message="Reading saved details and tracking progress..." />
      </AppPage>
    );
  }

  if (error || !detail) {
    const isMock = mediaItems.some((m) => m.id === id);
    return (
      <AppPage eyebrow={type ?? "Media"} title="Not tracked yet" description="This item is not tracked in the database.">
        {isMock ? (
          <EmptyState
            icon={<Plus size={24} />}
            title="Initialize Mock Media"
            message="This mock title exists in the UI but is not yet registered in your database. Click below to initialize Season 1 (5 episodes) and start tracking."
          >
            <div style={{ marginTop: "1rem" }}>
              <button className="primary-button" onClick={initializeMockMedia}>
                Initialize & Track
              </button>
            </div>
          </EmptyState>
        ) : (
          <EmptyState
            icon={<X size={24} />}
            title="Media Not Found"
            message="We couldn't find this item in your database."
          />
        )}
      </AppPage>
    );
  }

  const { media, userMedia } = detail;
  const regularEpisodes = episodes.filter((ep) => !ep.isSpecial);
  const availableRegularEpisodes = progressEligibleEpisodes(regularEpisodes);
  const totalRegularCount = availableRegularEpisodes.length;
  const watchedRegularCount = availableRegularEpisodes.filter((ep) => ep.activity?.watched).length;
  const progressPercent = totalRegularCount > 0 ? Math.round((watchedRegularCount / totalRegularCount) * 100) : 0;

  const nextEp = availableRegularEpisodes
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)
    .find((ep) => !ep.activity?.watched);
  const episodeGroups = [...new Set(episodes.map((episode) => episode.seasonNumber))]
    .sort((a, b) => a - b)
    .map((seasonNumber) => ({ seasonNumber, episodes: episodes.filter((episode) => episode.seasonNumber === seasonNumber) }));

  const manualStatusOptions = manualStatusOptionsForMedia(media.type);
  const dateRangeLabel = formatMediaDateRange(media, regularEpisodes);
  const backdropImage = media.backdropPath ?? media.posterPath;
  const posterImage = media.posterPath ?? media.backdropPath;
  const mediaVisualStyle = {
    "--media-backdrop": backdropImage ? `url(${backdropImage})` : "none",
    "--media-poster": posterImage ? `url(${posterImage})` : "none",
  } as CSSProperties;

  return (
    <AppPage eyebrow={displayMediaType(media)} title={media.title} description={media.overview ?? "No overview available."}>
      <div className="media-visual-layer" style={mediaVisualStyle} aria-hidden="true" />
      <div className="media-detail-topbar">
        <div className={`media-backdrop ${media.backdropPath ? "active" : "inactive"}`} style={media.backdropPath ? { backgroundImage: `url(${media.backdropPath})` } : undefined} aria-hidden="true" />
        {userMedia && <IconButton label="Media settings" onClick={() => setMediaSettingsOpen(true)}><MoreHorizontal size={19} /></IconButton>}
      </div>
      <section className={`detail-layout ${media.backdropPath ? "has-backdrop" : "no-backdrop"}`}>
        <div className="detail-poster-column">
          <ResponsivePoster accent="linear-gradient(145deg, #2b2f36, #0f1115)" title={media.title} posterPath={media.posterPath} />
        </div>

        <div className="detail-copy">
          <div className="metadata-row">
            {isAnimeMedia(media) && <span className="status-chip paused"><Sparkles size={14} />Anime</span>}
            {isAnimeMedia(media) && <span className="status-chip planned">{animeFormatLabel(media)}</span>}
            {dateRangeLabel && <span><CalendarDays size={16} />{dateRangeLabel}</span>}
            {media.runtimeMinutes && <span><Clock3 size={16} />{media.runtimeMinutes} min{media.type === "show" || media.type === "anime" ? " average" : ""}</span>}
            {media.language && <span>{media.language.toUpperCase()}</span>}
            {media.source !== "manual" && <span>{media.source.toUpperCase()}</span>}
          </div>
          <div className="action-row" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "space-between", marginTop: "1rem" }}>
            {!userMedia ? (
              <button className="primary-button" onClick={() => addToLibrary()}>
                <Plus size={18} aria-hidden="true" />
                Add to library
              </button>
            ) : (
              <>
                {manualStatusOptions.length > 0 && <ManualStatusControls options={manualStatusOptions} active={userMedia.status} onChange={(option) => void updateStatus(option)} />}

                <IconButton
                  label="Favorite"
                  onClick={toggleFavorite}
                  style={userMedia.isFavorite ? { background: "rgba(255, 75, 75, 0.15)", color: "#ff4b4b" } : undefined}
                >
                  <Heart size={18} fill={userMedia.isFavorite ? "currentColor" : "none"} />
                </IconButton>

                <EmojiRating value={userMedia.rating} onChange={updateRating} label="Your rating" />
              </>
            )}
          </div>

          {userMedia && media.type === "movie" && (
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "1rem", borderRadius: "0.5rem" }}>
              <IconButton className={userMedia.status === "watched" ? "watched-toggle active" : "watched-toggle"} label={userMedia.status === "watched" ? "Movie watch actions" : "Mark movie watched"} onClick={() => userMedia.status === "watched" ? setMovieActionOpen(true) : void markMovieWatched("watched_once")}>
                <WatchMark count={userMedia.status === "watched" ? 1 + userMedia.rewatchCount : 1} />
              </IconButton>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span style={{ fontSize: "0.85rem", color: "#aeb1ac" }}>{userMedia.status === "watched" ? "Watched" : "Not watched"} · Rewatches: {userMedia.rewatchCount}</span>
                {userMedia.watchedAt && (
                  <span style={{ fontSize: "0.85rem", color: "#aeb1ac" }}>
                    Last: {new Date(userMedia.watchedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )}

          {userMedia && (media.type === "show" || media.type === "anime") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.9rem", fontWeight: "bold" }}>Progress</span>
                <span style={{ fontSize: "0.85rem", color: "#ffbf47" }}>
                  {watchedRegularCount} / {totalRegularCount} available episodes ({progressPercent}%)
                </span>
              </div>
              <ProgressBar value={progressPercent} label={`${progressPercent}% watched`} />

              {nextEp && (
                <div className="up-next-card">
                  <p className="eyebrow">Up next</p>
                  <EpisodeTile
                    episode={nextEp}
                    media={media}
                    dateMode={animeDateMode}
                    watched={false}
                    onToggle={() => void toggleEpisodeWatched(nextEp.id, false)}
                    onOpenActions={() => setEpisodeAction({ type: "episode", episode: nextEp })}
                  />
                </div>
              )}
            </div>
          )}

          {userMedia && (media.type === "book" || media.type === "game") && (
            <ProgressEditor mediaId={media.id} mediaType={media.type} userMedia={userMedia} csrfToken={me.csrfToken} onSaved={(updated) => { setDetail({ ...detail, userMedia: updated }); triggerToast("Progress saved"); }} />
          )}

          {userMedia && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.5rem" }}>
              <label htmlFor="notes-textarea" className="eyebrow" style={{ margin: 0 }}>Private Notes</label>
              <textarea
                id="notes-textarea"
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                onBlur={saveNotes}
                placeholder="Add your private notes or review here. Auto-saves on blur."
                style={{
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "0.45rem",
                  padding: "0.75rem",
                  color: "#f8f7f2",
                  fontSize: "0.9rem",
                  minHeight: "5rem",
                  resize: "vertical",
                }}
                disabled={savingNotes}
              />
            </div>
          )}
        </div>
      </section>

      {(media.type === "show" || media.type === "anime") && (
        <section className="episodes-section">
          <div className="section-heading"><div><p className="eyebrow">Episode guide</p><h2>Seasons & Episodes</h2></div><span>{watchedRegularCount} of {totalRegularCount} available watched</span></div>
          {isAnimeMedia(media) && <div className="segmented-control compact-toggle" aria-label="Anime release date mode"><button className={animeDateMode === "sub" ? "active" : ""} onClick={() => setAnimeDateMode("sub")}>Sub dates</button><button className={animeDateMode === "dub" ? "active" : ""} onClick={() => setAnimeDateMode("dub")}>Dub dates</button></div>}
          {hydrationProgress && <EpisodeGuideProgress progress={hydrationProgress} />}
          {episodes.length === 0 ? (
            <EmptyState icon={<RefreshCw size={24} />} title="Episode guide is being prepared" message="Episode details will appear here as provider data is loaded." />
          ) : <div className="season-stack">
            {episodeGroups.map((group) => {
              const collapsed = collapsedSeasons.has(group.seasonNumber);
              const availableSeasonEpisodes = releasableEpisodesForSeason(group.episodes);
              const watchedCount = availableSeasonEpisodes.filter((episode) => episode.activity?.watched).length;
              const seasonTotal = availableSeasonEpisodes.length;
              const seasonProgress = seasonTotal > 0 ? Math.round((watchedCount / seasonTotal) * 100) : 0;
              return <section className="season-group" key={group.seasonNumber} style={{ "--season-progress": `${seasonProgress}%` } as CSSProperties}>
                <header className="season-header">
                  <button className="season-toggle" onClick={() => setCollapsedSeasons((current) => { const next = new Set(current); next.has(group.seasonNumber) ? next.delete(group.seasonNumber) : next.add(group.seasonNumber); return next; })}><ChevronDown className={collapsed ? "collapsed" : ""} size={18} /><span>{group.seasonNumber === 0 ? "Specials" : `Season ${group.seasonNumber}`}</span><small>{watchedCount}/{seasonTotal || group.episodes.length}</small></button>
                  <IconButton className={seasonTotal > 0 && watchedCount === seasonTotal ? "watched-toggle active" : "watched-toggle"} label={seasonTotal > 0 && watchedCount === seasonTotal ? "Season actions" : "Mark released episodes watched"} onClick={() => {
                    if (seasonTotal === 0) {
                      triggerToast("No released episodes are available in this season yet.", "info");
                    } else if (watchedCount === seasonTotal) {
                      setEpisodeAction({ type: "season", seasonNumber: group.seasonNumber, watchedCount, totalCount: seasonTotal });
                    } else {
                      void setSeasonWatched(group.seasonNumber, true);
                    }
                  }}><WatchMark count={seasonWatchCount(availableSeasonEpisodes)} /></IconButton>
                </header>
                {!collapsed && <div className="episode-list">{group.episodes.map((ep) => {
                  const watched = ep.activity?.watched ?? false;
                  return <article className={watched ? "episode-row watched" : "episode-row"} key={ep.id}>
                    <EpisodeTile
                      episode={ep}
                      media={media}
                      dateMode={animeDateMode}
                      watched={watched}
                      onToggle={() => watched ? setEpisodeAction({ type: "episode", episode: ep }) : void toggleEpisodeWatched(ep.id, false)}
                      onOpenActions={() => setEpisodeAction({ type: "episode", episode: ep })}
                    />
                    <NavLink className="episode-open" aria-label={`Open ${ep.name ?? `episode ${ep.episodeNumber}`}`} to={`/media/${media.type}/${media.id}/episodes/${ep.id}`}><ChevronRight size={18} /></NavLink>
                  </article>;
                })}</div>}
              </section>;
            })}
          </div>}
        </section>
      )}

      {(media.type === "book" || media.type === "game") && units.length > 0 && <section className="episodes-section"><div className="section-heading"><div><p className="eyebrow">Progress guide</p><h2>{media.type === "book" ? "Chapters & Parts" : "Missions & Acts"}</h2></div><span>{units.filter((unit) => unit.activity?.completed).length} of {units.length} complete</span></div><div className="episode-list">{units.map((unit) => <article className={unit.activity?.completed ? "episode-row watched" : "episode-row"} key={unit.id}><NavLink className="episode-copy" to={`/media/${media.type}/${media.id}/units/${unit.id}`}><span>{unit.kind} {unit.position}</span><strong>{unit.title ?? `${unit.kind} ${unit.position}`}</strong><small>{unit.releaseDate ? new Date(`${unit.releaseDate}T00:00:00`).toLocaleDateString() : "Optional tracking unit"}</small></NavLink><IconButton className={unit.activity?.completed ? "watched-toggle active" : "watched-toggle"} label={unit.activity?.completed ? "Mark incomplete" : "Mark complete"} onClick={async () => { await apiJson(`/api/units/${unit.id}/activity`, { method: "PATCH", csrfToken: me.csrfToken, body: JSON.stringify({ completed: !unit.activity?.completed }) }); const refreshed = await apiJson<{ units: TrackableUnit[] }>(`/api/media/${media.id}/units`); setUnits(refreshed.units); }}><Check size={17} /></IconButton><NavLink className="episode-open" aria-label={`Open ${unit.title ?? unit.kind}`} to={`/media/${media.type}/${media.id}/units/${unit.id}`}><ChevronRight size={18} /></NavLink></article>)}</div></section>}

      <MediaTemplateSections media={media} newsArticles={newsArticles} newsLoading={newsLoading} newsWarning={newsWarning} onReloadNews={() => void loadNews(true)} dateRangeLabel={dateRangeLabel} />

      <Modal title="Media settings" open={mediaSettingsOpen} onClose={() => setMediaSettingsOpen(false)}>
        <div className="media-settings-sheet">
          <label className="secondary-button media-upload-action">
            <Upload size={17} aria-hidden="true" />
            Upload/update cover
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void uploadMediaCover(event.target.files?.[0])} />
          </label>
          <button className="secondary-button" disabled title="Backdrop editing will arrive with provider metadata tools.">
            Upload/update banner
          </button>
          <button className="secondary-button" onClick={() => void refreshInfo()}>Refresh info</button>
          {(media.type === "show" || media.type === "movie" || media.type === "anime") && <button className="secondary-button" onClick={() => void setAnimeClassification(!isAnimeMedia(media))}>{isAnimeMedia(media) ? "Remove anime tag" : "Mark as anime"}</button>}
          {userMedia && <button className="secondary-button danger-action" onClick={removeFromLibrary}>Remove from library</button>}
        </div>
      </Modal>

      <Modal title={episodeAction?.type === "season" ? "Season watch state" : "Episode watch state"} open={Boolean(episodeAction)} onClose={() => setEpisodeAction(null)}>
        {episodeAction && <div className="watch-action-sheet">
          <button className="secondary-button" onClick={() => episodeAction.type === "season" ? void applySeasonAction(episodeAction.seasonNumber, "not_watched") : void applyEpisodeAction(episodeAction.episode, "not_watched")}>Not watched</button>
          <button className="secondary-button" onClick={() => episodeAction.type === "season" ? void applySeasonAction(episodeAction.seasonNumber, "rewatched") : void applyEpisodeAction(episodeAction.episode, "rewatched")}>Rewatched</button>
          <button className="primary-button" onClick={() => episodeAction.type === "season" ? void applySeasonAction(episodeAction.seasonNumber, "watched_once") : void applyEpisodeAction(episodeAction.episode, "watched_once")}>Watched once</button>
        </div>}
      </Modal>

      <Modal title="Movie watch state" open={movieActionOpen} onClose={() => setMovieActionOpen(false)}>
        <div className="watch-action-sheet">
          <button className="secondary-button" onClick={() => void markMovieWatched("not_watched")}>Not watched</button>
          <button className="secondary-button" onClick={() => void markMovieWatched("rewatched")}>Rewatched</button>
          <button className="primary-button" onClick={() => void markMovieWatched("watched_once")}>Watched once</button>
        </div>
      </Modal>

    </AppPage>
  );
}

function EpisodeTile({ episode, media, watched, onToggle, dateMode = "sub" }: { episode: EpisodeWithActivity; media: MediaDetailData["media"]; watched: boolean; onToggle: () => void; onOpenActions?: () => void; dateMode?: "sub" | "dub" }) {
  const episodeExt = parseExtendedData(episode.extendedDataJson);
  const animeEpisode = episodeExt.animeEpisode;
  const isAnime = isAnimeMedia(media);
  const effectiveAirDate = isAnime && dateMode === "dub" ? (animeEpisode?.dubAirDate ?? episode.airDate) : episode.airDate;
  const release = releaseStatus(effectiveAirDate);
  const dubAvailable = Boolean(animeEpisode?.dubAvailable || animeEpisode?.dubAirDate);
  const title = episode.name ?? (release.kind === "future" ? "TBA" : `Episode ${episode.episodeNumber}`);
  return (
    <div className="episode-tile">
      <NavLink className="episode-thumb" to={`/media/${media.type}/${media.id}/episodes/${episode.id}`} style={episode.stillPath ? { backgroundImage: `url(${episode.stillPath})` } : undefined} aria-label={`Open ${title}`}>
        {!episode.stillPath && <span>{media.title.slice(0, 2).toUpperCase()}</span>}
      </NavLink>
      <NavLink className="episode-tile-copy" to={`/media/${media.type}/${media.id}/episodes/${episode.id}`}>
        <span>{formatEpisodeCode(episode)}{episode.isSpecial ? " - Special" : ""}</span>
        <strong>{title}{isAnime && dubAvailable ? <em className="dub-tag">Dub</em> : null}</strong>
      </NavLink>
      {watched || release.kind === "released" ? (
        <IconButton className={watched ? "watched-toggle active" : "watched-toggle"} label={watched ? "Episode actions" : "Mark watched"} onClick={onToggle}><WatchMark count={episodeWatchCount(episode)} /></IconButton>
      ) : (
        <span className="release-countdown">{release.label}</span>
      )}
    </div>
  );
}

function WatchMark({ count }: { count: number }) {
  return count > 1 ? <span className="rewatch-count-mark">x{count}</span> : <Check size={17} />;
}

const ratingEmojis = ["😐", "🙂", "😄", "😍", "🤩"];

function EmojiRating({ value, onChange, label = "Rating" }: { value: number | null; onChange: (rating: number | null) => void | Promise<void>; label?: string }) {
  const normalizedValue = value ? Math.min(5, Math.max(1, value)) : null;
  return (
    <div className="emoji-rating" aria-label={label}>
      <span>{label}</span>
      <div>
        {ratingEmojis.map((emoji, index) => {
          const rating = index + 1;
          return (
            <button
              className={normalizedValue === rating ? "active" : ""}
              aria-label={`Rate ${rating} out of 5`}
              key={rating}
              onClick={() => void onChange(normalizedValue === rating ? null : rating)}
              type="button"
            >
              {emoji}
            </button>
          );
        })}
      </div>
      {normalizedValue ? <small>{normalizedValue}/5</small> : <small>Not rated</small>}
    </div>
  );
}

function ManualStatusControls({ options, active, onChange }: { options: string[]; active: string; onChange: (status: string) => void }) {
  return (
    <div className="manual-status-controls">
      <span className="eyebrow">Manual status</span>
      <div>
        {options.map((option) => (
          <button className={active === option ? "active" : ""} key={option} onClick={() => onChange(option)} type="button">
            {statusIcon(option)}
            {formatStatusLabel(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

function statusIcon(status: string) {
  if (status === "stopped" || status === "dropped") return <Square size={14} />;
  if (status === "watch_later") return <Clock3 size={14} />;
  return <Sparkles size={14} />;
}

function manualStatusOptionsForMedia(type: MediaType) {
  if (type === "show" || type === "anime") return ["watch_later", "stopped"];
  if (type === "book" || type === "game") return ["dropped"];
  return [];
}

function episodeWatchCount(episode: EpisodeWithActivity) {
  return episode.activity?.watched ? 1 + (episode.activity.rewatchCount ?? 0) : 1;
}

function seasonWatchCount(episodes: EpisodeWithActivity[]) {
  const watched = episodes.filter((episode) => episode.activity?.watched);
  if (watched.length !== episodes.length || watched.length === 0) return 1;
  return Math.min(...watched.map(episodeWatchCount));
}

function MediaTemplateSections({ media, newsArticles, newsLoading, newsWarning, onReloadNews, dateRangeLabel }: { media: MediaDetailData["media"]; newsArticles: MediaNewsArticle[]; newsLoading: boolean; newsWarning: string | null; onReloadNews: () => void; dateRangeLabel: string | null }) {
  const ext = parseExtendedData(media.extendedDataJson);
  const directors = peopleByJob(ext.crew, "Director");
  const writers = peopleByJob(ext.crew, "Writer", "Screenplay");
  const producers = peopleByJob(ext.crew, "Producer", "Executive Producer");
  const creators = ext.creators?.map((person) => person.name).filter(Boolean) ?? [];
  return (
    <div className="rich-detail-grid">
      <NewsRail articles={newsArticles} loading={newsLoading} warning={newsWarning} onReload={onReloadNews} />
      <TypeSpecificMetadataSections media={media} ext={ext} />
      <section className="detail-panel"><div><p className="eyebrow">Where to watch</p><h2>Streaming</h2></div>{ext.watchProviders?.length ? <div className="provider-row">{ext.watchProviders.map((provider) => <span key={provider.name}>{provider.logoPath && <img src={provider.logoPath} alt="" />}{provider.name}</span>)}</div> : <p className="muted-copy">Availability has not been hydrated yet.</p>}</section>
      <section className="detail-panel"><div><p className="eyebrow">Info</p><h2>{media.type === "game" ? "Game info" : media.type === "book" ? "Book info" : isAnimeMedia(media) ? "Anime info" : "Show info"}</h2></div><div className="info-list"><span><CalendarDays size={15} />{dateRangeLabel ?? "Release TBA"}</span><span><Clock3 size={15} />{media.runtimeMinutes ? `${media.runtimeMinutes} min${media.type === "show" || media.type === "anime" ? " avg" : ""}` : "Runtime TBA"}</span><span><Sparkles size={15} />{ext.genres?.map((genre) => genre.name).join(", ") || "Genres TBA"}</span><span><Clapperboard size={15} />Director: {directors.join(", ") || "TBA"}</span><span><BookOpen size={15} />Writer: {writers.join(", ") || "TBA"}</span><span><Star size={15} />Producer: {producers.join(", ") || "TBA"}</span><span><User size={15} />Creator: {creators.join(", ") || "TBA"}</span></div></section>
        <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Cast</p><h2>Cast & Characters</h2></div>{ext.cast?.length ? <div className="cast-scroll">{ext.cast.map((person, index) => <NavLink className="cast-card" key={`${person.id ?? person.name}-${index}`} to={`/people/${person.id ?? `cast-${index}`}`} state={{ person: { id: String(person.id ?? ""), name: person.name, profilePath: person.profilePath ?? null, knownForDepartment: "Acting" } }}><div className="cast-portrait" style={person.profilePath ? { backgroundImage: `url(${person.profilePath})` } : undefined}>{!person.profilePath && person.name.slice(0, 1)}</div><strong>{person.name}</strong><span>{person.role || "Cast"}</span></NavLink>)}</div> : <p className="muted-copy">Cast will appear after provider hydration.</p>}</section>
      <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Related</p><h2>Related media</h2></div>{ext.related?.length ? <RelatedMediaRow items={ext.related} /> : <p className="muted-copy">Related media will appear after provider hydration.</p>}</section>
      <section className="detail-panel"><div><p className="eyebrow">Ratings</p><h2>External ratings</h2></div><div className="provider-row"><span>TMDB {ext.rating ? `${Number(ext.rating).toFixed(1)}/10` : "TBA"}</span>{ext.voteCount ? <span>{ext.voteCount.toLocaleString()} votes</span> : null}</div></section>
      <section className="detail-panel"><div><p className="eyebrow">Community</p><h2>Comments</h2></div><p className="muted-copy">Spoiler-aware comments arrive in Phase 8.</p></section>
    </div>
  );
}

function NewsRail({ articles, loading, warning, onReload }: { articles: MediaNewsArticle[]; loading: boolean; warning: string | null; onReload: () => void }) {
  return (
    <section className="detail-panel detail-panel-wide">
      <div className="section-heading news-heading"><div><p className="eyebrow">News</p><h2>Latest articles</h2></div><button className="secondary-button" type="button" disabled={loading} onClick={onReload}>{loading ? "Loading..." : "Reload"}</button></div>
      {articles.length ? (
        <div className="news-scroll">
          {articles.slice(0, 5).map((article) => (
            <a className="news-card" href={article.url} target="_blank" rel="noreferrer" key={article.url}>
              <div className="news-card-image" style={article.imageUrl ? { backgroundImage: `url(${article.imageUrl})` } : undefined}>{!article.imageUrl && <span>{article.sourceName.slice(0, 2).toUpperCase()}</span>}</div>
              <div>
                <small>{article.sourceName}{article.publishedAt ? ` - ${new Date(article.publishedAt).toLocaleDateString()}` : ""}</small>
                <strong>{article.title}</strong>
                {article.description && <p>{article.description}</p>}
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="news-empty">
          <p>{warning ?? "No cached news yet. Reload to fetch the latest articles."}</p>
        </div>
      )}
      {warning && articles.length > 0 && <p className="muted-copy">{warning}</p>}
    </section>
  );
}

function TypeSpecificMetadataSections({ media, ext }: { media: MediaDetailData["media"]; ext: ExtendedData }) {
  if (isAnimeMedia(media)) {
    return <>
      <section className="detail-panel"><div><p className="eyebrow">Anime</p><h2>Language & audio</h2></div><div className="info-list"><span><Sparkles size={15} />Original: {ext.anime?.originalLanguage ?? media.language?.toUpperCase() ?? "Japanese TBA"}</span><span><MessageSquare size={15} />Audio: {ext.anime?.audioLanguages?.join(", ") || "Audio languages TBA"}</span><span><Mail size={15} />Subtitles: {ext.anime?.subtitleLanguages?.join(", ") || "Subtitle languages TBA"}</span></div></section>
      <section className="detail-panel"><div><p className="eyebrow">Titles</p><h2>Anime titles</h2></div><div className="info-list"><span><Sparkles size={15} />English: {ext.anime?.englishTitle ?? media.title}</span><span><BookOpen size={15} />Japanese: {ext.anime?.japaneseTitle ?? "Japanese title TBA"}</span><span><MessageSquare size={15} />Dub status: {ext.anime?.dubStatus ?? "Dub status TBA"}</span></div></section>
      <section className="detail-panel"><div><p className="eyebrow">Studio</p><h2>Animation studios</h2></div>{ext.anime?.studios?.length ? <div className="provider-row">{ext.anime.studios.map((studio) => <span key={studio.name}>{studio.logoPath && <img src={studio.logoPath} alt="" />}{studio.name}</span>)}</div> : <p className="muted-copy">Studio logos will appear when anime metadata is available.</p>}</section>
      <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Characters</p><h2>Anime characters</h2></div>{ext.anime?.characters?.length ? <CastRow people={ext.anime.characters} prefix="anime-character" fallbackRole="Character" /> : <p className="muted-copy">Character profiles will appear when anime metadata is available.</p>}</section>
      <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Voices</p><h2>Japanese cast</h2></div>{ext.anime?.japaneseCast?.length ? <CastRow people={ext.anime.japaneseCast} prefix="jp" /> : <p className="muted-copy">Original voice cast will appear when available.</p>}</section>
      <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Dub</p><h2>Dub cast</h2></div>{ext.anime?.dubCast?.length ? <CastRow people={ext.anime.dubCast} prefix="dub" /> : <p className="muted-copy">Dub cast can be shown here when provider metadata includes it.</p>}</section>
      <section className="detail-panel"><div><p className="eyebrow">Anime ratings</p><h2>External scores</h2></div><div className="provider-row"><span>MAL {ext.anime?.malRating ? `${ext.anime.malRating}/10` : "TBA"}</span><span>TMDB {ext.rating ? `${Number(ext.rating).toFixed(1)}/10` : "TBA"}</span></div></section>
    </>;
  }

  if (media.type === "book") {
    return <>
      <section className="detail-panel"><div><p className="eyebrow">Book</p><h2>Edition details</h2></div><div className="info-list"><span><BookOpen size={15} />ISBN: {ext.book?.isbn13 ?? ext.book?.isbn10 ?? "TBA"}</span><span><CalendarDays size={15} />Publisher: {ext.book?.publisher ?? "TBA"}</span><span><Library size={15} />Pages: {ext.book?.pageCount ?? "TBA"}</span><span><MessageSquare size={15} />Language: {ext.book?.languages?.join(", ") || media.language?.toUpperCase() || "TBA"}</span></div></section>
      <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Authors</p><h2>Author section</h2></div>{ext.book?.authors?.length ? <CastRow people={ext.book.authors} prefix="author" fallbackRole="Author" /> : <p className="muted-copy">Authors will appear from Open Library metadata when available.</p>}</section>
      <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Characters</p><h2>Book characters</h2></div>{ext.book?.characters?.length ? <CastRow people={ext.book.characters} prefix="book-character" fallbackRole="Fictional character" /> : <p className="muted-copy">Fictional character profiles can be added manually or by a future provider.</p>}</section>
      <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Reviews</p><h2>Book reviews</h2></div>{ext.book?.reviews?.length ? <ReviewList reviews={ext.book.reviews} /> : <p className="muted-copy">Reviews arrive with the Phase 8 community layer or a compliant review provider.</p>}</section>
      <section className="detail-panel"><div><p className="eyebrow">Ratings</p><h2>Book ratings</h2></div><div className="provider-row"><span>Open Library {ext.book?.rating ? `${ext.book.rating}/5` : "TBA"}</span><span>{ext.book?.editionCount ? `${ext.book.editionCount} editions` : "Editions TBA"}</span></div></section>
    </>;
  }

  if (media.type === "game") {
    return <>
      <section className="detail-panel"><div><p className="eyebrow">Game</p><h2>Platforms</h2></div>{ext.game?.platforms?.length ? <div className="provider-row">{ext.game.platforms.map((platform) => <span key={platform}>{platform}</span>)}</div> : <p className="muted-copy">Provider platforms will appear after RAWG detail hydration.</p>}</section>
      <section className="detail-panel"><div><p className="eyebrow">Studio</p><h2>Development</h2></div><div className="info-list"><span><Gamepad2 size={15} />Developer: {ext.game?.developers?.join(", ") || "TBA"}</span><span><Library size={15} />Publisher: {ext.game?.publishers?.join(", ") || "TBA"}</span><span><Clock3 size={15} />Completion: {ext.game?.estimatedHours ? `${ext.game.estimatedHours}h estimate` : "TBA"}</span><span><Star size={15} />Sales/budget: {ext.game?.commercialInfo ?? "TBA"}</span></div></section>
      <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Requirements</p><h2>System requirements</h2></div><div className="requirements-grid"><div><strong>Minimum</strong><p>{ext.game?.requirements?.minimum ?? "Minimum requirements TBA"}</p></div><div><strong>Recommended</strong><p>{ext.game?.requirements?.recommended ?? "Recommended requirements TBA"}</p></div></div></section>
      <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Characters</p><h2>Characters & voices</h2></div>{ext.game?.characters?.length ? <CastRow people={ext.game.characters} prefix="game-character" fallbackRole="Character" /> : <p className="muted-copy">Game characters and voice actors can be shown here when metadata is available.</p>}</section>
      <section className="detail-panel"><div><p className="eyebrow">Ratings</p><h2>Game ratings</h2></div><div className="provider-row"><span>RAWG {ext.game?.rawgRating ?? (ext.rating ? Number(ext.rating).toFixed(1) : "TBA")}</span><span>Steam {ext.game?.steamRating ?? "TBA"}</span><span>IGN {ext.game?.ignRating ?? "TBA"}</span></div></section>
      <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Trailer</p><h2>Video</h2></div>{ext.game?.trailerKey ? <div className="video-embed"><iframe title={`${media.title} trailer`} src={`https://www.youtube.com/embed/${ext.game.trailerKey}`} allowFullScreen /></div> : <p className="muted-copy">Trailer embed will appear when a provider supplies a video.</p>}</section>
    </>;
  }

  return null;
}

function CastRow({ people, prefix, fallbackRole }: { people: ExtendedPerson[]; prefix: string; fallbackRole?: string }) {
  return <div className="cast-scroll">{people.map((person, index) => <NavLink className="cast-card" key={`${prefix}-${person.id ?? person.name}-${index}`} to={`/people/${person.id ?? `${prefix}-${index}`}`} state={{ person: { id: String(person.id ?? ""), name: person.name, profilePath: person.profilePath ?? null, knownForDepartment: person.job ?? fallbackRole ?? "Cast" } }}><div className="cast-portrait" style={person.profilePath ? { backgroundImage: `url(${person.profilePath})` } : undefined}>{!person.profilePath && person.name.slice(0, 1)}</div><strong>{person.name}</strong><span>{person.role || person.job || fallbackRole || "Cast"}</span></NavLink>)}</div>;
}

function ReviewList({ reviews }: { reviews: Array<{ source: string; author?: string; text: string; rating?: string | number }> }) {
  return <div className="review-list">{reviews.slice(0, 4).map((review, index) => <article key={`${review.source}-${index}`}><strong>{review.source}{review.rating ? ` - ${review.rating}` : ""}</strong><p>{review.text}</p>{review.author && <span className="muted-copy">{review.author}</span>}</article>)}</div>;
}

type ExtendedPerson = { id?: number | string; name: string; role?: string; job?: string; profilePath?: string | null };
type ExtendedData = {
  cast?: ExtendedPerson[];
  crew?: ExtendedPerson[];
  creators?: ExtendedPerson[];
  watchProviders?: Array<{ name: string; logoPath?: string | null }>;
  related?: RelatedMediaItem[];
  genres?: Array<{ id?: number; name: string }>;
  rating?: number;
  voteCount?: number;
  category?: string;
  anime?: {
    originalLanguage?: string;
    audioLanguages?: string[];
    subtitleLanguages?: string[];
    studios?: Array<{ name: string; logoPath?: string | null }>;
    japaneseCast?: ExtendedPerson[];
    dubCast?: ExtendedPerson[];
    characters?: ExtendedPerson[];
    englishTitle?: string;
    japaneseTitle?: string;
    dubStatus?: string;
    malRating?: number;
  };
  animeEpisode?: {
    dubAvailable?: boolean;
    dubAirDate?: string | null;
    dubbingStudio?: string;
    japaneseCast?: ExtendedPerson[];
    dubCast?: ExtendedPerson[];
  };
  book?: {
    isbn10?: string;
    isbn13?: string;
    publisher?: string;
    pageCount?: number;
    languages?: string[];
    authors?: ExtendedPerson[];
    characters?: ExtendedPerson[];
    reviews?: Array<{ source: string; author?: string; text: string; rating?: string | number }>;
    rating?: number;
    editionCount?: number;
  };
  game?: {
    platforms?: string[];
    stores?: string[];
    developers?: string[];
    publishers?: string[];
    estimatedHours?: number;
    commercialInfo?: string;
    requirements?: { minimum?: string; recommended?: string };
    characters?: ExtendedPerson[];
    rawgRating?: number | string;
    steamRating?: string;
    ignRating?: string;
    trailerKey?: string;
  };
};

type RelatedMediaItem = {
  id: number | string;
  providerId?: string;
  provider?: "tmdb";
  title: string;
  posterPath?: string | null;
  type?: MediaType | string;
  localMediaId?: string | null;
  alreadyTracked?: boolean;
  year?: number | null;
};

function RelatedMediaRow({ items }: { items: RelatedMediaItem[] }) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [tracked, setTracked] = useState(() => new Set(items.filter((item) => item.alreadyTracked).map((item) => String(item.providerId ?? item.id))));

  const openOrAdd = async (item: RelatedMediaItem, shouldNavigate: boolean) => {
    const key = String(item.providerId ?? item.id);
    if (item.localMediaId) {
      if (!isRelatedTracked(item, tracked)) {
        await apiJson(`/api/library/${item.localMediaId}`, {
          method: "POST",
          csrfToken: me.csrfToken,
        });
        setTracked((current) => new Set(current).add(key));
        clearDashboardCaches(me.user.id);
      }
      if (shouldNavigate) navigate(`/media/${normalizeRelatedMediaType(item.type)}/${item.localMediaId}`);
      return;
    }
    const result = await apiJson<{ media: { id: string; type: MediaType } }>(`/api/explore/add`, {
      method: "POST",
      csrfToken: me.csrfToken,
      body: JSON.stringify({
        provider: item.provider ?? "tmdb",
        providerId: key,
        type: normalizeRelatedMediaType(item.type),
        title: item.title,
        posterPath: item.posterPath ?? null,
        year: item.year ?? null,
      }),
    });
    setTracked((current) => new Set(current).add(key));
    clearDashboardCaches(me.user.id);
    if (shouldNavigate) navigate(`/media/${result.media.type}/${result.media.id}`);
  };

  return (
    <div className="related-scroll">
      {items.map((item) => {
        const key = String(item.providerId ?? item.id);
        const isTracked = isRelatedTracked(item, tracked);
        return (
          <article className="related-card" key={`${normalizeRelatedMediaType(item.type)}-${key}`}>
            <button className="related-poster-button" style={item.posterPath ? { backgroundImage: `url(${item.posterPath})` } : undefined} onClick={() => void openOrAdd(item, true)}>
              {!item.posterPath && item.title.slice(0, 2).toUpperCase()}
            </button>
            <button className={isTracked ? "related-track-button tracked" : "related-track-button"} aria-label={isTracked ? `${item.title} is tracked` : `Track ${item.title}`} disabled={isTracked} onClick={() => void openOrAdd(item, false)}>
              {isTracked ? <Check size={14} /> : <Plus size={14} />}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function isRelatedTracked(item: RelatedMediaItem, tracked: Set<string>) {
  return tracked.has(String(item.providerId ?? item.id)) || Boolean(item.alreadyTracked);
}

function normalizeRelatedMediaType(type?: string): MediaType {
  return type === "movie" ? "movie" : "show";
}

function parseExtendedData(json: string | null): ExtendedData {
  if (!json) return {};
  try {
    return JSON.parse(json) as ExtendedData;
  } catch {
    return {};
  }
}

function isAnimeMedia(media: MediaDetailData["media"]) {
  if (media.type === "anime") return true;
  const ext = parseExtendedData(media.extendedDataJson);
  return classifyMedia({
    type: media.type,
    language: media.language,
    category: typeof ext.category === "string" ? ext.category : null,
    anime: Boolean(ext.anime),
    genres: Array.isArray(ext.genres) ? ext.genres : null,
  }).isAnime;
}

function animeFormatLabel(media: MediaDetailData["media"]) {
  const ext = parseExtendedData(media.extendedDataJson) as ExtendedData & { animeFormat?: string };
  if (ext.animeFormat === "movie" || media.type === "movie") return "Anime movie";
  return "Anime series";
}

function EpisodeGuideProgress({ progress }: { progress: HydrationProgress }) {
  const isRefreshing = progress.status === "refreshing" || progress.activeJobs > 0;
  const label = progress.totalEpisodes > 0
    ? `${progress.hydratedEpisodes} of ${progress.totalEpisodes} episode details loaded`
    : "Preparing episode guide";
  const detail = `${progress.runningJobs ? "Updating now" : "Waiting"}${progress.queuedJobs ? `, ${progress.queuedJobs} batch${progress.queuedJobs === 1 ? "" : "es"} queued` : ""}`;

  if (!isRefreshing) return null;
  return <LoadingPanel title={label} message={detail} progress={Math.max(0, Math.min(100, progress.percent))} />;
}

function mediaNeedsHydration(media: MediaDetailData["media"], episodes: EpisodeWithActivity[]) {
  if (media.source !== "tmdb") return false;
  const ext = parseExtendedData(media.extendedDataJson);
  const missingMedia = !media.posterPath || !media.backdropPath || !media.overview || !media.releaseDate || !ext.cast?.length || !ext.related?.length;
  const showLike = media.type === "show" || media.type === "anime";
  const missingEpisodes = showLike && episodes.length === 0;
  return missingMedia || missingEpisodes;
}

function hydrationCooldownKey(mediaId: string) {
  return `tuvu-hydration:${mediaId}`;
}

function recentlyTriedHydration(mediaId: string) {
  try {
    const value = Number(localStorage.getItem(hydrationCooldownKey(mediaId)) ?? "0");
    return Number.isFinite(value) && Date.now() - value < 6 * 60 * 60_000;
  } catch {
    return false;
  }
}

function markHydrationTried(mediaId: string) {
  try {
    localStorage.setItem(hydrationCooldownKey(mediaId), String(Date.now()));
  } catch {
    // Hydration should still work without local storage.
  }
}

async function reportHydrationIfStillMissing(mediaId: string, title: string) {
  try {
    const status = await apiJson<{ job: { id: string; status: string; last_error: string | null; updated_at: string } | null }>(`/api/merge/${mediaId}/refresh-status`);
    if (status.job?.status === "failed") {
      notify(`Some extra details for ${title} could not be refreshed right now. Your saved tracking is still available.`, "info");
    } else if (status.job?.status === "queued" || status.job?.status === "running") {
      notify(`Extra details for ${title} are still updating in the background.`, "info");
    }
  } catch {
    // Avoid looping notices if status lookup itself fails; apiJson has already surfaced the network/API issue.
  }
}

function peopleByJob(crew: ExtendedPerson[] | undefined, ...jobs: string[]) {
  const wanted = new Set(jobs);
  return (crew ?? []).filter((person) => person.job && wanted.has(person.job)).map((person) => person.name).filter(Boolean);
}

function formatEpisodeCode(episode: { seasonNumber: number; episodeNumber: number }) {
  return `S${String(episode.seasonNumber).padStart(2, "0")}xE${String(episode.episodeNumber).padStart(2, "0")}`;
}

function releaseStatus(airDate: string | null): { kind: "released" | "future" | "tba"; label: string } {
  if (!airDate) return { kind: "tba", label: "TBA" };
  const release = new Date(`${airDate}T00:00:00`);
  if (Number.isNaN(release.getTime())) return { kind: "tba", label: "TBA" };
  const diff = release.getTime() - Date.now();
  if (diff <= 0) return { kind: "released", label: "Released" };
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return { kind: "future", label: `${minutes}m` };
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return { kind: "future", label: `${hours}h` };
  const days = Math.ceil(hours / 24);
  if (days < 60) return { kind: "future", label: `${days}d` };
  return { kind: "future", label: `${Math.ceil(days / 30)}mo` };
}

function isReleasedEpisode(episode: { airDate: string | null }) {
  return releaseStatus(episode.airDate).kind === "released";
}

function releasableEpisodesForSeason(episodes: EpisodeWithActivity[]) {
  return episodes.filter((episode) => !episode.isSpecial && isReleasedEpisode(episode));
}

function progressEligibleEpisodes(episodes: EpisodeWithActivity[]) {
  const datedReleased = episodes.filter((episode) => !episode.isSpecial && isReleasedEpisode(episode));
  if (datedReleased.length) return datedReleased;
  const hasDatedEpisodes = episodes.some((episode) => !episode.isSpecial && Boolean(episode.airDate));
  return hasDatedEpisodes ? datedReleased : episodes.filter((episode) => !episode.isSpecial);
}

function formatMediaDateRange(media: MediaDetailData["media"], episodes: EpisodeWithActivity[]) {
  if (!media.releaseDate) return null;
  const start = new Date(`${media.releaseDate}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" });
  if (media.airStatus === "ended" || media.airStatus === "released") {
    const endDate = latestEpisodeAirDate(episodes) ?? media.releaseDate;
    const end = new Date(`${endDate}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" });
    return endDate === media.releaseDate ? start : `${start} - ${end}`;
  }
  if (media.airStatus === "continuing" || media.airStatus === "upcoming") return `${start} - Present`;
  return start;
}

function latestEpisodeAirDate(episodes: EpisodeWithActivity[]) {
  const dates = episodes
    .filter((episode) => !episode.isSpecial && episode.airDate)
    .map((episode) => episode.airDate!)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function ProgressEditor({ mediaId, mediaType, userMedia, csrfToken, onSaved }: { mediaId: string; mediaType: "book" | "game"; userMedia: NonNullable<MediaDetailData["userMedia"]>; csrfToken: string; onSaved: (updated: NonNullable<MediaDetailData["userMedia"]>) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(userMedia.progressValue ?? ""));
  const [total, setTotal] = useState(String(userMedia.progressTotal ?? ""));
  const [unit, setUnit] = useState(userMedia.progressUnit ?? (mediaType === "book" ? "page" : "hour"));
  const initialPrefs = parseUserPlatformPrefs(userMedia.platform);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(initialPrefs.platforms);
  
  // Parse purchaseLibrary which is a JSON array string
  const initialStores = (() => {
    if (!userMedia.purchaseLibrary) return [];
    try { return JSON.parse(userMedia.purchaseLibrary) as string[]; } catch { return []; }
  })();
  const [stores, setStores] = useState<string[]>(initialStores.length ? initialStores : (initialPrefs.store ? [initialPrefs.store] : []));
  
  // Format started_at for HTML date input (YYYY-MM-DD)
  const initialStartedAt = userMedia.startedAt ? userMedia.startedAt.slice(0, 10) : (initialPrefs.startedAt || "");
  const [startedAt, setStartedAt] = useState(initialStartedAt);
  
  const [playtimeHours, setPlaytimeHours] = useState(initialPrefs.playtimeHours != null ? String(initialPrefs.playtimeHours) : "");
  const [plainPlatform, setPlainPlatform] = useState(initialPrefs.plain);
  const percent = userMedia.progressValue != null && userMedia.progressTotal ? Math.round((userMedia.progressValue / userMedia.progressTotal) * 100) : null;
  const platformSummary = mediaType === "game" ? formatPlatformPrefs(parseUserPlatformPrefs(userMedia.platform), userMedia.purchaseLibrary, userMedia.startedAt) : null;
  
  const save = async () => {
    const platform = mediaType === "game"
      ? stringifyUserPlatformPrefs({ platforms: selectedPlatforms, playtimeHours: playtimeHours ? Number(playtimeHours) : null, plain: plainPlatform })
      : null;
      
    // Create valid ISO string for startedAt if provided
    let startedAtIso: string | null = null;
    if (startedAt) {
      try {
        startedAtIso = new Date(`${startedAt}T12:00:00Z`).toISOString();
      } catch { /* ignore */ }
    }
    
    const purchaseLibrary = stores.length > 0 ? JSON.stringify(stores) : null;

    const result = await apiJson<{ userMedia: NonNullable<MediaDetailData["userMedia"]> }>(`/api/library/${mediaId}/progress`, {
      method: "PATCH", csrfToken,
      body: JSON.stringify({ 
        value: value ? Number(value) : null, 
        total: total ? Number(total) : null, 
        unit, 
        platform,
        startedAt: startedAtIso,
        purchaseLibrary
      }),
    });
    onSaved(result.userMedia);
    setOpen(false);
  };
  return <>
    <section className="progress-editor-summary"><div><span className="eyebrow">My progress</span><strong>{userMedia.progressValue ?? 0}{userMedia.progressUnit ? ` ${userMedia.progressUnit}${userMedia.progressValue === 1 ? "" : "s"}` : ""}{userMedia.progressTotal ? ` / ${userMedia.progressTotal}` : ""}</strong>{platformSummary && <small>{platformSummary}</small>}</div>{percent != null && <ProgressBar value={percent} label={`${percent}% complete`} />}<button className="secondary-button" onClick={() => setOpen(true)}>Update progress</button></section>
    <Modal title={`Update ${mediaType} progress`} open={open} onClose={() => setOpen(false)}><div className="progress-form"><label>Progress<input type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} /></label><label>Total (optional)<input type="number" min={1} value={total} onChange={(event) => setTotal(event.target.value)} /></label><label>Measure<select value={unit} onChange={(event) => setUnit(event.target.value)}>{mediaType === "book" ? <><option value="page">Pages</option><option value="percent">Percent</option><option value="chapter">Chapters</option></> : <><option value="hour">Hours played</option><option value="percent">Percent</option><option value="mission">Missions</option></>}</select></label>{mediaType === "game" && <><fieldset className="platform-picker"><legend>Playing on</legend>{gamePlatformOptions.map((option) => <label key={option}><input type="checkbox" checked={selectedPlatforms.includes(option)} onChange={(event) => setSelectedPlatforms((current) => event.target.checked ? [...current, option] : current.filter((item) => item !== option))} />{option}</label>)}</fieldset><label>Other platform<input value={plainPlatform} onChange={(event) => setPlainPlatform(event.target.value)} placeholder="Steam Deck, cloud, emulator..." /></label><fieldset className="platform-picker"><legend>Library / store</legend>{gameStoreOptions.map((option) => <label key={option}><input type="checkbox" checked={stores.includes(option)} onChange={(event) => setStores((current) => event.target.checked ? [...current, option] : current.filter((item) => item !== option))} />{option}</label>)}</fieldset><label>Started<input type="date" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} /></label><div className="action-row"><button className="secondary-button" type="button" onClick={() => setStartedAt(new Date().toISOString().slice(0, 10))}>Started now</button></div><label>Playtime hours<input type="number" min={0} step="0.1" value={playtimeHours} onChange={(event) => setPlaytimeHours(event.target.value)} placeholder="Optional" /></label></>}<button className="primary-button" onClick={() => void save()}>Save progress</button></div></Modal>
  </>;
}

const gamePlatformOptions = ["PC", "PlayStation", "Xbox", "Switch", "Mobile"];
const gameStoreOptions = ["Steam", "GOG", "Epic", "PlayStation Store", "Xbox Store", "Nintendo eShop", "Game Pass", "Physical", "Other"];
type UserPlatformPrefs = { platforms: string[]; store?: string; startedAt?: string; playtimeHours: number | null; plain: string };

function parseUserPlatformPrefs(value: string | null): UserPlatformPrefs {
  if (!value) return { platforms: [], playtimeHours: null, plain: "" };
  try {
    const parsed = JSON.parse(value) as Partial<UserPlatformPrefs>;
    return {
      platforms: Array.isArray(parsed.platforms) ? parsed.platforms.filter((item): item is string => typeof item === "string") : [],
      store: typeof parsed.store === "string" ? parsed.store : undefined,
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : undefined,
      playtimeHours: typeof parsed.playtimeHours === "number" ? parsed.playtimeHours : null,
      plain: typeof parsed.plain === "string" ? parsed.plain : "",
    };
  } catch {
    return { platforms: value ? [value] : [], playtimeHours: null, plain: "" };
  }
}

function stringifyUserPlatformPrefs(prefs: UserPlatformPrefs) {
  const normalized = {
    platforms: [...new Set([...prefs.platforms, ...(prefs.plain.trim() ? [prefs.plain.trim()] : [])])],
    playtimeHours: prefs.playtimeHours,
  };
  if (!normalized.platforms.length && normalized.playtimeHours == null) return null;
  return JSON.stringify(normalized);
}

function formatPlatformPrefs(prefs: UserPlatformPrefs, purchaseLibrary?: string | null, startedAt?: string | null) {
  let stores = [];
  if (purchaseLibrary) {
    try { stores = JSON.parse(purchaseLibrary); } catch { /* ignore */ }
  } else if (prefs.store) {
    stores = [prefs.store];
  }
  
  const started = startedAt || prefs.startedAt;
  
  const parts = [
    prefs.platforms.join(", "), 
    stores.join(", "), 
    started ? `Started ${new Date(started).toLocaleDateString()}` : "", 
    prefs.playtimeHours != null ? `${prefs.playtimeHours}h played` : ""
  ].filter(Boolean);
  return parts.join(" - ");
}

type EpisodeDetailPayload = {
  episode: EpisodeWithActivity;
  media: MediaDetailData["media"] | null;
  activity: EpisodeWithActivity["activity"];
};

function EpisodeDetailPage() {
  const { type, id, episodeId } = useParams();
  const { me } = useAuth();
  const [data, setData] = useState<EpisodeDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [animeDateMode, setAnimeDateMode] = useState<"sub" | "dub">("sub");
  const autoHydrateEpisodeRef = useRef(false);

  const load = async () => {
    if (!episodeId) return;
    try {
      const next = await apiJson<EpisodeDetailPayload>(`/api/episodes/${episodeId}`);
      setData(next);
      setNotes(next.activity?.notes ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Episode could not be loaded.");
    }
  };
  useEffect(() => {
    autoHydrateEpisodeRef.current = false;
    void load();
  }, [episodeId]);

  useEffect(() => {
    if (!id || !data?.media || autoHydrateEpisodeRef.current) return;
    if (data.media.source !== "tmdb") return;
    const missing = !data.episode.stillPath || !data.episode.overview || !data.episode.airDate || !data.episode.runtimeMinutes;
    if (!missing) return;
    if (recentlyTriedHydration(id)) return;
    autoHydrateEpisodeRef.current = true;
    markHydrationTried(id);
    void (async () => {
      try {
        await apiJson(`/api/merge/${id}/refresh`, { method: "POST", csrfToken: me.csrfToken });
        window.setTimeout(() => {
          void (async () => {
            await load();
            await reportHydrationIfStillMissing(id, data.media?.title ?? data.episode.name ?? "episode");
          })();
        }, 4500);
      } catch (reason) {
        notify(friendlyErrorMessage(reason, "Episode details could not be refreshed right now."), "info");
      }
    })();
  }, [id, data?.media?.source, data?.episode.id, data?.episode.stillPath, data?.episode.overview, data?.episode.airDate, data?.episode.runtimeMinutes, me.csrfToken]);

  const updateActivity = async (changes: Record<string, unknown>) => {
    if (!episodeId) return;
    try {
      await apiJson(`/api/episodes/${episodeId}/activity`, { method: "PATCH", csrfToken: me.csrfToken, body: JSON.stringify(changes) });
      await load();
    } catch (reason) {
      notify(friendlyErrorMessage(reason, "Activity could not be saved right now."), "info");
    }
  };

  const refreshEpisodeInfo = async () => {
    if (!id) return;
    try {
      await apiJson(`/api/merge/${id}/refresh`, { method: "POST", csrfToken: me.csrfToken });
      markHydrationTried(id);
      notify("Refreshing extra details in the background.", "info");
    } catch (reason) {
      notify(friendlyErrorMessage(reason, "Extra details could not be refreshed right now."), "info");
    }
  };

  if (!data) return <AppPage eyebrow="Episode" title={error ? "Episode unavailable" : "Loading episode"} description="Reading episode details...">{!error && <LoadingPanel title="Loading episode" message="Reading episode and tracking details..." />}</AppPage>;
  const { episode, media, activity } = data;
  const watched = activity?.watched ?? false;
  const episodeExt = parseExtendedData(episode.extendedDataJson);
  const animeEpisode = episodeExt.animeEpisode;
  const animeEpisodeView = media ? isAnimeMedia(media) : false;
  const effectiveAirDate = animeEpisodeView && animeDateMode === "dub" ? (animeEpisode?.dubAirDate ?? episode.airDate) : episode.airDate;
  const episodeDirectors = peopleByJob(episodeExt.crew, "Director");
  const episodeWriters = peopleByJob(episodeExt.crew, "Writer");
  return (
    <AppPage eyebrow={media?.title ?? type ?? "Episode"} title={episode.name ?? `Episode ${episode.episodeNumber}`} description={episode.overview ?? "Synopsis has not been announced yet."}>
      <section className="episode-detail-hero">
        <div className="episode-still" style={episode.stillPath ? { backgroundImage: `url(${episode.stillPath})` } : undefined}><span>S{episode.seasonNumber} E{episode.episodeNumber}</span></div>
        <div className="episode-detail-copy">
          {animeEpisodeView && <div className="segmented-control compact-toggle" aria-label="Anime episode date mode"><button className={animeDateMode === "sub" ? "active" : ""} onClick={() => setAnimeDateMode("sub")}>Sub date</button><button className={animeDateMode === "dub" ? "active" : ""} onClick={() => setAnimeDateMode("dub")}>Dub date</button></div>}
          <div className="metadata-row"><span><CalendarDays size={16} />{effectiveAirDate ? new Date(`${effectiveAirDate}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "long" }) : "Release date TBA"}</span><span><Clock3 size={16} />{episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : "Runtime TBA"}</span>{animeEpisodeView && (animeEpisode?.dubAvailable || animeEpisode?.dubAirDate) ? <span className="dub-tag">Dub available</span> : null}{animeEpisode?.dubbingStudio ? <span>{animeEpisode.dubbingStudio}</span> : null}</div>
          <div className="episode-detail-actions"><IconButton className={watched ? "watched-toggle active" : "watched-toggle"} label={watched ? "Mark not watched" : "Mark watched"} onClick={() => void updateActivity({ watched: !watched })}><WatchMark count={watched ? 1 + (activity?.rewatchCount ?? 0) : 1} /></IconButton><span>{watched ? "Watched" : "Not watched"}</span></div>
          <button className="secondary-button" onClick={() => void refreshEpisodeInfo()}>Refresh info</button>
          {activity?.watchedAt && <p className="muted-copy">Watched {new Date(activity.watchedAt).toLocaleString()}</p>}
          <EmojiRating value={activity?.rating ?? null} onChange={(rating) => updateActivity({ rating })} label="Your rating" />
          <label className="notes-field">Private episode notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => void updateActivity({ notes: notes || null })} placeholder="What stood out?" /></label>
        </div>
      </section>
      <div className="rich-detail-grid">
        <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Cast</p><h2>Episode cast</h2></div>{episodeExt.cast?.length ? <div className="cast-scroll">{episodeExt.cast.map((person, index) => <NavLink className="cast-card" key={`${person.id ?? person.name}-${index}`} to={`/people/${person.id ?? `episode-${episode.id}-${index}`}`} state={{ person: { id: String(person.id ?? ""), name: person.name, profilePath: person.profilePath ?? null, knownForDepartment: "Acting" } }}><div className="cast-portrait" style={person.profilePath ? { backgroundImage: `url(${person.profilePath})` } : undefined}>{!person.profilePath && person.name.slice(0, 1)}</div><strong>{person.name}</strong><span>{person.role || "Guest"}</span></NavLink>)}</div> : <p className="muted-copy">Episode cast will appear after provider hydration.</p>}</section>
        {animeEpisodeView && <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Voices</p><h2>Japanese voices</h2></div>{animeEpisode?.japaneseCast?.length ? <CastRow people={animeEpisode.japaneseCast} prefix={`episode-jp-${episode.id}`} /> : <p className="muted-copy">Japanese voice cast TBA.</p>}</section>}
        {animeEpisodeView && <section className="detail-panel detail-panel-wide"><div><p className="eyebrow">Dub</p><h2>English dub voices</h2></div>{animeEpisode?.dubCast?.length ? <CastRow people={animeEpisode.dubCast} prefix={`episode-dub-${episode.id}`} /> : <p className="muted-copy">Dub voice cast TBA.</p>}</section>}
        <section className="detail-panel"><div><p className="eyebrow">Episode info</p><h2>Credits</h2></div><div className="info-list"><span>Director: {episodeDirectors.join(", ") || "TBA"}</span><span>Writer: {episodeWriters.join(", ") || "TBA"}</span><span>TMDB rating: {episodeExt.rating ? `${Number(episodeExt.rating).toFixed(1)}/10` : "TBA"}</span></div></section>
        <section className="detail-panel"><div><p className="eyebrow">Community</p><h2>Comments</h2></div>{watched ? <p className="muted-copy">Episode comments arrive in Phase 8.</p> : <p className="spoiler-lock"><ShieldCheck size={18} />Mark this episode watched to reveal spoiler comments.</p>}</section>
      </div>
    </AppPage>
  );
}

function UnitDetailPage() {
  const { type, id, unitId } = useParams();
  const { me } = useAuth();
  const [data, setData] = useState<{ unit: TrackableUnit; media: MediaDetailData["media"] | null; activity: TrackableUnit["activity"] } | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    if (!unitId) return;
    try { const next = await apiJson<typeof data extends infer T ? NonNullable<T> : never>(`/api/units/${unitId}`); setData(next); setNotes(next.activity?.notes ?? ""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Tracking unit could not be loaded."); }
  };
  useEffect(() => { void load(); }, [unitId]);
  const update = async (changes: Record<string, unknown>) => { if (!unitId) return; await apiJson(`/api/units/${unitId}/activity`, { method: "PATCH", csrfToken: me.csrfToken, body: JSON.stringify(changes) }); await load(); };
  if (!data) return <AppPage eyebrow={type ?? "Progress"} title={error ? "Progress unavailable" : "Loading..."} description="Reading progress details...">{!error && <LoadingPanel title="Loading progress" message="Reading tracking details..." />}</AppPage>;
  const { unit, media, activity } = data;
  return <AppPage eyebrow={media?.title ?? type ?? "Progress"} title={unit.title ?? `${unit.kind} ${unit.position}`} description={unit.overview ?? `Track this ${unit.kind} independently.`}><NavLink className="back-link" to={`/media/${type}/${id}`}>Back to {media?.title ?? "media"}</NavLink><section className="episode-detail-hero"><div className="episode-still" style={unit.imagePath ? { backgroundImage: `url(${unit.imagePath})` } : undefined}><span>{unit.kind} {unit.position}</span></div><div className="episode-detail-copy"><div className="metadata-row"><span><CalendarDays size={16} />{unit.releaseDate ? new Date(`${unit.releaseDate}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "long" }) : "Release date unavailable"}</span></div><div className="watch-toggle" role="group" aria-label="Completion status"><button className={!activity?.completed ? "active" : ""} onClick={() => void update({ completed: false })}>Not complete</button><button className={activity?.completed ? "active" : ""} onClick={() => void update({ completed: true })}><Check size={16} />Complete</button></div>{activity?.completedAt && <p className="muted-copy">Completed {new Date(activity.completedAt).toLocaleString()}</p>}<EmojiRating value={activity?.rating ?? null} onChange={(rating) => update({ rating })} label="Your rating" /><label className="notes-field">Private notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => void update({ notes: notes || null })} placeholder={`Notes about this ${unit.kind}`} /></label></div></section></AppPage>;
}

type PersonProfilePayload = {
  id: string;
  name: string;
  biography: string | null;
  profilePath: string | null;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  knownForDepartment: string | null;
  credits: Array<{ id: string; type: "movie" | "show"; title: string; character: string | null; posterPath: string | null; year: number | null }>;
};

function PersonPlaceholderPage() {
  const { id } = useParams();
  const location = useLocation();
  const fallbackPerson = useMemo(() => personFromNavigationState(location.state, id), [location.state, id]);
  const [person, setPerson] = useState<PersonProfilePayload | null>(() => fallbackPerson);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!fallbackPerson);

  useEffect(() => {
    if (!id) return;
    setPerson(fallbackPerson);
    setError(null);
    setLoading(!fallbackPerson);
    void (async () => {
      try {
        const next = await apiJson<PersonProfilePayload>(`/api/people/${id}`);
        setPerson(next);
      } catch (reason) {
        if (!fallbackPerson) {
          setError(friendlyErrorMessage(reason, "Full profile could not be loaded right now."));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, fallbackPerson]);

  if (!person) {
    return (
      <AppPage eyebrow="Cast" title={error ? "Person unavailable" : "Loading person"} description="Reading cast profile...">
        {!error && <LoadingPanel title="Loading profile" message="Fetching person details..." />}
      </AppPage>
    );
  }

  return (
    <AppPage eyebrow={person.knownForDepartment ?? "Cast"} title={person.name} description={person.biography || "Biography is not available yet."}>
      {loading && <LoadingPanel title="Loading profile" message="Fetching updated person details..." compact />}
      <section className="person-profile-layout">
        <div className="person-profile-image" style={person.profilePath ? { backgroundImage: `url(${person.profilePath})` } : undefined}>{!person.profilePath && person.name.slice(0, 1)}</div>
        <div className="detail-panel">
          <div><p className="eyebrow">Profile</p><h2>{person.name}</h2></div>
          <div className="info-list">
            <span><CalendarDays size={15} />{person.birthday ?? "Birthday TBA"}{person.deathday ? ` - ${person.deathday}` : ""}</span>
            <span><User size={15} />{person.placeOfBirth ?? "Location TBA"}</span>
            <span><Clapperboard size={15} />{person.knownForDepartment ?? "Department TBA"}</span>
          </div>
        </div>
      </section>
      <section className="detail-panel detail-panel-wide">
        <div><p className="eyebrow">Credits</p><h2>Known for</h2></div>
        {person.credits.length ? (
          <div className="related-scroll">
            {person.credits.map((credit) => (
              <NavLink className="related-card" key={`${credit.type}-${credit.id}`} to={`/explore/search?q=${encodeURIComponent(credit.title)}`}>
                <div className="related-poster-button" style={credit.posterPath ? { backgroundImage: `url(${credit.posterPath})` } : undefined}>{!credit.posterPath && credit.title.slice(0, 2).toUpperCase()}</div>
                <strong>{credit.title}</strong>
                <span className="muted-copy">{credit.character ?? credit.type}{credit.year ? ` - ${credit.year}` : ""}</span>
              </NavLink>
            ))}
          </div>
        ) : <p className="muted-copy">Credits will appear after provider hydration.</p>}
      </section>
    </AppPage>
  );
}

function personFromNavigationState(state: unknown, id?: string): PersonProfilePayload | null {
  const person = (state as { person?: Partial<PersonProfilePayload> } | null)?.person;
  if (!person?.name) return null;
  return {
    id: String(person.id || id || ""),
    name: person.name,
    biography: person.biography ?? null,
    profilePath: person.profilePath ?? null,
    birthday: person.birthday ?? null,
    deathday: person.deathday ?? null,
    placeOfBirth: person.placeOfBirth ?? null,
    knownForDepartment: person.knownForDepartment ?? null,
    credits: person.credits ?? [],
  };
}

function ListPage() {
  const { id } = useParams();

  return (
    <AppPage eyebrow="Lists" title={`List ${id ?? ""}`} description="Mixed-media lists can include shows, movies, anime, games, and books.">
      <PosterGrid>
        {mediaItems.slice(0, 3).map((item) => (
          <MediaCard key={item.id} item={item} />
        ))}
      </PosterGrid>
    </AppPage>
  );
}

function MessagesPage() {
  return (
    <AppPage eyebrow="Messages" title="Inbox" description="Direct messages will use a calm, polling-based inbox in v1.">
      <EmptyState icon={<MessageSquare size={24} />} title="No conversations yet" message="Connections and messages arrive in Phase 8." />
    </AppPage>
  );
}

type SettingsSectionId = "account" | "appearance" | "navigation" | "providers" | "data" | "storage";

const settingsSections: Array<{ id: SettingsSectionId; label: string; icon: LucideIcon }> = [
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Moon },
  { id: "navigation", label: "Navigation", icon: Compass },
  { id: "providers", label: "Providers", icon: ShieldCheck },
  { id: "data", label: "Data", icon: Upload },
  { id: "storage", label: "Storage", icon: BarChart3 },
];

function SettingsPage() {
  const { me, refresh } = useAuth();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("account");

  return (
    <AppPage eyebrow="Settings" title="Preferences" description="Account, appearance, navigation, providers, imports, backups, and storage live here." mobileHelp>
      <div className="settings-shell">
        <nav className="settings-section-nav" aria-label="Settings sections">
          {settingsSections.map(({ id, label, icon: Icon }) => (
            <button className={activeSection === id ? "active" : ""} key={id} onClick={() => setActiveSection(id)}>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-panel-stack">
          {activeSection === "account" && <AccountSettingsPanel me={me} refresh={refresh} />}
          {activeSection === "appearance" && <AppearanceSettingsPanel />}
          {activeSection === "navigation" && <NavigationSettingsPanel csrfToken={me.csrfToken} />}
          {activeSection === "providers" && <ProviderCredentialsPanel csrfToken={me.csrfToken} />}
          {activeSection === "data" && <DataSettingsPanel csrfToken={me.csrfToken} />}
          {activeSection === "storage" && <StorageSettingsPanel />}
        </div>
      </div>
    </AppPage>
  );
}

function AccountSettingsPanel({ me, refresh }: { me: MePayload; refresh: () => Promise<void> }) {
  return (
    <SettingsPanel title="Account" description="Profile identity, uploads, visibility, and session controls.">
      <ProfileSettingsForm me={me} onSaved={refresh} />
    </SettingsPanel>
  );
}

function AppearanceSettingsPanel() {
  return (
    <SettingsPanel title="Appearance" description="Theme and future density controls.">
      <section className="settings-list">
        <ThemeSetting />
        <SettingRow icon={<LayoutGrid size={20} />} title="Density" value="Comfortable" />
      </section>
    </SettingsPanel>
  );
}

const navigationChoices = navItems.filter((item) => item.label !== "Explore").map((item) => ({ id: item.to.slice(1) as "shows" | "anime" | "movies" | "books" | "youtube" | "games", label: item.label, icon: item.icon }));

function NavigationSettingsPanel({ csrfToken }: { csrfToken: string }) {
  const [items, setItems] = useState<string[]>(["shows", "anime", "movies", "books", "games"]);
  const [showLabelsMobile, setShowLabelsMobile] = useState(false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [touchActiveId, setTouchActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState("Choose 2 to 6 navigation items. Explore is always available.");

  useEffect(() => {
    let cancelled = false;
    apiJson<{ navigation: { items: string[]; showLabelsMobile?: boolean } }>("/api/settings/navigation")
      .then((data) => {
        if (!cancelled) {
          setItems(data.navigation.items);
          setShowLabelsMobile(data.navigation.showLabelsMobile ?? false);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) => {
    setItems((current) => {
      if (current.includes(id)) {
        if (current.length <= 2) {
          setMessage("Keep at least 2 navigation items selected.");
          return current;
        }
        return current.filter((item) => item !== id);
      }
      if (current.length >= 6) {
        setMessage("Navigation can show up to 6 chosen items plus Explore.");
        return current;
      }
      return [...current, id];
    });
  };

  const moveTo = (id: string, targetId: string) => {
    setItems((current) => {
      const index = current.indexOf(id);
      const nextIndex = current.indexOf(targetId);
      if (index < 0 || nextIndex < 0 || index === nextIndex) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (!moved) return current;
      next.splice(nextIndex, 0, moved);
      return next;
    });
  };

  const save = async () => {
    try {
      await apiJson("/api/settings/navigation", { method: "PUT", csrfToken, body: JSON.stringify({ items, showLabelsMobile }) });
      notify("Navigation preference saved.", "success");
      window.dispatchEvent(new Event(navigationUpdatedEventName));
      setMessage("Saved. Your navigation updated on this device.");
    } catch (error) {
      setMessage("Navigation preference could not be saved.");
    }
  };

  const handleTouchStart = (id: string) => {
    setTouchActiveId(id);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;
    const targetButton = element.closest("[data-nav-id]");
    if (targetButton) {
      const targetId = targetButton.getAttribute("data-nav-id");
      if (targetId && touchActiveId && targetId !== touchActiveId) {
        moveTo(touchActiveId, targetId);
      }
    }
  };

  const handleTouchEnd = () => {
    setTouchActiveId(null);
  };

  const midpoint = Math.ceil(items.length / 2);

  const renderOrderItem = (id: string, labelNumber: number) => {
    const choice = navigationChoices.find((item) => item.id === id);
    if (!choice) return null;
    const Icon = choice.icon;
    return (
      <button
        className={draggedItem === id || touchActiveId === id ? "nav-settings-icon ordered dragging" : "nav-settings-icon ordered"}
        draggable
        data-nav-id={id}
        key={id}
        onDragStart={() => setDraggedItem(id)}
        onDragEnd={() => setDraggedItem(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (draggedItem) moveTo(draggedItem, id);
          setDraggedItem(null);
        }}
        onTouchStart={() => handleTouchStart(id)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        title={`Drag to reorder ${choice.label}`}
      >
        <Icon size={18} aria-hidden="true" />
        <small>{labelNumber}</small>
      </button>
    );
  };

  return (
    <SettingsPanel title="Navigation" description="Choose what appears in your personal media nav.">
      <div className="nav-settings-row-info">
        <h3>1. Select navigation pages</h3>
        <p>Tap items to add or remove them from your active navigation bar.</p>
      </div>
      <div className="nav-settings-bar" aria-label="Choose navigation items">
        {navigationChoices.slice(0, 3).map(({ id, label, icon: Icon }) => (
          <button className={items.includes(id) ? "nav-settings-icon active" : "nav-settings-icon"} key={id} onClick={() => toggle(id)} aria-pressed={items.includes(id)} title={label}>
            <Icon size={18} aria-hidden="true" />
          </button>
        ))}
        <article className="nav-settings-icon locked" title="Explore is always available">
          <Compass size={18} aria-hidden="true" />
        </article>
        {navigationChoices.slice(3).map(({ id, label, icon: Icon }) => (
          <button className={items.includes(id) ? "nav-settings-icon active" : "nav-settings-icon"} key={id} onClick={() => toggle(id)} aria-pressed={items.includes(id)} title={label}>
            <Icon size={18} aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="nav-settings-row-info" style={{ marginTop: "1.5rem" }}>
        <h3>2. Set page order</h3>
        <p>Drag items on desktop or touch-and-drag on mobile to arrange your navbar order.</p>
      </div>
      <section className="nav-settings-bar nav-order-preview" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }} aria-label="Drag selected navigation items to reorder">
        {items.slice(0, midpoint).map((id, index) => renderOrderItem(id, index + 1))}
        
        <article className="nav-settings-icon locked ordered" title="Explore is always inserted automatically in the middle">
          <Compass size={18} aria-hidden="true" />
        </article>

        {items.slice(midpoint).map((id, index) => renderOrderItem(id, midpoint + index + 2))}
      </section>

      <div className="nav-settings-row-info" style={{ marginTop: "1.5rem" }}>
        <h3>3. Mobile Display Preferences</h3>
        <p>Choose whether navigation icons show text labels on smaller screens.</p>
      </div>
      <section className="settings-list" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-panel)", background: "var(--color-surface)", overflow: "hidden" }}>
        <article className="setting-row" style={{ border: "none" }}>
          <div className="setting-icon"><Compass size={20} /></div>
          <div>
            <h2>Show text labels on mobile</h2>
            <p>{showLabelsMobile ? "Labels enabled on mobile navigation" : "Labels hidden on mobile (icons only)"}</p>
          </div>
          <div className="theme-options" role="group" aria-label="Show text labels on mobile">
            <button className={!showLabelsMobile ? "active" : ""} onClick={() => setShowLabelsMobile(false)}>
              Hide
            </button>
            <button className={showLabelsMobile ? "active" : ""} onClick={() => setShowLabelsMobile(true)}>
              Show
            </button>
          </div>
        </article>
      </section>

      <div className="action-row" style={{ marginTop: "1.25rem" }}>
        <button className="primary-button" onClick={() => void save()}>Save navigation</button>
      </div>
      <p className="form-message" role="status">{message}</p>
    </SettingsPanel>
  );
}

type ProviderInfo = {
  id: string | null;
  provider: string;
  name: string;
  category: ProviderCategory;
  description: string;
  keyless: boolean;
  label: string | null;
  status: "active" | "disabled" | "not_configured";
  configured: boolean;
  configurationSource?: "personal" | "app" | "keyless" | "disabled" | "none";
  connectionStatus?: string | null;
  lastTestedAt?: string | null;
  configuredFields?: string[];
  lastValidatedAt: string | null;
  updatedAt: string | null;
  fields: Array<{ key: string; label: string; placeholder: string; secure?: boolean }>;
  attribution: string;
  docUrl: string;
  appFallback?: {
    configured: boolean;
    message: string;
  };
};

type PingResultPayload = {
  ok: boolean;
  status: string;
  latencyMs: number;
  message: string;
};

function ProviderCredentialsPanel({ csrfToken }: { csrfToken: string }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ProviderCategory | "all">("all");
  const [activeProviderCode, setActiveProviderCode] = useState<string>("tmdb");
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("Provider credentials are user-scoped. App-level fallback keys remain active when personal keys are not set.");
  const [pingState, setPingState] = useState<{ loading: boolean; result: PingResultPayload | null }>({ loading: false, result: null });
  const [appPingState, setAppPingState] = useState<{ loading: boolean; result: PingResultPayload | null }>({ loading: false, result: null });

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ providers: ProviderInfo[] }>("/api/settings/providers");
      setProviders(data.providers);
    } catch {
      // Fallback to static catalog if worker not reachable
      setProviders(
        PROVIDER_CATALOG.map((p) => ({
          id: null,
          provider: p.code,
          name: p.name,
          category: p.category,
          description: p.description,
          keyless: p.keyless,
          label: null,
          status: p.keyless ? "active" : p.defaultStatus === "disabled" ? "disabled" : "not_configured",
          configured: p.keyless,
          configurationSource: p.keyless ? "keyless" : "none",
          connectionStatus: null,
          lastTestedAt: null,
          configuredFields: [],
          lastValidatedAt: null,
          updatedAt: null,
          fields: p.fields,
          attribution: p.attribution,
          docUrl: p.docUrl,
          appFallback: {
            configured: p.keyless,
            message: p.keyless ? "Keyless public API (always ready)" : "Server environment fallback",
          },
        }))
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredProviders = useMemo(() => {
    if (selectedCategory === "all") return providers;
    return providers.filter((p) => p.category === selectedCategory);
  }, [providers, selectedCategory]);

  const activeProvider = useMemo(() => {
    return providers.find((p) => p.provider === activeProviderCode) || providers[0] || (PROVIDER_CATALOG[0] as unknown as ProviderInfo);
  }, [providers, activeProviderCode]);

  const recordConnectionStatus = (provider: string, status: string) => {
    setProviders((current) => current.map((item) => item.provider === provider ? { ...item, connectionStatus: status } : item));
  };
  const activeProviderConnectionFailed = Boolean(activeProvider?.connectionStatus && !["healthy", "not_configured"].includes(activeProvider.connectionStatus));
  const activeProviderHealthLabel = activeProvider?.connectionStatus === "healthy" ? "Live" : activeProviderConnectionFailed ? "Failing" : "Not tested";
  const activeProviderHealthStyle = {
    background: activeProvider?.connectionStatus === "healthy" ? "rgba(16, 185, 129, 0.15)" : activeProviderConnectionFailed ? "rgba(239, 68, 68, 0.15)" : "rgba(255, 255, 255, 0.08)",
    color: activeProvider?.connectionStatus === "healthy" ? "var(--color-success, #10b981)" : activeProviderConnectionFailed ? "var(--color-danger, #ef4444)" : "var(--color-text-muted)",
  };

  const handleSelectCategory = (catId: ProviderCategory | "all") => {
    setSelectedCategory(catId);
    if (catId === "all") {
      if (!providers.some((p) => p.provider === activeProviderCode)) {
        setActiveProviderCode("tmdb");
      }
    } else {
      const match = providers.find((p) => p.category === catId);
      if (match) {
        setActiveProviderCode(match.provider);
      }
    }
  };

  // Reset ping state when active provider changes
  useEffect(() => {
    setPingState({ loading: false, result: null });
    setAppPingState({ loading: false, result: null });
    setValues({});
  }, [activeProviderCode]);

  const save = async () => {
    if (!activeProvider) return;
    const secrets = Object.fromEntries(
      (activeProvider.fields || []).map((f) => [f.key, values[f.key]?.trim()]).filter(([, val]) => Boolean(val))
    );
    if (Object.keys(secrets).length === 0) {
      notify("Please enter at least one credential value.", "error");
      return;
    }
    try {
      await apiJson(`/api/settings/providers/${activeProvider.provider}`, {
        method: "PUT",
        csrfToken,
        body: JSON.stringify({ label: "Personal", secrets }),
      });
      setValues({});
      await load();
      notify(`${activeProvider.name} credentials saved.`, "success");
      setMessage(`${activeProvider.name} is now connected to your user account.`);
    } catch {
      setMessage("Failed to save provider credentials.");
    }
  };

  const disable = async (code: string) => {
    try {
      await apiJson(`/api/settings/providers/${code}`, { method: "DELETE", csrfToken });
      await load();
      notify(`${activeProvider?.name || code} disabled.`, "success");
      setMessage("Provider credentials disabled.");
    } catch {
      setMessage("Failed to disable provider.");
    }
  };

  const runPing = async () => {
    if (!activeProvider) return;
    setPingState({ loading: true, result: null });
    try {
      const scope = activeProvider.configurationSource === "app" ? "app" : "user";
      const res = await apiJson<{ ping: PingResultPayload }>(`/api/settings/providers/${activeProvider.provider}/ping?scope=${scope}`, {
        method: "POST",
        csrfToken,
        body: JSON.stringify({ scope }),
      });
      setPingState({ loading: false, result: res.ping });
      recordConnectionStatus(activeProvider.provider, res.ping.status);
      if (res.ping.ok) {
        notify(`${activeProvider.name} responded in ${res.ping.latencyMs} ms`, "success");
      } else {
        notify(`${activeProvider.name}: ${res.ping.message}`, "error");
      }
    } catch (err: any) {
      const failure = {
        loading: false,
        result: {
          ok: false,
          status: "unavailable",
          latencyMs: 0,
          message: err?.message || "Connection probe failed.",
        },
      };
      setPingState(failure);
      recordConnectionStatus(activeProvider.provider, failure.result.status);
    }
  };

  const runTestAppFallback = async () => {
    if (!activeProvider) return;
    setAppPingState({ loading: true, result: null });
    try {
      const res = await apiJson<{ ping: PingResultPayload }>(`/api/settings/providers/${activeProvider.provider}/ping?scope=app`, {
        method: "POST",
        csrfToken,
        body: JSON.stringify({ scope: "app" }),
      });
      setAppPingState({ loading: false, result: res.ping });
      recordConnectionStatus(activeProvider.provider, res.ping.status);
      if (res.ping.ok) {
        notify(`App fallback: ${res.ping.message} (${res.ping.latencyMs} ms)`, "success");
      } else {
        notify(`App fallback: ${res.ping.message}`, "error");
      }
    } catch (err: any) {
      const failure = {
        loading: false,
        result: {
          ok: false,
          status: "unavailable",
          latencyMs: 0,
          message: err?.message || "App fallback probe failed.",
        },
      };
      setAppPingState(failure);
      recordConnectionStatus(activeProvider.provider, failure.result.status);
    }
  };

  return (
    <SettingsPanel title="Providers & APIs" description="Manage user-scoped credentials, keyless services, and live connectivity probes.">
      {/* Category selector pills */}
      <div className="provider-category-pills" role="tablist" aria-label="Provider Categories">
        {PROVIDER_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={selectedCategory === cat.id ? "active" : ""}
            onClick={() => handleSelectCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="provider-settings-grid">
        {/* Provider master list */}
        <div className="provider-list" role="tablist" aria-label="Provider catalog">
          {filteredProviders.map((p) => {
            const isConfigured = p.configurationSource === "personal" || p.configurationSource === "app";
            const hasFailedConnection = Boolean(p.connectionStatus && !["healthy", "not_configured"].includes(p.connectionStatus));
            const isKeyless = p.keyless;
            const isDisabled = p.status === "disabled";
            return (
              <button
                className={activeProviderCode === p.provider ? "active" : ""}
                key={p.provider}
                onClick={() => setActiveProviderCode(p.provider)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", textAlign: "left" }}
              >
                <div>
                  <div style={{ fontWeight: 650, color: "var(--color-text)" }}>{p.name}</div>
                  <small style={{ color: "var(--color-text-muted)" }}>
                    {p.configurationSource === "personal" ? "Personal key saved" : p.configurationSource === "app" ? "App fallback set" : isKeyless ? "Keyless / Ready" : isDisabled ? "Disabled" : "Not configured"}
                  </small>
                </div>
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: hasFailedConnection ? "var(--color-danger, #ef4444)" : isConfigured ? "var(--color-success, #10b981)" : isKeyless ? "var(--color-accent, #3b82f6)" : isDisabled ? "var(--color-danger, #ef4444)" : "var(--color-text-subtle, #6b7280)",
                    flexShrink: 0,
                    marginLeft: "0.5rem",
                  }}
                  title={p.status}
                />
              </button>
            );
          })}
        </div>

        {/* Selected Provider Details & Credentials Form */}
        {activeProvider && (
          <form className="settings-form provider-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>{activeProvider.name}</h3>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                  {activeProvider.description}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "999px",
                  background: (activeProvider.configurationSource === "personal" || activeProvider.configurationSource === "app") ? "rgba(16, 185, 129, 0.15)" : activeProvider.keyless ? "rgba(59, 130, 246, 0.15)" : "rgba(255, 255, 255, 0.08)",
                  color: (activeProvider.configurationSource === "personal" || activeProvider.configurationSource === "app") ? "var(--color-success, #10b981)" : activeProvider.keyless ? "var(--color-accent, #3b82f6)" : "var(--color-text-muted)",
                  border: "1px solid currentColor",
                }}
              >
                {activeProvider.keyless ? "Keyless API" : activeProvider.configurationSource === "personal" ? "Personal key saved" : activeProvider.configurationSource === "app" ? "App fallback set" : "Not configured"}
              </span>
              <span style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", padding: "0.2rem 0.6rem", borderRadius: "999px", border: "1px solid currentColor", ...activeProviderHealthStyle }}>{activeProviderHealthLabel}</span>
              </div>
            </div>

            {/* Keyless Info Banner */}
            {activeProvider.keyless && (
              <div style={{ padding: "0.75rem 1rem", borderRadius: "var(--radius-panel)", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.2)", display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.85rem" }}>
                <Wifi size={18} style={{ color: "var(--color-accent, #3b82f6)", flexShrink: 0 }} />
                <span>This provider is keyless and available out of the box. You can test live connectivity below.</span>
              </div>
            )}

            {/* App Fallback Status Row with Small Icon-Only Test Button */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0.85rem", borderRadius: "var(--radius-panel)", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--color-border)", fontSize: "0.82rem", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, minWidth: 0 }}>
                <Server size={15} style={{ color: activeProvider.appFallback?.configured ? "var(--color-success, #10b981)" : "var(--color-text-subtle)", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontWeight: 650, color: "var(--color-text)" }}>App Fallback</span>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        padding: "0.1rem 0.4rem",
                        borderRadius: "999px",
                        backgroundColor: activeProvider.appFallback?.configured ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: activeProvider.appFallback?.configured ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)",
                      }}
                    >
                      {activeProvider.appFallback?.configured ? "Set" : "Not Set"}
                    </span>
                    <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "0.1rem 0.4rem", borderRadius: "999px", ...activeProviderHealthStyle }}>{activeProviderHealthLabel}</span>
                  </div>
                  <div style={{ color: "var(--color-text-muted)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {appPingState.result
                      ? `${appPingState.result.message}${appPingState.result.latencyMs > 0 ? ` (${appPingState.result.latencyMs} ms)` : ""}`
                      : activeProvider.appFallback?.message || (activeProvider.keyless ? "Keyless public API (always ready)" : "Server environment fallback")}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="icon-button"
                title="Test App Fallback Connection"
                disabled={appPingState.loading}
                onClick={() => void runTestAppFallback()}
                style={{
                  width: "28px",
                  height: "28px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-panel)",
                  border: "1px solid var(--color-border)",
                  background: appPingState.loading ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.05)",
                  cursor: "pointer",
                  color: appPingState.result ? (appPingState.result.ok ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)") : "var(--color-accent)",
                  flexShrink: 0,
                }}
              >
                {appPingState.loading ? (
                  <Activity size={13} className="spin" />
                ) : appPingState.result ? (
                  appPingState.result.ok ? <Check size={13} /> : <X size={13} />
                ) : (
                  <Activity size={13} />
                )}
              </button>
            </div>

            {/* Credential Fields */}
            {activeProvider.fields && activeProvider.fields.length > 0 && (
              <div style={{ display: "grid", gap: "0.85rem", marginTop: "0.5rem" }}>
                {activeProvider.fields.map((field) => {
                  const hasSavedField = activeProvider.configuredFields?.includes(field.key) ?? false;
                  const effectivePlaceholder = hasSavedField && !values[field.key]
                    ? "•••••••••••••••• (Configured)"
                    : field.placeholder;
                  return (
                    <label key={field.key}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{field.label}</span>
                      <input
                        value={values[field.key] ?? ""}
                        onChange={(e) => setValues((curr) => ({ ...curr, [field.key]: e.target.value }))}
                        placeholder={effectivePlaceholder}
                        type={field.secure || field.key.toLowerCase().includes("key") || field.key.toLowerCase().includes("secret") || field.key.toLowerCase().includes("token") ? "password" : "text"}
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {/* Live Connection Probe Card */}
            {pingState.result && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-panel)",
                  background: pingState.result.ok ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: `1px solid ${pingState.result.ok ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.85rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Activity size={16} style={{ color: pingState.result.ok ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)" }} />
                  <span>{pingState.result.message}</span>
                </div>
                {pingState.result.latencyMs > 0 && (
                  <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                    {pingState.result.latencyMs} ms
                  </span>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="action-row" style={{ marginTop: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <button
                className="secondary-button"
                type="button"
                disabled={pingState.loading}
                onClick={() => void runPing()}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Activity size={16} />
                {pingState.loading ? "Testing..." : "Test Connection"}
              </button>

              {activeProvider.fields && activeProvider.fields.length > 0 && (
                <button className="primary-button" type="submit">
                  Save Credentials
                </button>
              )}

              {activeProvider.status === "active" && !activeProvider.keyless && (
                <button className="danger-button" type="button" onClick={() => void disable(activeProvider.provider)}>
                  Disable
                </button>
              )}
            </div>

            {/* Mandatory Attribution & Documentation */}
            <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem", color: "var(--color-text-subtle)", flexWrap: "wrap", gap: "0.5rem" }}>
              <span>{activeProvider.attribution}</span>
              {activeProvider.docUrl && (
                <a
                  href={activeProvider.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--color-accent)", textDecoration: "none" }}
                >
                  Documentation <ExternalLink size={12} />
                </a>
              )}
            </div>

            <p className="form-message" role="status" style={{ margin: "0.25rem 0 0 0" }}>{message}</p>
          </form>
        )}
      </div>
    </SettingsPanel>
  );
}

type UserBackup = { id: string; label: string | null; status: string; byteSize: number; createdAt: string; updatedAt: string };

function DataSettingsPanel({ csrfToken }: { csrfToken: string }) {
  const [backups, setBackups] = useState<UserBackup[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Create a backup first, then export that backup when needed.");

  const load = useCallback(async () => {
    const data = await apiJson<{ backups: UserBackup[] }>("/api/settings/backups");
    setBackups(data.backups);
  }, []);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  const createBackup = async () => {
    setBusy(true);
    try {
      await apiJson("/api/settings/backups", { method: "POST", csrfToken });
      await load();
      notify("Backup created.", "success");
      setMessage("Backup ready. Export it when you want an offline copy.");
    } catch (error) {
      setMessage("Backup could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async (backupId: string) => {
    try {
      const data = await apiJson<{ backup: { id: string; label: string | null; payload: unknown } }>(`/api/settings/backups/${backupId}/export`);
      const blob = new Blob([JSON.stringify(data.backup.payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tuvu-backup-${data.backup.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
      notify("Backup exported.", "success");
    } catch (error) {
      setMessage("Backup could not be exported.");
    }
  };

  return (
    <SettingsPanel title="Data" description="Import TV Time data, create account backups, and export backups.">
      <section className="settings-list">
        <NavLink className="setting-row" to="/profile/import/tv-time"><div className="setting-icon"><Upload size={20} /></div><div><h2>TV Time import</h2><p>Import ZIP or individual backup files.</p></div><ChevronRight size={18} /></NavLink>
        <article className="setting-row"><div className="setting-icon"><RefreshCw size={20} /></div><div><h2>Create backup</h2><p>Packages account tracking data into a D1 backup record.</p></div><button className="secondary-button" disabled={busy} onClick={() => void createBackup()}>{busy ? "Creating..." : "Create"}</button></article>
        <SettingRow icon={<Library size={20} />} title="Restore backup" value="Restore safety checks pending" />
      </section>
      <section className="backup-list" aria-label="Backups">
        {backups.length === 0 ? <EmptyState icon={<RefreshCw size={24} />} title="No backups yet" message="Create a backup to enable export." /> : backups.map((backup) => (
          <article className="backup-card" key={backup.id}>
            <div><h3>{backup.label ?? "Backup"}</h3><p>{new Date(backup.createdAt).toLocaleString()} - {formatBytes(backup.byteSize)}</p></div>
            <button className="secondary-button" onClick={() => void exportBackup(backup.id)}>Export</button>
          </article>
        ))}
      </section>
      <p className="form-message" role="status">{message}</p>
    </SettingsPanel>
  );
}

function StorageSettingsPanel() {
  const [storage, setStorage] = useState<{ libraryItems: number; userUploads: number; userUploadBytes: number; globalMediaItems: number; backups: number; backupBytes: number; databaseBytes: number | null; supabaseBytes: number | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiJson<{ storage: NonNullable<typeof storage> }>("/api/settings/storage").then((data) => { if (!cancelled) setStorage(data.storage); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <SettingsPanel title="Storage" description="Current usage estimates and future backup sizing.">
      <section className="settings-storage-grid">
        <StorageCard icon={<Library size={20} />} label="Tracked items" value={String(storage?.libraryItems ?? 0)} detail="User library rows" />
        <StorageCard icon={<Upload size={20} />} label="Profile media" value={formatBytes(storage?.userUploadBytes ?? 0)} detail={`${storage?.userUploads ?? 0} upload records`} />
        <StorageCard icon={<RefreshCw size={20} />} label="Backups" value={formatBytes(storage?.backupBytes ?? 0)} detail={`${storage?.backups ?? 0} backup records`} />
        <StorageCard icon={<BarChart3 size={20} />} label="Global media" value={String(storage?.globalMediaItems ?? 0)} detail="Shared catalog rows" />
      </section>
      <section className="settings-list">
        <SettingRow icon={<BarChart3 size={20} />} title="Database size" value={storage?.databaseBytes == null ? "Estimate endpoint pending" : formatBytes(storage.databaseBytes)} />
        <SettingRow icon={<Upload size={20} />} title="Supabase media size" value={storage?.supabaseBytes == null ? "Estimate endpoint pending" : formatBytes(storage.supabaseBytes)} />
      </section>
    </SettingsPanel>
  );
}

function StorageCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="storage-card">
      <div className="setting-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function SettingsPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="settings-panel">
      <div className="section-heading"><div><p className="eyebrow">Settings</p><h2>{title}</h2><p>{description}</p></div></div>
      {children}
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function ImportPage() {
  const { me } = useAuth();
  const importState = useImport();
  const [summary, setSummary] = useState<TvTimeImportSummary | null>(null);
  const [job, setJob] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [message, setMessage] = useState("Select the TV Time ZIP export or the individual export files.");
  const [error, setError] = useState<string | null>(null);

  const chooseFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    setJob(null);
    try {
      const parsed = await parseTvTimeFiles([...files]);
      setSummary(parsed);
      setMessage(`Parsed ${parsed.fileNames.length} file(s). Review data below before uploading.`);
    } catch (reason) {
      const nextError = reason instanceof Error ? reason.message : "Files could not be parsed.";
      notify(nextError, "error");
      setError(nextError);
    } finally {
      setBusy(false);
    }
  };

  const uploadData = async () => {
    if (!summary) return;
    setBusy(true);
    setError(null);
    try {
      let activeJob = job;
      if (!activeJob || activeJob.status === "created") {
        const created = await apiJson<{ job: any }>("/api/imports/tv-time/jobs", {
          method: "POST",
          csrfToken: me.csrfToken,
          body: JSON.stringify({ fileNames: summary.fileNames, counts: summary.counts }),
        });
        activeJob = created.job;
      }

      const chunks = chunkItems(summary.items, 25);
      setUploadProgress({ current: 0, total: chunks.length });
      for (let index = 0; index < chunks.length; index += 1) {
        setMessage(`Uploading chunk ${index + 1} of ${chunks.length}...`);
        setUploadProgress({ current: index + 1, total: chunks.length });
        await apiJson(`/api/imports/tv-time/jobs/${activeJob.id}/chunks`, {
          method: "POST",
          csrfToken: me.csrfToken,
          body: JSON.stringify({ chunkIndex: index, items: chunks[index] }),
        });
      }
      const refreshed = await apiJson<{ job: any }>(`/api/imports/tv-time/jobs/${activeJob.id}`);
      setJob(refreshed.job);
      setMessage("Chunks uploaded. Commit when ready.");
    } catch (reason) {
      const nextError = reason instanceof Error ? reason.message : "Data upload failed.";
      setError(nextError);
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const commit = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      importState.startBackgroundCommit(job.id, me.csrfToken);
      setJob({ ...job, status: "committing" });
      setMessage("Import started in background. You can navigate away.");
    } catch (reason) {
      const nextError = reason instanceof Error ? reason.message : "Commit failed to start.";
      setError(nextError);
    } finally {
      setBusy(false);
    }
  };

  const rollback = async () => {
    if (!job || !window.confirm("Roll back records created by this import job?")) return;
    setBusy(true);
    setError(null);
    try {
      const rolledBack = await apiJson<{ job: any; removed: number }>(`/api/imports/tv-time/jobs/${job.id}/rollback`, {
        method: "POST",
        csrfToken: me.csrfToken,
      });
      setJob(rolledBack.job);
      setMessage(`Rollback complete. Removed ${rolledBack.removed} created record(s).`);
    } catch (reason) {
      const nextError = reason instanceof Error ? reason.message : "Rollback failed.";
      setError(nextError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppPage eyebrow="Import" title="TV Time import" description="The import wizard route is reserved for file selection, chunked commits, and warnings." mobileHelp>
      <section className="import-wizard">
        <label className={`import-dropzone ${busy ? "busy" : ""}`}>
          {busy && !uploadProgress ? (
            <div className="import-spinner-container">
              <div className="import-spinner"></div>
              <strong>Processing export files...</strong>
              <span>Please keep this window open while we process your export data.</span>
            </div>
          ) : (
            <>
              <Upload size={24} aria-hidden="true" />
              <strong>Choose TV Time export</strong>
              <span>Upload `tv time backup data.zip` or select the JSON, CSV, and summary HTML files together.</span>
            </>
          )}
          <input type="file" multiple accept=".zip,.json,.csv,.html,text/csv,application/json,text/html" onChange={(event) => void chooseFiles(event.target.files)} disabled={busy} />
        </label>
        <p className="muted-copy">{message}</p>
        {summary && <ImportReview summary={summary} />}
        {job && <ImportJobPanel job={job} />}

        {importState.activeJob?.status === "committing" && importState.importProgress && (
          <div style={{ margin: "1.5rem 0", padding: "1rem", background: "rgba(255, 207, 92, 0.05)", border: "1px solid rgba(255, 207, 92, 0.2)", borderRadius: "0.5rem" }}>
            <p className="eyebrow" style={{ marginBottom: "0.5rem", color: "#ffcf5c" }}>Active Import Progress</p>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
              <span>Importing your library to the database...</span>
              <span>{importState.importProgress.processed} / {importState.importProgress.total} items</span>
            </div>
            <ProgressBar value={Math.round((importState.importProgress.processed / importState.importProgress.total) * 100) || 0} label="Import database progress" />
          </div>
        )}


        <div className="import-actions">
          {(!job || job.status === "created") && summary && (
            <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "0.5rem" }}>
              <button className="primary-button" disabled={busy} onClick={() => void uploadData()}>Step 1: Push Data to Database (Chunked)</button>
              {uploadProgress && (
                <div style={{ marginTop: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "0.3rem" }}>
                    <span>Uploading chunks...</span>
                    <span>{uploadProgress.current} / {uploadProgress.total}</span>
                  </div>
                  <ProgressBar value={Math.round((uploadProgress.current / uploadProgress.total) * 100)} label="Chunk upload progress" />
                </div>
              )}
            </div>
          )}
          {job && job.status === "uploaded" && (
            <button className="primary-button" disabled={busy} onClick={() => void commit()}>Step 2: Start Import</button>
          )}
          {job && (job.status === "committed" || job.status === "rolled_back") && (
            <button className="secondary-button danger-action" disabled={busy || job.status === "rolled_back"} onClick={() => void rollback()}>Rollback Import</button>
          )}
        </div>
      </section>
      <ImportHistory />
    </AppPage>
  );
}

function ImportHistory() {
  const [jobs, setJobs] = useState<any[]>([]);
  const { me } = useAuth();
  const importState = useImport();
  const [rollbackJobId, setRollbackJobId] = useState<string | null>(null);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [abandonJobId, setAbandonJobId] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      const res = await apiJson<{ jobs: any[] }>("/api/imports/tv-time/jobs");
      setJobs(res.jobs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const deleteJobLog = async (id: string) => {
    setDeleteJobId(null);
    try {
      await apiJson(`/api/imports/tv-time/jobs/${id}`, { method: "DELETE", csrfToken: me.csrfToken });
      fetchJobs();
    } catch (e) {
      notify("Import log could not be deleted.", "error");
    }
  };

  if (jobs.length === 0) return null;

  function jobStatusChip(job: any) {
    const isStopped = job.status === "failed" && (job.errorMessage === "Manually stopped." || job.error_message === "Manually stopped.");
    const map: Record<string, { label: string; tone: string }> = {
      committed: { label: "Committed", tone: "complete" },
      rolling_back: { label: "Rolling back", tone: "watching" },
      rolled_back: { label: "Rolled back", tone: "paused" },
      failed: isStopped ? { label: "Stopped", tone: "stopped" } : { label: "Failed", tone: "stopped" },
      uploading: { label: "Uploading", tone: "watching" },
      uploaded: { label: "Uploaded", tone: "planned" },
      committing: { label: "Committing", tone: "watching" },
      created: { label: "Created", tone: "planned" },
    };
    const { label, tone } = map[job.status] ?? { label: job.status.replace(/_/g, " "), tone: "" };
    return <span className={`status-chip ${tone}`} style={{ textTransform: "capitalize", fontSize: "0.78rem" }}>{label}</span>;
  }

  return (
    <section className="import-history-section">
      <div className="section-heading" style={{ marginBottom: "1rem" }}>
        <div>
          <p className="eyebrow">History</p>
          <h2>Previous Imports</h2>
        </div>
      </div>

      <div className="import-history-list">
        {jobs.map((job) => {
          const date = new Date(job.created_at);
          const shows = job.counts?.shows;
          const movies = job.counts?.movies;
          const canRollback = job.status === "committed";
          const isStopped = job.status === "failed" && (job.errorMessage === "Manually stopped." || job.error_message === "Manually stopped.");
          const canStop = ["committing", "rolling_back", "uploaded", "created"].includes(job.status) || (job.status === "failed" && !isStopped);
          const committedAt = job.committed_at ? new Date(job.committed_at) : null;

          // Progress calculation for history card
          let pct = 0;
          let processed = 0;
          let total = 0;
          const isActiveProgress = job.status === "committing" || job.status === "rolling_back";

          if (job.status === "committing") {
            if (job.itemStats && Array.isArray(job.itemStats)) {
              for (const stat of job.itemStats) {
                total += stat.count;
                if (stat.status === "committed") processed += stat.count;
              }
            }
            if (total === 0 && job.counts) {
              total = (job.counts.shows ?? 0) + (job.counts.movies ?? 0);
            }
            pct = Math.round((processed / Math.max(total, 1)) * 100) || 0;
          } else if (job.status === "rolling_back") {
            if (job.counts) {
              total = (job.counts.shows ?? 0) + (job.counts.movies ?? 0);
            }
            const remaining = job.remainingCreatedRecords ?? 0;
            processed = Math.max(0, total - remaining);
            pct = Math.round((processed / Math.max(total, 1)) * 100) || 0;
          }

          return (
            <article key={job.id} className="import-history-card">
              <div className="import-history-card-main" style={{ width: "100%" }}>
                <div className="import-history-card-meta">
                  <div className="import-history-card-date">
                    <CalendarDays size={13} aria-hidden="true" />
                    <span>{date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
                    {committedAt && <span className="import-history-card-time">{committedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>}
                  </div>
                  {jobStatusChip(job)}
                </div>

                <div className="import-history-card-stats">
                  {shows != null && (
                    <div className="import-stat-bubble">
                      <Tv size={12} aria-hidden="true" />
                      <strong>{shows.toLocaleString()}</strong>
                      <span>shows</span>
                    </div>
                  )}
                  {movies != null && (
                    <div className="import-stat-bubble">
                      <Film size={12} aria-hidden="true" />
                      <strong>{movies.toLocaleString()}</strong>
                      <span>movies</span>
                    </div>
                  )}
                </div>

                {isActiveProgress && (
                  <div style={{ marginTop: "0.4rem", width: "100%", maxWidth: "320px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-color)", marginBottom: "0.2rem" }}>
                      <span style={{ color: "#ffcf5c" }}>{job.status === "rolling_back" ? "Rolling back..." : "Importing..."}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{pct}% ({processed}/{total})</span>
                    </div>
                    <ProgressBar value={pct} label="Job progress" />
                  </div>
                )}
              </div>

              <div className="import-history-card-actions">
                {canStop && !canRollback && (
                  <button
                    className="secondary-button danger-action"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.8rem", display: "flex", alignItems: "center", gap: "0.35rem", borderColor: "rgba(255,107,107,0.25)" }}
                    onClick={() => setAbandonJobId(job.id)}
                  >
                    <X size={13} aria-hidden="true" />
                    Stop
                  </button>
                )}
                {canRollback && (
                  <button
                    className="secondary-button danger-action"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.8rem", display: "flex", alignItems: "center", gap: "0.35rem", borderColor: "rgba(255,107,107,0.25)" }}
                    onClick={() => setRollbackJobId(job.id)}
                  >
                    <X size={13} aria-hidden="true" />
                    Rollback
                  </button>
                )}
                <button
                  className="secondary-button"
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.8rem" }}
                  onClick={() => setDeleteJobId(job.id)}
                  aria-label="Delete log"
                >
                  Delete Log
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* Rollback confirmation modal */}
      {rollbackJobId && (
        <Modal title="Rollback Import" open={true} onClose={() => setRollbackJobId(null)}>
          <div className="modal-confirm-body">
            <div className="modal-confirm-icon" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}>
              <X size={24} />
            </div>
            <p className="modal-confirm-message">
              This will remove all media, episodes, and activity records created by this import job. Items you manually modified after import will also be removed.
            </p>
            <div className="modal-confirm-actions">
              <button className="secondary-button" style={{ flex: 1 }} onClick={() => setRollbackJobId(null)}>Cancel</button>
              <button
                className="primary-button"
                style={{ flex: 1, background: "#c0392b", borderColor: "transparent", color: "#fff" }}
                onClick={() => {
                  importState?.startBackgroundRollback(rollbackJobId, me.csrfToken);
                  setRollbackJobId(null);
                }}
              >
                Confirm Rollback
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete log confirmation modal */}
      {deleteJobId && (
        <Modal title="Delete Import Log" open={true} onClose={() => setDeleteJobId(null)}>
          <div className="modal-confirm-body">
            <p className="modal-confirm-message">
              This will delete the import log entry from history. <strong>It will not remove any imported data.</strong> To remove imported data, use Rollback instead.
            </p>
            <div className="modal-confirm-actions">
              <button className="secondary-button" style={{ flex: 1 }} onClick={() => setDeleteJobId(null)}>Cancel</button>
              <button className="primary-button" style={{ flex: 1 }} onClick={() => void deleteJobLog(deleteJobId)}>Delete Log</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Stop/abandon confirmation modal */}
      {abandonJobId && (
        <Modal title="Stop Import" open={true} onClose={() => setAbandonJobId(null)}>
          <div className="modal-confirm-body">
            <div className="modal-confirm-icon" style={{ color: "#ff8080", background: "rgba(255,107,107,0.1)" }}>
              <X size={24} />
            </div>
            <p className="modal-confirm-message">
              This will <strong>stop and abandon</strong> this import job. Any items already imported will remain, but the rest will not continue. You can start a new import afterwards.
            </p>
            <div className="modal-confirm-actions">
              <button className="secondary-button" style={{ flex: 1 }} onClick={() => setAbandonJobId(null)}>Cancel</button>
              <button
                className="primary-button"
                style={{ flex: 1, background: "#c0392b", borderColor: "transparent", color: "#fff" }}
                onClick={() => {
                  void importState?.abandonJob(abandonJobId, me.csrfToken).then(fetchJobs);
                  setAbandonJobId(null);
                }}
              >
                Stop Import
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function ImportReview({ summary }: { summary: TvTimeImportSummary }) {
  const countEntries = Object.entries(summary.counts) as Array<[keyof typeof summary.counts, number]>;
  return (
    <section className="import-review">
      <div className="section-heading"><div><p className="eyebrow">Dry run</p><h2>Detected export data</h2></div><span>{summary.items.length} normalized items</span></div>
      <div className="import-count-grid">
        {countEntries.map(([key, value]) => {
          const expected = tvTimeExpectedCounts[key];
          const matches = expected === value;
          return <article className={matches ? "import-count-card ok" : "import-count-card warn"} key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><strong>{value.toLocaleString()}</strong><small>Expected {expected.toLocaleString()}</small></article>;
        })}
      </div>
      <div className="import-file-list">{summary.fileNames.map((name) => <span key={name}>{name}</span>)}</div>
      {summary.warnings.length > 0 && <WarningList warnings={summary.warnings} />}
    </section>
  );
}

function ImportJobPanel({ job }: { job: any }) {
  return (
    <section className="import-job-panel">
      <div><p className="eyebrow">Job</p><h2 style={{ textTransform: "capitalize" }}>{job.status.replaceAll("_", " ")}</h2></div>
      <div className="import-file-list">{job.itemStats?.map((stat: any) => <span key={`${stat.item_kind}-${stat.status}`}>{stat.item_kind} {stat.status}: {stat.count}</span>)}</div>
      {job.warnings?.length > 0 && <WarningList warnings={job.warnings} />}
    </section>
  );
}

function WarningList({ warnings }: { warnings: Array<{ severity: string; code: string; message: string }> }) {
  return <div className="warning-list">{warnings.slice(0, 80).map((warning, index) => <p className={`warning ${warning.severity}`} key={`${warning.code}-${index}`}><strong>{warning.code}</strong>{warning.message}</p>)}</div>;
}

function chunkItems(items: TvTimeImportItem[], size: number) {
  const chunks: TvTimeImportItem[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

let globalNavDirection: "forward" | "back" = "forward";

function AppPage({
  eyebrow,
  title,
  description,
  action,
  mobileHelp = false,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  mobileHelp?: boolean;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const topLevelPaths = new Set(["/books", "/games", "/shows", "/movies", "/explore", "/profile", "/profile/explore", "/anime", "/youtube"]);
  const isSubPage = !topLevelPaths.has(location.pathname) && location.pathname !== "/";
  
  // Snap the navigation direction at component mount time.
  const [navDirection] = useState(globalNavDirection);
  
  // Expanded state for long descriptions (like biography)
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Reset global nav direction to "forward" for subsequent transitions
    globalNavDirection = "forward";
  }, []);

  useEffect(() => {
    // Reset scroll to top on every route change
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const goBack = () => {
    globalNavDirection = "back";
    navigate(-1);
  };

  const isLongDescription = description.length > 280;
  const displayDescription = isLongDescription && !expanded 
    ? `${description.slice(0, 260)}...` 
    : description;

  return (
    <main className={`${isSubPage ? "page-shell sub-page-shell" : "page-shell"} ${navDirection === "back" ? "slide-back" : "slide-in"}`}>
      {isSubPage && <IconButton className="page-back-button" label="Go back" onClick={goBack}><ArrowLeft size={18} /></IconButton>}
      <section className={mobileHelp ? "page-heading mobile-help" : "page-heading"}>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 tabIndex={mobileHelp ? 0 : undefined} data-help={mobileHelp ? description : undefined} title={mobileHelp ? description : undefined}>{title}</h1>
          {isSubPage && (
            <p className="heading-description">
              {displayDescription}
              {isLongDescription && (
                <button type="button" className="read-more-btn" onClick={() => setExpanded(!expanded)}>
                  {expanded ? "Collapse" : "Read more"}
                </button>
              )}
            </p>
          )}
        </div>
        {action}
      </section>
      {children}
    </main>
  );
}

const sortOptions = [
  { value: "updated", label: "Recently updated", icon: Clock3 },
  { value: "title", label: "Title", icon: ListIcon },
  { value: "year", label: "Release year", icon: CalendarDays },
  { value: "progress", label: "Progress", icon: BarChart3 },
];

function SortMenu({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const active = sortOptions.find((option) => option.value === value) ?? sortOptions.find((option) => option.value === "updated")!;
  const ActiveIcon = active.icon;
  return (
    <details className="sort-menu">
      <summary aria-label={`Sort: ${active.label}`} title={`Sort: ${active.label}`}>
        <ActiveIcon size={17} aria-hidden="true" />
      </summary>
      <div className="sort-menu-panel" role="menu">
        {sortOptions.map(({ value: optionValue, label, icon: Icon }) => (
          <button
            className={value === optionValue ? "active" : ""}
            key={optionValue}
            role="menuitemradio"
            aria-checked={value === optionValue}
            onClick={(event) => {
              onChange(optionValue);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}

function DashboardStats({ entries = [], kind = "shows", totalTracked, statusCounts }: { entries?: DashboardEntry[]; kind?: DashboardKind; totalTracked?: number; statusCounts?: Record<string, number> }) {
  const active = statusCounts ? (statusCounts["watching"] || 0) : entries.filter((entry) => ["watching", "reading", "playing"].includes(entry.status)).length;
  const favorites = entries.filter((entry) => entry.isFavorite).length;
  return (
    <section className="stats-grid" aria-label="Library stats">
      <Stat icon={<Play size={20} />} label={kind === "shows" ? "Next up" : "In progress"} value={String(kind === "shows" ? entries.filter((entry) => entry.nextEpisode).length : active)} />
      <Stat icon={<Star size={20} />} label="Favorites" value={String(favorites)} />
      <Stat icon={<BarChart3 size={20} />} label="Tracked" value={String(totalTracked ?? entries.length)} />
    </section>
  );
}

function DashboardTabs({ tabs, active, onChange }: { tabs: Array<{ id: string; label: string; count: number }>; active: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs dashboard-tabs" role="tablist" aria-label="Dashboard sections">
      {tabs.map((tab) => <button className={active === tab.id ? "active" : ""} role="tab" aria-selected={active === tab.id} key={tab.id} onClick={() => onChange(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}
    </div>
  );
}

function toneForStatus(status: string): StatusTone {
  if (["watching", "playing", "reading"].includes(status)) return "watching";
  if (["completed", "watched", "finished", "up_to_date"].includes(status)) return "complete";
  if (status === "paused") return "paused";
  if (["stopped", "dropped"].includes(status)) return "stopped";
  return "planned";
}

function DashboardMediaCard({ entry, compact, onMarkNext }: { entry: DashboardEntry; compact: boolean; onMarkNext: (episodeId: string) => Promise<void> }) {
  const percent = entry.totalRegularEpisodes > 0
    ? Math.min(100, Math.round((entry.progressEpisodes / entry.totalRegularEpisodes) * 100))
    : entry.progressValue != null && entry.progressTotal
      ? Math.min(100, Math.round((entry.progressValue / entry.progressTotal) * 100))
    : (["watched", "completed", "finished"].includes(entry.status) ? 100 : 0);
  const nextLabel = entry.nextEpisode ? `S${entry.nextEpisode.seasonNumber} E${entry.nextEpisode.episodeNumber}` : null;

  if (compact) {
    return (
      <article className="media-card compact-card">
        <NavLink className="media-card-link" to={`/media/${entry.type}/${entry.mediaId}`} aria-label={`Open ${entry.title}`}>
          <div className="poster-container" style={{ position: "relative", width: "100%", aspectRatio: "2 / 3", overflow: "hidden", borderRadius: "0.4rem" }}>
            {/* Background poster with opacity */}
            <div style={{ opacity: "var(--opacity-bg-poster)", width: "100%", height: "100%" }}>
              <ResponsivePoster accent="linear-gradient(145deg, #30343b, #111318)" title={entry.title} posterPath={entry.posterPath} showTitle={false} />
            </div>

            {/* Foreground clipped poster with 1.0 opacity */}
            <div style={{ position: "absolute", inset: 0, opacity: 1, clipPath: `polygon(0 0, ${percent}% 0, ${percent}% 100%, 0 100%)`, width: "100%", height: "100%" }}>
              <ResponsivePoster accent="linear-gradient(145deg, #30343b, #111318)" title={entry.title} posterPath={entry.posterPath} showTitle={false} />
            </div>
          </div>

          <div className="media-card-body">
            <div>
              <h2 style={{ fontSize: "0.95rem", fontWeight: 750, margin: 0, textAlign: "left" }}>{entry.title}</h2>
              <p style={{ margin: "0.15rem 0 0.35rem", fontSize: "0.82rem", color: "#aeb1ac", textAlign: "left" }}>
                {nextLabel ?? (entry.year ? String(entry.year) : "")}
              </p>
            </div>
            <div style={{ display: "flex" }}>
              <StatusChip tone={toneForStatus(entry.status)}>{entry.status.replaceAll("_", " ")}</StatusChip>
            </div>
          </div>
        </NavLink>
        {entry.nextEpisode && (
          <button className="quick-watch thinner" onClick={() => void onMarkNext(entry.nextEpisode!.id)}>
            <Check size={14} />Mark watched
          </button>
        )}
      </article>
    );
  }

  const displayYear = entry.year ? String(entry.year) : "";
  return (
    <article className="media-card">
      <NavLink className="media-card-link" to={`/media/${entry.type}/${entry.mediaId}`} aria-label={`Open ${entry.title}`}>
        <div className="poster-container" style={{ position: "relative", width: "100%", aspectRatio: "2 / 3", overflow: "hidden", borderRadius: "0.5rem" }}>
          {/* Background poster with opacity */}
          <div style={{ opacity: "var(--opacity-bg-poster)", width: "100%", height: "100%" }}>
            <ResponsivePoster accent="linear-gradient(145deg, #30343b, #111318)" title={entry.title} posterPath={entry.posterPath} showTitle={false} />
          </div>

          {/* Foreground clipped poster with 1.0 opacity */}
          <div style={{ position: "absolute", inset: 0, opacity: 1, clipPath: `polygon(0 0, ${percent}% 0, ${percent}% 100%, 0 100%)`, width: "100%", height: "100%" }}>
            <ResponsivePoster accent="linear-gradient(145deg, #30343b, #111318)" title={entry.title} posterPath={entry.posterPath} showTitle={false} />
          </div>

          {/* Status chip over top left */}
          <div style={{ position: "absolute", top: "0.5rem", left: "0.5rem", zIndex: 10 }}>
            <StatusChip tone={toneForStatus(entry.status)}>{entry.status.replaceAll("_", " ")}</StatusChip>
          </div>

          {/* S1 E2 chip over top right */}
          {nextLabel && (
            <div style={{ position: "absolute", top: "0.5rem", right: "0.5rem", zIndex: 10 }}>
              <span className="episode-chip">{nextLabel}</span>
            </div>
          )}

          {/* Title and Year Overlay at the bottom */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0.85rem", zIndex: 10, background: "linear-gradient(transparent, rgba(0, 0, 0, 0.85))", borderRadius: "0 0 0.5rem 0.5rem" }}>
            <span style={{ color: "#fff8e8", fontSize: "0.95rem", fontWeight: 850, lineHeight: 1.1, overflowWrap: "anywhere", marginRight: "0.5rem", flex: 1, textAlign: "left" }}>
              {entry.title}
            </span>
            {displayYear && (
              <span className="poster-year-chip">
                {displayYear}
              </span>
            )}
          </div>
        </div>
      </NavLink>
      {entry.nextEpisode && (
        <button className="quick-watch thinner" onClick={() => void onMarkNext(entry.nextEpisode!.id)}>
          <Check size={14} />Mark {nextLabel} watched
        </button>
      )}
    </article>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="stat-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ThemeSetting() {
  const auth = useAuth();
  const me = auth?.me;
  const refresh = auth?.refresh;

  const [theme, setTheme] = useState<ThemePreference>(() => {
    return normalizeThemePreference(localStorage.getItem(uiConstants.themeStorageKey));
  });

  useEffect(() => {
    if (me?.appearance?.theme) {
      setTheme(me.appearance.theme);
    }
  }, [me?.appearance?.theme]);

  const changeTheme = async (newTheme: ThemePreference) => {
    setTheme(newTheme);
    localStorage.setItem(uiConstants.themeStorageKey, newTheme);
    applyThemePreference(newTheme);
    if (me) {
      try {
        await apiJson("/api/settings/appearance", {
          method: "PUT",
          csrfToken: me.csrfToken,
          body: JSON.stringify({ theme: newTheme }),
        });
        if (refresh) {
          await refresh();
        }
      } catch {}
    }
  };

  useEffect(() => {
    applyThemePreference(theme);
    if (theme !== "system") return;
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyThemePreference("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <article className="setting-row theme-setting">
      <div className="setting-icon"><Moon size={20} /></div>
      <div>
        <h2>Theme</h2>
        <p>{theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light"}</p>
      </div>
      <div className="theme-options" role="group" aria-label="Theme">
        {(["light", "dark", "system"] as ThemePreference[]).map((option) => (
          <button className={theme === option ? "active" : ""} key={option} onClick={() => void changeTheme(option)}>
            {option}
          </button>
        ))}
      </div>
    </article>
  );
}

function SettingRow({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <article className="setting-row">
      <div className="setting-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{value}</p>
      </div>
      <ChevronDown size={18} aria-hidden="true" />
    </article>
  );
}

function ProfileSettingsForm({ me, onSaved }: { me: MePayload; onSaved: () => Promise<void> }) {
  const [displayName, setDisplayName] = useState(me.user.displayName);
  const [username, setUsername] = useState(me.user.username);
  const [bio, setBio] = useState(me.profile.bio);
  const [visibility, setVisibility] = useState(me.profile.visibility);
  const [message, setMessage] = useState("Profile changes use CSRF-protected requests.");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiJson("/api/me/profile", {
        method: "PATCH",
        csrfToken: me.csrfToken,
        body: JSON.stringify({ displayName, username, bio, visibility }),
      });
      await onSaved();
      setMessage("Profile saved.");
    } catch (error) {
      setMessage("Profile save failed.");
    }
  }

  async function uploadImage(kind: "avatar" | "banner", file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    try {
      await apiJson("/api/uploads/profile", {
        method: "POST",
        csrfToken: me.csrfToken,
        body: form,
        contentType: null,
      });
      await onSaved();
      setMessage(`${kind} uploaded.`);
    } catch (error) {
      setMessage(`${kind} upload failed.`);
    }
  }


  async function handleDeleteConfirm() {
    if (deleteConfirmUsername !== me.user.username) return;
    try {
      setDeleting(true);
      setDeleteError(null);
      await apiJson("/api/me", {
        method: "DELETE",
        csrfToken: me.csrfToken,
      });
      window.location.assign("/auth");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete account.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <form className="settings-form" onSubmit={saveProfile}>
        <section className="profile-hero settings-preview" aria-label="Current profile media" style={{ marginBottom: "1.5rem" }}>
          <div className="profile-banner" style={me.profile.bannerUrl ? { backgroundImage: `url(${me.profile.bannerUrl})` } : undefined}>
            <button className="banner-edit-btn" type="button" onClick={() => bannerInputRef.current?.click()} title="Change banner" aria-label="Change banner">
              <Camera size={16} />
            </button>
            <input ref={bannerInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }} onChange={(event) => void uploadImage("banner", event.target.files?.[0])} />
          </div>
          <div className="profile-row">
            <div className="avatar-wrapper">
              <div className="avatar">{me.profile.avatarUrl ? <img src={me.profile.avatarUrl} alt="" /> : initials(displayName)}</div>
              <button className="avatar-edit-btn" type="button" onClick={() => avatarInputRef.current?.click()} title="Change avatar" aria-label="Change avatar">
                <Camera size={12} />
              </button>
              <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }} onChange={(event) => void uploadImage("avatar", event.target.files?.[0])} />
            </div>
            <div>
              <h2>{displayName || me.user.displayName}</h2>
              <p>@{username || me.user.username}</p>
            </div>
          </div>
        </section>

        <label>
          Display name
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          Email address
          <input value={me.user.email ?? ""} readOnly disabled className="readonly-input" style={{ opacity: 0.6, cursor: "not-allowed" }} />
        </label>
        <label>
          Bio
          <textarea value={bio} onChange={(event) => setBio(event.target.value)} />
        </label>
        <label>
          Visibility
          <div className="theme-options" style={{ display: "flex", gap: "0.25rem", marginTop: "0.25rem" }} role="group" aria-label="Visibility">
            {(["private", "connections", "public"] as const).map((option) => (
              <button
                type="button"
                className={visibility === option ? "active" : ""}
                key={option}
                onClick={() => setVisibility(option)}
                style={{ flex: 1, textTransform: "capitalize" }}
              >
                {option}
              </button>
            ))}
          </div>
        </label>
        <div className="action-row">
          <button className="primary-button">Save profile</button>
        </div>
        <p className="form-message" role="status">{message}</p>
      </form>

      {/* Delete Account Section */}
      <section className="settings-list" style={{ marginTop: "1rem" }}>
        <article className="setting-row">
          <div className="setting-icon" style={{ color: "var(--color-danger)" }}><Trash2 size={20} /></div>
          <div>
            <h2>Danger Zone</h2>
            <p style={{ color: "var(--color-danger)" }}>Permanently delete your account and all tracked data. This cannot be undone.</p>
          </div>
          <button className="danger-button" type="button" onClick={() => setShowDeleteModal(true)}>
            Delete Account
          </button>
        </article>
      </section>

      {/* Delete Account Confirmation Modal */}
      <Modal title="Delete Account" open={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
        <div style={{ padding: "1.25rem", display: "grid", gap: "1.25rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", padding: "0.75rem", background: "rgba(255, 107, 107, 0.1)", border: "1px solid rgba(255, 107, 107, 0.2)", borderRadius: "var(--radius-panel)" }}>
            <AlertTriangle size={20} style={{ color: "var(--color-danger)", flexShrink: 0 }} />
            <div>
              <strong style={{ color: "var(--color-text)" }}>This action is permanent and irreversible!</strong>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
                Deleting your account will purge all your custom media items, library entries, tracking history, notes, and credentials from the system database immediately.
              </p>
            </div>
          </div>
          <p>To confirm, please type your username <strong>{me.user.username}</strong> below:</p>
          <div className="settings-form">
            <input
              value={deleteConfirmUsername}
              onChange={(event) => setDeleteConfirmUsername(event.target.value)}
              placeholder="Type username to confirm"
            />
          </div>
          <div className="action-row" style={{ marginTop: "0.5rem" }}>
            <button className="secondary-button" type="button" onClick={() => { setShowDeleteModal(false); setDeleteConfirmUsername(""); }}>
              Cancel
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={deleteConfirmUsername !== me.user.username || deleting}
              onClick={() => void handleDeleteConfirm()}
            >
              {deleting ? "Deleting..." : "Permanently Delete Account"}
            </button>
          </div>
          {deleteError && <p className="form-message error-message" style={{ color: "var(--color-danger)" }}>{deleteError}</p>}
        </div>
      </Modal>
    </>
  );
}

function useMe() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await apiJson<MePayload>("/api/me", { suppressNotification: true }));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (me?.appearance?.theme) {
      const dbTheme = me.appearance.theme;
      localStorage.setItem(uiConstants.themeStorageKey, dbTheme);
      applyThemePreference(dbTheme);
    }
  }, [me]);

  return { me, refresh, loading };
}

function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("Auth context is only available inside protected routes.");
  }
  return value;
}

async function apiJson<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: BodyInit;
    csrfToken?: string;
    contentType?: string | null;
    suppressNotification?: boolean;
  } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  if (options.csrfToken) {
    headers.set("x-csrf-token", options.csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      body: options.body,
      headers,
    });
  } catch (error) {
    const message = "We could not reach the app server. Check your connection and try again.";
    const friendly = new Error(message) as Error & { cause?: unknown };
    friendly.cause = error;
    throw friendly;
  }
  const text = await response.text();
  let payload: { data?: T; error?: { message: string } };
  try {
    payload = text ? JSON.parse(text) as { data?: T; error?: { message: string } } : {};
  } catch {
    const message = response.status >= 500
      ? "The app server hit an error. Please try again."
      : "The app server returned invalid data. Please refresh.";
    throw new Error(message);
  }

  if (!response.ok || !payload.data) {
    const errorDetails = payload.error as any;
    const message = apiNoticeMessage(response.status, errorDetails?.message);
    const error = new Error(message) as any;
    error.code = errorDetails?.code;
    error.details = errorDetails?.details;
    error.developerMessage = errorDetails?.message;
    throw error;
  }
  return payload.data;
}

function apiNoticeMessage(status: number, message?: string) {
  if (status === 503) return "This service is temporarily unavailable. Please try again in a moment.";
  if (status >= 500) return "Something went wrong while loading this. Please try again in a moment.";
  if (status === 401) return message && !looksTechnical(message) ? message : "Your session expired. Please log in again.";
  if (status === 403) return message && !looksTechnical(message) ? message : "This action is not allowed right now. Please refresh and try again.";
  if (status === 404) return message && !looksTechnical(message) ? message : "The requested item was not found.";
  if (status === 409) return message ?? "This change conflicts with existing data.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  return message && !looksTechnical(message) ? message : "Request failed. Please try again.";
}

function looksTechnical(message: string) {
  return /internal error|reference\s*=|D1|SQL|database binding|TMDB_API_KEY|stack|JSON|Worker|wrangler|csrf/i.test(message);
}

function friendlyErrorMessage(reason: unknown, fallback = "Something went wrong. Please try again.") {
  if (reason instanceof Error && reason.message && !looksTechnical(reason.message)) return reason.message;
  return fallback;
}

function safeNoticeText(message: string | null | undefined, fallback: string) {
  return message && !looksTechnical(message) ? message : fallback;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TU";
}
