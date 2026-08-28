/**
 * Meldet einmal an und legt die Sitzung ab, damit die drei Geraeteprojekte sie
 * teilen. Ohne das meldet sich jeder der ~30 Mobile-Tests einzeln an — das
 * dominierte die Laufzeit der Suite.
 */

import {
  test as setup,
  expect,
  CREDS_AVAILABLE,
  STORAGE_STATE,
  loginAdmin,
} from "./mobile-helpers";

setup("anmelden", async ({ page }) => {
  setup.skip(!CREDS_AVAILABLE, "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD fehlen in .env");

  await loginAdmin(page);
  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: STORAGE_STATE });
});
