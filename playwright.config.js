import { defineConfig } from '@playwright/test';

// 构建产物 base 为 /pneumatic-actuator/（GH Pages 路径），
// 故 baseURL 与 vite preview 亦须同前缀
export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:4173/pneumatic-actuator/',
  },
  webServer: {
    command: 'npm run preview -- --base=/pneumatic-actuator/',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
