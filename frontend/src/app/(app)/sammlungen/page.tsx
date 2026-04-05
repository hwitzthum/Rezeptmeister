import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { collections, collectionRecipes, images } from "@/lib/db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";
import CollectionsClient from "@/components/collections/CollectionsClient";

export const metadata = {
  title: "Sammlungen",
};

export default async function SammlungenPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/anmelden");
  }

  const userCollections = await db.query.collections.findMany({
    where: eq(collections.userId, session.user.id),
    orderBy: [desc(collections.createdAt)],
  });

  // Fetch recipe counts per collection
  let countMap = new Map<string, number>();
  if (userCollections.length > 0) {
    const counts = await db
      .select({
        collectionId: collectionRecipes.collectionId,
        count: sql<number>`count(*)::int`,
      })
      .from(collectionRecipes)
      .where(
        inArray(
          collectionRecipes.collectionId,
          userCollections.map((c) => c.id),
        ),
      )
      .groupBy(collectionRecipes.collectionId);

    countMap = new Map(counts.map((c) => [c.collectionId, c.count]));
  }

  // Fetch cover images
  const coverImageMap = new Map<string, string | null>();

  const withCoverImage = userCollections.filter((c) => c.coverImageId);
  if (withCoverImage.length > 0) {
    const coverImages = await db
      .select({ id: images.id, filePath: images.filePath })
      .from(images)
      .where(
        inArray(
          images.id,
          withCoverImage.map((c) => c.coverImageId!),
        ),
      );
    for (const img of coverImages) {
      const col = withCoverImage.find((c) => c.coverImageId === img.id);
      if (col) coverImageMap.set(col.id, img.filePath);
    }
  }

  const serialized = userCollections.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    recipeCount: countMap.get(c.id) ?? 0,
    coverImageUrl: coverImageMap.get(c.id) ?? null,
    createdAt: c.createdAt.toISOString(),
  }));

  return <CollectionsClient initialCollections={serialized} />;
}
