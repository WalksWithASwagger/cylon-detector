import { defineConfig, devices } from '@playwright/test'
import { execFileSync } from 'node:child_process'

const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

export default defineConfig({
  testDir: './test/e2e',
  outputDir: 'test-results/playwright',
  fullyParallel: true,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    env: { VERCEL_GIT_COMMIT_SHA: sourceCommit },
    reuseExistingServer: false,
    timeout: 120_000
  }
})
