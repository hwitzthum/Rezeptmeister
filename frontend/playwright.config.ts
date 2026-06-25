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
      // The test server listens on 3002, but .env.local pins NEXTAUTH_URL to the
      // normal dev port (3001). Without this override, the auth middleware
      // redirects unauthenticated requests to localhost:3001 — which isn't
      // running during a standalone test run — so every redirect-based test
      // fails with ERR_CONNECTION_REFUSED. Align the auth origin with the test
      // port so redirects stay same-origin and reachable.
      NEXTAUTH_URL: "http://localhost:3002",
    },
  },
});
