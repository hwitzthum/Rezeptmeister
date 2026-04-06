"use client";

import * as React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  action?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { label, error, hint, icon, iconPosition = "left", action, className = "", id, ...props },
    ref,
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-warm-700 dark:text-warm-300"
          >
            {label}
            {props.required && (
              <span className="ml-1 text-terra-500" aria-label="Pflichtfeld">
                *
              </span>
            )}
          </label>
        )}

        <div className="relative flex items-center">
          {icon && iconPosition === "left" && (
            <span
              className="absolute left-3 flex items-center text-warm-400 pointer-events-none"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
            aria-invalid={!!error}
            className={[
              "w-full bg-[var(--bg-surface)] text-[var(--text-primary)]",
              "border rounded-lg px-3.5 py-2.5 text-sm",
              "placeholder:text-warm-400",
              "transition-all duration-150",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              error
                ? "border-red-400 focus:ring-red-400 focus:border-red-400"
                : "border-[var(--border-base)] focus:ring-terra-500 focus:border-terra-500 hover:border-[var(--border-strong)]",
              icon && iconPosition === "left" ? "pl-10" : "",
              icon && iconPosition === "right" ? "pr-10" : "",
              action ? "pr-20" : "",
              props.disabled ? "opacity-60 cursor-not-allowed bg-[var(--bg-subtle)] dark:bg-warm-800/50" : "",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            {...props}
          />

          {icon && iconPosition === "right" && (
            <span
              className="absolute right-3 flex items-center text-warm-400 pointer-events-none"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}

          {action && (
            <div className="absolute right-2 flex items-center">{action}</div>
          )}
        </div>

        {hint && !error && (
          <p id={hintId} className="text-xs text-warm-500 dark:text-warm-400">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1" role="alert">
            <svg
              className="w-3.5 h-3.5 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";


interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = "", id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-warm-700 dark:text-warm-300">
            {label}
            {props.required && (
              <span className="ml-1 text-terra-500" aria-label="Pflichtfeld">*</span>
            )}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          aria-invalid={!!error}
          className={[
            "w-full bg-[var(--bg-surface)] text-[var(--text-primary)]",
            "border rounded-lg px-3.5 py-2.5 text-sm",
            "placeholder:text-warm-400 resize-y min-h-[120px]",
            "transition-all duration-150",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            error
              ? "border-red-400 focus:ring-red-400"
              : "border-[var(--border-base)] focus:ring-terra-500 focus:border-terra-500 hover:border-[var(--border-strong)]",
            props.disabled ? "opacity-60 cursor-not-allowed" : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
        {hint && !error && <p id={hintId} className="text-xs text-warm-500 dark:text-warm-400">{hint}</p>}
        {error && (
          <p id={errorId} className="text-xs text-red-500 dark:text-red-400" role="alert">{error}</p>
        )}
      </div>
    );
  },
);
Textarea.displayName = "Textarea";


interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, placeholder, className = "", id, children, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-warm-700 dark:text-warm-300">
            {label}
            {props.required && <span className="ml-1 text-terra-500">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            className={[
              "w-full appearance-none bg-[var(--bg-surface)] text-[var(--text-primary)]",
              "border rounded-lg px-3.5 py-2.5 text-sm pr-10",
              "transition-all duration-150 cursor-pointer",
              "focus:outline-none focus:ring-2 focus:ring-offset-0",
              error
                ? "border-red-400 focus:ring-red-400"
                : "border-[var(--border-base)] focus:ring-terra-500 focus:border-terra-500",
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {children}
          </select>
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-warm-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>
        {hint && !error && <p className="text-xs text-warm-500 dark:text-warm-400">{hint}</p>}
        {error && <p className="text-xs text-red-500 dark:text-red-400" role="alert">{error}</p>}
      </div>
    );
  },
);
Select.displayName = "Select";