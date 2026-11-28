import { defineConfig, devices } from '@playwright/test';
// The layout e2e in Chromium (the reference the static checks are proved against), and in Firefox and WebKit to see
// where their CSS baselines (UA styles, defaults, rendering) differ: `--project chromium|firefox|webkit`.
// fullyParallel: each test may run in its own worker and shard (ci.yml cuts shards per test, tools/ci/e2e-shards.mjs); a
// spec whose tests depend on each other says so with test.describe.configure({mode: 'default'}) (or 'serial'). Locally
// it is still one worker.
export default defineConfig({
  testDir: './e2e', testMatch: 'layout*.spec.mjs', workers: 1, fullyParallel: true,
  use: { headless: true },
  projects: [
    // Unhinted glyph advances, as on macOS and as the text model measures them: headless Chromium on Linux hints them by
    // default, which widens text set in a font file by a fraction of a pixel per word (layout-svelte: 0.5625px).
    { name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--font-render-hinting=none'] } } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
