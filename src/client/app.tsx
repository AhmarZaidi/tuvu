import {
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
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tv,
  Upload,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, CSSProperties, FormEvent, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useParams, useLocation } from "react-router-dom";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { DashboardEntry, DashboardKind, DashboardSection } from "@shared/dashboard";
import { tvTimeExpectedCounts, type TvTimeImportItem, type TvTimeImportSummary } from "@shared/tv-time-import";
import { parseTvTimeFiles } from "./tv-time-parser";

type MediaType = "show" | "movie" | "anime" | "game" | "book";
type StatusTone = "watching" | "planned" | "complete" | "paused" | "stopped";

type MediaCardItem = {
  id: string;
  title: string;
  meta: string;
  type: MediaType;
  progress: number;
  status: string;
  tone: StatusTone;
  accent: string;
  posterPath?: string | null;
  nextEpisode?: DashboardEntry["nextEpisode"];
};

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
  csrfToken: string;
};

type AuthState = {
  me: MePayload;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

type ImportJob = {
  id: string;
  status: string;
  counts_json?: string;
  error_message?: string;
};

type ImportState = {
  activeJob: ImportJob | null;
  importProgress: { processed: number; total: number; done: boolean } | null;
  startBackgroundCommit: (jobId: string, csrfToken: string) => void;
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

  const startBackgroundCommit = (jobId: string, csrfToken: string) => {
    setActiveJob({ id: jobId, status: "committing" });
    setImportProgress({ processed: 0, total: 100, done: false });

    const runChunk = async () => {
      try {
        const response = await fetch(`/api/imports/tv-time/jobs/${jobId}/commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }
        });
        const res = await response.json();
        
        if (!response.ok || !res.success) {
          setActiveJob({ id: jobId, status: "failed", error_message: res.error?.message || "Server error" });
          return;
        }

        if (res.data?.done) {
          setActiveJob(null);
          setImportProgress(null);
        } else {
          setImportProgress({ processed: res.data?.processed ?? 0, total: res.data?.total ?? 100, done: false });
          setTimeout(runChunk, 300);
        }
      } catch (err) {
        console.error("Background commit failed:", err);
        setActiveJob({ id: jobId, status: "failed", error_message: err instanceof Error ? err.message : "Network error" });
      }
    };
    
    runChunk();
  };

  return (
    <ImportContext.Provider value={{ activeJob, importProgress, startBackgroundCommit }}>
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

const navItems = [
  { to: "/books", label: "Books", icon: BookOpen },
  { to: "/games", label: "Games", icon: Gamepad2 },
  { to: "/movies", label: "Movies", icon: Film },
  { to: "/shows", label: "Shows", icon: Tv },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const profileNav = [
  { to: "/profile/explore", label: "Explore", icon: Compass },
  { to: "/profile/messages", label: "Messages", icon: Mail },
  { to: "/profile/settings", label: "Settings", icon: Settings },
  { to: "/profile/import/tv-time", label: "Import", icon: Upload },
] as const;

const exploreFilters: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Shows", icon: Tv },
  { label: "Movies", icon: Film },
  { label: "Anime", icon: Sparkles },
  { label: "Games", icon: Gamepad2 },
  { label: "Books", icon: BookOpen },
];

export function App() {
  useEffect(() => {
    const stored = localStorage.getItem("tuvu-theme");
    document.documentElement.dataset.theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  }, []);

  return (
    <ImportProvider>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<ProtectedShell />}>
          <Route index element={<Navigate to="/shows" replace />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/shows" element={<ShowsPage />} />
          <Route path="/movies" element={<MoviesPage />} />
          <Route path="/profile/explore" element={<ExplorePage />} />
          <Route path="/profile/messages" element={<MessagesPage />} />
          <Route path="/profile/settings" element={<SettingsPage />} />
          <Route path="/profile/import/tv-time" element={<ImportPage />} />
          <Route path="/profile/:username?" element={<ProfilePage />} />
          <Route path="/media/:type/:id" element={<MediaDetailPage />} />
          <Route path="/media/:type/:id/episodes/:episodeId" element={<EpisodeDetailPage />} />
          <Route path="/media/:type/:id/units/:unitId" element={<UnitDetailPage />} />
          <Route path="/lists/:id" element={<ListPage />} />
        </Route>
      </Routes>
    </ImportProvider>
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
        {(type === "book" || type === "game") && <div className="form-grid"><label>Trackable unit<select value={unitKind} onChange={(event) => setUnitKind(event.target.value as typeof unitKind)}>{type === "book" ? <><option value="chapter">Chapter</option><option value="act">Part / act</option></> : <><option value="mission">Mission</option><option value="quest">Quest</option><option value="act">Act</option></>}</select></label><label>How many (optional)<input type="number" min={0} max={200} value={unitCount} onChange={(event) => setUnitCount(Math.max(0, Number(event.target.value)))} /></label></div>}
        {error && <span className="input-error">{error}</span>}
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

  const openCreateModal = (type: MediaType = "show") => {
    setDefaultType(type);
    setIsCreateOpen(true);
  };

  const contextValue = useMemo(() => ({ openCreateModal }), []);

  return (
    <MediaCreationContext.Provider value={contextValue}>
      <div className="app-shell">
        <aside className="desktop-rail">
          <BrandMark />
          <nav className="rail-nav" aria-label="Primary">
            {navItems.map((item) => (
              <ShellNavLink key={item.to} {...item} />
            ))}
          </nav>
        </aside>

        <div className="app-frame">
          <header className="topbar">
            <BrandMark compact />
            <div className="search-box" role="search">
              <Search size={18} aria-hidden="true" />
              <input aria-label="Search media" placeholder="Search your library" />
            </div>
            <IconButton label="Notifications">
              <Bell size={18} />
            </IconButton>
          </header>

          <Outlet />
        </div>

        <nav className="bottom-nav" aria-label="Primary">
          {navItems.map((item) => (
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

  if (!importState || !importState.activeJob || (importState.activeJob.status !== "committing" && importState.activeJob.status !== "failed") || !importState.importProgress) return null;
  if (location.pathname === "/profile/import/tv-time") return null;

  const percentage = Math.round((importState.importProgress.processed / importState.importProgress.total) * 100) || 0;
  const isFailed = importState.activeJob.status === "failed";

  return (
    <div className="global-import-progress">
      <NavLink to="/profile/import/tv-time" className="progress-pill">
        <div className="progress-pill-fill" style={{ width: `${isFailed ? 100 : percentage}%`, backgroundColor: isFailed ? "rgba(255,107,107,0.15)" : undefined }} />
        <div className="progress-pill-info">
          <span className="progress-pill-label" style={{ color: isFailed ? "#ff6b6b" : undefined }}>{isFailed ? "Import failed" : "Importing library..."}</span>
          {!isFailed && <span className="progress-pill-count">{importState.importProgress.processed} / {importState.importProgress.total}</span>}
        </div>
        {isFailed && importState.activeJob.error_message && (
          <div className="progress-pill-error">{importState.activeJob.error_message}</div>
        )}
      </NavLink>
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
    active = currentPath === "/shows" || 
             currentPath.startsWith("/media/show/") || 
             currentPath.startsWith("/media/anime/");
  } else if (to === "/profile") {
    active = currentPath.startsWith("/profile");
  } else {
    active = currentPath === to;
  }

  return (
    <NavLink to={to} className={active ? "nav-link active" : "nav-link"}>
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
      if (error.code === "validation_failed" && error.details?.fieldErrors) {
        setErrors(error.details.fieldErrors);
        setMessage("Please fix the validation errors below.");
      } else {
        setMessage(error instanceof Error ? error.message : "Auth failed.");
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
      setMessage(error instanceof Error ? error.message : "Passkey login failed.");
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
      setMessage(error instanceof Error ? error.message : "OAuth start failed.");
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
          <label>
            Email
            <input value={email} type="email" placeholder="you@example.com" autoComplete="email" onChange={(event) => setEmail(event.target.value)} />
            {errors.email && <span className="input-error">{errors.email[0]}</span>}
          </label>
          {mode === "register" ? (
            <>
              <label>
                Username
                <input value={username} placeholder="your_username" autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
                {errors.username && <span className="input-error">{errors.username[0]}</span>}
              </label>
              <label>
                Display name
                <input value={displayName} placeholder="Your display name" autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} />
                {errors.displayName && <span className="input-error">{errors.displayName[0]}</span>}
              </label>
            </>
          ) : null}
          <label>
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
        </form>
        <p className="form-message" role="status">{message}</p>
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
      <AppShell />
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
      } else if (matchingLib.item.status === "paused") {
        tone = "paused";
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
      } else if (entry.item.status === "paused") {
        tone = "paused";
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

function MoviesPage() {
  return <DashboardPage kind="movies" mediaType="movie" title="Movies" description="Your watchlist, watched movies, favorites, and upcoming releases." />;
}

function BooksPage() {
  return <DashboardPage kind="books" mediaType="book" title="Books" description="Keep reading, plan the next book, and revisit finished favorites." />;
}

function GamesPage() {
  return <DashboardPage kind="games" mediaType="game" title="Games" description="Move between your backlog, current games, completed titles, and upcoming releases." />;
}

type DashboardPayload = {
  entries: DashboardEntry[];
  sections: DashboardSection[];
  page: { limit: number; offset: number; hasMore: boolean };
};

function DashboardPage({ kind, mediaType, title, description }: { kind: DashboardKind; mediaType: MediaType; title: string; description: string }) {
  const { me } = useAuth();
  const { openCreateModal } = useMediaCreation();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [activeSection, setActiveSection] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState<"grid" | "compact">("grid");
  const [visible, setVisible] = useState(12);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const next = await apiJson<DashboardPayload>(`/api/library/dashboard/${kind}?limit=100`);
      const normalized: DashboardPayload = {
        entries: Array.isArray(next.entries) ? next.entries : [],
        sections: Array.isArray(next.sections) ? next.sections : [{ id: "all", label: `All ${title}`, entries: [] }],
        page: next.page ?? { limit: 100, offset: 0, hasMore: false },
      };
      setPayload(normalized);
      setActiveSection((current) => normalized.sections.some((section) => section.id === current && section.entries.length) ? current : (normalized.sections.find((section) => section.entries.length)?.id ?? "all"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dashboard could not be loaded.");
    }
  };

  useEffect(() => { void load(); }, [kind]);
  useEffect(() => { setVisible(12); }, [activeSection, query, sort]);

  const section = payload?.sections.find((candidate) => candidate.id === activeSection) ?? payload?.sections.at(-1);
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
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Episode could not be updated.");
    }
  };

  const sectionTabs = (payload?.sections ?? []).map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    count: candidate.entries.length,
  }));

  return (
    <AppPage eyebrow="Library" title={title} description={description} mobileHelp action={<IconButton label={`Add ${mediaType}`} onClick={() => openCreateModal(mediaType)}><Plus size={18} /></IconButton>}>
      {payload && <DashboardStats entries={payload.entries} kind={kind} />}
      <div className="dashboard-toolbar">
        <SortMenu value={sort} onChange={setSort} />
        <div className="dashboard-search"><Search size={16} /><input aria-label={`Filter ${title}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Filter ${title.toLowerCase()}`} /></div>
        <div className="view-toggle" aria-label="View mode">
          <IconButton label="Poster grid" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={17} /></IconButton>
          <IconButton label="Compact list" aria-pressed={view === "compact"} onClick={() => setView("compact")}><ListIcon size={17} /></IconButton>
        </div>
      </div>
      {sectionTabs.length > 0 && <DashboardTabs tabs={sectionTabs} active={activeSection} onChange={setActiveSection} />}
      {error && <p className="input-error" role="alert">{error}</p>}
      {!payload ? <SkeletonGrid /> : entries.length === 0 ? (
        <EmptyState icon={kind === "shows" ? <Clapperboard size={24} /> : kind === "movies" ? <Film size={24} /> : kind === "books" ? <BookOpen size={24} /> : <Gamepad2 size={24} />} title={query ? "No matching titles" : `Nothing in ${section?.label ?? title} yet`} message={query ? "Try a different title or clear the filter." : `Add a ${mediaType} and choose a tracking status to fill this section.`}>
          {!query && <button className="primary-button" onClick={() => openCreateModal(mediaType)}><Plus size={18} />Add {mediaType}</button>}
        </EmptyState>
      ) : (
        <>
          <section className={view === "compact" ? "media-results compact" : "media-results poster-grid"} aria-label={section?.label}>
            {entries.slice(0, visible).map((entry) => <DashboardMediaCard key={entry.mediaId} entry={entry} compact={view === "compact"} onMarkNext={markNextWatched} />)}
          </section>
          {visible < entries.length && <button className="load-more" onClick={() => setVisible((count) => count + 12)}>Show more</button>}
        </>
      )}
    </AppPage>
  );
}

function ExplorePage() {
  return (
    <AppPage eyebrow="Explore" title="Find something good" description="Search and discovery will connect to cached local results first, then provider APIs later." mobileHelp>
      <div className="filter-row">
        {exploreFilters.map(({ label, icon: Icon }) => (
          <button className="chip-button" key={label}>
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <PosterGrid>
        {mediaItems.map((item) => (
          <MediaCard key={item.id} item={item} />
        ))}
      </PosterGrid>
    </AppPage>
  );
}

function ProfilePage() {
  const { username } = useParams();
  const { me } = useAuth();

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
    </AppPage>
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
    visibility: string;
  } | null;
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

function MediaDetailPage() {
  const { type, id } = useParams();
  const { me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<MediaDetailData | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeWithActivity[]>([]);
  const [units, setUnits] = useState<TrackableUnit[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [collapsedSeasons, setCollapsedSeasons] = useState<Set<number>>(new Set());
  const [mediaSettingsOpen, setMediaSettingsOpen] = useState(false);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => current === msg ? null : current);
    }, 3000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const mediaData = await apiJson<MediaDetailData>(`/api/media/${id}`);
      setDetail(mediaData);
      setNotesText(mediaData.userMedia?.notes ?? "");

      if (mediaData.media.type === "show" || mediaData.media.type === "anime") {
        const epData = await apiJson<{ episodes: EpisodeWithActivity[] }>(`/api/media/${id}/episodes`);
        setEpisodes(epData.episodes);
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
      setError(err instanceof Error ? err.message : "Failed to load media.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

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
      triggerToast("Added to library.");
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
      triggerToast("Removed from library.");
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
      triggerToast(nextFavorite ? "Favorite added" : "Favorite removed");
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
      triggerToast(rating ? `Rated ${rating}/10` : "Rating cleared");
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
      triggerToast("Notes saved");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Failed to save notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  const markMovieWatched = async () => {
    if (!id || !detail || !detail.userMedia) return;
    try {
      const result = await apiJson<{ userMedia: MediaDetailData["userMedia"] }>(`/api/library/${id}/watched`, {
        method: "PATCH",
        csrfToken: me.csrfToken,
      });
      setDetail({ ...detail, userMedia: result.userMedia });
      triggerToast("Watched movie!");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Failed to watch.");
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
      triggerToast(currentWatched ? "Episode unwatched" : "Episode watched");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Failed to log episode.");
    }
  };

  const setSeasonWatched = async (seasonNumber: number, watched: boolean) => {
    if (!id) return;
    try {
      await apiJson(`/api/episodes/media/${id}/seasons/${seasonNumber}`, { method: "PATCH", csrfToken: me.csrfToken, body: JSON.stringify({ watched }) });
      const refreshed = await apiJson<{ episodes: EpisodeWithActivity[] }>(`/api/media/${id}/episodes`);
      setEpisodes(refreshed.episodes);
      triggerToast(watched ? `Season ${seasonNumber} watched` : `Season ${seasonNumber} reset`);
    } catch (reason) {
      triggerToast(reason instanceof Error ? reason.message : "Season could not be updated.");
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
      triggerToast("Cover updated successfully!");
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : "Upload failed.");
    }
  };

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
        <SkeletonGrid />
      </AppPage>
    );
  }

  if (error || !detail) {
    const isMock = mediaItems.some((m) => m.id === id);
    return (
      <AppPage eyebrow={type ?? "Media"} title="Not tracked yet" description={error ?? "This item is not tracked in the database."}>
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
  const totalRegularCount = regularEpisodes.length;
  const watchedRegularCount = regularEpisodes.filter((ep) => ep.activity?.watched).length;
  const progressPercent = totalRegularCount > 0 ? Math.round((watchedRegularCount / totalRegularCount) * 100) : 0;

  const nextEp = regularEpisodes
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)
    .find((ep) => !ep.activity?.watched);
  const episodeGroups = [...new Set(episodes.map((episode) => episode.seasonNumber))]
    .sort((a, b) => a - b)
    .map((seasonNumber) => ({ seasonNumber, episodes: episodes.filter((episode) => episode.seasonNumber === seasonNumber) }));

  const statusOptions = {
    show: ["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"],
    anime: ["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"],
    movie: ["watch_later", "watched"],
    game: ["planned", "playing", "completed", "paused", "dropped"],
    book: ["want_to_read", "reading", "finished", "paused", "dropped"],
  }[media.type] ?? [];
  const backdropImage = media.backdropPath ?? media.posterPath;
  const posterImage = media.posterPath ?? media.backdropPath;
  const mediaVisualStyle = {
    "--media-backdrop": backdropImage ? `url(${backdropImage})` : "none",
    "--media-poster": posterImage ? `url(${posterImage})` : "none",
  } as CSSProperties;

  return (
    <AppPage eyebrow={media.type} title={media.title} description={media.overview ?? "No overview available."}>
      <div className="media-visual-layer" style={mediaVisualStyle} aria-hidden="true" />
      <div className="media-detail-topbar">
        <div className="media-backdrop" style={media.backdropPath ? { backgroundImage: `url(${media.backdropPath})` } : undefined} aria-hidden="true" />
        {userMedia && <IconButton label="Media settings" onClick={() => setMediaSettingsOpen(true)}><MoreHorizontal size={19} /></IconButton>}
      </div>
      <section className="detail-layout">
        <div className="detail-poster-column">
          <ResponsivePoster accent="linear-gradient(145deg, #2b2f36, #0f1115)" title={media.title} posterPath={media.posterPath} />
        </div>
        
        <div className="detail-copy">
          <div className="metadata-row">
            {media.releaseDate && <span><CalendarDays size={16} />{new Date(`${media.releaseDate}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" })}{media.airStatus === "continuing" ? " - Present" : ""}</span>}
            {media.runtimeMinutes && <span><Clock3 size={16} />{media.runtimeMinutes} min{media.type === "show" || media.type === "anime" ? " average" : ""}</span>}
            {media.language && <span>{media.language.toUpperCase()}</span>}
            {media.source !== "manual" && <span>{media.source.toUpperCase()}</span>}
          </div>
          <div className="action-row" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "space-between" }}>
            {!userMedia ? (
              <button className="primary-button" onClick={() => addToLibrary()}>
                <Plus size={18} aria-hidden="true" />
                Add to library
              </button>
            ) : (
              <>
                <div className="tracking-status"><span className="eyebrow">Tracking status</span><div>{statusOptions.map((option) => <button className={userMedia.status === option ? "active" : ""} key={option} onClick={() => void updateStatus(option)}>{option.replaceAll("_", " ")}</button>)}</div></div>

                <IconButton
                  label="Favorite"
                  onClick={toggleFavorite}
                  style={userMedia.isFavorite ? { background: "rgba(255, 75, 75, 0.15)", color: "#ff4b4b" } : undefined}
                >
                  <Heart size={18} fill={userMedia.isFavorite ? "currentColor" : "none"} />
                </IconButton>

                <div className="rating-summary"><button onClick={() => void updateRating(userMedia.rating === 10 ? null : (userMedia.rating ?? 0) + 1)}><Star size={17} fill={userMedia.rating ? "currentColor" : "none"} />{userMedia.rating ? `${userMedia.rating}/10` : "Rate"}</button></div>
              </>
            )}
          </div>

          {userMedia && media.type === "movie" && (
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", background: "rgba(255,255,255,0.03)", padding: "1rem", borderRadius: "0.5rem" }}>
              <button className="primary-button" onClick={markMovieWatched}>
                <Check size={18} />
                Mark Watched
              </button>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span style={{ fontSize: "0.85rem", color: "#aeb1ac" }}>Rewatches: {userMedia.rewatchCount}</span>
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
                  {watchedRegularCount} / {totalRegularCount} episodes ({progressPercent}%)
                </span>
              </div>
              <ProgressBar value={progressPercent} label={`${progressPercent}% watched`} />

              {nextEp && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "rgba(255,191,71,0.06)",
                    border: "1px dashed rgba(255,191,71,0.25)",
                    padding: "0.75rem 1rem",
                    borderRadius: "0.5rem",
                    marginTop: "0.25rem",
                  }}
                >
                  <div>
                    <p className="eyebrow" style={{ margin: 0, fontSize: "0.7rem" }}>Up next</p>
                    <p style={{ margin: 0, fontWeight: "bold", fontSize: "0.95rem" }}>
                      S{nextEp.seasonNumber} E{nextEp.episodeNumber} - {nextEp.name ?? "Untitled"}
                    </p>
                  </div>
                  <button className="primary-button" onClick={() => toggleEpisodeWatched(nextEp.id, false)} style={{ minHeight: "2.2rem", padding: "0 0.75rem", fontSize: "0.8rem" }}>
                    Watch
                  </button>
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

      {(media.type === "show" || media.type === "anime") && episodes.length > 0 && (
        <section className="episodes-section">
          <div className="section-heading"><div><p className="eyebrow">Episode guide</p><h2>Seasons & Episodes</h2></div><span>{watchedRegularCount} of {totalRegularCount} watched</span></div>
          <div className="season-stack">
            {episodeGroups.map((group) => {
              const collapsed = collapsedSeasons.has(group.seasonNumber);
              const watchedCount = group.episodes.filter((episode) => episode.activity?.watched).length;
              return <section className="season-group" key={group.seasonNumber}>
                <header className="season-header">
                  <button className="season-toggle" onClick={() => setCollapsedSeasons((current) => { const next = new Set(current); next.has(group.seasonNumber) ? next.delete(group.seasonNumber) : next.add(group.seasonNumber); return next; })}><ChevronDown className={collapsed ? "collapsed" : ""} size={18} /><span>{group.seasonNumber === 0 ? "Specials" : `Season ${group.seasonNumber}`}</span><small>{watchedCount}/{group.episodes.length}</small></button>
                  <button className="text-button" onClick={() => void setSeasonWatched(group.seasonNumber, watchedCount !== group.episodes.length)}>{watchedCount === group.episodes.length ? "Reset" : "Mark all"}</button>
                </header>
                {!collapsed && <div className="episode-list">{group.episodes.map((ep) => {
                  const watched = ep.activity?.watched ?? false;
                  return <article className={watched ? "episode-row watched" : "episode-row"} key={ep.id}>
                    <NavLink to={`/media/${media.type}/${media.id}/episodes/${ep.id}`} className="episode-copy"><span>S{ep.seasonNumber} E{ep.episodeNumber}{ep.isSpecial ? " · Special" : ""}</span><strong>{ep.name ?? (ep.airDate && new Date(`${ep.airDate}T00:00:00`).getTime() > Date.now() ? "TBA" : `Episode ${ep.episodeNumber}`)}</strong><small>{ep.airDate ? new Date(`${ep.airDate}T00:00:00`).toLocaleDateString() : "Release date TBA"}</small></NavLink>
                    <IconButton className={watched ? "watched-toggle active" : "watched-toggle"} label={watched ? "Mark unwatched" : "Mark watched"} onClick={() => void toggleEpisodeWatched(ep.id, watched)}><Check size={17} /></IconButton>
                    <NavLink className="episode-open" aria-label={`Open ${ep.name ?? `episode ${ep.episodeNumber}`}`} to={`/media/${media.type}/${media.id}/episodes/${ep.id}`}><ChevronRight size={18} /></NavLink>
                  </article>;
                })}</div>}
              </section>;
            })}
          </div>
        </section>
      )}

      {(media.type === "book" || media.type === "game") && units.length > 0 && <section className="episodes-section"><div className="section-heading"><div><p className="eyebrow">Progress guide</p><h2>{media.type === "book" ? "Chapters & Parts" : "Missions & Acts"}</h2></div><span>{units.filter((unit) => unit.activity?.completed).length} of {units.length} complete</span></div><div className="episode-list">{units.map((unit) => <article className={unit.activity?.completed ? "episode-row watched" : "episode-row"} key={unit.id}><NavLink className="episode-copy" to={`/media/${media.type}/${media.id}/units/${unit.id}`}><span>{unit.kind} {unit.position}</span><strong>{unit.title ?? `${unit.kind} ${unit.position}`}</strong><small>{unit.releaseDate ? new Date(`${unit.releaseDate}T00:00:00`).toLocaleDateString() : "Optional tracking unit"}</small></NavLink><IconButton className={unit.activity?.completed ? "watched-toggle active" : "watched-toggle"} label={unit.activity?.completed ? "Mark incomplete" : "Mark complete"} onClick={async () => { await apiJson(`/api/units/${unit.id}/activity`, { method: "PATCH", csrfToken: me.csrfToken, body: JSON.stringify({ completed: !unit.activity?.completed }) }); const refreshed = await apiJson<{ units: TrackableUnit[] }>(`/api/media/${media.id}/units`); setUnits(refreshed.units); }}><Check size={17} /></IconButton><NavLink className="episode-open" aria-label={`Open ${unit.title ?? unit.kind}`} to={`/media/${media.type}/${media.id}/units/${unit.id}`}><ChevronRight size={18} /></NavLink></article>)}</div></section>}

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
          {userMedia && <button className="secondary-button danger-action" onClick={removeFromLibrary}>Remove from library</button>}
        </div>
      </Modal>

      {toastMessage && <Toast message={toastMessage} />}
    </AppPage>
  );
}

function ProgressEditor({ mediaId, mediaType, userMedia, csrfToken, onSaved }: { mediaId: string; mediaType: "book" | "game"; userMedia: NonNullable<MediaDetailData["userMedia"]>; csrfToken: string; onSaved: (updated: NonNullable<MediaDetailData["userMedia"]>) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(userMedia.progressValue ?? ""));
  const [total, setTotal] = useState(String(userMedia.progressTotal ?? ""));
  const [unit, setUnit] = useState(userMedia.progressUnit ?? (mediaType === "book" ? "page" : "hour"));
  const [platform, setPlatform] = useState(userMedia.platform ?? "");
  const percent = userMedia.progressValue != null && userMedia.progressTotal ? Math.round((userMedia.progressValue / userMedia.progressTotal) * 100) : null;
  const save = async () => {
    const result = await apiJson<{ userMedia: NonNullable<MediaDetailData["userMedia"]> }>(`/api/library/${mediaId}/progress`, {
      method: "PATCH", csrfToken,
      body: JSON.stringify({ value: value ? Number(value) : null, total: total ? Number(total) : null, unit, platform: mediaType === "game" ? platform || null : null }),
    });
    onSaved(result.userMedia);
    setOpen(false);
  };
  return <>
    <section className="progress-editor-summary"><div><span className="eyebrow">My progress</span><strong>{userMedia.progressValue ?? 0}{userMedia.progressUnit ? ` ${userMedia.progressUnit}${userMedia.progressValue === 1 ? "" : "s"}` : ""}{userMedia.progressTotal ? ` / ${userMedia.progressTotal}` : ""}</strong>{mediaType === "game" && userMedia.platform && <small>{userMedia.platform}</small>}</div>{percent != null && <ProgressBar value={percent} label={`${percent}% complete`} />}<button className="secondary-button" onClick={() => setOpen(true)}>Update progress</button></section>
    <Modal title={`Update ${mediaType} progress`} open={open} onClose={() => setOpen(false)}><div className="progress-form"><label>Progress<input type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} /></label><label>Total (optional)<input type="number" min={1} value={total} onChange={(event) => setTotal(event.target.value)} /></label><label>Measure<select value={unit} onChange={(event) => setUnit(event.target.value)}>{mediaType === "book" ? <><option value="page">Pages</option><option value="percent">Percent</option><option value="chapter">Chapters</option></> : <><option value="hour">Hours</option><option value="percent">Percent</option><option value="mission">Missions</option></>}</select></label>{mediaType === "game" && <label>Platform<input value={platform} onChange={(event) => setPlatform(event.target.value)} placeholder="PC, PlayStation 5, Switch..." /></label>}<button className="primary-button" onClick={() => void save()}>Save progress</button></div></Modal>
  </>;
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
  useEffect(() => { void load(); }, [episodeId]);

  const updateActivity = async (changes: Record<string, unknown>) => {
    if (!episodeId) return;
    try {
      await apiJson(`/api/episodes/${episodeId}/activity`, { method: "PATCH", csrfToken: me.csrfToken, body: JSON.stringify(changes) });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Activity could not be saved.");
    }
  };

  if (!data) return <AppPage eyebrow="Episode" title={error ? "Episode unavailable" : "Loading episode"} description={error ?? "Reading episode details..."}>{!error && <SkeletonGrid />}</AppPage>;
  const { episode, media, activity } = data;
  return (
    <AppPage eyebrow={media?.title ?? type ?? "Episode"} title={episode.name ?? `Episode ${episode.episodeNumber}`} description={episode.overview ?? "Synopsis has not been announced yet."}>
      <NavLink className="back-link" to={`/media/${type}/${id}`}>Back to {media?.title ?? "media"}</NavLink>
      <section className="episode-detail-hero">
        <div className="episode-still" style={episode.stillPath ? { backgroundImage: `url(${episode.stillPath})` } : undefined}><span>S{episode.seasonNumber} E{episode.episodeNumber}</span></div>
        <div className="episode-detail-copy">
          <div className="metadata-row"><span><CalendarDays size={16} />{episode.airDate ? new Date(`${episode.airDate}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "long" }) : "Release date TBA"}</span><span><Clock3 size={16} />{episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : "Runtime TBA"}</span></div>
          <div className="watch-toggle" role="group" aria-label="Watch status"><button className={!activity?.watched ? "active" : ""} onClick={() => void updateActivity({ watched: false })}>Not watched</button><button className={activity?.watched ? "active" : ""} onClick={() => void updateActivity({ watched: true })}><Check size={16} />Watched</button></div>
          {activity?.watchedAt && <p className="muted-copy">Watched {new Date(activity.watchedAt).toLocaleString()}</p>}
          <div className="rating-picker"><span>Your rating</span><div>{[1,2,3,4,5,6,7,8,9,10].map((rating) => <button className={activity?.rating === rating ? "active" : ""} aria-label={`Rate ${rating} out of 10`} key={rating} onClick={() => void updateActivity({ rating })}>{rating}</button>)}</div></div>
          <label className="notes-field">Private episode notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => void updateActivity({ notes: notes || null })} placeholder="What stood out?" /></label>
        </div>
      </section>
      <section className="detail-band"><div><p className="eyebrow">Community</p><h2>Comments</h2></div>{activity?.watched ? <button className="secondary-button" disabled>Comments arrive in Phase 8</button> : <p className="spoiler-lock"><ShieldCheck size={18} />Mark this episode watched to reveal spoiler comments.</p>}</section>
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
  if (!data) return <AppPage eyebrow={type ?? "Progress"} title={error ?? "Loading..."} description="Reading progress details...">{!error && <SkeletonGrid />}</AppPage>;
  const { unit, media, activity } = data;
  return <AppPage eyebrow={media?.title ?? type ?? "Progress"} title={unit.title ?? `${unit.kind} ${unit.position}`} description={unit.overview ?? `Track this ${unit.kind} independently.`}><NavLink className="back-link" to={`/media/${type}/${id}`}>Back to {media?.title ?? "media"}</NavLink><section className="episode-detail-hero"><div className="episode-still" style={unit.imagePath ? { backgroundImage: `url(${unit.imagePath})` } : undefined}><span>{unit.kind} {unit.position}</span></div><div className="episode-detail-copy"><div className="metadata-row"><span><CalendarDays size={16} />{unit.releaseDate ? new Date(`${unit.releaseDate}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "long" }) : "Release date unavailable"}</span></div><div className="watch-toggle" role="group" aria-label="Completion status"><button className={!activity?.completed ? "active" : ""} onClick={() => void update({ completed: false })}>Not complete</button><button className={activity?.completed ? "active" : ""} onClick={() => void update({ completed: true })}><Check size={16} />Complete</button></div>{activity?.completedAt && <p className="muted-copy">Completed {new Date(activity.completedAt).toLocaleString()}</p>}<div className="rating-picker"><span>Your rating</span><div>{[1,2,3,4,5,6,7,8,9,10].map((rating) => <button className={activity?.rating === rating ? "active" : ""} key={rating} onClick={() => void update({ rating })}>{rating}</button>)}</div></div><label className="notes-field">Private notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => void update({ notes: notes || null })} placeholder={`Notes about this ${unit.kind}`} /></label></div></section></AppPage>;
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

function SettingsPage() {
  const { me, refresh } = useAuth();

  return (
    <AppPage eyebrow="Settings" title="Preferences" description="Profile, theme, privacy, region, and provider settings will live here." mobileHelp>
      <section className="profile-hero settings-preview" aria-label="Current profile media">
        <div className="profile-banner" style={me.profile.bannerUrl ? { backgroundImage: `url(${me.profile.bannerUrl})` } : undefined} />
        <div className="profile-row">
          <div className="avatar">{me.profile.avatarUrl ? <img src={me.profile.avatarUrl} alt="" /> : initials(me.user.displayName)}</div>
          <div>
            <h2>{me.user.displayName}</h2>
            <p>@{me.user.username}</p>
          </div>
        </div>
      </section>
      <ProfileSettingsForm me={me} onSaved={refresh} />
      <section className="settings-list">
        <ThemeSetting />
        <SettingRow icon={<User size={20} />} title="Profile visibility" value={me?.profile.visibility ?? "Private"} />
        <SettingRow icon={<Library size={20} />} title="Library defaults" value="Personal" />
      </section>
    </AppPage>
  );
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
      setError(reason instanceof Error ? reason.message : "Files could not be parsed.");
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
      setError(reason instanceof Error ? reason.message : "Data upload failed.");
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
      setError(reason instanceof Error ? reason.message : "Commit failed to start.");
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
      setError(reason instanceof Error ? reason.message : "Rollback failed.");
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
        {error && <p className="input-error" role="alert">{error}</p>}
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

        {importState.activeJob?.status === "failed" && importState.activeJob.error_message && (
          <div style={{ margin: "1.5rem 0", padding: "1rem", background: "rgba(255, 107, 107, 0.05)", border: "1px solid rgba(255, 107, 107, 0.2)", borderRadius: "0.5rem" }}>
             <p className="eyebrow" style={{ marginBottom: "0.5rem", color: "#ff6b6b" }}>Import Failed</p>
             <p style={{ margin: 0, fontSize: "0.9rem", color: "#ff6b6b" }}>{importState.activeJob.error_message}</p>
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
    if (!window.confirm("Delete this import log from history? (This will not rollback imported data)")) return;
    try {
      await apiJson(`/api/imports/tv-time/jobs/${id}`, { method: "DELETE", csrfToken: me.csrfToken });
      fetchJobs();
    } catch (e) {
      alert("Failed to delete log.");
    }
  };

  const rollbackJob = async (id: string) => {
    if (!window.confirm("Roll back records created by this import job?")) return;
    try {
      await apiJson(`/api/imports/tv-time/jobs/${id}/rollback`, { method: "POST", csrfToken: me.csrfToken });
      fetchJobs();
      alert("Rollback complete.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Rollback failed.");
    }
  };

  if (jobs.length === 0) return null;

  return (
    <section className="import-history" style={{ marginTop: "3rem" }}>
      <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Previous Imports</h2>
      <div className="table-responsive">
        <table className="list-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Shows</th>
              <th>Movies</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{new Date(job.created_at).toLocaleDateString()}</td>
                <td style={{ textTransform: "capitalize" }}>{job.status.replace("_", " ")}</td>
                <td>{job.counts?.shows ?? "-"}</td>
                <td>{job.counts?.movies ?? "-"}</td>
                <td>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {job.status === "committed" && (
                       <button className="secondary-button danger-action" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem", border: "1px solid rgba(255, 107, 107, 0.2)" }} onClick={() => rollbackJob(job.id)}>
                         Rollback
                       </button>
                    )}
                    <button className="secondary-button" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }} onClick={() => deleteJobLog(job.id)}>
                      Delete Log
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  return (
    <main className="page-shell">
      <section className={mobileHelp ? "page-heading mobile-help" : "page-heading"}>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 tabIndex={mobileHelp ? 0 : undefined} data-help={mobileHelp ? description : undefined} title={mobileHelp ? description : undefined}>{title}</h1>
          <p className="heading-description">{description}</p>
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

function DashboardStats({ entries = [], kind = "shows" }: { entries?: DashboardEntry[]; kind?: DashboardKind }) {
  const active = entries.filter((entry) => ["watching", "reading", "playing"].includes(entry.status)).length;
  const favorites = entries.filter((entry) => entry.isFavorite).length;
  return (
    <section className="stats-grid" aria-label="Library stats">
      <Stat icon={<Play size={20} />} label={kind === "shows" ? "Next up" : "In progress"} value={String(kind === "shows" ? entries.filter((entry) => entry.nextEpisode).length : active)} />
      <Stat icon={<Star size={20} />} label="Favorites" value={String(favorites)} />
      <Stat icon={<BarChart3 size={20} />} label="Tracked" value={String(entries.length)} />
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
  return (
    <article className={compact ? "media-card compact-card" : "media-card"}>
      <NavLink className="media-card-link" to={`/media/${entry.type}/${entry.mediaId}`} aria-label={`Open ${entry.title}`}>
        <ResponsivePoster accent="linear-gradient(145deg, #30343b, #111318)" title={entry.title} posterPath={entry.posterPath} />
        <div className="media-card-body"><div><h2>{entry.title}</h2><p>{nextLabel ?? (entry.year ? String(entry.year) : '')}</p></div><StatusChip tone={toneForStatus(entry.status)}>{entry.status.replaceAll("_", " ")}</StatusChip></div>
      </NavLink>
      <ProgressBar value={percent} label={`${percent}% complete`} />
      {entry.nextEpisode && <button className="quick-watch" onClick={() => void onMarkNext(entry.nextEpisode!.id)}><Check size={16} />Mark {nextLabel} watched</button>}
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

export function MediaCard({ item }: { item: MediaCardItem }) {
  return (
    <article className="media-card">
      <NavLink to={`/media/${item.type}/${item.id}`} aria-label={`Open ${item.title}`}>
        <ResponsivePoster accent={item.accent} title={item.title} posterPath={item.posterPath} />
      </NavLink>
      <div className="media-card-body">
        <div>
          <h2>{item.title}</h2>
          <p>{item.meta}</p>
        </div>
        <StatusChip tone={item.tone}>{item.status}</StatusChip>
      </div>
      <ProgressBar value={item.progress} label={`${item.progress}% complete`} />
    </article>
  );
}

export function PosterGrid({ children }: { children: ReactNode }) {
  return <section className="poster-grid">{children}</section>;
}

export function ResponsivePoster({ accent, title, posterPath }: { accent: string; title: string; posterPath?: string | null }) {
  if (posterPath) {
    return (
      <div className="poster">
        <img src={posterPath} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "0.5rem" }} />
      </div>
    );
  }
  return (
    <div className="poster" style={{ background: accent }}>
      <span>{title}</span>
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress-wrap" aria-label={label}>
      <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function StatusChip({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`status-chip ${tone}`}>{children}</span>;
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  to,
  children,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  to?: string;
  children?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{message}</p>
      {actionLabel && to ? <NavLink to={to}>{actionLabel}</NavLink> : null}
      {children}
    </section>
  );
}

export function SkeletonGrid() {
  return (
    <section className="poster-grid" aria-label="Loading media">
      {[1, 2, 3].map((item) => (
        <div className="skeleton-card" key={item}>
          <div className="skeleton poster-skeleton" />
          <div className="skeleton line-skeleton" />
          <div className="skeleton short-line-skeleton" />
        </div>
      ))}
    </section>
  );
}

export function Modal({ title, children, open = true, onClose }: { title: string; children: ReactNode; open?: boolean; onClose?: () => void }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <IconButton label="Close modal" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return (
    <div className="toast" role="status">
      <Check size={16} aria-hidden="true" />
      {message}
    </div>
  );
}

type ThemePreference = "light" | "dark" | "system";

function ThemeSetting() {
  const [theme, setTheme] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem("tuvu-theme");
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  });

  useEffect(() => {
    localStorage.setItem("tuvu-theme", theme);
    document.documentElement.dataset.theme = theme;
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
          <button className={theme === option ? "active" : ""} key={option} onClick={() => setTheme(option)}>
            {option}
          </button>
        ))}
      </div>
    </article>
  );
}

export function Tabs({ tabs }: { tabs: Array<{ id: string; label: string }> }) {
  return (
    <div className="tabs" role="tablist" aria-label="Dashboard sections">
      {tabs.map((tab, index) => (
        <button className={index === 0 ? "active" : ""} role="tab" aria-selected={index === 0} key={tab.id}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SegmentedControl({ options }: { options: string[] }) {
  return (
    <div className="segmented-control" aria-label="View filter">
      {options.map((option, index) => (
        <button className={index === 0 ? "active" : ""} key={option}>
          {option}
        </button>
      ))}
    </div>
  );
}

export function IconButton({ label, children, className, ...props }: { label: string; children: ReactNode } & ComponentProps<"button">) {
  return (
    <button className={className ? `icon-button ${className}` : "icon-button"} aria-label={label} title={label} {...props}>
      {children}
    </button>
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
      setMessage(error instanceof Error ? error.message : "Profile save failed.");
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
      setMessage(error instanceof Error ? error.message : `${kind} upload failed.`);
    }
  }

  async function logout() {
    try {
      await apiJson("/api/auth/logout", { method: "POST", csrfToken: me.csrfToken });
      window.location.assign("/auth");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logout failed.");
    }
  }

  return (
    <form className="settings-form" onSubmit={saveProfile}>
      <label>
        Display name
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <label>
        Username
        <input value={username} onChange={(event) => setUsername(event.target.value)} />
      </label>
      <label>
        Bio
        <textarea value={bio} onChange={(event) => setBio(event.target.value)} />
      </label>
      <label>
        Visibility
        <select value={visibility} onChange={(event) => setVisibility(event.target.value as MePayload["profile"]["visibility"])}>
          <option value="private">Private</option>
          <option value="connections">Connections</option>
          <option value="public">Public</option>
        </select>
      </label>
      <div className="file-row">
        <label>
          Avatar
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void uploadImage("avatar", event.target.files?.[0])} />
        </label>
        <label>
          Banner
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void uploadImage("banner", event.target.files?.[0])} />
        </label>
      </div>
      <div className="action-row">
        <button className="primary-button">Save profile</button>
        <button className="secondary-button" type="button" onClick={() => void logout()}>
          Log out
        </button>
      </div>
      <p className="form-message" role="status">{message}</p>
    </form>
  );
}

function useMe() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setMe(await apiJson<MePayload>("/api/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

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
  } = {},
): Promise<T> {
  const headers = new Headers();
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  if (options.csrfToken) {
    headers.set("x-csrf-token", options.csrfToken);
  }

  const response = await fetch(path, {
    method: options.method ?? "GET",
    body: options.body,
    headers,
  });
  const text = await response.text();
  let payload: { data?: T; error?: { message: string } };
  try {
    payload = text ? JSON.parse(text) as { data?: T; error?: { message: string } } : {};
  } catch {
    const contentType = response.headers.get("content-type") ?? "unknown content";
    throw new Error(
      `API did not return JSON (${response.status} ${contentType}). Start the Worker with npm run dev:worker, or run Vite together with Wrangler on port 8787.`,
    );
  }

  if (!response.ok || !payload.data) {
    const errorDetails = payload.error as any;
    const error = new Error(errorDetails?.message ?? "Request failed.") as any;
    error.code = errorDetails?.code;
    error.details = errorDetails?.details;
    throw error;
  }
  return payload.data;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "TU";
}
