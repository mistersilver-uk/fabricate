/**
 * A `CompendiumImporter` standing over a plain in-memory world-settings object. This file is a
 * HELPER, never a `*.test.js` (issue 1278).
 */

import { CompendiumImporter } from '../../src/systems/CompendiumImporter.js';

/**
 * @param {object} [seed] Initial world settings, keyed by setting key (`currencyConfig`,
 *   `travelConfig`, …). A key left absent reads back as `undefined`, which is what an
 *   unconfigured world looks like to the importer.
 * @returns {{ importer: CompendiumImporter, settings: object }} the importer plus the LIVE
 *   settings object it writes through, so a test asserts against what was actually persisted.
 */
export function importerOverSettings(seed = {}, extraSeams = {}) {
  const settings = { ...seed };
  // Seams are the THIRD constructor argument; `extraSeams` lets a test add one (e.g. a travelStore
  // delegator) without the harness growing a parameter per seam.
  const importer = new CompendiumImporter(null, null, {
    getSetting: (key) => settings[key],
    setSetting: async (key, value) => {
      settings[key] = value;
    },
    ...extraSeams,
  });
  return { importer, settings };
}
