import * as React from "react";
import Link from "next/link";
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./Button";

interface LinkButtonProps
  extends Omit<React.ComponentProps<typeof Link>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  className?: string;
}

/**
 * Ein Link, der aussieht und sich anfuehlt wie ein Button.
 *
 * Ersetzt das Muster `<Link><Button>…</Button></Link>`: ein <button> in einem
 * <a> ist ungueltiges HTML — Screenreader kuendigen zwei verschachtelte
 * interaktive Elemente an, und die Tastaturbedienung wird mehrdeutig. Wer
 * navigiert, braucht einen Link; wer eine Aktion ausloest, einen Button.
 */
export function LinkButton({
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  fullWidth = false,
  className = "",
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {icon && iconPosition === "left" && (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      {children && <span>{children}</span>}
      {icon && iconPosition === "right" && (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
    </Link>
  );
}
