import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut, Smartphone } from "lucide-react";
import { auth, signOut } from "@/auth";
import { USER_ROLE } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import ThemeToggle from "@/components/layout/ThemeToggle";
import InstallGuide from "@/components/layout/InstallGuide";
import { bottomNavItems, navGroups } from "@/components/layout/nav-items";
import {
  IOS_SHORTCUT_TITLE,
  IOS_SHORTCUT_INTRO,
  IOS_SHORTCUT_STEPS,
} from "@/lib/pwa/ios-shortcut";

export const metadata: Metadata = {
  title: "Mehr | Rezeptmeister",
  description: "Alle übrigen Bereiche, Darstellung und Konto.",
};

/** Stabiler Test-Haken aus dem Pfad — bewusst lokal, siehe Kommentar unten. */
function navSlug(href: string) {
  if (href === "/") return "dashboard";
  return href.replace(/^\//, "").replace(/\//g, "-");
}

/** Was schon in der Tab-Leiste steht, wird hier nicht wiederholt. */
const tabHrefs = new Set(bottomNavItems.map((item) => item.href));

export default async function MehrPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === USER_ROLE.admin;
  const userName = session?.user?.name ?? session?.user?.email ?? undefined;

  async function abmelden() {
    "use server";
    await signOut({ redirectTo: "/auth/anmelden" });
  }

  const groups = navGroups
    .map((group) => ({
      label: group.label,
      items: group.items.filter(
        (item) => !tabHrefs.has(item.href) && (!item.adminOnly || isAdmin),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <PageHeader
        subtitle="Navigation"
        title="Mehr"
        description="Alle übrigen Bereiche, Darstellung und Konto."
        sticky={false}
      />

      <div className="container mx-auto px-4 py-6 max-w-3xl space-y-6" data-testid="mehr-page">
        {/* Benutzer */}
        {userName && (
          <section className="rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-terra-100 dark:bg-terra-900/30 flex items-center justify-center shrink-0">
                <span className="text-terra-600 dark:text-terra-400 text-base font-semibold">
                  {userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {userName}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {isAdmin ? "Angemeldet als Administrator" : "Angemeldet"}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Bereiche */}
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] px-1 mb-1.5">
              {group.label}
            </h2>
            <ul
              role="list"
              className="rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] overflow-hidden divide-y divide-[var(--border-subtle)]"
            >
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-testid={`mehr-link-${navSlug(item.href)}`}
                    className="min-tap flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                  >
                    <span
                      className="shrink-0 text-warm-500 dark:text-warm-400"
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 truncate">{item.label}</span>
                    {item.adminOnly && (
                      <span className="text-xs bg-terra-100 text-terra-600 px-1.5 py-0.5 rounded-md font-medium dark:bg-terra-900/30 dark:text-terra-400">
                        Admin
                      </span>
                    )}
                    <ChevronRight
                      className="ml-auto w-4 h-4 shrink-0 text-[var(--text-muted)]"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* iOS-Kurzbefehl */}
        <section>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] px-1 mb-1.5">
            Unterwegs
          </h2>
          <div className="mb-2">
            <InstallGuide />
          </div>
          <details data-testid="mehr-ios-shortcut" className="group rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] overflow-hidden">
            <summary className="min-tap flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer list-none transition-colors duration-150 hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]">
              <Smartphone
                className="w-5 h-5 shrink-0 text-warm-500 dark:text-warm-400"
                aria-hidden="true"
              />
              <span className="min-w-0">{IOS_SHORTCUT_TITLE}</span>
              <ChevronRight
                className="ml-auto w-4 h-4 shrink-0 text-[var(--text-muted)] transition-transform duration-150 group-open:rotate-90"
                aria-hidden="true"
              />
            </summary>
            <div className="px-4 pb-4 pt-1 border-t border-[var(--border-subtle)]">
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                {IOS_SHORTCUT_INTRO}
              </p>
              <ol className="mt-3 space-y-2 list-decimal list-inside text-sm text-[var(--text-secondary)] marker:text-terra-500 marker:font-semibold">
                {IOS_SHORTCUT_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </details>
        </section>

        {/* Darstellung */}
        <section>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] px-1 mb-1.5">
            Darstellung
          </h2>
          <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Modus
            </span>
            <ThemeToggle compact />
          </div>
        </section>

        {/* Konto */}
        <section>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] px-1 mb-1.5">
            Konto
          </h2>
          <form action={abmelden}>
            <button
              type="submit"
              data-testid="mehr-signout"
              className="min-tap w-full flex items-center gap-3 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 transition-colors duration-150 hover:bg-red-50 dark:hover:bg-red-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            >
              <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" />
              Abmelden
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
