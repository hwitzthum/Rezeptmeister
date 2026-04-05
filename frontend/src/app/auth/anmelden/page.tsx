"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Ungültige E-Mail oder Passwort.",
  Configuration: "Serverfehler. Bitte versuchen Sie es später erneut.",
  AccessDenied: "Zugang verweigert.",
  Verification: "Verifizierungslink abgelaufen.",
  Default: "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get("callbackUrl") ?? "/";
  // Reject external redirects: only allow same-origin relative paths
  const callbackUrl =
    rawCallbackUrl.startsWith("/") && !rawCallbackUrl.startsWith("//")
      ? rawCallbackUrl
      : "/";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? (ERROR_MESSAGES[urlError] ?? ERROR_MESSAGES.Default) : null,
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email: email.toLowerCase().trim(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.Default);
      return;
    }

    if (result?.ok) {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Heading */}
        <div className="text-center mb-8">
          <h1
            className="font-display text-4xl font-bold text-terra-500 mb-1"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Rezeptmeister
          </h1>
          <p className="text-warm-500 text-sm">
            Schweizer Küchenintelligenz
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-surface)] rounded-2xl shadow-warm-lg border border-[var(--border-subtle)] p-8">
          <h2
            className="text-2xl font-semibold text-[var(--text-primary)] mb-6"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Anmelden
          </h2>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              <svg
                className="mt-0.5 h-4 w-4 shrink-0"
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
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-warm-700"
              >
                E-Mail-Adresse{" "}
                <span className="text-terra-500" aria-label="Pflichtfeld">
                  *
                </span>
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beispiel.ch"
                className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-warm-400 focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-terra-500 hover:border-[var(--border-strong)] transition-all"
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-warm-700"
              >
                Passwort{" "}
                <span className="text-terra-500" aria-label="Pflichtfeld">
                  *
                </span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] px-3.5 py-2.5 pr-11 text-sm text-[var(--text-primary)] placeholder:text-warm-400 focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-terra-500 hover:border-[var(--border-strong)] transition-all"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 transition-colors"
                  aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"}
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="mt-2 w-full rounded-lg bg-terra-500 px-4 py-2.5 text-sm font-semibold text-white shadow-warm-sm transition-all hover:bg-terra-600 active:bg-terra-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Wird angemeldet…
                </span>
              ) : (
                "Anmelden"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-warm-500">
            Noch kein Konto?{" "}
            <Link
              href="/auth/registrieren"
              className="font-medium text-terra-500 hover:text-terra-600 hover:underline"
            >
              Jetzt registrieren
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AnmeldenPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
