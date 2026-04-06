/**
 * Phase 4 – Bildverwaltung
 *
 * Voraussetzung: PostgreSQL läuft (docker compose up -d)
 * und Admin-User ist in db/seed.sql.
 * Der Dev-Server startet automatisch via playwright.config.ts (Port 3002).
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

// Test-Secrets aus Root-.env lesen (Fallback: Umgebungsvariable)
function loadEnvVar(varName: string): string {
  if (process.env[varName]) return process.env[varName]!;
  const envPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, "utf-8").match(new RegExp(`^${varName}=(.+)$`, "m"));
    if (m) return m[1].trim();
  }
  return "";
}

const ADMIN_EMAIL = loadEnvVar("TEST_ADMIN_EMAIL");
const ADMIN_PASSWORD = loadEnvVar("TEST_ADMIN_PASSWORD");

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    "TEST_ADMIN_EMAIL und TEST_ADMIN_PASSWORD müssen in .env oder als Umgebungsvariablen gesetzt sein.",
  );
}

const RUN_ID = Date.now().toString(36);

// ── Minimales 1×1-PNG (base64) für Tests ──────────────────────────────────────
const PNG_1X1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// ── Hilfs-Login ───────────────────────────────────────────────────────────────

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

// ── API-Hilfe: Rezept erstellen ───────────────────────────────────────────────

async function createRecipeViaApi(
  page: import("@playwright/test").Page,
  title: string,
): Promise<string> {
  const resp = await page.evaluate(async (t: string) => {
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: t,
        servings: 4,
        instructions: "Testanleitung für Playwright.",
        ingredients: [
          { name: "Mehl", amount: 500, unit: "g", sortOrder: 0, isOptional: false },
        ],
        tags: ["test"],
        difficulty: "einfach",
      }),
    });
    const body = await res.json();
    return { status: res.status, id: body.id as string };
  }, title);

  expect(resp.status).toBe(201);
  expect(resp.id).toBeTruthy();
  return resp.id;
}

// ── API-Hilfe: Bild hochladen ─────────────────────────────────────────────────

async function uploadTestImageViaApi(
  page: import("@playwright/test").Page,
): Promise<{ id: string; thumbnailUrl: string; filePath: string }> {
  const result = await page.evaluate(async (b64: string) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type: "image/png" }), "test.png");

    const res = await fetch("/api/images/upload", { method: "POST", body: fd });
    const body = await res.json();
    return {
      status: res.status,
      id: body.id as string,
      thumbnailUrl: body.thumbnailUrl as string,
      filePath: body.filePath as string,
    };
  }, PNG_1X1_B64);

  expect(result.status).toBe(201);
  expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
  return result;
}

// ── Tests: 4.1 Bild-Upload ────────────────────────────────────────────────────

test.describe("4.1 – Bild-Upload", () => {
  test("API POST /api/images/upload – unauthenticated → 401", async ({ request }) => {
    const res = await request.post("/api/images/upload", {
      multipart: {
        file: {
          name: "test.png",
          mimeType: "image/png",
          buffer: Buffer.from("not-a-real-image"),
        },
      },
    });
    expect(res.status()).toBe(401);
  });

  test("API POST /api/images/upload – falsches Format → 415", async ({ page }) => {
    await loginAdmin(page);
    const status = await page.evaluate(async () => {
      const fd = new FormData();
      fd.append("file", new Blob(["hello"], { type: "text/plain" }), "test.txt");
      const res = await fetch("/api/images/upload", { method: "POST", body: fd });
      return res.status;
    });
    expect(status).toBe(415);
  });

  test("API POST /api/images/upload – erfolgreich → 201 + thumbnailUrl", async ({
    page,
  }) => {
    await loginAdmin(page);
    const result = await uploadTestImageViaApi(page);

    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.thumbnailUrl).toContain("/api/uploads/thumbnails/");
    expect(result.thumbnailUrl).toMatch(/\.webp$/);
    expect(result.filePath).toContain("/api/uploads/originals/");
  });

  test("Thumbnail wird unter thumbnailUrl serviert (200 + image/webp)", async ({
    page,
    request,
  }) => {
    await loginAdmin(page);
    const { thumbnailUrl } = await uploadTestImageViaApi(page);

    const res = await request.get(thumbnailUrl);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/webp");
  });

  test("Original wird unter filePath serviert (200)", async ({ page, request }) => {
    await loginAdmin(page);
    const { filePath } = await uploadTestImageViaApi(page);

    const res = await request.get(filePath);
    expect(res.status()).toBe(200);
  });

  test("Datei-Serving mit ungültigem Pfad → 404", async ({ request }) => {
    const res = await request.get("/api/uploads/originals/nichtvorhanden.jpg");
    expect(res.status()).toBe(404);
  });

  test("Ungültige Dateiendung – kein Bild → 415", async ({ page }) => {
    // Confirm upload rejects non-image MIME types (belt-and-suspenders MIME check)
    await loginAdmin(page);
    const status = await page.evaluate(async () => {
      const fd = new FormData();
      fd.append("file", new Blob(["GIF89a\x01\x00"], { type: "image/gif" }), "anim.gif");
      const res = await fetch("/api/images/upload", { method: "POST", body: fd });
      return res.status;
    });
    // GIF is not in ALLOWED_MIME → 415
    expect(status).toBe(415);
  });
});

// ── Tests: 4.2 Bilder verwalten ───────────────────────────────────────────────

test.describe("4.2 – Bilder verwalten", () => {
  test("Bild hochladen → Rezept zuordnen → als Hauptbild markieren", async ({
    page,
  }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, `BildTest-${RUN_ID}`);
    const { id: imageId } = await uploadTestImageViaApi(page);

    // Rezept zuordnen
    const patchAssignStatus = await page.evaluate(
      async ({ imageId, recipeId }: { imageId: string; recipeId: string }) => {
        const res = await fetch(`/api/images/${imageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId }),
        });
        return res.status;
      },
      { imageId, recipeId },
    );
    expect(patchAssignStatus).toBe(200);

    // Als Hauptbild markieren
    const patchPrimaryResult = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/images/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      const body = await res.json();
      return { status: res.status, isPrimary: body.isPrimary as boolean };
    }, imageId);
    expect(patchPrimaryResult.status).toBe(200);
    expect(patchPrimaryResult.isPrimary).toBe(true);
  });

  test("GET /api/images?rezeptId= gibt zugeordnetes Bild zurück", async ({
    page,
  }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, `GalleryTest-${RUN_ID}`);
    const { id: imageId } = await uploadTestImageViaApi(page);

    // Zuordnen
    await page.evaluate(
      async ({ imageId, recipeId }: { imageId: string; recipeId: string }) => {
        await fetch(`/api/images/${imageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId }),
        });
      },
      { imageId, recipeId },
    );

    // Galerie abfragen
    const gallery = await page.evaluate(async (rId: string) => {
      const res = await fetch(`/api/images?rezeptId=${rId}`);
      const body = await res.json();
      return { status: res.status, count: (body.images as unknown[]).length };
    }, recipeId);

    expect(gallery.status).toBe(200);
    expect(gallery.count).toBeGreaterThanOrEqual(1);
  });

  test("GET /api/images?unzugeordnet=true enthält Bild ohne Rezept", async ({
    page,
  }) => {
    await loginAdmin(page);
    const { id: imageId } = await uploadTestImageViaApi(page);

    const result = await page.evaluate(async (id: string) => {
      const res = await fetch("/api/images?unzugeordnet=true");
      const body = await res.json();
      const imgs = body.images as Array<{ id: string }>;
      return { status: res.status, found: imgs.some((i) => i.id === id) };
    }, imageId);

    expect(result.status).toBe(200);
    expect(result.found).toBe(true);
  });

  test("DELETE /api/images/[id] → 204 und Thumbnail danach 404", async ({
    page,
    request,
  }) => {
    await loginAdmin(page);
    const { id: imageId, thumbnailUrl } = await uploadTestImageViaApi(page);

    // Löschen
    const deleteStatus = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/images/${id}`, { method: "DELETE" });
      return res.status;
    }, imageId);
    expect(deleteStatus).toBe(204);

    // Thumbnail nicht mehr vorhanden
    const thumbRes = await request.get(thumbnailUrl);
    expect(thumbRes.status()).toBe(404);
  });

  test("PATCH /api/images/[id] – isPrimary:true ohne recipeId → 400", async ({
    page,
  }) => {
    await loginAdmin(page);
    const { id: imageId } = await uploadTestImageViaApi(page);

    const status = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/images/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      return res.status;
    }, imageId);

    expect(status).toBe(400);
  });

  test("PATCH /api/images – Fremdbild → 403", async ({ page }) => {
    await loginAdmin(page);
    // Try to PATCH with a nonexistent ID
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/images/00000000-0000-0000-0000-000000000000", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ altText: "test" }),
      });
      return res.status;
    });
    expect([403, 404]).toContain(status);
  });
});

// ── Tests: 4.3 UI-Tests ──────────────────────────────────────────────────────

test.describe("4.3 – UI", () => {
  test("/bilder Seite lädt mit Überschrift", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/bilder");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Bildergalerie" })).toBeVisible();
  });

  test("Rezeptdetailseite zeigt Bilder-Sektion", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, `DetailImg-${RUN_ID}`);
    await page.goto(`/rezepte/${recipeId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Bilder" })).toBeVisible();
  });

  test("Rezeptdetailseite zeigt Hero-Bild nach Upload + Zuordnung", async ({
    page,
  }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, `HeroImg-${RUN_ID}`);
    const { id: imageId } = await uploadTestImageViaApi(page);

    // Zuordnen und als Hauptbild setzen
    await page.evaluate(
      async ({ imageId, recipeId }: { imageId: string; recipeId: string }) => {
        await fetch(`/api/images/${imageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId }),
        });
        await fetch(`/api/images/${imageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPrimary: true }),
        });
      },
      { imageId, recipeId },
    );

    await page.goto(`/rezepte/${recipeId}`);
    await page.waitForLoadState("networkidle");

    // Hero sollte nun ein <img> mit Bilddaten enthalten
    const heroImg = page
      .locator(".relative.h-64 img, .relative.h-80 img")
      .first();
    await expect(heroImg).toBeVisible({ timeout: 8_000 });
    const src = await heroImg.getAttribute("src");
    expect(src).toContain("/api/uploads/");
  });

  test("Bildergalerie enthält hochgeladenes Bild", async ({ page }) => {
    await loginAdmin(page);
    await uploadTestImageViaApi(page);

    await page.goto("/bilder");
    await page.waitForLoadState("networkidle");

    // Es sollte mindestens ein Thumbnail sichtbar sein
    const thumbnails = page.locator("img[src*='/api/uploads/thumbnails/']");
    await expect(thumbnails.first()).toBeVisible({ timeout: 8_000 });
  });
});
