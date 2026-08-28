import * as React from "react";

interface ActionBarProps {
  children: React.ReactNode;
  /** Zusaetzliche Klassen fuer Abstaende der umgebenden Seite. */
  className?: string;
  /**
   * Spalten auf dem Handy. Vorgabe 2 — bei drei ungleich breiten Aktionen
   * sonst wieder ein haengender Button in der zweiten Zeile.
   */
  mobileColumns?: 1 | 2 | 3;
}

const mobileGrid: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

/**
 * Aktionsreihe, deren Eintraege auf dem Handy gleich breit sind.
 *
 * `flex flex-wrap` laesst unterschiedlich breite Buttons ungleichmaessig
 * umbrechen — auf schmalen Geraeten steht dann zwei nebeneinander und einer
 * darunter, was unfertig aussieht. Auf dem Handy sorgt ein Raster fuer
 * gleiche Breiten, ab `sm` uebernimmt wieder der natuerliche Fluss.
 *
 * Die Kinder erhalten `w-full`, damit sie ihre Rasterzelle ausfuellen; dafuer
 * genuegt eine Klasse am Container statt einer Prop an jedem Button.
 */
export function ActionBar({
  children,
  className = "",
  mobileColumns = 2,
}: ActionBarProps) {
  return (
    <div
      className={[
        "grid gap-2",
        mobileGrid[mobileColumns],
        "sm:flex sm:flex-wrap sm:items-center",
        "[&>*]:w-full sm:[&>*]:w-auto",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
