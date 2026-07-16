/**
 * 1.17.0 — Strip the retired system-level progressive `allowPlayerReorder` (issue 651;
 * pure, idempotent, version-gated).
 *
 * The reorder permission moved off the system's progressive check and onto the entities
 * it actually describes: `Recipe.allowPlayerResultReorder` and
 * `Component.salvage.allowPlayerResultReorder`, both defaulting to `true`. The system-level
 * flag is retired, so this migration deletes it from all THREE progressive check blocks a
 * system can carry:
 *
 *   craftingCheck.progressive.allowPlayerReorder
 *   salvageCraftingCheck.progressive.allowPlayerReorder
 *   gatheringCraftingCheck.progressive.allowPlayerReorder
 *
 * WHY THIS EXISTS — read this before deleting it as redundant. This is a DEFENSIVE STRIP OF
 * STORED SETTINGS DATA, not an export fix. `_normalizeProgressiveCraftingCheck` is an
 * allowlist literal that never spreads its source, `getSettings()` returns the normalized
 * in-memory map, and `CraftingSystemExporter` reads from that map — so the normalizer
 * already drops the field on read and it can never reach an export. What it does NOT do is
 * rewrite the stored payload, which keeps the dead key until some unrelated save happens to
 * rewrite that system. This migration removes it from storage once, deliberately.
 *
 * The same allowlist shape is a safety property worth stating: because the normalizer
 * enumerates its keys rather than spreading, IMPORTING A LEGACY PAYLOAD CANNOT REINTRODUCE
 * THE FLAG. There is no path back in, so this migration never needs a re-run guard beyond
 * its version gate.
 *
 * IT DELIBERATELY DOES NOT SEED. No `allowPlayerResultReorder` is written to any recipe or
 * salvage config here. The `Recipe` constructor and `_normalizeSalvage` both read an absent
 * key as `true`, which is exactly the value a seed would write and exactly today's implicit
 * behaviour (the retired flag was never honoured at runtime, so the authored order always
 * won). Seeding would churn stored JSON for zero observable change. This omission is a
 * decision, not an oversight — do not "fix" it.
 *
 * Mutated setting key: `craftingSystems` (and only it).
 *
 * Idempotent: the key is deleted, so a second run finds nothing and is a no-op. Never
 * throws — every level is guarded, and a malformed system/check/progressive is skipped
 * rather than being repaired (normalization is the normalizer's job, not this migration's).
 *
 * @param {Array<object>} systems - raw craftingSystems setting
 * @returns {{ systems: Array<object> }}
 */

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
  for (const system of safeSystems) {
    if (!system || typeof system !== 'object') continue;
    for (const key of CHECK_KEYS) _stripRetiredFlag(system[key]);
  }
  return { systems: safeSystems };
}
