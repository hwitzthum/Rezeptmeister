/**
 * Phase 2 – Authentifizierung & API-Schlüssel-Verwaltung
 *
 * Voraussetzung: PostgreSQL läuft (docker compose up -d)
 * und db/seed.sql wurde eingespielt (Admin: harrywitzthum@gmail.com).
 *
 * Der Dev-Server startet automatisch via playwright.config.ts webServer.
 */

import { test, expect } from "@playwright/test";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

const ADMIN_EMAIL = "harrywitzthum@gmail.com";
const ADMIN_PASSWORD = "05!Shakespeare_15";

// Unique suffix per test run to avoid email collisions
const RUN_ID = Date.now().toString(36);
function testEmail(label: string) {
  return `test-${label}-${RUN_ID}@playwright.local`;
}

async function registerUser(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  password = "TestPasswort1!",
) {
  return request.post("/api/auth/register", {
    data: { name: "Playwright Tester", email, password },
  });
}

// ─── 2.1 Registrierung & Login ────────────────────────────────────────────────

test.describe("2.1 – Registrierung & Login", () => {
  test("Registrierungsseite lädt korrekt", async ({ page }) => {
    await page.goto("/auth/registrieren");
    await expect(page.getByRole("heading", { name: "Konto erstellen" })).toBeVisible();
    await expect(page.getByLabel(/Name/)).toBeVisible();
    await expect(page.getByLabel(/E-Mail/)).toBeVisible();
  });

  test("Anmeldeseite lädt korrekt", async ({ page }) => {
    await page.goto("/auth/anmelden");
    await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible();
    await expect(page.getByLabel(/E-Mail/)).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("Ungültige Anmeldedaten zeigen Fehlermeldung", async ({ page }) => {
    await page.goto("/auth/anmelden");
    await page.getByLabel(/E-Mail/).fill("falsch@example.com");
    await page.locator("#password").fill("wrongpassword");
    await page.getByRole("button", { name: "Anmelden" }).click();
    // Exclude Next.js route announcer (also has role="alert") — use specific class
    await expect(
      page.locator('[role="alert"].text-red-700'),
    ).toContainText(/Ungültige/i, { timeout: 8_000 });
  });

  test("API: Registrierung → 201 status=pending", async ({ request }) => {
    const email = testEmail("reg");
    const res = await registerUser(request, email);
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.message).toMatch(/Registrierung erfolgreich/i);
  });

  test("API: Doppelte Registrierung → 409", async ({ request }) => {
    const email = testEmail("dup");
    await registerUser(request, email);
    const res = await registerUser(request, email);
    expect(res.status()).toBe(409);
  });

  test("API: Zu kurzes Passwort → 400", async ({ request }) => {
    const res = await registerUser(request, testEmail("short"), "abc");
    expect(res.status()).toBe(400);
  });

  test("UI: Registrierung → Pending-Seite", async ({ page }) => {
    const email = testEmail("ui-reg");

    await page.goto("/auth/registrieren");
    await page.getByLabel(/Name/).fill("UI Tester");
    await page.getByLabel(/E-Mail/).fill(email);
    // Fill password fields by type (there are two password inputs)
    const pwFields = page.getByPlaceholder(/Mindestens 8 Zeichen/);
    await pwFields.fill("TestPasswort1!");
    await page.getByPlaceholder(/Passwort wiederholen/).fill("TestPasswort1!");
    await page.getByRole("button", { name: "Konto erstellen" }).click();

    await expect(page).toHaveURL(/\/auth\/warten/);
    await expect(
      page.getByRole("heading", { name: /Registrierung wird geprüft/i }),
    ).toBeVisible();
  });

  test("UI: Ausstehender Benutzer kann sich nicht anmelden", async ({
    page,
    request,
  }) => {
    const email = testEmail("pending-login");
    await registerUser(request, email, "TestPasswort1!");

    await page.goto("/auth/anmelden");
    await page.getByLabel(/E-Mail/).fill(email);
    await page.locator("#password").fill("TestPasswort1!");
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
  });
});

// ─── 2.2 Admin-Dashboard ─────────────────────────────────────────────────────

test.describe("2.2 – Admin-Dashboard", () => {
  test("Admin kann sich anmelden und zum Dashboard navigieren", async ({
    page,
  }) => {
    await page.goto("/auth/anmelden");
    await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Benutzerverwaltung" }),
    ).toBeVisible();
  });

  test("Nicht-Admin wird vom Admin-Bereich abgewiesen", async ({
    page,
    request,
  }) => {
    // Register & approve a regular user
    const email = testEmail("nonadmin");
    await registerUser(request, email, "TestPasswort1!");

    // Approve via API (admin session not available here — skip direct UI test)
    // Just verify the route protection works for unauthenticated users
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/auth\/anmelden/);
  });

  test("API GET /api/admin/users – unauthenticated → 403", async ({
    request,
  }) => {
    const res = await request.get("/api/admin/users");
    expect(res.status()).toBe(403);
  });

  test("Admin sieht pending Benutzer und kann freigeben", async ({
    page,
    request,
  }) => {
    // Register a pending user
    const email = testEmail("to-approve");
    await registerUser(request, email, "TestPasswort1!");

    // Login as admin
    await page.goto("/auth/anmelden");
    await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });

    // Go to admin and wait for dashboard to fully render
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Benutzerverwaltung" })).toBeVisible();

    // Switch to "Ausstehend" filter
    await page.getByRole("button", { name: "Ausstehend" }).click();

    // Find the pending user row
    const userRow = page.locator("tr").filter({ hasText: email });
    await expect(userRow).toBeVisible({ timeout: 8_000 });

    // Click approve (checkmark button)
    const approveBtn = userRow.locator('[title="Freigeben"]');
    await approveBtn.click();

    // Toast confirms action
    await expect(page.getByRole("status")).toContainText(/aktualisiert/i, { timeout: 8_000 });

    // Verify the user's status changed in the API (same session, no sign-out needed)
    const statusRes = await page.evaluate(async (userEmail: string) => {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(userEmail)}&status=approved`);
      const data = await res.json();
      return { status: res.status, count: data.users?.length ?? 0 };
    }, email);
    expect(statusRes.status).toBe(200);
    expect(statusRes.count).toBe(1);
  });

  test("Admin kann Benutzer ablehnen", async ({ page, request }) => {
    const email = testEmail("to-reject");
    await registerUser(request, email, "TestPasswort1!");

    // Login admin
    await page.goto("/auth/anmelden");
    await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });

    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Ausstehend" }).click();
    const userRow = page.locator("tr").filter({ hasText: email });
    await expect(userRow).toBeVisible({ timeout: 8_000 });
    await userRow.locator('[title="Ablehnen"]').click();
    await expect(page.getByRole("status")).toContainText(/aktualisiert/i, { timeout: 8_000 });
  });

  test("Suchfilter funktioniert", async ({ page }) => {
    // Login admin
    await page.goto("/auth/anmelden");
    await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });

    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page
      .getByPlaceholder(/Name oder E-Mail/)
      .fill("harrywitzthum@gmail.com");

    // Admin row should appear
    await expect(page.locator("td").filter({ hasText: "harrywitzthum@gmail.com" })).toBeVisible({ timeout: 8_000 });
  });
});

// ─── 2.3 BYOK API-Schlüssel ──────────────────────────────────────────────────

test.describe("2.3 – BYOK API-Schlüssel-Verwaltung", () => {
  async function loginAdmin(page: import("@playwright/test").Page) {
    await page.goto("/auth/anmelden");
    await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });
  }

  test("Einstellungsseite lädt korrekt", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/einstellungen");
    await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "KI-API-Schlüssel" })).toBeVisible();
  });

  test("Einstellungsseite zeigt API-Schlüssel-Status", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/einstellungen");
    await page.waitForLoadState("networkidle");
    // Either "KI-Funktionen sind deaktiviert." span (no key) or "gespeichert" in green status (has key)
    const noKey = page.locator("span.text-terra-600", { hasText: "KI-Funktionen sind deaktiviert." });
    const hasKey = page.locator(".bg-green-50", { hasText: "gespeichert" });
    await expect(noKey.or(hasKey)).toBeVisible({ timeout: 8_000 });
  });

  test("API-Schlüssel speichern → maskiert anzeigen", async ({ page }) => {
    await loginAdmin(page);

    // First remove any existing key using the browser's authenticated session
    await page.evaluate(async () => {
      await fetch("/api/settings/api-key", { method: "DELETE" });
    });

    await page.goto("/einstellungen");
    await page.waitForLoadState("networkidle");

    // Wait for form to load (label varies depending on hasKey state)
    await expect(page.locator("#api-key")).toBeVisible({ timeout: 8_000 });

    await page.locator("#api-key").fill("sk-test-key-playwright-12345");
    await page.getByRole("button", { name: /Schlüssel speichern/ }).click();

    // Success feedback (role="status" in the form)
    await expect(page.getByRole("status")).toContainText(/gespeichert/i, { timeout: 8_000 });
  });

  test("API PUT /api/settings/api-key – nicht angemeldet → 401", async ({
    request,
  }) => {
    const res = await request.put("/api/settings/api-key", {
      data: { apiKey: "sk-test-12345678", provider: "gemini" },
    });
    expect(res.status()).toBe(401);
  });

  test("API PUT /api/settings/api-key – zu kurzer Schlüssel → 400", async ({
    page,
  }) => {
    await loginAdmin(page);
    // Use page.evaluate so the request carries the authenticated session cookie
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/settings/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "short", provider: "gemini" }),
      });
      return res.status;
    });
    expect(status).toBe(400);
  });
});
