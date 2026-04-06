import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 3,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3002",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3002",
    url: "http://localhost:3002/api/health",
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      DISABLE_RATE_LIMIT: "true",
    },
  },
});