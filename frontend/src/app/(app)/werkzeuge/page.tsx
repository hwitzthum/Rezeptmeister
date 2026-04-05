import { Metadata } from "next";
import UnitConverter from "@/components/werkzeuge/UnitConverter";

export const metadata: Metadata = {
  title: "Werkzeuge | Rezeptmeister",
  description: "Einheitenumrechner für Schweizer Masseinheiten — zutatenbewusst.",
};

export default function WerkzeugePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1
        className="font-playfair text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Einheitenumrechner
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        US-Masseinheiten in Schweizer Einheiten umrechnen — mit zutatenbewusster Konvertierung.
      </p>
      <UnitConverter />
    </div>
  );
}