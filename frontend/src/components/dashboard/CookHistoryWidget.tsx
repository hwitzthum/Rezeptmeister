"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { relativeDate } from "@/lib/format";

export interface CookHistoryEntry {
  recipeId: string;
  title: string;
  cookedOn: string;
}

export interface LongAgoEntry {
  recipeId: string;
  title: string;
  cookCount: number;
  lastCookedOn: string;
}

interface Props {
  recent: CookHistoryEntry[];
  longAgo: LongAgoEntry[];
}

/**
 * «Zuletzt gekocht» plus «Lange nicht mehr gekocht» — die Historie als
 * Erinnerung, nicht nur als Protokoll.
 */
export default function CookHistoryWidget({ recent, longAgo }: Props) {
  return (
    <Card data-testid="cook-history-widget">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-terra-50 dark:bg-terra-950/30 flex items-center justify-center shrink-0">
          <svg
            className="w-5 h-5 text-terra-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
          Zuletzt gekocht
        </h2>
      </div>

      {recent.length === 0 ? (
        <p
          className="text-sm text-[var(--text-muted)]"
          data-testid="cook-history-empty"
        >
          Noch keine Einträge — im Kochmodus auf «Fertig» tippen oder im Rezept
          «Heute gekocht» wählen.
        </p>
      ) : (
        <ul className="space-y-1.5" data-testid="cook-history-recent">
          {recent.map((e) => (
            <li
              key={`${e.recipeId}-${e.cookedOn}`}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <Link
                href={`/rezepte/${e.recipeId}`}
                className="text-[var(--text-primary)] hover:text-terra-600 dark:hover:text-terra-400 truncate transition-colors"
              >
                {e.title}
              </Link>
              <span className="text-xs text-[var(--text-muted)] shrink-0">
                {relativeDate(e.cookedOn)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {longAgo.length > 0 && (
        <div
          className="mt-4 pt-3 border-t border-[var(--border-subtle)]"
          data-testid="cook-history-long-ago"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] mb-1.5">
            Lange nicht mehr gekocht
          </p>
          <ul className="space-y-1.5">
            {longAgo.map((e) => (
              <li
                key={e.recipeId}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <Link
                  href={`/rezepte/${e.recipeId}`}
                  className="text-[var(--text-primary)] hover:text-terra-600 dark:hover:text-terra-400 truncate transition-colors"
                >
                  {e.title}
                </Link>
                <span className="text-xs text-[var(--text-muted)] shrink-0">
                  {e.cookCount}× · {relativeDate(e.lastCookedOn)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
