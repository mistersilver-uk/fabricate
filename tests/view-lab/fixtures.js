/**
 * Pure View Lab fixtures (issue 823).
 *
 * Plain data only — props for the mounted component, an optional `i18n` seed for
 * the Foundry-free `game.i18n` stub surface the lab reuses (the SAME shape as
 * `tests/helpers/svelte-component-harness.js`'s `installComponentTestGlobals`, NOT
 * new Foundry-global scaffolding), and optional frame hints. No DOM, no browser or
 * Foundry globals are touched at import, so this module is safe to import from the
 * globbed `node --test` registry unit suite (to prove every `case.fixtureId`
 * resolves) AND from the Vite-served browser mount.
 *
 * `i18n` seeds `game.i18n.localize(key)` so a case can render a real localized
 * string (font-metric width depends on it) instead of the bare key.
 */

const LONG_RECIPE = Object.freeze({
  id: 'view-lab-long-name',
  name: 'Grand Alembic Distillation of the Thrice-Refined Quicksilver Panacea',
  systemName: 'Alchemical Reagents & Elixirs',
  category: 'elixirs',
  categoryLabel: 'Elixirs & Tinctures',
  browseStatus: 'available',
  redaction: { redacted: false },
});

const NARROW_RECIPE = Object.freeze({
  id: 'view-lab-narrow',
  name: 'Venom-Coated Arrowheads (bundle of twenty)',
  systemName: 'Ammunition Crafting',
  category: 'ammunition',
  categoryLabel: 'Ammunition',
  browseStatus: 'missingMaterials',
  redaction: { redacted: false },
});

export const FIXTURES = Object.freeze({
  craftingStatusAvailable: {
    props: { status: 'available' },
    i18n: { 'FABRICATE.App.Crafting.Status.Available': 'Available' },
  },
  craftingStatusLocalized: {
    props: { status: 'missingMaterials' },
    i18n: {
      'FABRICATE.App.Crafting.Status.MissingMaterials':
        'Missing materials — gather more reagents before crafting',
    },
  },
  craftingCheckMono: {
    // CraftingCheckCard paints its roll formula `<code>` in JetBrains Mono
    // (`.crafting-check-formula code { font-family: var(--fab-font-mono) }`), so this
    // frame actually exercises the mono-metric width axis (verified: the code element
    // computes to "JetBrains Mono, …"). A rollFormula is required for the code to render.
    props: {
      check: {
        dc: 18,
        skill: 'Arcana',
        rollFormula: '1d20 + @prof + @int',
        resolvedFormula: '1d20 + 4 + 3',
        formulaResolved: true,
        mandatory: true,
        usable: true,
      },
    },
    i18n: {
      'FABRICATE.App.Crafting.Check.Title': 'Crafting check',
      'FABRICATE.App.Crafting.Check.Mandatory': 'Required',
      'FABRICATE.App.Crafting.Check.Optional': 'Optional',
      'FABRICATE.App.Crafting.Check.DcLabel': 'DC {dc}',
    },
  },
  statusPillEnabled: {
    props: { tone: 'success', icon: 'fas fa-circle', label: 'Enabled' },
  },
  statusPillBlocked: {
    props: { tone: 'danger', icon: 'fas fa-triangle-exclamation', label: "Can't enable" },
  },
  statusPillRestricted: {
    props: { tone: 'accent', icon: 'fas fa-lock', label: 'Locked' },
  },
  recipeRowLongName: {
    props: { recipe: LONG_RECIPE, selected: false },
    i18n: { 'FABRICATE.App.Crafting.Status.Available': 'Available' },
  },
  recipeRowNarrowStacked: {
    props: { recipe: NARROW_RECIPE, selected: true },
    i18n: {
      'FABRICATE.App.Crafting.Status.MissingMaterials': 'Missing materials',
    },
  },
  globalUiTheme: {
    props: { status: 'available' },
    i18n: { 'FABRICATE.App.Crafting.Status.Available': 'Available' },
  },
});

/** The set of registered fixture ids — used by the registry self-consistency test. */
export function fixtureIds() {
  return Object.keys(FIXTURES);
}

export function getFixture(id) {
  return Object.prototype.hasOwnProperty.call(FIXTURES, id) ? FIXTURES[id] : null;
}
