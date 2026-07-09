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
  Home,
  Library,
  List,
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
import type { ComponentProps, ReactNode } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";

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
  { to: "/shows", label: "Shows", icon: Tv },
  { to: "/movies", label: "Movies", icon: Film },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const utilityNav = [
  { to: "/messages", label: "Messages", icon: Mail },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/import/tv-time", label: "Import", icon: Upload },
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
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/shows" replace />} />
        <Route path="/shows" element={<ShowsPage />} />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/profile/:username?" element={<ProfilePage />} />
        <Route path="/media/:type/:id" element={<MediaDetailPage />} />
        <Route path="/lists/:id" element={<ListPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/import/tv-time" element={<ImportPage />} />
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
        <nav className="rail-nav rail-nav-secondary">
          {utilityNav.map((item) => (
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
    <NavLink to="/shows" className={compact ? "brand brand-compact" : "brand"} aria-label="Tuvu home">
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
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
      <Icon size={compact ? 21 : 19} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

function AuthPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <img src="/app-icon.png" alt="" className="auth-icon" />
        <p className="eyebrow">Personal media tracking</p>
        <h1 id="auth-heading">Tuvu</h1>
        <p className="auth-copy">
          Keep shows, movies, anime, games, and books in one quiet place.
        </p>
        <div className="auth-actions">
          <button className="primary-button">
            <ShieldCheck size={18} aria-hidden="true" />
            Continue with passkey
          </button>
          <button className="secondary-button">
            <Sparkles size={18} aria-hidden="true" />
            Continue with OAuth
          </button>
        </div>
      </section>
    </main>
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

  return (
    <AppPage eyebrow="Profile" title={username ? `@${username}` : "Your profile"} description="Stats, recent activity, favorites, and public lists will gather here.">
      <section className="profile-hero">
        <div className="profile-banner" />
        <div className="profile-row">
          <div className="avatar">AZ</div>
          <div>
            <h2>Ahmar Zaidi</h2>
            <p>@ahmar</p>
          </div>
        </div>
      </section>
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
  return (
    <AppPage eyebrow="Settings" title="Preferences" description="Profile, theme, privacy, region, and provider settings will live here.">
      <section className="settings-list">
        <SettingRow icon={<Moon size={20} />} title="Theme" value="System" />
        <SettingRow icon={<User size={20} />} title="Profile visibility" value="Private" />
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

export function Modal({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <IconButton label="Close modal">
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
