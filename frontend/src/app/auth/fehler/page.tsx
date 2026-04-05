"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const ERROR_LABELS: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: "Serverfehler",
    description: "Es gibt ein Problem mit der Serverkonfiguration. Bitte wenden Sie sich an den Administrator.",
  },
  AccessDenied: {
    title: "Zugang verweigert",
    description: "Sie haben keine Berechtigung, auf diese Seite zuzugreifen.",
  },
  Verification: {
    title: "Verifizierungslink abgelaufen",
    description: "Der Verifizierungslink ist abgelaufen oder wurde bereits verwendet.",
  },
  Default: {
    title: "Anmeldung fehlgeschlagen",
    description: "Bei der Anmeldung ist ein unbekannter Fehler aufgetreten. Bitte versuchen Sie es erneut.",
  },
};

function FehlerContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error") ?? "Default";
  const { title, description } =
    ERROR_LABELS[errorCode] ?? ERROR_LABELS.Default;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
          <svg
            className="h-10 w-10 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1
          className="text-3xl font-bold text-[var(--text-primary)] mb-3"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>

        <div className="bg-[var(--bg-surface)] rounded-2xl shadow-warm border border-[var(--border-subtle)] p-8 mb-6">
          <p className="text-[var(--text-secondary)] leading-relaxed">{description}</p>
          {errorCode !== "Default" && (
            <p className="mt-3 text-xs text-warm-400 font-mono">
              Fehlercode: {errorCode}
            </p>
          )}
        </div>

        <Link
          href="/auth/anmelden"
          className="inline-flex items-center gap-2 rounded-lg bg-terra-500 px-5 py-2.5 text-sm font-semibold text-white shadow-warm-sm transition-all hover:bg-terra-600"
        >
          Zur Anmeldung
        </Link>
      </div>
    </div>
  );
}

export default function FehlerPage() {
  return (
    <Suspense>
      <FehlerContent />
    </Suspense>
  );
}
