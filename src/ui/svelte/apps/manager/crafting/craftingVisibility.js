/**
 * Crafting visibility matrix (issue 511, PR-B redesign).
 *
 * A single flat system-level enum — `visibilityMode` — gates the whole Crafting
 * authoring surface. It replaces the old compound `recipeVisibility.listMode` +
 * `knowledge.mode` pair. This module is the canonical matrix contract: every
 * stream (Settings effect panel, nav gating, Books & Scrolls, limited-use,
 * learning limits) derives what it renders from `craftingEffect(mode)` so the
 * conditional surface has one source of truth.
 *
 * The matrix:
 *
 *   visibilityMode | showAccess | showBooksScrolls | showLimitedUse | showLearningLimits
 *   ---------------|------------|------------------|----------------|-------------------
 *   global         | false      | false            | false          | false
 *   restricted     | true       | false            | false          | false
 *   item           | false      | true             | true           | false
 *   knowledge      | false      | true             | false          | true
 *
 * Pure and dependency-free: no Svelte, no Foundry. Safe to import anywhere.
 */

/**
 * The four valid visibility modes, in canonical order. `'knowledge'` is the
 * default for absent/invalid input.
 * @type {readonly ['global', 'restricted', 'item', 'knowledge']}
 */
export const VISIBILITY_MODES = ['global', 'restricted', 'item', 'knowledge'];

const DEFAULT_VISIBILITY_MODE = 'knowledge';

// The matrix as data — one flag block + summary i18n key per mode.
const EFFECTS = {
  global: {
    showAccess: false,
    showBooksScrolls: false,
    showLimitedUse: false,
    showLearningLimits: false,
    summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryGlobal',
  },
  restricted: {
    showAccess: true,
    showBooksScrolls: false,
    showLimitedUse: false,
    showLearningLimits: false,
    summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryRestricted',
  },
  item: {
    showAccess: false,
    showBooksScrolls: true,
    showLimitedUse: true,
    showLearningLimits: false,
    summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryItem',
  },
  knowledge: {
    showAccess: false,
    showBooksScrolls: true,
    showLimitedUse: false,
    showLearningLimits: true,
    summaryKey: 'FABRICATE.Admin.Manager.Crafting.Effect.SummaryKnowledge',
  },
};

/**
 * Resolve the conditional-surface effect for a visibility mode.
 *
 * @param {string} mode One of {@link VISIBILITY_MODES}. Unknown/invalid input
 *   (including `undefined`/`null`) is treated as `'knowledge'`.
 * @returns {{
 *   showAccess: boolean,
 *   showBooksScrolls: boolean,
 *   showLimitedUse: boolean,
 *   showLearningLimits: boolean,
 *   summaryKey: string,
 * }} A fresh object (never a shared reference to the internal table).
 */
export function craftingEffect(mode) {
  const effect = EFFECTS[mode] ?? EFFECTS[DEFAULT_VISIBILITY_MODE];
  return { ...effect };
}
