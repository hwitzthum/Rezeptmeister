"use client";

import { useSyncExternalStore } from "react";
import { ChevronRight, Smartphone } from "lucide-react";
import { ANLEITUNGEN } from "@/lib/pwa/install-hint";
import {
  getInstallServerSnapshot,
  getInstallSnapshot,
  subscribeInstall,
} from "@/lib/pwa/install-store";

/**
 * Dauerhafte Anleitung, wie die App auf den Home-Bildschirm kommt.
 *
 * Anders als der Hinweis auf dem Dashboard laesst sich das hier nicht
 * wegtippen und steht auch dann bereit, wenn die App schon installiert ist —
 * genau dann braucht man sie naemlich, wenn das Symbol spaeter einmal
 * verschwindet und man vom Browser aus zurueckfindet.
 */
export default function InstallGuide() {
  const { installiert, plattform } = useSyncExternalStore(
    subscribeInstall,
    getInstallSnapshot,
    getInstallServerSnapshot,
  );

  const anleitung = ANLEITUNGEN[plattform];

  return (
    <details
      data-testid="mehr-install-guide"
      className="group rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] overflow-hidden"
    >
      <summary className="min-tap flex items-center gap-3 px-4 py-3 text-sm font-medium text-[var(--text-secondary)] cursor-pointer list-none transition-colors duration-150 hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]">
        <Smartphone className="w-5 h-5 shrink-0 text-warm-500 dark:text-warm-400" aria-hidden="true" />
        <span className="min-w-0">{anleitung.titel}</span>
        {installiert && (
          <span
            data-testid="install-guide-status"
            className="ml-auto shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400"
          >
            Bereits abgelegt
          </span>
        )}
        <ChevronRight
          className={[
            "w-4 h-4 shrink-0 text-[var(--text-muted)] transition-transform duration-150 group-open:rotate-90",
            installiert ? "ml-2" : "ml-auto",
          ].join(" ")}
          aria-hidden="true"
        />
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-[var(--border-subtle)]">
        <ol className="mt-3 space-y-2 list-decimal list-inside text-sm text-[var(--text-secondary)] marker:text-terra-500 marker:font-semibold">
          {anleitung.schritte.map((schritt) => (
            <li key={schritt}>{schritt.replace(/\*\*/g, "")}</li>
          ))}
        </ol>
        {anleitung.hinweis && (
          <p className="mt-3 rounded-xl bg-[var(--bg-subtle)] px-3 py-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {anleitung.hinweis}
          </p>
        )}
      </div>
    </details>
  );
}
