"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui";
import { Button } from "@/components/ui";
import PrintableRecipe from "./PrintableRecipe";
import type { RecipeDetail } from "./RecipeDetailClient";

interface PrintOptionsModalProps {
  open: boolean;
  onClose: () => void;
  recipe: RecipeDetail;
  targetServings: number;
  originalServings: number;
}

export default function PrintOptionsModal({
  open,
  onClose,
  recipe,
  targetServings: initialServings,
  originalServings,
}: PrintOptionsModalProps) {
  const [includeImage, setIncludeImage] = useState(true);
  const [servings, setServings] = useState(initialServings);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Sync servings when modal opens with new value
  useEffect(() => {
    if (open) setServings(initialServings);
  }, [open, initialServings]);

  const handlePrint = useCallback(() => {
    // Kurze Verzögerung um sicherzustellen, dass PrintableRecipe gerendert ist
    requestAnimationFrame(() => {
      window.print();
    });
  }, []);

  const handlePdfDownload = useCallback(async () => {
    setGeneratingPdf(true);
    try {
      // Dynamic import um Bundle-Grösse zu minimieren
      const { generateRecipePdf } = await import("./RecipePdf");
      const blob = await generateRecipePdf({
        recipe,
        targetServings: servings,
        originalServings,
        includeImage,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${recipe.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF-Generierung fehlgeschlagen:", err);
    } finally {
      setGeneratingPdf(false);
    }
  }, [recipe, servings, originalServings, includeImage]);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Drucken & PDF-Export"
        size="lg"
        footer={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              data-testid="print-action"
            >
              Drucken
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handlePdfDownload()}
              disabled={generatingPdf}
              data-testid="pdf-download"
            >
              {generatingPdf ? "Wird erstellt…" : "Als PDF speichern"}
            </Button>
          </div>
        }
      >
        {/* Optionen */}
        <div className="space-y-4 mb-6">
          {/* Bild-Option */}
          <label className="flex items-center gap-3 cursor-pointer" data-testid="include-image-toggle">
            <input
              type="checkbox"
              checked={includeImage}
              onChange={(e) => setIncludeImage(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border-base)] text-terra-500 focus:ring-terra-500"
            />
            <span className="text-sm text-[var(--text-primary)]">
              Bild einschliessen
            </span>
          </label>

          {/* Portionen */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-secondary)]">
              Portionen:
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setServings((v) => Math.max(1, v - 1))}
                disabled={servings <= 1}
                className="w-7 h-7 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 transition-colors"
                aria-label="Portionen verringern"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span
                className="w-10 text-center text-base font-semibold text-[var(--text-primary)]"
                data-testid="print-servings-display"
              >
                {servings}
              </span>
              <button
                onClick={() => setServings((v) => Math.min(999, v + 1))}
                className="w-7 h-7 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
                aria-label="Portionen erhöhen"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Vorschau */}
        <div className="border border-[var(--border-subtle)] rounded-xl p-4 bg-white text-black max-h-80 overflow-y-auto">
          <PrintableRecipe
            recipe={recipe}
            targetServings={servings}
            includeImage={includeImage}
          />
        </div>
      </Modal>

      {/* Versteckter Druckbereich — via Portal direkt unter <body> gerendert,
           damit body > .print-only im Print-Stylesheet greift */}
      {open &&
        createPortal(
          <div className="hidden print:block print-only" data-testid="print-content">
            <PrintableRecipe
              recipe={recipe}
              targetServings={servings}
              includeImage={includeImage}
            />
          </div>,
          document.body
        )}
    </>
  );
}
