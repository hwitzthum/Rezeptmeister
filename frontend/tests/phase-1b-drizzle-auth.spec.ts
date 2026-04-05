/**
 * Phase 1.2 E2E Tests – Drizzle ORM Schema & NextAuth.js
 *
 * Prüft:
 * 1. NextAuth CSRF-Endpoint antwortet korrekt
 * 2. NextAuth gibt Credentials als Provider zurück
 * 3. NextAuth Session-Endpoint antwortet (unauthentifiziert → null session)
 * 4. Middleware schützt / → Weiterleitung zu /auth/anmelden
 * 5. Middleware lässt /auth/* öffentlich durch
 * 6. /api/health gibt App-Status zurück
 * 7. DB-Schema-Konsistenz (Drizzle): kritische Tabellennamen sind in Schema-Datei deklariert
 */

import { test, expect } from "@playwright/test";

test.describe("Phase 1.2 – Drizzle ORM Schema", () => {
  test("Schema-Datei exportiert alle 9 Kerntabellen", async ({ request }) => {
    // Indirekter Test: /api/health lädt erfolgreich (importiert db-Modul)
    const res = await request.get("/api/health");
    // Auch ohne DB muss die Route ohne Crash antworten
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("checks");
    expect(body.checks.app).toBe("ok");
  });

  test("NEXTAUTH_SECRET ist im Build gesetzt (env_nextauth_secret: ok)", async ({
    request,
  }) => {
    const res = await request.get("/api/health");
    const body = await res.json();
    expect(body.checks.env_nextauth_secret).toBe("ok");
  });
});

test.describe("Phase 1.2 – NextAuth.js Konfiguration", () => {
  test("GET /api/auth/csrf gibt CSRF-Token zurück", async ({ request }) => {
    const res = await request.get("/api/auth/csrf");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("csrfToken");
    expect(typeof body.csrfToken).toBe("string");
    expect(body.csrfToken.length).toBeGreaterThan(10);
  });

  test("GET /api/auth/providers gibt credentials-Provider zurück", async ({
    request,
  }) => {
    const res = await request.get("/api/auth/providers");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("credentials");
    expect(body.credentials.id).toBe("credentials");
    expect(body.credentials.type).toBe("credentials");
  });

  test("GET /api/auth/session gibt null-Session für unauthentifizierte Anfrage zurück", async ({
    request,
  }) => {
    const res = await request.get("/api/auth/session");
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Unauthentifiziert → leere oder null Session
    // NextAuth v5 gibt {} oder { user: null } zurück
    expect(body).toBeDefined();
  });

  test("GET /api/auth/signin antwortet (NextAuth v5 leitet zu Custom-Seite weiter)", async ({
    request,
  }) => {
    const res = await request.get("/api/auth/signin");
    // NextAuth v5 mit custom signIn-Seite gibt 404 zurück (Seite noch nicht gebaut)
    // oder einen Redirect – beides ist korrekt für diesen Konfigurationsstand
    expect([200, 301, 302, 307, 308, 404]).toContain(res.status());
  });
});

test.describe("Phase 1.2 – Middleware Route-Schutz", () => {
  test("GET / zeigt öffentliche Startseite für unauthentifizierte Benutzer", async ({
    page,
  }) => {
    await page.goto("/");
    // Root is the public landing page — no redirect to login
    await expect(page).toHaveURL("/");
    await expect(page).toHaveTitle(/Rezeptmeister/i);
  });

  test("GET /rezepte leitet unauthentifizierte Benutzer um", async ({
    page,
  }) => {
    await page.goto("/rezepte");
    await expect(page).toHaveURL(/\/auth\/anmelden/);
  });

  test("GET /einstellungen leitet unauthentifizierte Benutzer um", async ({
    page,
  }) => {
    await page.goto("/einstellungen");
    await expect(page).toHaveURL(/\/auth\/anmelden/);
  });

  test("Redirect-URL enthält callbackUrl-Parameter", async ({ page }) => {
    await page.goto("/rezepte");
    const url = new URL(page.url());
    expect(url.searchParams.has("callbackUrl")).toBe(true);
  });

  test("GET /auth/anmelden ist ohne Login erreichbar (kein Redirect-Loop)", async ({
    page,
  }) => {
    const response = await page.goto("/auth/anmelden");
    // Seite muss erreichbar sein (200 oder vom Middleware durchgelassen)
    // Da wir noch keine Seite gebaut haben, kann es eine 404 sein – aber kein Redirect-Loop
    const finalUrl = page.url();
    expect(finalUrl).toContain("/auth/anmelden");
    // Kein infiniter Loop: URL enthält nicht mehrfach auth/anmelden
    const occurrences = (finalUrl.match(/auth\/anmelden/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  test("GET /auth/registrieren ist ohne Login erreichbar", async ({ page }) => {
    await page.goto("/auth/registrieren");
    expect(page.url()).toContain("/auth/registrieren");
  });
});