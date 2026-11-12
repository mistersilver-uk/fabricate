/**
 * The missing-browser preflight behind `tests/helpers/playwrightChromium.js` (issue 1277).
 * `npm ci` installs the `playwright` package but not its browser, so a suite that launches Chromium
 * must fail at load with the command that installs it.
 */

import { existsSync } from 'node:fs';

export const INSTALL_HINT =
  'Run `npm run test:foundry:install` to download the chromium binary Playwright needs.';

/**
 * Throw when Playwright's Chromium executable is absent.
 * @param {string} executablePath The path `chromium.executablePath()` reports.
 * @param {(path: string) => boolean} [exists] The existence probe.
 */
export function assertChromiumInstalled(executablePath, exists = existsSync) {
  if (exists(executablePath)) return;
  throw new Error(`Playwright's Chromium is not installed at ${executablePath}. ${INSTALL_HINT}`);
}
