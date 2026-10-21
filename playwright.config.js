// Playwright 煙霧測試設定：用 Python 內建的 http.server 在本機提供靜態檔，只跑 Chromium。
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.PORT || 4173;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90 * 1000,                 // 出圖（PDF／DXF）會畫很多 canvas，給寬一點
  expect: { timeout: 15 * 1000 },
  fullyParallel: false,
  workers: 1,                         // 單一 WebGL 畫面，序列跑最穩
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    viewport: { width: 1400, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // 無頭模式沒有 GPU，用 SwiftShader 軟體算圖跑 three.js 的 WebGL
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000
  }
});
