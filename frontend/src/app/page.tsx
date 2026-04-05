export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-3">
        <h1 className="font-display text-5xl font-bold text-terra-500">
          Rezeptmeister
        </h1>
        <p className="text-warm-600 text-lg">
          KI-gestützte Rezeptverwaltung für die Schweizer Küche
        </p>
      </div>

      <div
        data-testid="design-tokens"
        className="flex gap-4"
        aria-label="Design-System-Vorschau"
      >
        <div className="w-16 h-16 rounded-xl bg-terra-500" title="Terrakotta" />
        <div className="w-16 h-16 rounded-xl bg-cream-100 border border-warm-200" title="Cremeweis" />
        <div className="w-16 h-16 rounded-xl bg-gold-500" title="Gold" />
      </div>

      <p className="text-sm text-warm-400" data-testid="phase-indicator">
        Phase 1 – Fundament bereit
      </p>
    </main>
  );
}
