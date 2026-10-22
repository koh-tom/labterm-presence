import { defineConfig } from "@playwright/test";

// デモデータ (?demo) で画面を確認する。ブラウザはシステムの chromium を使う
export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "pnpm build && pnpm preview --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
});
