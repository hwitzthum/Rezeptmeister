"use client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* Branded error illustration */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-terra-50 dark:bg-terra-950/30 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-terra-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          Etwas ist schiefgelaufen
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
          {error.message ||
            "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut."}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-terra-500 text-white hover:bg-terra-600 transition-colors duration-150 shadow-sm"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
            />
          </svg>
          Neu laden
        </button>
      </div>
    </div>
  );
}
