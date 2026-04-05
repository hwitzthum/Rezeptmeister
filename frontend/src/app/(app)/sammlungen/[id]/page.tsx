import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  collections,
  collectionRecipes,
  recipes,
  images,
} from "@/lib/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import CollectionDetailClient from "@/components/collections/CollectionDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return { title: "Sammlung" };

  const collection = await db.query.collections.findFirst({
    where: and(
      eq(collections.id, id),
      eq(collections.userId, session.user.id),
    ),
    columns: { name: true },
  });

  return { title: collection?.name ?? "Sammlung" };
}

export default async function SammlungDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/anmelden");
  }

  const collection = await db.query.collections.findFirst({
    where: and(
      eq(collections.id, id),
      eq(collections.userId, session.user.id),
    ),
  });

  if (!collection) {
    notFound();
  }

  // Fetch recipes in collection
  const recipesInCollection = await db
    .select({
      sortOrder: collectionRecipes.sortOrder,
      recipeId: recipes.id,
      title: recipes.title,
      category: recipes.category,
      totalTimeMinutes: recipes.totalTimeMinutes,
      difficulty: recipes.difficulty,
      servings: recipes.servings,
      isFavorite: recipes.isFavorite,
    })
    .from(collectionRecipes)
    .innerJoin(recipes, eq(collectionRecipes.recipeId, recipes.id))
    .where(eq(collectionRecipes.collectionId, id))
    .orderBy(asc(collectionRecipes.sortOrder));

  // Batch-fetch primary images
  const recipeIds = recipesInCollection.map((r) => r.recipeId);
  let imageMap = new Map<string, string>();

  if (recipeIds.length > 0) {
    const primaryImages = await db
      .select({
        recipeId: images.recipeId,
        filePath: images.filePath,
      })
      .from(images)
      .where(
        and(inArray(images.recipeId, recipeIds), eq(images.isPrimary, true)),
      );

    imageMap = new Map(
      primaryImages
        .filter((i) => i.recipeId !== null)
        .map((i) => [i.recipeId!, i.filePath]),
    );
  }

  const serializedCollection = {
    ...collection,
    createdAt: collection.createdAt.toISOString(),
  };

  const serializedRecipes = recipesInCollection.map((r) => ({
    ...r,
    thumbnailUrl: imageMap.get(r.recipeId) ?? null,
  }));

  return (
    <CollectionDetailClient
      collection={serializedCollection}
      initialRecipes={serializedRecipes}
    />
  );
}
