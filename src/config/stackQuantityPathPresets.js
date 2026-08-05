/**
 * Per-Foundry-system defaults for the item stack-quantity path (issue 1024, #853).
 *
 * This module is the SINGLE legitimate home for the `'system.quantity'` literal in
 * `src/**`. Every other module reads the path through `itemStackQuantity.js`, and
 * `tests/quantity-literal-gate.test.js` allowlists exactly this file, so a literal
 * growing back anywhere else is a red test rather than a silent regression in one
 * surface.
 *
 * The table is deliberately tiny. It exists so a GM on a system Fabricate already
 * knows about never has to discover the setting at all, not to enumerate the ecosystem
 * — an unknown system falls back to the near-universal default, and the GM edits the
 * setting when their system differs.
 */

/**
 * The path used by dnd5e, pf2e, and most other Foundry systems.
 *
 * @type {string}
 */
export const DEFAULT_ITEM_STACK_QUANTITY_PATH = 'system.quantity';

/**
 * Known per-system overrides, keyed by `game.system.id`.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ITEM_STACK_QUANTITY_PATH_PRESETS = Object.freeze({
  // Tormenta20 stores the stack count as `qtd` (quantidade). Reported in #853.
  tormenta20: 'system.qtd',
});

/**
 * The default stack-quantity path for a Foundry system id.
 *
 * NEVER returns `undefined`: the value is used as a setting `default`, and Foundry's
 * `ClientSettings#register` applies `data.default ??= null`, which would make every
 * read of an unconfigured world return `null` rather than a usable path.
 *
 * @param {unknown} systemId `game.system.id`, or anything at all.
 * @returns {string} The preset path, or {@link DEFAULT_ITEM_STACK_QUANTITY_PATH}.
 */
export function stackQuantityPathPresetFor(systemId) {
  if (typeof systemId !== 'string') return DEFAULT_ITEM_STACK_QUANTITY_PATH;
  const key = systemId.trim();
  if (key === '' || !Object.hasOwn(ITEM_STACK_QUANTITY_PATH_PRESETS, key)) {
    return DEFAULT_ITEM_STACK_QUANTITY_PATH;
  }
  const preset = ITEM_STACK_QUANTITY_PATH_PRESETS[key];
  return typeof preset === 'string' && preset.trim() !== ''
    ? preset
    : DEFAULT_ITEM_STACK_QUANTITY_PATH;
}
