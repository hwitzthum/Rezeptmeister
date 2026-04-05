"use client";

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import { formatAmount } from "@/lib/units";
import type { RecipeDetail } from "./RecipeDetailClient";

// ── Styles ───────────────────────────────────────────────────────────────────
// Verwendet Helvetica (built-in in @react-pdf/renderer) — kein Font-Download nötig

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    color: "#333",
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "#C24D2C",
    marginBottom: 4,
  },
  meta: {
    fontSize: 9,
    color: "#888",
    marginBottom: 12,
    flexDirection: "row",
    gap: 12,
  },
  image: {
    width: "100%",
    maxHeight: 180,
    objectFit: "cover",
    borderRadius: 8,
    marginBottom: 12,
  },
  description: {
    fontSize: 10,
    color: "#666",
    fontStyle: "italic",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#C24D2C",
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e1db",
    paddingBottom: 3,
  },
  ingredientRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
    fontSize: 10,
  },
  ingredientAmount: {
    width: 70,
    textAlign: "right",
    fontWeight: 700,
    color: "#C24D2C",
  },
  ingredientName: {
    flex: 1,
  },
  instructionStep: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 6,
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#aaa",
    borderTopWidth: 1,
    borderTopColor: "#e5e1db",
    paddingTop: 6,
  },
});

// ── Einzelrezept PDF-Dokument ────────────────────────────────────────────────

interface RecipePdfDocProps {
  recipe: RecipeDetail;
  targetServings: number;
  originalServings: number;
  includeImage: boolean;
}

function scaledAmount(
  amountStr: string | null,
  targetServings: number,
  originalServings: number,
): string {
  if (!amountStr) return "";
  const n = parseFloat(amountStr);
  if (isNaN(n)) return amountStr;
  return formatAmount((n * targetServings) / originalServings);
}

function RecipePdfPage({
  recipe,
  targetServings,
  originalServings,
  includeImage,
}: RecipePdfDocProps) {
  const heroImg = recipe.images.find((i) => i.isPrimary) ?? recipe.images[0];

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>{recipe.title}</Text>

      <View style={styles.meta}>
        <Text>
          {targetServings} {targetServings === 1 ? "Portion" : "Portionen"}
        </Text>
        {recipe.totalTimeMinutes && (
          <Text>
            {recipe.totalTimeMinutes < 60
              ? `${recipe.totalTimeMinutes} Min.`
              : `${Math.floor(recipe.totalTimeMinutes / 60)} Std.${recipe.totalTimeMinutes % 60 > 0 ? ` ${recipe.totalTimeMinutes % 60} Min.` : ""}`}
          </Text>
        )}
        {recipe.difficulty && <Text>{recipe.difficulty}</Text>}
        {recipe.category && <Text>{recipe.category}</Text>}
      </View>

      {includeImage && heroImg?.filePath && (
        <Image src={heroImg.filePath} style={styles.image} />
      )}

      {recipe.description && (
        <Text style={styles.description}>{recipe.description}</Text>
      )}

      <Text style={styles.sectionTitle}>Zutaten</Text>
      {recipe.ingredients.map((ing) => {
        const amount = scaledAmount(ing.amount, targetServings, originalServings);
        return (
          <View key={ing.id} style={styles.ingredientRow}>
            <Text style={styles.ingredientAmount}>
              {amount}
              {ing.unit ? ` ${ing.unit}` : ""}
            </Text>
            <Text style={styles.ingredientName}>
              {ing.name}
              {ing.isOptional ? " (optional)" : ""}
            </Text>
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>Zubereitung</Text>
      {recipe.instructions.split(/\n+/).map((para, i) => (
        <Text key={i} style={styles.instructionStep}>
          {para}
        </Text>
      ))}

      <View style={styles.footer} fixed>
        <Text>
          Rezeptmeister — erstellt am{" "}
          {new Date().toLocaleDateString("de-CH")}
        </Text>
      </View>
    </Page>
  );
}

function RecipePdfDocument(props: RecipePdfDocProps) {
  return (
    <Document
      title={props.recipe.title}
      author="Rezeptmeister"
      subject={`Rezept: ${props.recipe.title}`}
    >
      <RecipePdfPage {...props} />
    </Document>
  );
}

// ── Collection PDF ───────────────────────────────────────────────────────────

interface CollectionPdfDocProps {
  collectionName: string;
  recipes: RecipePdfDocProps[];
}

function CollectionPdfDocument({
  collectionName,
  recipes,
}: CollectionPdfDocProps) {
  return (
    <Document title={collectionName} author="Rezeptmeister">
      {/* Titelseite */}
      <Page size="A4" style={styles.page}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#C24D2C",
              marginBottom: 8,
            }}
          >
            {collectionName}
          </Text>
          <Text style={{ fontSize: 12, color: "#888" }}>
            {recipes.length}{" "}
            {recipes.length === 1 ? "Rezept" : "Rezepte"}
          </Text>
        </View>
      </Page>

      {/* Ein Rezept pro Seite */}
      {recipes.map((rp) => (
        <RecipePdfPage key={rp.recipe.id} {...rp} />
      ))}
    </Document>
  );
}

// ── Export-Funktionen ────────────────────────────────────────────────────────

export async function generateRecipePdf(
  props: RecipePdfDocProps,
): Promise<Blob> {
  return pdf(<RecipePdfDocument {...props} />).toBlob();
}

export async function generateCollectionPdf(
  props: CollectionPdfDocProps,
): Promise<Blob> {
  return pdf(<CollectionPdfDocument {...props} />).toBlob();
}
