import * as React from "react";
import Link from "next/link";

/**
 * Gleichbreite Aktionskacheln — Icon oben, Beschriftung darunter.
 *
 * Fuer die wenigen Haupteinstiege einer Seite (Dashboard-Schnellaktionen).
 * Alle Kacheln teilen sich die Breite exakt, auf dem Handy wie auf dem
 * Desktop; nichts bricht ungleichmaessig um.
 */
export function ActionGrid({
  children,
  className = "",
  "data-testid": testId,
}: {
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={[
        "grid grid-cols-3 gap-2 sm:gap-3",
        "auto-rows-fr",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

type ActionTileTone = "primary" | "neutral";

interface ActionTileBaseProps {
  icon: React.ReactNode;
  label: string;
  /** Zweite Zeile auf breiteren Schirmen — auf dem Handy ausgeblendet. */
  hint?: string;
  tone?: ActionTileTone;
  "data-testid"?: string;
}

type ActionTileProps = ActionTileBaseProps &
  ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

const toneStyles: Record<ActionTileTone, string> = {
  primary: [
    "bg-terra-500 text-cream-100 border-terra-500 shadow-warm-sm",
    "hover:bg-terra-600 hover:border-terra-600 hover:shadow-warm",
    "active:bg-terra-700",
    "dark:bg-terra-600 dark:border-terra-600 dark:hover:bg-terra-500",
  ].join(" "),
  neutral: [
    "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-base)]",
    "hover:border-terra-300 hover:bg-terra-50/60 hover:shadow-warm-sm",
    "active:bg-terra-100/60",
    "dark:hover:bg-terra-950/30 dark:hover:border-terra-700 dark:active:bg-terra-900/40",
  ].join(" "),
};

function tileClasses(tone: ActionTileTone) {
  return [
    "min-tap flex flex-col items-center justify-center gap-1.5",
    "rounded-2xl border px-2 py-3 sm:px-4 sm:py-4",
    "text-center transition-all duration-150 cursor-pointer select-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-warm-900",
    toneStyles[tone],
  ].join(" ");
}

function TileContent({
  icon,
  label,
  hint,
  tone,
}: Pick<ActionTileBaseProps, "icon" | "label" | "hint"> & {
  tone: ActionTileTone;
}) {
  return (
    <>
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="text-xs sm:text-sm font-medium leading-tight">
        {label}
      </span>
      {hint && (
        <span
          className={[
            "hidden sm:block text-[11px] leading-tight",
            tone === "primary" ? "text-cream-100/80" : "text-[var(--text-muted)]",
          ].join(" ")}
        >
          {hint}
        </span>
      )}
    </>
  );
}

/**
 * Eine Kachel — als Link, wenn sie navigiert, sonst als Button.
 *
 * Die Unterscheidung ist keine Formsache: ein Link laesst sich in einem neuen
 * Tab oeffnen und wird als Ziel angekuendigt, ein Button als Aktion.
 */
export function ActionTile({
  icon,
  label,
  hint,
  tone = "neutral",
  href,
  onClick,
  "data-testid": testId,
}: ActionTileProps) {
  if (href) {
    return (
      <Link href={href} className={tileClasses(tone)} data-testid={testId}>
        <TileContent icon={icon} label={label} hint={hint} tone={tone} />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={tileClasses(tone)}
      data-testid={testId}
    >
      <TileContent icon={icon} label={label} hint={hint} tone={tone} />
    </button>
  );
}
