import { Metadata } from "next";
import RecipeSuggestions from "@/components/ai/RecipeSuggestions";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Rezeptvorschläge | Rezeptmeister",
};

export default function VorschlägePage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <PageHeader
        subtitle="KI-Assistent"
        title="Rezeptvorschläge"
        description="Lass die KI passende Rezepte für dich vorschlagen."
        sticky={false}
      />
      <div className="container mx-auto px-4 py-8">
        <RecipeSuggestions />
      </div>
    </div>
  );
}
