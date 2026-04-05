"use client";

import { useState, useEffect } from "react";

type Provider = "gemini" | "openai" | "claude";

const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  claude: "Anthropic Claude",
};

export default function ApiKeyForm() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [masked, setMasked] = useState<string | null>(null);
  const [currentProvider, setCurrentProvider] = useState<Provider | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<Provider>("gemini");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/settings/api-key");
        if (res.ok) {
          const data = await res.json();
          setHasKey(data.hasKey);
          setMasked(data.masked);
          setCurrentProvider(data.provider);
        }
      } catch {
        // Silent — will show "kein Schlüssel" state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (apiKey.length < 10) {
      setError("API-Schlüssel zu kurz (mindestens 10 Zeichen).");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, provider }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Fehler beim Speichern.");
        return;
      }
      setHasKey(true);
      setMasked(data.masked);
      setCurrentProvider(provider);
      setApiKey("");
      setSuccess("API-Schlüssel gespeichert.");
      setTimeout(() => setSuccess(null), 3_000);
    } catch {
      setError("Netzwerkfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/settings/api-key", { method: "DELETE" });
      if (res.ok) {
        setHasKey(false);
        setMasked(null);
        setCurrentProvider(null);
        setSuccess("API-Schlüssel entfernt.");
        setTimeout(() => setSuccess(null), 3_000);
      }
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="h-24 flex items-center text-sm text-warm-400">Wird geladen…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Current key status */}
      {hasKey ? (
        <div className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <svg className="h-4 w-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-green-800">
                {currentProvider ? PROVIDER_LABELS[currentProvider] : "API-Schlüssel"} gespeichert
              </p>
              <p className="text-xs text-green-700 font-mono mt-0.5">{masked}</p>
            </div>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-red-600 hover:text-red-700 font-medium hover:underline disabled:opacity-50"
          >
            {deleting ? "Wird entfernt…" : "Entfernen"}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-lg bg-warm-100 border border-warm-200 px-4 py-3">
          <svg className="h-4 w-4 text-warm-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-warm-700">
            Kein API-Schlüssel gespeichert.{" "}
            <span className="text-terra-600 font-medium">KI-Funktionen sind deaktiviert.</span>
          </p>
        </div>
      )}

      {/* Form to update */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Provider */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="provider" className="text-sm font-medium text-warm-700">
              Anbieter
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="w-full appearance-none rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-terra-500"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Anthropic Claude</option>
            </select>
          </div>

          {/* Key input */}
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label htmlFor="api-key" className="text-sm font-medium text-warm-700">
              {hasKey ? "Neuen API-Schlüssel eingeben" : "API-Schlüssel"}{" "}
              <span className="text-terra-500">*</span>
            </label>
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? "Aktuellen Schlüssel ersetzen…" : "sk-..."}
              className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-warm-400 focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-terra-500"
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1.5" role="alert">
            <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}

        {success && (
          <p className="text-xs text-green-600 flex items-center gap-1.5" role="status">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !apiKey}
          className="rounded-lg bg-terra-500 px-4 py-2.5 text-sm font-semibold text-white shadow-warm-sm transition-all hover:bg-terra-600 active:bg-terra-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Wird gespeichert…" : hasKey ? "Schlüssel ersetzen" : "Schlüssel speichern"}
        </button>
      </form>

      <p className="text-xs text-warm-400 mt-2">
        Ihr API-Schlüssel wird mit AES-256-GCM verschlüsselt und nie im Klartext gespeichert oder
        übertragen.
      </p>
    </div>
  );
}
