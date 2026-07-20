/**
 * Shared enricher-description fixtures for the issue 800 plain-text flattening
 * suites. Hoisted here so the reporter's exact string and the broad mixed
 * fixture are defined once and reused across the unit, caller-path, and
 * cross-caller-equivalence tests (avoids Sonar new-code duplication).
 */

// The reporter's Alchemist's Supplies description (Mythwright world): a list of
// labelled @UUID content links. Foundry renders the labels; Fabricate used to
// leak the raw directives.
export const REPORTER_ENRICHER_DESCRIPTION = [
  '@UUID[Compendium.dnd5e.equipment24.Item.phbagA cid0000000]{Acid}',
  "@UUID[Compendium.dnd5e.equipment24.Item.alchemyfire01]{Alchemist's Fire}",
  '@UUID[Compendium.dnd5e.equipment24.Item.componentpouch]{Component Pouch}',
  '@UUID[Compendium.dnd5e.equipment24.Item.oil0000000000]{Oil}',
  '@UUID[Compendium.dnd5e.equipment24.Item.paper000000000]{Paper}',
  '@UUID[Compendium.dnd5e.equipment24.Item.perfume0000000]{Perfume}',
].join(', ');

export const REPORTER_ENRICHER_EXPECTED =
  "Acid, Alchemist's Fire, Component Pouch, Oil, Paper, Perfume";

// A single string exercising every branch the screenshot fixture also carries:
// labelled links forming a list, a labelled roll, a bare/label-less roll, and a
// label-less link IN the list (so the run-collapse separator tidy is visible —
// the orphaned `, ,` between Acid and Oil collapses to a single separator).
export const BROAD_ENRICHER_DESCRIPTION =
  'Craft: @UUID[Compendium.dnd5e.items.Item.acid00]{Acid}, ' +
  '@UUID[Compendium.dnd5e.items.Item.nolabel00], ' +
  '@UUID[Compendium.dnd5e.items.Item.oil000]{Oil}, ' +
  '@UUID[Compendium.dnd5e.items.Item.paper0]{Paper}. ' +
  'Burns for [[/r 1d4]]{1d4 rounds} dealing [[/roll 2d6]] fire damage.';

export const BROAD_ENRICHER_EXPECTED =
  'Craft: Acid, Oil, Paper. Burns for 1d4 rounds dealing 2d6 fire damage.';
