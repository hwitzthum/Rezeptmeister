import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ApiKeyForm from "@/components/settings/ApiKeyForm";
import ThemeToggle from "@/components/layout/ThemeToggle";
import Link from "next/link";

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
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-xl font-bold text-terra-500"
          >
            Rezeptmeister
          </Link>
          <span className="text-sm text-warm-500 dark:text-warm-400 hidden sm:block">
            {session.user.email}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1
          className="text-3xl font-bold text-[var(--text-primary)] mb-8"
        >
          Einstellungen
        </h1>

        {/* API Key section */}
        <section className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm overflow-hidden">
          <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
            <h2
              className="text-lg font-semibold text-[var(--text-primary)]"
            >
              KI-API-Schlüssel
            </h2>
            <p className="mt-1 text-sm text-warm-500 dark:text-warm-400">
              Hinterlegen Sie Ihren eigenen API-Schlüssel (BYOK). Er wird verschlüsselt gespeichert und
              nie im Klartext übertragen.
            </p>
          </div>
          <div className="px-6 py-6">
            <ApiKeyForm />
          </div>
        </section>

        {/* Darstellung */}
        <div className="mt-6 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-base)] p-6">
          <h2 className="font-display text-xl font-bold mb-4">Darstellung</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Wähle dein bevorzugtes Farbschema</p>
          <ThemeToggle />
        </div>

        {/* Account section */}
        <section className="mt-6 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm overflow-hidden">
          <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
            <h2
              className="text-lg font-semibold text-[var(--text-primary)]"
            >
              Konto
            </h2>
          </div>
          <div className="px-6 py-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-warm-600 dark:text-warm-400">Name</span>
              <span className="font-medium text-[var(--text-primary)]">
                {session.user.name ?? <span className="italic text-warm-400 dark:text-warm-500">Nicht angegeben</span>}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-warm-600 dark:text-warm-400">E-Mail</span>
              <span className="font-medium text-[var(--text-primary)]">{session.user.email}</span>
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
