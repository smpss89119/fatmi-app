const { defineConfig, devices } = require("@playwright/test");
const iphone = devices["iPhone 12"];
module.exports = defineConfig({
  testDir: "./tests",
  timeout: 90000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    ...iphone,
    browserName: "chromium",
    defaultBrowserType: "chromium",
    baseURL: "http://127.0.0.1:43123",
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
    serviceWorkers: "block",
  },
  outputDir: "test-results",
  projects: [{ name: "chromium-iphone", use: { browserName: "chromium" } }],
});
