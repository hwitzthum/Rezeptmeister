import { notFound } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipeOwnerCondition } from "@/lib/db/helpers";
import RecipeDetailClient from "@/components/recipes/RecipeDetailClient";
import type { Metadata } from "next";

// Deduplicate auth() across generateMetadata + page within the same request
const getSession = cache(auth);

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) return { title: "Rezept" };
  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(id, session.user.id, session.user.role),
    columns: { title: true },
  });
  return { title: recipe?.title ?? "Rezept" };
}

export default async function RecipeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) notFound();

  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(id, session.user.id, session.user.role),
    columns: { embedding: false },
    with: {
      ingredients: {
        orderBy: (fields, { asc }) => [asc(fields.sortOrder)],
      },
      images: {
        where: (fields, { eq }) => eq(fields.isPrimary, true),
        columns: { embedding: false },
        limit: 1,
      },
    },
  });

  if (!recipe) notFound();

  // Serialisieren für Client-Übergabe (Date → string)
  const serialized = JSON.parse(JSON.stringify(recipe));

  return <RecipeDetailClient recipe={serialized} />;
}
