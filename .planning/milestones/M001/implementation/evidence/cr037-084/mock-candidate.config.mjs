export default {
  testDir: "/work/tests/e2e",
  workers: 2,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3300",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 720 },
        screen: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 412, height: 915 },
        screen: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2.625,
      },
    },
  ],
};
