"use client";

import * as React from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "gold";
type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    "bg-terra-500 text-cream-100 border border-terra-500",
    "hover:bg-terra-600 hover:border-terra-600",
    "active:bg-terra-700",
    "shadow-warm-sm hover:shadow-warm",
    "disabled:bg-terra-300 disabled:border-terra-300 disabled:cursor-not-allowed",
    "dark:bg-terra-600 dark:border-terra-600 dark:hover:bg-terra-500 dark:hover:border-terra-500 dark:active:bg-terra-400",
    "dark:disabled:bg-terra-800 dark:disabled:border-terra-800",
  ].join(" "),

  secondary: [
    "bg-warm-100 text-warm-800 border border-warm-200",
    "hover:bg-warm-200 hover:border-warm-300",
    "active:bg-warm-300",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "dark:bg-warm-800 dark:text-warm-200 dark:border-warm-700",
    "dark:hover:bg-warm-700 dark:hover:border-warm-600 dark:active:bg-warm-600",
  ].join(" "),

  outline: [
    "bg-transparent text-terra-500 border border-terra-400",
    "hover:bg-terra-50 hover:border-terra-500",
    "active:bg-terra-100",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "dark:text-terra-400 dark:border-terra-600",
    "dark:hover:bg-terra-950/30 dark:hover:border-terra-500 dark:active:bg-terra-900/40",
  ].join(" "),

  ghost: [
    "bg-transparent text-warm-700 border border-transparent",
    "hover:bg-warm-100 hover:text-warm-900",
    "active:bg-warm-200",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "dark:text-warm-300 dark:hover:bg-warm-800 dark:hover:text-warm-100 dark:active:bg-warm-700",
  ].join(" "),

  danger: [
    "bg-red-600 text-white border border-red-600",
    "hover:bg-red-700 hover:border-red-700",
    "active:bg-red-800",
    "shadow-warm-sm hover:shadow-warm",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "dark:bg-red-700 dark:border-red-700 dark:hover:bg-red-600 dark:hover:border-red-600 dark:active:bg-red-500",
  ].join(" "),

  gold: [
    "bg-gold-500 text-warm-900 border border-gold-500",
    "hover:bg-gold-600 hover:border-gold-600",
    "active:bg-gold-700",
    "shadow-warm-sm hover:shadow-warm",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "dark:bg-gold-600 dark:border-gold-600 dark:hover:bg-gold-500 dark:hover:border-gold-500 dark:active:bg-gold-400",
  ].join(" "),
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "px-2.5 py-1 text-xs gap-1.5 rounded-md",
  sm: "px-3.5 py-1.5 text-sm gap-2 rounded-lg",
  md: "px-5 py-2.5 text-sm gap-2 rounded-lg",
  lg: "px-7 py-3.5 text-base gap-2.5 rounded-xl",
};

function Spinner({ size = "sm" }: { size?: "xs" | "sm" | "md" }) {
  const sizeMap = { xs: "w-3 h-3", sm: "w-4 h-4", md: "w-5 h-5" };
  return (
    <svg
      className={`animate-spin shrink-0 ${sizeMap[size]}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      iconPosition = "left",
      fullWidth = false,
      disabled,
      children,
      className = "",
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          "inline-flex items-center justify-center font-medium",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-warm-900",
          "select-none cursor-pointer",
          variantStyles[variant],
          sizeStyles[size],
          fullWidth ? "w-full" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <Spinner size={size === "lg" ? "md" : size === "xs" ? "xs" : "sm"} />
        ) : (
          icon && iconPosition === "left" && (
            <span className="shrink-0" aria-hidden="true">
              {icon}
            </span>
          )
        )}

        {children && <span className={loading ? "opacity-70" : ""}>{children}</span>}

        {!loading && icon && iconPosition === "right" && (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
      </button>
    );
  },
);
Button.displayName = "Button";

export { type ButtonProps, type ButtonVariant, type ButtonSize };
