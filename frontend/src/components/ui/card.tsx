import * as React from "react";

/* ─── Base Card ─── */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  bordered?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

export function Card({
  elevated = false,
  bordered = true,
  padding = "md",
  className = "",
  children,
  ...props
}: CardProps) {
  const paddingMap = { none: "", sm: "p-4", md: "p-5", lg: "p-7" };
  return (
    <div
      className={[
        "rounded-xl bg-[var(--bg-surface)]",
        bordered ? "border border-[var(--border-base)]" : "",
        elevated ? "shadow-warm" : "",
        paddingMap[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

/* ─── Recipe Card ─── */
interface RecipeCardProps {
  id: string;
  title: string;
  category?: string;
  totalTimeMinutes?: number;
  difficulty?: "einfach" | "mittel" | "anspruchsvoll";
  imageUrl?: string;
  isFavorite?: boolean;
  averageRating?: number;
  servings?: number;
  tags?: string[];
  onClick?: () => void;
  onFavoriteToggle?: (id: string, newState: boolean) => void;
  className?: string;
}

const difficultyLabel: Record<string, { label: string; color: string }> = {
  einfach:      { label: "Einfach",      color: "text-emerald-600 bg-emerald-50" },
  mittel:       { label: "Mittel",       color: "text-gold-700 bg-gold-50" },
  anspruchsvoll:{ label: "Anspruchsvoll",color: "text-terra-600 bg-terra-50" },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Bewertung: ${rating.toFixed(1)} von 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-3 h-3 ${star <= Math.round(rating) ? "text-gold-500" : "text-warm-300"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return filled ? (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ) : (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

function ImagePlaceholder() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-cream-200 via-cream-100 to-warm-100">
      <svg className="w-12 h-12 text-terra-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span className="mt-2 text-xs text-terra-300 font-medium tracking-wide uppercase">
        Kein Bild
      </span>
    </div>
  );
}

export function RecipeCard({
  id,
  title,
  category,
  totalTimeMinutes,
  difficulty,
  imageUrl,
  isFavorite = false,
  averageRating,
  servings,
  onClick,
  onFavoriteToggle,
  className = "",
}: RecipeCardProps) {
  const [favorite, setFavorite] = React.useState(isFavorite);
  const diff = difficulty ? difficultyLabel[difficulty] : null;

  function handleFavoriteClick(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !favorite;
    setFavorite(next);
    onFavoriteToggle?.(id, next);
  }

  function formatTime(minutes: number) {
    if (minutes < 60) return `${minutes} Min.`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h} Std. ${m} Min.` : `${h} Std.`;
  }

  return (
    <article
      className={[
        "group relative flex flex-col overflow-hidden rounded-2xl",
        "bg-[var(--bg-surface)] border border-[var(--border-base)]",
        "transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-warm-lg hover:border-[var(--border-strong)]",
        onClick ? "cursor-pointer" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      aria-label={`Rezept: ${title}`}
    >
      {/* Image area */}
      <div className="relative h-48 overflow-hidden bg-cream-100 shrink-0">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <ImagePlaceholder />
        )}

        {/* Bottom gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />

        {/* Category badge top-left */}
        {category && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/90 backdrop-blur-sm text-terra-600 shadow-warm-xs">
            {category}
          </span>
        )}

        {/* Favorite button top-right */}
        <button
          className={[
            "absolute top-3 right-3",
            "w-8 h-8 rounded-xl flex items-center justify-center",
            "bg-white/90 backdrop-blur-sm shadow-warm-xs",
            "transition-all duration-150",
            "hover:bg-white hover:scale-110",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra-500",
          ].join(" ")}
          onClick={handleFavoriteClick}
          aria-label={favorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
          aria-pressed={favorite}
        >
          <HeartIcon
            filled={favorite}
            className={`w-4 h-4 ${favorite ? "text-terra-500" : "text-warm-400"}`}
          />
        </button>

        {/* Difficulty badge bottom-right (on image) */}
        {diff && (
          <span
            className={`absolute bottom-3 right-3 px-2 py-0.5 rounded-md text-xs font-medium ${diff.color} bg-opacity-90`}
          >
            {diff.label}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2.5 p-4">
        <h3 className="font-display text-base font-semibold leading-snug text-[var(--text-primary)] line-clamp-2 group-hover:text-terra-600 transition-colors duration-150">
          {title}
        </h3>

        {/* Meta row */}
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            {totalTimeMinutes !== undefined && (
              <span className="flex items-center gap-1">
                <ClockIcon className="w-3.5 h-3.5" />
                {formatTime(totalTimeMinutes)}
              </span>
            )}
            {servings !== undefined && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {servings} {servings === 1 ? "Person" : "Personen"}
              </span>
            )}
          </div>

          {averageRating !== undefined && averageRating > 0 && (
            <StarRating rating={averageRating} />
          )}
        </div>
      </div>
    </article>
  );
}