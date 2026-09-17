import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:3200'
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) {
  throw new Error('This isolated browser suite must run locally, not against live customer services.')
}
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${new URL(baseURL).port || '3200'}`,
    url: `${baseURL}/portal/sample`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
