import {
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  Clapperboard,
  Compass,
  Film,
  Gamepad2,
  Heart,
  Library,
  Mail,
  MessageSquare,
  Moon,
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
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useParams, useLocation } from "react-router-dom";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

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
  return (
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
        <Route path="/lists/:id" element={<ListPage />} />
      </Route>
    </Routes>
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
  const [seasonsCount, setSeasonsCount] = useState(1);
  const [episodesCount, setEpisodesCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          source: "manual",
          overview: "Manually created media item.",
          posterPath: posterPath.trim() || undefined,
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

          for (let ep = 1; ep <= episodesCount; ep++) {
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
        {(type === "show" || type === "anime") && (
          <div className="file-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label>
              Seasons
              <input type="number" min={1} max={50} value={seasonsCount} onChange={(e) => setSeasonsCount(Number(e.target.value))} disabled={busy} />
            </label>
            <label>
              Episodes per Season
              <input type="number" min={1} max={100} value={episodesCount} onChange={(e) => setEpisodesCount(Number(e.target.value))} disabled={busy} />
            </label>
          </div>
        )}
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
    </MediaCreationContext.Provider>
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
  const { openCreateModal } = useMediaCreation();
  const { library, loading } = useLibrary();

  const showList = useMemo(() => {
    const showLib = library.filter(entry => entry.media.type === "show" || entry.media.type === "anime");
    const staticShows = mediaItems.filter(item => item.type === "show" || item.type === "anime");
    return mergeMediaItems(staticShows, showLib);
  }, [library]);

  return (
    <AppPage
      eyebrow="Shows"
      title="Watch next"
      description="A dashboard shaped like the daily tracking loop: resume, catch up, and keep an eye on what is coming."
      action={<IconButton label="Add show" onClick={() => openCreateModal("show")}><Plus size={18} /></IconButton>}
    >
      <DashboardStats />
      <Tabs
        tabs={[
          { id: "next", label: "Watch Next" },
          { id: "later", label: "Watch Later" },
          { id: "upcoming", label: "Upcoming" },
        ]}
      />
      {loading ? (
        <SkeletonGrid />
      ) : (
        <PosterGrid>
          {showList.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </PosterGrid>
      )}
      <EmptyState
        icon={<Clapperboard size={24} />}
        title="No imported TV Time data yet"
        message="The import wizard is ready for the next phase of data work."
        actionLabel="Open import"
        to="/import/tv-time"
      />
    </AppPage>
  );
}

function MoviesPage() {
  const { openCreateModal } = useMediaCreation();
  const { library, loading } = useLibrary();

  const movieList = useMemo(() => {
    const movieLib = library.filter(entry => entry.media.type === "movie");
    const staticMovies = mediaItems.filter(item => item.type === "movie");
    return mergeMediaItems(staticMovies, movieLib);
  }, [library]);

  return (
    <AppPage
      eyebrow="Movies"
      title="Movie library"
      description="A compact home for watchlist, watched titles, favorites, and upcoming releases."
      action={<IconButton label="Add movie" onClick={() => openCreateModal("movie")}><Plus size={18} /></IconButton>}
    >
      <SegmentedControl options={["Watchlist", "Watched", "Favorites", "Upcoming"]} />
      {loading ? (
        <SkeletonGrid />
      ) : (
        <PosterGrid>
          {movieList.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </PosterGrid>
      )}
    </AppPage>
  );
}

function BooksPage() {
  const { openCreateModal } = useMediaCreation();
  const { library, loading } = useLibrary();

  const bookList = useMemo(() => {
    const bookLib = library.filter(entry => entry.media.type === "book");
    const staticBooks = mediaItems.filter(item => item.type === "book");
    return mergeMediaItems(staticBooks, bookLib);
  }, [library]);

  return (
    <AppPage
      eyebrow="Books"
      title="Book library"
      description="Books are placeholder-first in this phase, with tracking coming in Phase 7."
      action={<IconButton label="Add book" onClick={() => openCreateModal("book")}><Plus size={18} /></IconButton>}
    >
      {loading ? (
        <SkeletonGrid />
      ) : (
        <PosterGrid>
          {bookList.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </PosterGrid>
      )}
      <EmptyState icon={<BookOpen size={24} />} title="Books are ready for tracking" message="Search, reading status, and progress arrive after the core media model." />
    </AppPage>
  );
}

function GamesPage() {
  const { openCreateModal } = useMediaCreation();
  const { library, loading } = useLibrary();

  const gameList = useMemo(() => {
    const gameLib = library.filter(entry => entry.media.type === "game");
    const staticGames = mediaItems.filter(item => item.type === "game");
    return mergeMediaItems(staticGames, gameLib);
  }, [library]);

  return (
    <AppPage
      eyebrow="Games"
      title="Game library"
      description="Games are placeholder-first in this phase, with tracking coming in Phase 7."
      action={<IconButton label="Add game" onClick={() => openCreateModal("game")}><Plus size={18} /></IconButton>}
    >
      {loading ? (
        <SkeletonGrid />
      ) : (
        <PosterGrid>
          {gameList.map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
        </PosterGrid>
      )}
      <EmptyState icon={<Gamepad2 size={24} />} title="Games are ready for tracking" message="Platform, play status, and progress notes arrive after the core media model." />
    </AppPage>
  );
}

function ExplorePage() {
  return (
    <AppPage eyebrow="Explore" title="Find something good" description="Search and discovery will connect to cached local results first, then provider APIs later.">
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
    <AppPage eyebrow="Profile" title={username ? `@${username}` : "Your profile"} description="Stats, recent activity, favorites, and public lists will gather here.">
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
  } | null;
};

function MediaDetailPage() {
  const { type, id } = useParams();
  const { me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<MediaDetailData | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeWithActivity[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

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
      } else {
        setEpisodes([]);
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

  const statusOptions = {
    show: ["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"],
    anime: ["watch_later", "not_started", "watching", "up_to_date", "completed", "stopped"],
    movie: ["watch_later", "watched"],
    game: ["planned", "playing", "completed", "paused", "dropped"],
    book: ["want_to_read", "reading", "finished", "paused", "dropped"],
  }[media.type] ?? [];

  return (
    <AppPage eyebrow={media.type} title={media.title} description={media.overview ?? "No overview available."}>
      <section className="detail-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "min(100%, 18rem)" }}>
          <ResponsivePoster accent="linear-gradient(145deg, #2b2f36, #0f1115)" title={media.title} posterPath={media.posterPath} />
          {userMedia && (
            <label className="secondary-button" style={{ cursor: "pointer", fontSize: "0.85rem", minHeight: "2.2rem", padding: "0 0.5rem", display: "inline-flex", width: "100%", justifyContent: "center", alignItems: "center" }}>
              Upload Cover
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  form.set("file", file);
                  try {
                    triggerToast("Uploading cover...");
                    const res = await apiJson<{ posterPath: string }>(`/api/media/${media.id}/cover`, {
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
                      }
                    });
                    triggerToast("Cover updated successfully!");
                  } catch (err) {
                    triggerToast(err instanceof Error ? err.message : "Upload failed.");
                  }
                }}
                style={{ display: "none" }}
              />
            </label>
          )}
        </div>
        
        <div className="detail-copy">
          <div className="action-row" style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            {!userMedia ? (
              <button className="primary-button" onClick={() => addToLibrary()}>
                <Plus size={18} aria-hidden="true" />
                Add to library
              </button>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <label htmlFor="status-select" className="eyebrow" style={{ margin: 0 }}>Tracking status</label>
                  <select
                    id="status-select"
                    value={userMedia.status}
                    onChange={(e) => updateStatus(e.target.value)}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      borderRadius: "0.35rem",
                      padding: "0.45rem 0.75rem",
                      color: "white",
                      fontSize: "0.9rem",
                    }}
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt.replace("_", " ").toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <IconButton
                  label="Favorite"
                  onClick={toggleFavorite}
                  style={userMedia.isFavorite ? { background: "rgba(255, 75, 75, 0.15)", color: "#ff4b4b" } : undefined}
                >
                  <Heart size={18} fill={userMedia.isFavorite ? "currentColor" : "none"} />
                </IconButton>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <label htmlFor="rating-select" className="eyebrow" style={{ margin: 0 }}>Rating</label>
                  <select
                    id="rating-select"
                    value={userMedia.rating ?? ""}
                    onChange={(e) => updateRating(e.target.value ? Number(e.target.value) : null)}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      borderRadius: "0.35rem",
                      padding: "0.45rem 0.75rem",
                      color: "white",
                      fontSize: "0.9rem",
                    }}
                  >
                    <option value="">No rating</option>
                    {[1,2,3,4,5,6,7,8,9,10].map((r) => (
                      <option key={r} value={r}>{r} / 10</option>
                    ))}
                  </select>
                </div>

                <button className="secondary-button" onClick={removeFromLibrary} style={{ color: "#ff6b6b" }}>
                  Remove
                </button>
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
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", color: "#fff4d3", margin: "0 0 1rem" }}>Episodes</h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {episodes.map((ep) => {
              const watched = ep.activity?.watched ?? false;
              return (
                <div
                  key={ep.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.8rem 1rem",
                    background: watched ? "rgba(255,207,92,0.04)" : "rgba(255,255,255,0.02)",
                    border: watched ? "1px solid rgba(255,207,92,0.15)" : "1px solid rgba(255,255,255,0.05)",
                    borderRadius: "0.5rem",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                    <span style={{ fontSize: "0.8rem", color: "#aeb1ac", fontWeight: "bold" }}>
                      S{ep.seasonNumber} E{ep.episodeNumber} {ep.isSpecial && <span style={{ color: "#ff4b4b", fontSize: "0.7rem", marginLeft: "0.3rem" }}>SPECIAL</span>}
                    </span>
                    <span style={{ fontSize: "0.95rem", color: watched ? "#ffcf5c" : "white", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ep.name ?? `Episode ${ep.episodeNumber}`}
                    </span>
                  </div>

                  <IconButton
                    label={watched ? "Mark unwatched" : "Mark watched"}
                    onClick={() => toggleEpisodeWatched(ep.id, watched)}
                    style={{
                      background: watched ? "#ffcf5c" : "rgba(255,255,255,0.06)",
                      color: watched ? "#1d1505" : "#aeb1ac",
                      border: "none",
                      width: "2.2rem",
                      height: "2.2rem",
                      flex: "0 0 2.2rem",
                    }}
                  >
                    <Check size={16} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {toastMessage && <Toast message={toastMessage} />}
    </AppPage>
  );
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
    <AppPage eyebrow="Settings" title="Preferences" description="Profile, theme, privacy, region, and provider settings will live here.">
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
        <SettingRow icon={<Moon size={20} />} title="Theme" value="System" />
        <SettingRow icon={<User size={20} />} title="Profile visibility" value={me?.profile.visibility ?? "Private"} />
        <SettingRow icon={<Library size={20} />} title="Library defaults" value="Personal" />
      </section>
    </AppPage>
  );
}

function ImportPage() {
  return (
    <AppPage eyebrow="Import" title="TV Time import" description="The import wizard route is reserved for file selection, dry runs, chunked commits, and warnings.">
      <EmptyState icon={<Upload size={24} />} title="Import wizard starts in Phase 5" message="The route exists now so navigation and layout can settle before data work begins." />
    </AppPage>
  );
}

function AppPage({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="page-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action}
      </section>
      {children}
      <Toast message="Phase 1 shell ready" />
    </main>
  );
}

function DashboardStats() {
  return (
    <section className="stats-grid" aria-label="Library stats">
      <Stat icon={<Play size={20} />} label="Next up" value="12" />
      <Stat icon={<Star size={20} />} label="Favorites" value="37" />
      <Stat icon={<BarChart3 size={20} />} label="Tracked" value="1.7k" />
    </section>
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
    <div className="modal-backdrop" role="presentation">
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

export function IconButton({ label, children, ...props }: { label: string; children: ReactNode } & ComponentProps<"button">) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
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
