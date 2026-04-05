"use client";

import * as React from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  className?: string;
}

const sizeStyles = {
  sm:   "max-w-sm",
  md:   "max-w-md",
  lg:   "max-w-lg",
  xl:   "max-w-2xl",
  full: "max-w-[95vw] max-h-[95dvh]",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  closeOnBackdrop = true,
  className = "",
}: ModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);
  const [visible, setVisible] = React.useState(false);

  // Hydration guard
  React.useEffect(() => setMounted(true), []);

  // Animate in/out
  React.useEffect(() => {
    if (open) {
      setVisible(true);
    } else {
      const t = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Lock body scroll
  React.useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Trap focus
  React.useEffect(() => {
    if (!open || !dialogRef.current) return;
    const el = dialogRef.current;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "Tab") {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!mounted || !visible) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      aria-describedby={description ? "modal-description" : undefined}
      className={[
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        open ? "animate-fade-in" : "opacity-0",
      ].join(" ")}
    >
      {/* Backdrop */}
      <div
        className={[
          "absolute inset-0 bg-warm-900/40 backdrop-blur-[2px]",
          "transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        ].join(" ")}
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Panel */}
      <div
        ref={dialogRef}
        className={[
          "relative w-full bg-[var(--bg-surface)]",
          "border border-[var(--border-base)]",
          "rounded-2xl shadow-warm-xl",
          "flex flex-col max-h-[90dvh]",
          "transition-all duration-200",
          open ? "animate-scale-in" : "scale-95 opacity-0",
          sizeStyles[size],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-base)] shrink-0">
            <div>
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-semibold text-[var(--text-primary)] font-display"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-description" className="mt-1 text-sm text-[var(--text-muted)]">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-warm-400 hover:text-warm-700 hover:bg-warm-100 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra-500"
              aria-label="Schliessen"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-base)] bg-[var(--bg-subtle)] rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ─── Confirm Dialog ─── */
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Bestätigen",
  cancelLabel = "Abbrechen",
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  const iconColor = variant === "danger" ? "text-red-500" : variant === "warning" ? "text-gold-500" : "text-blue-500";
  const iconBg    = variant === "danger" ? "bg-red-50"   : variant === "warning" ? "bg-gold-50"   : "bg-blue-50";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-warm-700 hover:text-warm-900 hover:bg-warm-100 rounded-lg transition-all duration-150"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={[
              "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              variant === "danger"
                ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
                : variant === "warning"
                ? "bg-gold-500 text-warm-900 hover:bg-gold-600 focus-visible:ring-gold-500"
                : "bg-terra-500 text-cream-100 hover:bg-terra-600 focus-visible:ring-terra-500",
              loading ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {loading ? "Bitte warten…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          <svg className={`w-5 h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={variant === "danger"
                ? "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                : "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"}
            />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] font-display">{title}</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{message}</p>
        </div>
      </div>
    </Modal>
  );
}