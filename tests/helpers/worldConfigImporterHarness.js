/**
 * A `CompendiumImporter` standing over a plain in-memory world-settings object.
 *
 * The two WORLD-scope configuration merges an import performs — the currency ladder (issue
 * 1278) and the travel/realm library (issue 1282) — write their setting directly rather than
 * through a store, and touch neither the crafting-system manager nor the recipe manager. Both
 * merge suites therefore need the same tiny stand: a settings object plus the `getSetting` /
 * `setSetting` seams, with both managers left null.
 *
 * Shared rather than copied because the two suites would otherwise carry byte-identical
 * fixtures, which is exactly what the SonarCloud new-code duplication gate fails on.
 *
 * This file is a HELPER, never a `*.test.js`.
 */

import { CompendiumImporter } from '../../src/systems/CompendiumImporter.js';

/**
 * @param {object} [seed] Initial world settings, keyed by setting key (`currencyConfig`,
 *   `travelConfig`, …). A key left absent reads back as `undefined`, which is what an
 *   unconfigured world looks like to the importer.
 * @returns {{ importer: CompendiumImporter, settings: object }} the importer plus the LIVE
 *   settings object it writes through, so a test asserts against what was actually persisted.
 */
export function importerOverSettings(seed = {}) {
  const settings = { ...seed };
  // Seams are the THIRD constructor argument.
  const importer = new CompendiumImporter(null, null, {
    getSetting: (key) => settings[key],
    setSetting: async (key, value) => {
      settings[key] = value;
    },
  });
  return { importer, settings };
}
