import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listQuerySchema, listRecipes } from "@/lib/recipes/list";
import RezeptListeClient from "@/components/recipes/RezeptListeClient";

export const metadata = { title: "Meine Rezepte" };

export default async function RezeptListePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/anmelden");

  // Default-Ansicht server-seitig laden (Seite 1, neueste zuerst) und als
  // initialData an die interaktive Client-Komponente übergeben — kein
  // Client-Fetch-Wasserfall und kein Lade-Skeleton beim Erstaufruf.
  const initial = await listRecipes(session.user.id, listQuerySchema.parse({}));

  return (
    <RezeptListeClient
      initialItems={initial.recipes}
      initialTotal={initial.total}
      initialHasMore={initial.hasMore}
    />
  );
}
