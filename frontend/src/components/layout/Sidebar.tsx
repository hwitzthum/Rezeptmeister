"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Link as LucideLink } from "lucide-react";
import UrlImportDialog from "@/components/ai/UrlImportDialog";
import ThemeToggle from "@/components/layout/ThemeToggle";
import {
  navGroups,
  BookOpenIcon,
  HomeIcon,
  PlusIcon,
  SearchIcon,
  ShoppingCartIcon,
  type NavItem,
} from "@/components/layout/nav-items";

const ChefHatIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5A5.25 5.25 0 002.25 10.25v.75c0 .69.56 1.25 1.25 1.25H4.5M12 6.253C13.168 5.477 14.754 5 16.5 5a5.25 5.25 0 015.25 5.25v.75c0 .69-.56 1.25-1.25 1.25H19.5" />
  </svg>
);

// Flat list for mobile bottom nav (first 5 meaningful items)
const mobileNavItems: NavItem[] = [
  { href: "/",              label: "Dashboard",        icon: <HomeIcon /> },
  { href: "/rezepte",       label: "Meine Rezepte",    icon: <BookOpenIcon /> },
  { href: "/rezepte/neu",   label: "Erstellen",        icon: <PlusIcon />, cta: true },
  { href: "/suche",         label: "Suche",            icon: <SearchIcon /> },
  { href: "/einkaufsliste", label: "Einkaufsliste",    icon: <ShoppingCartIcon /> },
];

interface SidebarProps {
  isAdmin?: boolean;
  userName?: string;
}

export function Sidebar({ isAdmin = false, userName }: SidebarProps) {
  const pathname = usePathname();
  const [showUrlImport, setShowUrlImport] = useState(false);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside
      className="hidden lg:flex flex-col w-64 shrink-0 h-full border-r border-[var(--border-base)] bg-[var(--bg-surface)]"
      aria-label="Hauptnavigation"
    >
      {/* Logo */}
      <div className="px-6 py-5 border-b border-[var(--border-base)]">
        <Link
          href="/"
          className="flex items-center gap-3 group"
          aria-label="Rezeptmeister – Startseite"
        >
          <div className="w-9 h-9 rounded-xl bg-terra-500 flex items-center justify-center shadow-warm-sm">
            <ChefHatIcon />
          </div>
          <span className="font-display font-bold text-lg text-[var(--text-primary)] group-hover:text-terra-600 dark:group-hover:text-terra-400 transition-colors">
            Rezeptmeister
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navGroups.map((group, groupIdx) => {
          const visibleItems = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;
          return (
            <div
              key={group.label}
              className={groupIdx > 0 ? "mt-4 pt-3 border-t border-[var(--border-subtle)]" : ""}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] px-3 mb-1.5">
                {group.label}
              </p>
              <ul role="list" className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active = isActive(item.href);
                  const isCta = item.cta && !active;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={[
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium",
                          "transition-all duration-150 group",
                          active
                            ? "bg-terra-50 text-terra-700 shadow-warm-xs dark:bg-terra-950/30 dark:text-terra-300"
                            : isCta
                              ? "bg-terra-500 text-white hover:bg-terra-600 shadow-sm"
                              : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]",
                        ].join(" ")}
                        aria-current={active ? "page" : undefined}
                      >
                        <span
                          className={[
                            "shrink-0 transition-colors duration-150",
                            active
                              ? "text-terra-500 dark:text-terra-400"
                              : isCta
                                ? "text-white"
                                : "text-warm-500 group-hover:text-warm-600 dark:text-warm-400 dark:group-hover:text-warm-300",
                          ].join(" ")}
                          aria-hidden="true"
                        >
                          {item.icon}
                        </span>
                        {item.label}
                        {item.adminOnly && (
                          <span className="ml-auto text-xs bg-terra-100 text-terra-600 px-1.5 py-0.5 rounded-md font-medium dark:bg-terra-900/30 dark:text-terra-400">
                            Admin
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {/* URL importieren — opens dialog instead of navigating */}
        <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setShowUrlImport(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          >
            <span className="shrink-0 text-warm-500 group-hover:text-warm-600 dark:text-warm-400 dark:group-hover:text-warm-300 transition-colors duration-150" aria-hidden="true">
              <LucideLink className="w-5 h-5" />
            </span>
            URL importieren
          </button>
        </div>
      </nav>

      <UrlImportDialog
        isOpen={showUrlImport}
        onClose={() => setShowUrlImport(false)}
      />

      {/* Theme toggle */}
      <div className="px-4 py-3 border-t border-[var(--border-base)]">
        <ThemeToggle compact />
      </div>

      {/* User footer */}
      {userName && (
        <div className="px-4 py-4 border-t border-[var(--border-base)]">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-xl bg-terra-100 dark:bg-terra-900/30 flex items-center justify-center shrink-0">
              <span className="text-terra-600 dark:text-terra-400 text-sm font-semibold">
                {userName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{userName}</p>
              <p className="text-xs text-[var(--text-muted)]">Angemeldet</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ─── Mobile Bottom Navigation ─── */

export function BottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-surface)] border-t border-[var(--border-base)] safe-area-inset-bottom"
      aria-label="Mobile Navigation"
    >
      <ul role="list" className="flex items-stretch h-16">
        {mobileNavItems.map((item) => {
          const active = isActive(item.href);
          const isCta = item.cta && !active;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={[
                  "relative flex flex-col items-center justify-center gap-1 h-full w-full px-1",
                  "transition-colors duration-150",
                  active
                    ? "text-terra-500"
                    : isCta
                      ? "text-white"
                      : "text-warm-500 hover:text-warm-700 dark:text-warm-400 dark:hover:text-warm-300",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-terra-500" />
                )}
                {isCta ? (
                  <span className="flex items-center justify-center w-10 h-10 -mt-3 rounded-full bg-terra-500 text-white shadow-md" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : (
                  <span aria-hidden="true">{item.icon}</span>
                )}
                <span className={[
                  "text-[10px] font-medium leading-none truncate max-w-full px-1",
                  isCta ? "text-terra-500" : "",
                ].join(" ")}>
                  {item.label.split(" ")[0]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
