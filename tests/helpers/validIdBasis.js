/**
 * Make a bare unit fixture's corpus KNOWN-COMPLETE for the **Valid Id Basis** gate
 * (issues 1224, 1226).
 *
 * The gate fails CLOSED on an unreadable input, and a hand-built fixture reads nothing: it
 * seeds a `Map` settings store with only the keys its own suite cares about, and it usually
 * sets `initialized = true` rather than running the corpus read that stamps the layout
 * observed across it. Every such fixture therefore scores "not known-complete", and every
 * corpus-derived prune is refused inside it — which is correct behaviour and useless as a
 * fixture, because a suite asserting that a delete DOES prune is asserting the gate's OPEN
 * direction and needs a world the gate can attest.
 *
 * This is the smallest complete attestation: five settings plus the one fact no setting
 * supplies. It states a `singleArray` world on the highest registered migration — the
 * shipped default every world reads until a GM converts — so a suite calling it is
 * modelling a healthy world, never waiving the gate.
 *
 * It deliberately does NOT let a caller state a partial world. The closed direction belongs
 * to `tests/mutation-time-valid-id-basis.test.js`, which drives the real managers from
 * SETTINGS one input at a time; a helper that could also seed "incomplete" would invite a
 * suite to inject the answer and prove nothing, which is how two earlier acceptance sets
 * for #1224 went green against a gate that never fired.
 */

import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  SETTING_KEYS,
} from '../../src/config/settings.js';
import { getHighestRegisteredMigrationVersion } from '../../src/migration/MigrationRunner.js';

/**
 * @param {Map<string, unknown>} settings The fixture's settings store (`installFoundryEnv`'s
 *   `settings` Map, or any `Map` behind `game.settings.get`).
 * @param {object} [managers]
 * @param {object} [managers.recipeManager] Stamped with the layout its corpus read would
 *   have observed. `initialize()` is what sets this in production; a fixture that seeded
 *   `recipes` directly never ran one, and `null` is not known-complete.
 * @param {object} [managers.craftingSystemManager] The same, for the extracted component
 *   class (issue 1212).
 */
export function seedKnownCompleteValidIdBasis(
  settings,
  { recipeManager = null, craftingSystemManager = null } = {}
) {
  settings.set(SETTING_KEYS.RECIPE_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY);
  settings.set(SETTING_KEYS.RECIPE_STORAGE_TARGET, DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY);
  settings.set(SETTING_KEYS.COMPONENT_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY);
  settings.set(SETTING_KEYS.COMPONENT_STORAGE_TARGET, DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY);
  settings.set(SETTING_KEYS.MIGRATION_VERSION, getHighestRegisteredMigrationVersion());
  if (recipeManager) {
    recipeManager._layoutAtCorpusRead = DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY;
  }
  if (craftingSystemManager) {
    craftingSystemManager._componentLayoutAtCorpusRead = DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY;
  }
}
