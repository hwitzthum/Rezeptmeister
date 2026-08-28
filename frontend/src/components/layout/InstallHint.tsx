"use client";

import { useSyncExternalStore } from "react";
import { ANLEITUNGEN } from "@/lib/pwa/install-hint";
import {
  getInstallServerSnapshot,
  getInstallSnapshot,
  hinweisWegtippen,
  subscribeInstall,
} from "@/lib/pwa/install-store";

/**
 * Weist darauf hin, dass die App auf den Home-Bildschirm gehoert — aber nur,
 * wenn sie dort gerade nicht liegt.
 *
 * Verschwindet das Symbol (iOS entfernt abgelegte Web-Apps beim Loeschen der
 * Websitedaten, und der Home-Bildschirm gleicht sich ueber iCloud ab), landet
 * man im Browser und findet ohne Anleitung nicht zurueck. Die vollstaendige
 * Anleitung steht dauerhaft unter /mehr; dies hier ist der Wegweiser dorthin.
 */
export default function InstallHint() {
  const { hinweisZeigen, plattform } = useSyncExternalStore(
    subscribeInstall,
    getInstallSnapshot,
    getInstallServerSnapshot,
  );

  if (!hinweisZeigen) return null;
  const anleitung = ANLEITUNGEN[plattform];

  return (
    <section
      data-testid="install-hint"
      className="mb-6 rounded-2xl border border-terra-200 bg-terra-50/70 px-4 py-3.5 dark:border-terra-800 dark:bg-terra-950/30"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 shrink-0 text-terra-600 dark:text-terra-400"
          aria-hidden="true"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Rezeptmeister auf den Home-Bildschirm legen
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
            Als eigenes Symbol startet die App ohne Adressleiste und ist beim
            Kochen schneller zur Hand.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-[var(--text-secondary)]">
            {anleitung.schritte.map((schritt) => (
              <li key={schritt}>{schritt.replace(/\*\*/g, "")}</li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          data-testid="install-hint-dismiss"
          onClick={hinweisWegtippen}
          aria-label="Hinweis ausblenden"
          className="min-tap -mr-2 -mt-1 shrink-0 rounded-xl px-2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra-500"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </section>
  );
}
