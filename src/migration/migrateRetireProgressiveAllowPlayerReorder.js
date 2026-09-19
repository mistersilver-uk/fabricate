/**
 * `1.17.0` — strip the retired system-level progressive `allowPlayerReorder` from all three check
 * blocks, the permission having moved onto the entities it describes (issue 651).
 * A DEFENSIVE STRIP OF STORED DATA, not an export fix: the normalizer already drops the field on
 * read, but nothing rewrites the STORED payload until an unrelated save happens to. IT DELIBERATELY
 * DOES NOT SEED — both readers treat an absent key as `true`, so a seed would churn JSON for nothing.
 */

import { forEachSystem } from './migrationHelpers.js';

const CHECK_KEYS = ['craftingCheck', 'salvageCraftingCheck', 'gatheringCraftingCheck'];

const RETIRED_KEY = 'allowPlayerReorder';

function _stripRetiredFlag(check) {
  if (!check || typeof check !== 'object') return;
  const progressive = check.progressive;
  if (!progressive || typeof progressive !== 'object') return;
  delete progressive[RETIRED_KEY];
}

export function migrateRetireProgressiveAllowPlayerReorder(systems) {
  const safeSystems = Array.isArray(systems) ? systems : [];
  forEachSystem(safeSystems, (system) => {
    for (const key of CHECK_KEYS) _stripRetiredFlag(system[key]);
  });
  return { systems: safeSystems };
}
