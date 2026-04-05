import * as React from "react";

type BadgeVariant =
  | "terra"
  | "gold"
  | "green"
  | "warm"
  | "blue"
  | "red"
  | "outline"
  | "source";

type BadgeSize = "sm" | "md";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
}

const variantStyles: Record<BadgeVariant, string> = {
  terra:   "bg-terra-50 text-terra-700 border border-terra-200",
  gold:    "bg-gold-50 text-gold-700 border border-gold-200",
  green:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warm:    "bg-warm-100 text-warm-700 border border-warm-200",
  blue:    "bg-blue-50 text-blue-700 border border-blue-200",
  red:     "bg-red-50 text-red-700 border border-red-200",
  outline: "bg-transparent text-[var(--text-secondary)] border border-[var(--border-base)]",
  source:  "bg-warm-100 text-warm-600 border border-warm-200",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs gap-1",
  md: "px-2.5 py-1 text-sm gap-1.5",
};

export function Badge({
  variant = "warm",
  size = "sm",
  dot = false,
  removable = false,
  onRemove,
  className = "",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center font-medium rounded-lg select-none",
        variantStyles[variant],
        sizeStyles[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {dot && (
        <span
          className={[
            "shrink-0 rounded-full",
            size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2",
            variant === "terra" ? "bg-terra-500"
              : variant === "gold" ? "bg-gold-500"
              : variant === "green" ? "bg-emerald-500"
              : variant === "blue" ? "bg-blue-500"
              : variant === "red" ? "bg-red-500"
              : "bg-warm-500",
          ].join(" ")}
          aria-hidden="true"
        />
      )}
      {children}
      {removable && (
        <button
          type="button"
          className="ml-0.5 -mr-0.5 rounded hover:bg-black/10 transition-colors p-0.5"
          onClick={onRemove}
          aria-label="Entfernen"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

/* ─── Difficulty Badge ─── */
const difficultyConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  einfach:       { label: "Einfach",       variant: "green" },
  mittel:        { label: "Mittel",        variant: "gold" },
  anspruchsvoll: { label: "Anspruchsvoll", variant: "terra" },
};

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const config = difficultyConfig[difficulty] ?? { label: difficulty, variant: "warm" as BadgeVariant };
  return <Badge variant={config.variant} dot>{config.label}</Badge>;
}

/* ─── Source Type Badge ─── */
const sourceConfig: Record<string, string> = {
  manual:       "Manuell",
  image_ocr:    "Aus Bild",
  url_import:   "Importiert",
  ai_generated: "KI-generiert",
  web_search:   "Web-Suche",
};

export function SourceBadge({ sourceType }: { sourceType: string }) {
  const label = sourceConfig[sourceType] ?? sourceType;
  const isAi = sourceType === "ai_generated";
  return (
    <Badge variant={isAi ? "terra" : "source"} size="sm">
      {isAi && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )}
      {label}
    </Badge>
  );
}
