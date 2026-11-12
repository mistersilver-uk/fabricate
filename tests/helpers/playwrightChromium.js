/**
 * The one door tests use to reach Playwright's `chromium` (issue 1277): importing it fails the
 * suite at load, naming the install command, when the browser binary is missing. ESLint forbids
 * a direct `playwright` import under `tests/`, so a new browser suite cannot skip the check.
 */

// eslint-disable-next-line no-restricted-imports -- this module is the guarded re-export.
import { chromium as playwrightChromium } from 'playwright';

import { assertChromiumInstalled } from './playwrightBrowserPreflight.js';

// ratchet-exempt(lint): failing at import time is this module's whole purpose (issue 1277).
assertChromiumInstalled(playwrightChromium.executablePath());

// eslint-disable-next-line unicorn/prefer-export-from -- an `export … from 'playwright'` is the restricted import.
export const chromium = playwrightChromium;
