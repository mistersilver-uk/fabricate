/**
 * Fabricate View Lab automation config (issue 823) — SEPARATE from the live-smoke
 * Playwright/foundry-test config on purpose (the fast lab must not inherit the heavy
 * smoke config). Consumed by `scripts/view-lab-screenshots.mjs`, which drives the
 * already-present `playwright` library (NOT WebdriverIO, and NOT the `@playwright/test`
 * runner — reused to avoid adding a dependency) over a programmatic Vite dev server
 * that serves `tests/view-lab/index.html`.
 */
export default {
  // Vite dev server (see tests/view-lab/vite.config.js) that serves the mount page.
  server: {
    viteConfig: 'tests/view-lab/vite.config.js',
    port: 5273,
    host: '127.0.0.1',
  },
  // The mount page; a case is selected via `?case=<id>`.
  mountPath: '/tests/view-lab/index.html',
  // Where `capture` writes `<id>.png` + `manifest.json`.
  artifactDir: 'ui-screenshot-artifact',
  // Deterministic Chromium settings (Design D). deviceScaleFactor MUST be identical
  // local + CI; 1 is the recommended anchor. `--headless=new` + a fixed ANGLE backend.
  deviceScaleFactor: 1,
  locale: 'en-US',
  timezoneId: 'UTC',
  launchArgs: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--force-color-profile=srgb'],
  readyTimeoutMs: 15000,
  // Console messages allowed during a render (Design D: fail on unexpected errors).
  consoleErrorAllowlist: [],
};
