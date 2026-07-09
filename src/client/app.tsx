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

function AppShell() {
  return (
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

function ShowsPage() {
  return (
    <AppPage
      eyebrow="Shows"
      title="Watch next"
      description="A dashboard shaped like the daily tracking loop: resume, catch up, and keep an eye on what is coming."
      action={<IconButton label="Add show"><Plus size={18} /></IconButton>}
    >
      <DashboardStats />
      <Tabs
        tabs={[
          { id: "next", label: "Watch Next" },
          { id: "later", label: "Watch Later" },
          { id: "upcoming", label: "Upcoming" },
        ]}
      />
      <PosterGrid>
        {mediaItems
          .filter((item) => item.type === "show" || item.type === "anime")
          .map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
      </PosterGrid>
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
  return (
    <AppPage eyebrow="Movies" title="Movie library" description="A compact home for watchlist, watched titles, favorites, and upcoming releases.">
      <SegmentedControl options={["Watchlist", "Watched", "Favorites", "Upcoming"]} />
      <PosterGrid>
        {mediaItems
          .filter((item) => item.type === "movie")
          .map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
      </PosterGrid>
      <SkeletonGrid />
    </AppPage>
  );
}

function BooksPage() {
  return (
    <AppPage eyebrow="Books" title="Book library" description="Books are placeholder-first in this phase, with tracking coming in Phase 7.">
      <PosterGrid>
        {mediaItems
          .filter((item) => item.type === "book")
          .map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
      </PosterGrid>
      <EmptyState icon={<BookOpen size={24} />} title="Books are ready for tracking" message="Search, reading status, and progress arrive after the core media model." />
    </AppPage>
  );
}

function GamesPage() {
  return (
    <AppPage eyebrow="Games" title="Game library" description="Games are placeholder-first in this phase, with tracking coming in Phase 7.">
      <PosterGrid>
        {mediaItems
          .filter((item) => item.type === "game")
          .map((item) => (
            <MediaCard key={item.id} item={item} />
          ))}
      </PosterGrid>
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

function MediaDetailPage() {
  const { type, id } = useParams();
  const fallbackMedia = mediaItems[0] as MediaCardItem;
  const item = mediaItems.find((media) => media.id === id) ?? fallbackMedia;

  return (
    <AppPage eyebrow={type ?? "Media"} title={item.title} description="Detail pages will host seasons, episodes, reactions, notes, and spoiler-gated comments.">
      <section className="detail-layout">
        <ResponsivePoster accent={item.accent} title={item.title} />
        <div className="detail-copy">
          <StatusChip tone={item.tone}>{item.status}</StatusChip>
          <ProgressBar value={item.progress} label={`${item.progress}% complete`} />
          <div className="action-row">
            <button className="primary-button">
              <Check size={18} aria-hidden="true" />
              Mark progress
            </button>
            <IconButton label="Favorite">
              <Heart size={18} />
            </IconButton>
          </div>
        </div>
      </section>
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
        <ResponsivePoster accent={item.accent} title={item.title} />
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

export function ResponsivePoster({ accent, title }: { accent: string; title: string }) {
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
}: {
  icon: ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  to?: string;
}) {
  return (
    <section className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{message}</p>
      {actionLabel && to ? <NavLink to={to}>{actionLabel}</NavLink> : null}
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
