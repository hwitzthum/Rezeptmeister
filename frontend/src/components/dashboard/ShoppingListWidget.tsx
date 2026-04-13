"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";

interface Props {
  openCount: number;
}

export default function ShoppingListWidget({ openCount }: Props) {
  return (
    <Card data-testid="shopping-list-widget">
      <Link href="/einkaufsliste" className="block group">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gold-50 dark:bg-gold-950/30 flex items-center justify-center shrink-0 group-hover:bg-gold-100 dark:group-hover:bg-gold-900/30 transition-colors">
            <svg className="w-6 h-6 text-gold-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] group-hover:text-terra-600 transition-colors">
              Einkaufsliste
            </h2>
            <p className="text-sm text-[var(--text-muted)]" data-testid="shopping-count">
              {openCount === 0
                ? "Einkaufsliste ist leer"
                : openCount === 1
                  ? "1 offener Eintrag"
                  : `${openCount} offene Eintr\u00e4ge`}
            </p>
          </div>
          <svg className="w-5 h-5 text-[var(--text-muted)] ml-auto shrink-0 group-hover:text-terra-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </Link>
    </Card>
  );
}
