import React from "react";

interface PageHeaderProps {
  /** Small uppercase label above the title (e.g. "Rezepte") */
  subtitle?: string;
  /** Main heading text */
  title: string;
  /** Optional count shown as "(count)" after title */
  count?: number;
  /** Optional description below the title */
  description?: string;
  /** Action slot (buttons, links) aligned to the right */
  action?: React.ReactNode;
  /** Use sticky positioning with backdrop blur (default: true) */
  sticky?: boolean;
}

export function PageHeader({
  subtitle,
  title,
  count,
  description,
  action,
  sticky = true,
}: PageHeaderProps) {
  return (
    <header
      className={[
        "z-20 border-b border-[var(--border-subtle)]",
        "bg-gradient-to-r from-[var(--bg-surface)] via-[var(--bg-surface)] to-[var(--bg-base)]",
        sticky
          ? "sticky top-0 backdrop-blur-sm bg-[var(--bg-surface)]/90"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
        {subtitle && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-terra-500 mb-1">
            {subtitle}
          </p>
        )}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] truncate">
              {title}
              {count !== undefined && count > 0 && (
                <span className="ml-2 text-base font-normal text-[var(--text-muted)]">
                  ({count})
                </span>
              )}
            </h1>
            {description && (
              <p className="mt-1 text-sm text-[var(--text-secondary)] line-clamp-1">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
    </header>
  );
}
