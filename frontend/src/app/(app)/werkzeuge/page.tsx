import { Metadata } from "next";
import UnitConverter from "@/components/werkzeuge/UnitConverter";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Werkzeuge | Rezeptmeister",
  description: "Einheitenumrechner für Schweizer Masseinheiten — zutatenbewusst.",
};

export default function WerkzeugePage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <PageHeader
        subtitle="Werkzeuge"
        title="Einheitenumrechner"
        description="US-Masseinheiten in Schweizer Einheiten umrechnen — mit zutatenbewusster Konvertierung."
        sticky={false}
      />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <UnitConverter />
      </div>
    </div>
  );
}