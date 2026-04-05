import { Metadata } from "next";
import RecipeSuggestions from "@/components/ai/RecipeSuggestions";

export const metadata: Metadata = {
  title: "Rezeptvorschläge | Rezeptmeister",
};

export default function VorschlägePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1
        className="font-playfair text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Rezeptvorschläge
      </h1>
      <p className="text-muted-foreground mb-8 text-[var(--text-secondary)]">
        Lass die KI passende Rezepte für dich vorschlagen.
      </p>
      <RecipeSuggestions />
    </div>
  );
}
