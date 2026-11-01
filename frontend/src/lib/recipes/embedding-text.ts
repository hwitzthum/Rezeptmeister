/**
 * Text, aus dem das Rezept-Embedding fuer die semantische Suche entsteht.
 *
 * Muss dem Aufbau in `backend/app/routers/admin.py::_build_embedding_text`
 * (Re-Embedding-Job) entsprechen. Auseinanderlaufende Texte hiessen, dass
 * dasselbe Rezept je nach Weg — Anlegen, Bearbeiten, Import, Re-Embedding —
 * ein anderes Embedding bekommt. Die Tags ("Asiatisch", "Geflügel") und die
 * Einordnung gehoeren dazu, sonst findet die KI-Suche ein Rezept nicht ueber
 * das, was die KI selbst als sein Wesen festgehalten hat.
 */
export interface EmbeddingTextSource {
  title: string;
  description?: string | null;
  instructions?: string | null;
  cuisine?: string | null;
  category?: string | null;
  tags?: string[] | null;
}

export function buildEmbeddingText(recipe: EmbeddingTextSource): string {
  const parts = [recipe.title];
  if (recipe.description) parts.push(recipe.description);
  if (recipe.instructions) parts.push(recipe.instructions);
  if (recipe.cuisine) parts.push(`Kueche: ${recipe.cuisine}`);
  if (recipe.category) parts.push(`Kategorie: ${recipe.category}`);
  if (recipe.tags && recipe.tags.length > 0)
    parts.push(`Tags: ${recipe.tags.join(", ")}`);
  return parts.join("\n");
}
