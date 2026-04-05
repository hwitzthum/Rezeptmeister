import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipeOwnerCondition } from "@/lib/db/helpers";
import CookingMode from "@/components/recipes/CookingMode";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ portionen?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return { title: "Kochmodus" };
  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(id, session.user.id, session.user.role),
    columns: { title: true },
  });
  return { title: recipe ? `Kochmodus — ${recipe.title}` : "Kochmodus" };
}

export default async function KochmodusPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { portionen } = await searchParams;
  const session = await auth();
  if (!session?.user) notFound();

  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(id, session.user.id, session.user.role),
    columns: { embedding: false },
    with: {
      ingredients: {
        orderBy: (fields, { asc }) => [asc(fields.sortOrder)],
      },
      images: {
        columns: { embedding: false, extractedText: false },
        orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      },
    },
  });

  if (!recipe) notFound();

  // Serialisieren für Client-Übergabe
  const serialized = JSON.parse(JSON.stringify(recipe));

  const targetServings = portionen ? parseInt(portionen, 10) : undefined;

  return (
    <CookingMode
      recipe={serialized}
      targetServings={targetServings && !isNaN(targetServings) ? targetServings : undefined}
    />
  );
}
