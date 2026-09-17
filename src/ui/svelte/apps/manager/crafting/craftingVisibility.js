/**
 * The crafting visibility matrix: every conditional surface derives what it renders from
 * `craftingEffect(mode)`, so the flat `visibilityMode` enum has one reading.
 * `openspec/specs/recipe-visibility/spec.md` is canonical for the enum and
 * `openspec/specs/ui-integration/spec.md` → "GM Crafting Admin" for what each flag reveals.
 */

/** The four valid modes in canonical order; absent or invalid input resolves to `'knowledge'`. */
export const VISIBILITY_MODES = ['global', 'restricted', 'item', 'knowledge'];

const DEFAULT_VISIBILITY_MODE = 'knowledge';

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

/** The conditional-surface effect for a mode, as a FRESH object — never a reference into the table. */
export function craftingEffect(mode) {
  const effect = EFFECTS[mode] ?? EFFECTS[DEFAULT_VISIBILITY_MODE];
  return { ...effect };
}
