import { X } from "lucide-react";
import type { ComponentProps, ReactNode, Ref } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import type { MediaType } from "@shared/media";
import type { DashboardEntry } from "@shared/dashboard";

export type StatusTone = "watching" | "planned" | "complete" | "paused" | "stopped";

export type MediaCardItem = {
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

export function MediaCard({ item }: { item: MediaCardItem }) {
  return (
    <article className="media-card">
      <NavLink to={`/media/${item.type}/${item.id}`} aria-label={`Open ${item.title}`}>
        <ResponsivePoster accent={item.accent} title={item.title} posterPath={item.posterPath} />
      </NavLink>
      <div className="media-card-body">
        <div>
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

export function ResponsivePoster({ accent, title, posterPath, showTitle = true }: { accent: string; title: string; posterPath?: string | null; showTitle?: boolean }) {
  if (posterPath) {
    return (
      <div className="poster">
        <img src={posterPath} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "0.5rem" }} />
      </div>
    );
  }
  return (
    <div className="poster" style={{ background: accent }}>
      {showTitle && <span>{title}</span>}
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

export function LoadingPanel({
  title,
  message,
  progress,
  compact = false,
}: {
  title: string;
  message?: string;
  progress?: number | null;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "loading-panel compact" : "loading-panel"} aria-live="polite">
      <div className="import-spinner" />
      <div>
        <strong>{title}</strong>
        {message && <p>{message}</p>}
      </div>
      {typeof progress === "number" && <ProgressBar value={progress} label={`${progress}% complete`} />}
    </section>
  );
}

export function SearchField({
  value,
  onChange,
  onClear,
  inputRef,
  placeholder,
  label,
  icon,
  variant = "compact",
  className,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  placeholder: string;
  label: string;
  icon?: ReactNode;
  variant?: "pill" | "compact";
  className?: string;
  onSubmit?: () => void;
}) {
  const content = (
    <>
      {icon}
      <input
        ref={inputRef}
        aria-label={label}
        placeholder={placeholder}
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <IconButton
          type="button"
          className="search-clear"
          label="Clear search"
          onClick={onClear ?? (() => onChange(""))}
        >
          <X size={14} />
        </IconButton>
      )}
    </>
  );

  const classes = ["search-field", variant === "pill" ? "search-field-pill" : "search-field-compact", className].filter(Boolean).join(" ");
  if (onSubmit) {
    return (
      <form
        className={classes}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {content}
      </form>
    );
  }
  return <div className={classes}>{content}</div>;
}

export function Modal({ title, children, open = true, onClose }: { title: string; children: ReactNode; open?: boolean; onClose?: () => void }) {
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-open");
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
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
    </div>,
    document.body,
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
