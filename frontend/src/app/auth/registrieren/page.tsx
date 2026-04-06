"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface FormState {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
}

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  passwordConfirm?: string;
}

function validateForm(data: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (data.name.trim().length < 2) errors.name = "Name muss mindestens 2 Zeichen haben.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = "Ungültige E-Mail-Adresse.";
  if (data.password.length < 8) errors.password = "Passwort muss mindestens 8 Zeichen haben.";
  if (data.password !== data.passwordConfirm) errors.passwordConfirm = "Passwörter stimmen nicht überein.";
  return errors;
}

export default function RegistrierenPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    const errors = validateForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.toLowerCase().trim(),
          password: form.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error ?? "Registrierung fehlgeschlagen.");
        return;
      }

      router.push("/auth/warten");
    } catch {
      setServerError("Netzwerkfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border bg-[var(--bg-surface)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-terra-500 hover:border-[var(--border-strong)] transition-all";

  const errorBorder = "border-red-400 focus:ring-red-400";
  const normalBorder = "border-[var(--border-base)] focus:border-terra-500";

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1
            className="font-display text-4xl font-bold text-terra-500 mb-1"
          >
            Rezeptmeister
          </h1>
          <p className="text-warm-500 dark:text-warm-400 text-sm">Schweizer Küchenintelligenz</p>
        </div>

        <div className="bg-[var(--bg-surface)] rounded-2xl shadow-warm-lg border border-[var(--border-subtle)] p-8">
          <h2
            className="text-2xl font-semibold text-[var(--text-primary)] mb-2"
          >
            Konto erstellen
          </h2>
          <p className="text-sm text-warm-500 dark:text-warm-400 mb-6">
            Nach der Registrierung wird Ihr Konto von einem Administrator freigegeben.
          </p>

          {serverError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium text-warm-700 dark:text-warm-300">
                Name <span className="text-terra-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Ihr vollständiger Name"
                className={`${inputClass} ${fieldErrors.name ? errorBorder : normalBorder}`}
                disabled={loading}
              />
              {fieldErrors.name && (
                <p className="text-xs text-red-500" role="alert">{fieldErrors.name}</p>
              )}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reg-email" className="text-sm font-medium text-warm-700 dark:text-warm-300">
                E-Mail-Adresse <span className="text-terra-500">*</span>
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="name@beispiel.ch"
                className={`${inputClass} ${fieldErrors.email ? errorBorder : normalBorder}`}
                disabled={loading}
              />
              {fieldErrors.email && (
                <p className="text-xs text-red-500" role="alert">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reg-password" className="text-sm font-medium text-warm-700 dark:text-warm-300">
                Passwort <span className="text-terra-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                  className={`${inputClass} pr-11 ${fieldErrors.password ? errorBorder : normalBorder}`}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 dark:hover:text-warm-300 transition-colors"
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
              {fieldErrors.password && (
                <p className="text-xs text-red-500" role="alert">{fieldErrors.password}</p>
              )}
            </div>

            {/* Password confirm */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password-confirm" className="text-sm font-medium text-warm-700 dark:text-warm-300">
                Passwort bestätigen <span className="text-terra-500">*</span>
              </label>
              <input
                id="password-confirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={form.passwordConfirm}
                onChange={(e) => update("passwordConfirm", e.target.value)}
                placeholder="Passwort wiederholen"
                className={`${inputClass} ${fieldErrors.passwordConfirm ? errorBorder : normalBorder}`}
                disabled={loading}
              />
              {fieldErrors.passwordConfirm && (
                <p className="text-xs text-red-500" role="alert">{fieldErrors.passwordConfirm}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-terra-500 px-4 py-2.5 text-sm font-semibold text-white shadow-warm-sm transition-all hover:bg-terra-600 active:bg-terra-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Wird registriert…
                </span>
              ) : (
                "Konto erstellen"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-warm-500 dark:text-warm-400">
            Bereits ein Konto?{" "}
            <Link
              href="/auth/anmelden"
              className="font-medium text-terra-500 hover:text-terra-600 hover:underline"
            >
              Anmelden
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
