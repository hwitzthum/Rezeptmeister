import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ApiKeyForm from "@/components/settings/ApiKeyForm";
import BackupPanel from "@/components/settings/BackupPanel";
import ThemeToggle from "@/components/layout/ThemeToggle";
import { PageHeader } from "@/components/ui";

export const metadata = {
  title: "Einstellungen",
};

export default async function EinstellungenPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/anmelden?callbackUrl=/einstellungen");
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Kopfzeile wie auf jeder anderen Seite der App-Gruppe. Die eigene
          Leiste mit Wortmarke entfiel beim Umzug hierher: die Navigation
          kommt jetzt vom gemeinsamen Layout (Sidebar ab md, Tab-Leiste
          darunter), zwei gestapelte Kopfzeilen waeren die Folge gewesen. */}
      <PageHeader
        subtitle="Konto"
        title="Einstellungen"
        description={session.user.email ?? undefined}
        sticky={false}
      />

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* API Key section */}
        <section className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm overflow-hidden">
          <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              KI-API-Schlüssel
            </h2>
            <p className="mt-1 text-sm text-warm-500 dark:text-warm-400">
              Hinterlegen Sie Ihren eigenen API-Schlüssel (BYOK). Er wird
              verschlüsselt gespeichert und nie im Klartext übertragen.
            </p>
          </div>
          <div className="px-6 py-6">
            <ApiKeyForm />
          </div>
        </section>

        {/* Darstellung */}
        <div className="mt-6 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-base)] p-6">
          <h2 className="font-display text-xl font-bold mb-4">Darstellung</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Wähle dein bevorzugtes Farbschema
          </p>
          <ThemeToggle />
        </div>

        {/* Daten & Backup */}
        <section className="mt-6 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm overflow-hidden">
          <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Daten &amp; Backup
            </h2>
            <p className="mt-1 text-sm text-warm-500 dark:text-warm-400">
              Ihre Daten gehören Ihnen: als JSON sichern und jederzeit wieder
              einspielen.
            </p>
          </div>
          <div className="px-6 py-6">
            <BackupPanel />
          </div>
        </section>

        {/* Account section */}
        <section className="mt-6 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm overflow-hidden">
          <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Konto
            </h2>
          </div>
          <div className="px-6 py-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-warm-600 dark:text-warm-400">Name</span>
              <span className="font-medium text-[var(--text-primary)]">
                {session.user.name ?? (
                  <span className="italic text-warm-400 dark:text-warm-500">
                    Nicht angegeben
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-warm-600 dark:text-warm-400">E-Mail</span>
              <span className="font-medium text-[var(--text-primary)]">
                {session.user.email}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-warm-600 dark:text-warm-400">Rolle</span>
              <span className="font-medium text-[var(--text-primary)]">
                {session.user.role === "admin" ? "Administrator" : "Benutzer"}
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
