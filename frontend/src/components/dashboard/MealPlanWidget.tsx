"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { MealPlanEntry } from "./DashboardClient";

interface Props {
  entries: MealPlanEntry[];
}

const mealTypeLabels: Record<string, string> = {
  fruehstueck: "Fr\u00fchst\u00fcck",
  mittagessen: "Mittagessen",
  abendessen: "Abendessen",
  snack: "Snack",
};

const mealTypeIcons: Record<string, string> = {
  fruehstueck: "\u2615",
  mittagessen: "\ud83c\udf5d",
  abendessen: "\ud83c\udf73",
  snack: "\ud83c\udf4e",
};

export default function MealPlanWidget({ entries }: Props) {
  return (
    <Card data-testid="meal-plan-widget">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <svg className="w-5 h-5 text-terra-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Heute auf dem Plan
        </h2>
        <Link
          href="/wochenplan"
          className="text-sm text-terra-500 hover:text-terra-600 font-medium"
        >
          Wochenplan
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm">
          Heute nichts geplant.{" "}
          <Link href="/wochenplan" className="text-terra-500 hover:text-terra-600 font-medium">
            Mahlzeit planen
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/rezepte/${entry.recipeId}`}
                className="flex items-center gap-3 p-2 -m-2 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors group"
              >
                <span className="text-lg" aria-hidden="true">
                  {mealTypeIcons[entry.mealType] ?? ""}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    {mealTypeLabels[entry.mealType] ?? entry.mealType}
                  </p>
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-terra-600 transition-colors">
                    {entry.recipeTitle}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
