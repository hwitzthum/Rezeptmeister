"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import Step1Grunddaten, {
  type Step1Data,
} from "./steps/Step1Grunddaten";
import Step2Zutaten, {
  type Step2Data,
} from "./steps/Step2Zutaten";
import Step3Anleitung, { type Step3Data } from "./steps/Step3Anleitung";
import Step4Metadaten, { type Step4Data } from "./steps/Step4Metadaten";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecipeFormData
  extends Step1Data,
    Step2Data,
    Step3Data,
    Step4Data {}

export interface RecipeFormInitialData {
  title?: string;
  description?: string;
  category?: string;
  cuisine?: string;
  servings?: number;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  difficulty?: string | null;
  ingredients?: Array<{
    id?: string;
    name: string;
    amount?: string | null;
    unit?: string | null;
    groupName?: string | null;
    isOptional?: boolean;
  }>;
  instructions?: string;
  tags?: string[] | null;
}

interface Props {
  mode: "create" | "edit";
  recipeId?: string;
  initialData?: RecipeFormInitialData;
}

// ── Hilfs-Funktion ────────────────────────────────────────────────────────────

function buildInitialFormData(init?: RecipeFormInitialData): RecipeFormData {
  return {
    title: init?.title ?? "",
    description: init?.description ?? "",
    category: init?.category ?? "",
    cuisine: init?.cuisine ?? "",
    servings: init?.servings?.toString() ?? "4",
    prepTimeMinutes: init?.prepTimeMinutes?.toString() ?? "",
    cookTimeMinutes: init?.cookTimeMinutes?.toString() ?? "",
    difficulty: init?.difficulty ?? "",
    ingredients:
      init?.ingredients?.map((ing) => ({
        id: ing.id ?? Math.random().toString(36).slice(2),
        name: ing.name,
        amount: ing.amount ?? "",
        unit: ing.unit ?? "g",
        groupName: ing.groupName ?? "",
        isOptional: ing.isOptional ?? false,
      })) ?? [],
    instructions: init?.instructions ?? "",
    tags: init?.tags ?? [],
  };
}

// ── Schrittbeschriftungen ─────────────────────────────────────────────────────

const STEPS = [
  { label: "Grunddaten", short: "1" },
  { label: "Zutaten", short: "2" },
  { label: "Anleitung", short: "3" },
  { label: "Metadaten", short: "4" },
] as const;

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function RecipeForm({ mode, recipeId, initialData }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<RecipeFormData>(() =>
    buildInitialFormData(initialData),
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof RecipeFormData, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // ── Per-Step-Validierung ──────────────────────────────────────────────────

  function validateStep1(): boolean {
    const errs: typeof errors = {};
    if (!formData.title.trim()) {
      errs.title = "Titel ist erforderlich.";
    }
    const srvg = parseInt(formData.servings);
    if (isNaN(srvg) || srvg < 1) {
      errs.servings = "Mindestens 1 Portion.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2(): boolean {
    // Zutaten sind optional, aber Namen dürfen nicht leer sein
    const hasEmpty = formData.ingredients.some(
      (i) => !i.name.trim(),
    );
    if (hasEmpty) {
      setErrors({ ingredients: "Alle Zutaten müssen einen Namen haben." });
      return false;
    }
    setErrors({});
    return true;
  }

  function validateStep3(): boolean {
    setErrors({});
    return true;
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function goNext() {
    const valid =
      step === 1 ? validateStep1() :
      step === 2 ? validateStep2() :
      validateStep3();
    if (valid) setStep((s) => Math.min(s + 1, 4) as 1 | 2 | 3 | 4);
  }

  function goBack() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3 | 4);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setApiError(null);
    setIsSubmitting(true);

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      instructions: formData.instructions.trim(),
      servings: parseInt(formData.servings) || 4,
      prepTimeMinutes: formData.prepTimeMinutes
        ? parseInt(formData.prepTimeMinutes)
        : null,
      cookTimeMinutes: formData.cookTimeMinutes
        ? parseInt(formData.cookTimeMinutes)
        : null,
      difficulty: formData.difficulty || null,
      category: formData.category.trim() || undefined,
      cuisine: formData.cuisine.trim() || undefined,
      tags: formData.tags,
      sourceType: "manual",
      ingredients: formData.ingredients
        .filter((i) => i.name.trim())
        .map((i, idx) => ({
          name: i.name.trim(),
          amount: i.amount ? parseFloat(i.amount.replace(",", ".")) : null,
          unit: i.unit || undefined,
          groupName: i.groupName.trim() || undefined,
          sortOrder: idx,
          isOptional: i.isOptional,
        })),
    };

    try {
      const url =
        mode === "edit" ? `/api/recipes/${recipeId}` : "/api/recipes";
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setApiError(
          body.error ?? "Unbekannter Fehler beim Speichern.",
        );
        return;
      }

      const saved = await res.json();
      const targetId = mode === "edit" ? recipeId : saved.id;
      router.push(`/rezepte/${targetId}`);
      router.refresh();
    } catch {
      setApiError("Netzwerkfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      {/* Schritt-Indikator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, idx) => {
            const num = idx + 1;
            const isActive = num === step;
            const isDone = num < step;
            return (
              <div key={s.label} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={[
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold",
                      "transition-all duration-200",
                      isActive
                        ? "bg-terra-500 text-white shadow-warm-sm"
                        : isDone
                          ? "bg-terra-100 text-terra-600"
                          : "bg-[var(--bg-subtle)] text-[var(--text-muted)]",
                    ].join(" ")}
                    aria-current={isActive ? "step" : undefined}
                  >
                    {isDone ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      s.short
                    )}
                  </div>
                  <span
                    className={[
                      "mt-1 text-xs hidden sm:block",
                      isActive
                        ? "text-terra-600 font-medium"
                        : "text-[var(--text-muted)]",
                    ].join(" ")}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={[
                      "flex-1 h-px mx-2 transition-colors duration-200",
                      num < step
                        ? "bg-terra-300"
                        : "bg-[var(--border-base)]",
                    ].join(" ")}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Formular-Inhalt */}
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm p-6 mb-6">
        <h2
          className="text-lg font-semibold text-[var(--text-primary)] mb-5"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {step === 1 && "Grunddaten"}
          {step === 2 && "Zutaten"}
          {step === 3 && "Zubereitung"}
          {step === 4 && "Abschluss"}
        </h2>

        {step === 1 && (
          <Step1Grunddaten
            data={formData}
            onChange={(d) => setFormData((prev) => ({ ...prev, ...d }))}
            errors={errors}
          />
        )}
        {step === 2 && (
          <Step2Zutaten
            data={{ ingredients: formData.ingredients }}
            onChange={(d) =>
              setFormData((prev) => ({ ...prev, ingredients: d.ingredients }))
            }
          />
        )}
        {step === 3 && (
          <Step3Anleitung
            data={{ instructions: formData.instructions }}
            onChange={(d) =>
              setFormData((prev) => ({ ...prev, instructions: d.instructions }))
            }
          />
        )}
        {step === 4 && (
          <Step4Metadaten
            data={{ tags: formData.tags }}
            onChange={(d) =>
              setFormData((prev) => ({ ...prev, tags: d.tags }))
            }
          />
        )}

        {/* Zutaten-Fehler (Step 2) */}
        {errors.ingredients && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {errors.ingredients}
          </p>
        )}
      </div>

      {/* API-Fehler */}
      {apiError && (
        <div
          className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700"
          role="alert"
        >
          {apiError}
        </div>
      )}

      {/* Navigation-Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={goBack}
          disabled={step === 1 || isSubmitting}
        >
          ← Zurück
        </Button>

        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-muted)]">
            Schritt {step} von {STEPS.length}
          </span>
          {step < 4 ? (
            <Button variant="primary" onClick={goNext}>
              Weiter →
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {mode === "edit" ? "Änderungen speichern" : "Rezept speichern"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
