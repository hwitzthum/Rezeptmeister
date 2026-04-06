/**
 * Sicherheitspruefung fuer Umgebungsvariablen.
 * Wird beim Serverstart importiert und prueft kritische Werte.
 * Langfristig besser in instrumentation.ts verschieben.
 */

// Skip checks during `next build` (NEXT_PHASE=phase-production-build).
// The guards only matter at runtime in an actual production deployment.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isProduction = process.env.NODE_ENV === "production" && !isBuildPhase;

if (isProduction && process.env.NEXTAUTH_SECRET?.includes("dev-secret")) {
  throw new Error(
    "NEXTAUTH_SECRET enthaelt 'dev-secret' – in Produktion nicht erlaubt. " +
      "Generieren: openssl rand -base64 48",
  );
}

if (
  isProduction &&
  process.env.ENCRYPTION_KEY &&
  /^0+$/.test(process.env.ENCRYPTION_KEY)
) {
  throw new Error(
    "ENCRYPTION_KEY besteht nur aus Nullen – in Produktion nicht erlaubt. " +
      "Generieren: openssl rand -hex 32",
  );
}

if (isProduction && process.env.DISABLE_RATE_LIMIT === "true") {
  throw new Error("DISABLE_RATE_LIMIT=true ist in Produktion nicht erlaubt.");
}

if (!process.env.INTERNAL_SECRET && !isBuildPhase) {
  console.warn(
    "[env-check] INTERNAL_SECRET ist nicht gesetzt. " +
      "Backend-Anfragen werden fehlschlagen.",
  );
}