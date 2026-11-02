import { defineConfig } from '@playwright/test';

/**
 * Browser tests for the public chart API and the React component.
 *
 * They need a real canvas, so they run in Chromium rather than Node. The global
 * setup bundles the sources once; each test serves that bundle from a fake
 * origin, so localStorage (and therefore persistence) behaves as on a site.
 *
 * Set FSCANDLE_CHROMIUM to use a Chromium other than Playwright's bundled one,
 * for example a preinstalled binary in a sandboxed environment.
 */
const chromiumPath = process.env.FSCANDLE_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/browser/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 1000, height: 700 },
    launchOptions: {
      executablePath: chromiumPath,
      // A preinstalled browser in a container usually runs as root, where the
      // sandbox cannot start.
      args: chromiumPath ? ['--no-sandbox'] : [],
    },
  },
});
