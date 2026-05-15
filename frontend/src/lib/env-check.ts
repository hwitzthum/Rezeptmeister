/**
 * Sicherheitsprüfung für Umgebungsvariablen.
 * Wird beim Serverstart importiert und prüft kritische Werte.
 * Langfristig besser in instrumentation.ts verschieben.
 */

// Skip checks during `next build` (NEXT_PHASE=phase-production-build).
// The guards only matter at runtime in an actual production deployment.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isProduction = process.env.NODE_ENV === "production" && !isBuildPhase;

// NEXTAUTH_SECRET must be set and sufficiently long (>=32 chars) in all environments.
if (!isBuildPhase && (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 32)) {
  if (isProduction) {
    throw new Error(
      "NEXTAUTH_SECRET ist nicht gesetzt oder zu kurz (< 32 Zeichen). " +
        "Generieren: openssl rand -base64 48",
    );
  } else {
    console.warn(
      "[env-check] NEXTAUTH_SECRET ist nicht gesetzt oder zu kurz. " +
        "Bitte für Produktion setzen: openssl rand -base64 48",
    );
  }
}

if (isProduction && process.env.NEXTAUTH_SECRET?.includes("dev-secret")) {
  throw new Error(
    "NEXTAUTH_SECRET enthält 'dev-secret' – in Produktion nicht erlaubt. " +
      "Generieren: openssl rand -base64 48",
  );
}

// Block known weak/example DB passwords in production
const weakDbPasswords = ["localdev", "password", "postgres", "changeme", "secret", "CHANGE_ME"];
if (isProduction && process.env.DB_PASSWORD && weakDbPasswords.includes(process.env.DB_PASSWORD)) {
  throw new Error(
    `DB_PASSWORD ist ein bekanntes schwaches Passwort ('${process.env.DB_PASSWORD}'). ` +
      "Generieren: openssl rand -hex 16",
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
} else if (
  !isBuildPhase &&
  process.env.INTERNAL_SECRET &&
  process.env.INTERNAL_SECRET.length < 32
) {
  throw new Error(
    "INTERNAL_SECRET muss mindestens 32 Zeichen lang sein. " +
      "Generieren: openssl rand -hex 32",
  );
}
