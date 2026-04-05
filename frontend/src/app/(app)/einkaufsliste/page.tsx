import { cache } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shoppingListItems } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import ShoppingListClient from "@/components/shopping/ShoppingListClient";
import type { Metadata } from "next";

const getSession = cache(auth);

export const metadata: Metadata = {
  title: "Einkaufsliste",
};

export default async function EinkaufslistePage() {
  const session = await getSession();
  if (!session?.user) notFound();

  const items = await db.query.shoppingListItems.findMany({
    where: eq(shoppingListItems.userId, session.user.id),
    orderBy: [asc(shoppingListItems.aisleCategory), asc(shoppingListItems.sortOrder)],
  });

  // Serialize dates to strings for client component
  const serialized = JSON.parse(JSON.stringify(items));

  return <ShoppingListClient initialItems={serialized} />;
}
