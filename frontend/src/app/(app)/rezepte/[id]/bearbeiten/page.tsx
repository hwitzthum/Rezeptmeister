import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import RecipeForm from "@/components/recipes/RecipeForm";
import { recipeOwnerCondition } from "@/lib/db/helpers";
import Link from "next/link";
import type { Metadata } from "next";

// Deduplicate auth() across generateMetadata + page within the same request
const getSession = cache(auth);

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return { title: "Rezept bearbeiten" };
  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(id, session.user.id, session.user.role),
    columns: { title: true },
  });
  return { title: recipe ? `${recipe.title} bearbeiten` : "Rezept bearbeiten" };
}

export default async function BearbeitenPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) redirect(`/auth/anmelden?callbackUrl=/rezepte/${id}/bearbeiten`);

  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(id, session.user.id, session.user.role),
    columns: { embedding: false },
    with: {
      ingredients: {
        orderBy: (fields, { asc }) => [asc(fields.sortOrder)],
      },
    },
  });

  if (!recipe) notFound();

  // Serialisieren für Client-Props
  const serialized = JSON.parse(JSON.stringify(recipe));

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href={`/rezepte/${id}`}
            className="text-sm text-[var(--text-secondary)] hover:text-terra-600 flex items-center gap-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {recipe.title}
          </Link>
          <span className="text-[var(--border-base)]">/</span>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Bearbeiten
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1
          className="text-2xl font-bold text-[var(--text-primary)] mb-8"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Rezept bearbeiten
        </h1>
        <RecipeForm
          mode="edit"
          recipeId={id}
          initialData={{
            title: serialized.title,
            description: serialized.description,
            category: serialized.category,
            cuisine: serialized.cuisine,
            servings: serialized.servings,
            prepTimeMinutes: serialized.prepTimeMinutes,
            cookTimeMinutes: serialized.cookTimeMinutes,
            difficulty: serialized.difficulty,
            instructions: serialized.instructions,
            tags: serialized.tags,
            ingredients: serialized.ingredients,
          }}
        />
      </main>
    </div>
  );
}
