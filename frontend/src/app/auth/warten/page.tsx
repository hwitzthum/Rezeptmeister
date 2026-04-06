import Link from "next/link";

export const metadata = {
  title: "Registrierung wird geprüft",
};

export default function WartenPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gold-500/10">
          <svg
            className="h-10 w-10 text-gold-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
            />
          </svg>
        </div>

        <h1
          className="text-3xl font-bold text-[var(--text-primary)] mb-3"
        >
          Registrierung wird geprüft
        </h1>

        <div className="bg-[var(--bg-surface)] rounded-2xl shadow-warm border border-[var(--border-subtle)] p-8 mb-6 text-left space-y-4">
          <p className="text-[var(--text-secondary)] leading-relaxed">
            Vielen Dank für Ihre Registrierung! Ihre Anfrage wird von einem Administrator
            geprüft und freigegeben.
          </p>
          <p className="text-[var(--text-secondary)] leading-relaxed">
            Sie erhalten keine automatische Benachrichtigung — bitte versuchen Sie sich
            nach einiger Zeit anzumelden.
          </p>

          <div className="flex items-start gap-3 rounded-lg bg-gold-500/10 border border-gold-500/20 px-4 py-3">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-gold-700"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-warm-700 dark:text-warm-300">
              Solange Ihr Konto noch nicht freigegeben ist, können Sie sich nicht anmelden.
            </p>
          </div>
        </div>

        <Link
          href="/auth/anmelden"
          className="inline-flex items-center gap-2 rounded-lg border border-terra-400 px-5 py-2.5 text-sm font-medium text-terra-500 transition-all hover:bg-terra-50 dark:hover:bg-terra-950/30 hover:border-terra-500"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Zur Anmeldeseite
        </Link>
      </div>
    </div>
  );
}
