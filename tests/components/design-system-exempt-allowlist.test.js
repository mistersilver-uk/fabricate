/**
 * Pins every `ratchet-exempt(design-system)` marker under `src/` and `styles/` by reason and count.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { RULED_KINDS } from '../../scripts/lib/viewLabComputedCensus.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import {
  DESIGN_SYSTEM_FAMILY,
  MODULE_CORPUS,
  STYLE_CORPUS,
  workingTree,
} from '../helpers/designSystemRatchet.js';
import { parseMarkers } from '../helpers/mergeBaseRatchet.js';

const PORTRAIT = "an actor portrait, the portrait ladder's 32 single mark, not a control";
const STEPPER_LABELS =
  'the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from ' +
  'GatheringTaskEditView';
const OWN_REST = "the spread is this primitive's own rest, forwarded to the root it composes";

/** Each reviewed reason, and how many of its markers each file states. */
const ALLOWLIST = Object.freeze([
  [
    PORTRAIT,
    {
      'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte': 2,
      'src/ui/svelte/apps/manager/PartyTravelActorPanel.svelte': 1,
      'styles/fabricate.css': 1,
    },
  ],
  [
    "the remove overlay covering a 32 portrait tile, drawn at the tile's 9 so no corner of the " +
      'portrait shows past it',
    { 'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte': 1 },
  ],
  [
    "a tile, not a control: the portrait ladder's 32, the slot PartyTravelActorPanel fills with " +
      'an actor portrait on link',
    { 'src/ui/svelte/components/EmptyState.svelte': 1 },
  ],
  [
    "a 14px inline mark inside a 20px text pill, not a record tile; the art ladder's 22 would " +
      'grow every pill',
    { 'src/ui/svelte/apps/inventory/detail/salvage/SalvageRollSummary.svelte': 1 },
  ],
  [
    "a 124px preview of the GM's colour and icon choice, not a record tile; the art ladder's 38 " +
      'would shrink it to a speck',
    { 'src/ui/svelte/apps/manager/essences/EssenceIdentityTab.svelte': 1 },
  ],
  [
    "a 150px preview of the GM's colour and icon choice, not a record tile; the art ladder's 38 " +
      'would shrink it to a speck',
    { 'src/ui/svelte/apps/manager/scoped/WorldEssenceEntryPage.svelte': 1 },
  ],
  [
    "the library's 56px slot tile; its geometry against the specimen is issue 2257's to converge",
    { 'src/ui/svelte/components/SlotTile.svelte': 1 },
  ],
  [
    "the compact search's 32, the one exception to the retired 32 the geometry requirement names",
    { 'styles/fabricate.css': 1 },
  ],
  [
    "the compact search's ruled box, 34 at radius 6, the geometry requirement's named exception " +
      'rather than a rung',
    { 'styles/fabricate.css': 1 },
  ],
  [
    "a nav row keeps its 30px rung's corner when a long label wraps it taller",
    { 'styles/fabricate.css': 1 },
  ],
  [
    "the 22px button's 6px corner outset by the 1px hit-area padding, so the content-box " +
      'background still draws 6; retires if the adjunct moves to the ::before form or a hit-area ' +
      'token lands',
    { 'src/ui/svelte/components/Stepper.svelte': 1 },
  ],
  [
    "an alignment, not a step: the header's 8px inset, its 38px thumb and the thumb's 12px gap",
    { 'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte': 1 },
  ],
  [
    "an alignment, not a step: the option's 8px inset, its 12px tick and the tick's 8px gap",
    { 'styles/fabricate.css': 1 },
  ],
  [
    'a derived token is declared once on every root a palette is, :root included, so each ' +
      'resolves against its own palette. --fab-control-outline outlines an unchecked selection ' +
      'control at 3:1 on its surface in every palette (issue 2047).',
    { 'styles/fabricate.css': 1 },
  ],
  [
    "<PageHeader> ships at target, because its callers keep the manager's shipped header " +
      "geometry, which disagrees with the specimen's (issue 1777 decision E4; geometry converges " +
      'in issue 2257)',
    { 'src/ui/svelte/components/PageHeader.svelte': 1 },
  ],
  [
    '<NavSidebar> ships at target: the pip and 8/0/6 padding are ruled, so the specimen is ' +
      "redrawn; the expanded group's box converges at issue 2257 (issue 1777 decision E3)",
    { 'src/ui/svelte/components/NavSidebar.svelte': 1 },
  ],
  [
    'promoted on its second importer at issue 1644; its icon chip, hint line and a short ' +
      "candidate's undimmed reading still disagree with the specimen, carried to issue 2257",
    { 'src/ui/svelte/components/ChoiceOptionList.svelte': 1 },
  ],
  [
    'promoted on its third importer at issue 1644; its head glyph, band chip, row yields and ' +
      'kicker disagree with the specimen, recorded in the migrations table, so the row arrives ' +
      'at target',
    { 'src/ui/svelte/components/OutcomeLadder.svelte': 1 },
  ],
  [
    'the die tiles are promoted to a shared primitive at target, because the player result box ' +
      'and the salvage roll summary now import them beside the Checks Studio simulator ' +
      '(issue 2006)',
    { 'src/ui/svelte/components/DiceTiles.svelte': 1 },
  ],
  [
    'InlineRenameField is a new manager-only member at target, because it replaces ' +
      'PartyNameField and RealmNameField and so has two callers (issue 1521)',
    { 'src/ui/svelte/apps/manager/InlineRenameField.svelte': 1 },
  ],
  [
    'CheckOptionGroup is promoted to a manager-only primitive at target, because the Formula ' +
      "card's roll-prompt group and its additional-dice group now both draw this well (issue 2008)",
    { 'src/ui/svelte/apps/manager/checks/CheckOptionGroup.svelte': 1 },
  ],
  [
    'PlayerDetailHeader is a composition of design-system members (Medallion and Button, with ' +
      "the caller's own Chip row), so it draws no control of its own and takes no manifest row",
    { 'src/ui/svelte/apps/PlayerDetailHeader.svelte': 1 },
  ],
  [
    'a composition of the Medallion member and two text runs, shared by the crafting ' +
      "detail's two award lists rather than offered as a vocabulary member",
    { 'src/ui/svelte/apps/crafting/detail/AwardPill.svelte': 1 },
  ],
  [
    "the gathering task editor's own card, the chrome and header snippet its view carried at " +
      "base, shared by that editor's tabs and cards rather than offered as a vocabulary member",
    { 'src/ui/svelte/apps/manager/gathering-task/GatheringTaskCard.svelte': 1 },
  ],
  [
    'the composition licence of "The primitive set is a closed, versioned vocabulary" — this ' +
      "is `PickerRow`'s amount slot, wholly the members `SegmentedControl`, `Stepper` and " +
      "`RollDataExpressionInput`, so its second caller, the result choice group header's N " +
      '(issue 1773), owes it no manifest row',
    { 'src/ui/svelte/apps/manager/recipe/PickerRowAmount.svelte': 1 },
  ],
  [
    STEPPER_LABELS,
    {
      'src/ui/svelte/apps/manager/gathering-task/GatheringTaskCheckOverrideCard.svelte': 3,
      'src/ui/svelte/apps/manager/gathering-task/GatheringTaskNodesCard.svelte': 3,
      'src/ui/svelte/apps/manager/gathering-task/GatheringTaskStaminaCard.svelte': 3,
    },
  ],
  [
    OWN_REST,
    {
      'src/ui/svelte/components/ModifierPillSelect.svelte': 1,
      'src/ui/svelte/components/SearchField.svelte': 1,
    },
  ],
  [
    "the spread is this primitive's own rest, forwarded to the field it composes",
    { 'src/ui/svelte/components/Typeahead.svelte': 1 },
  ],
  [
    "the spread is `primaryProps`, the caller's extra `class` and the `data-*`, `title` and " +
      '`aria-*` Button takes through rest',
    { 'src/ui/svelte/apps/PlayerDetailHeader.svelte': 1 },
  ],
  [
    "the spread is the menu's own trigger contract (ARIA state, handlers, element attachment), " +
      "never a caller's name",
    { 'src/ui/svelte/apps/manager/recipe/RecipeResultAdder.svelte': 1 },
  ],
  [
    "the spread is the popover's own trigger contract (type, ARIA state, handlers, element " +
      "attachment), never a caller's name",
    { 'src/ui/svelte/apps/manager/component/ComponentSalvageCard.svelte': 1 },
  ],
  [
    "the spread is `runStateNotice`'s `hooks`, which holds `data-journal-*` names only",
    { 'src/ui/svelte/apps/journal/RunDetail.svelte': 1 },
  ],
  [
    "the spread is `hook()`'s one `data-*` name from `HOOK_NAMES`",
    { 'src/ui/svelte/apps/manager/environment/GatheringModifierEditor.svelte': 3 },
  ],
  [
    'the spread is the one `labelDataAttr` hook the caller names, or nothing',
    { 'src/ui/svelte/components/StatBox.svelte': 1 },
  ],
  [
    "per-item props carry the caller's data-* hook onto the pill",
    { 'src/ui/svelte/components/OutcomeLadder.svelte': 1 },
  ],
  [
    "per-item props carry the caller's data-* hook onto the band",
    { 'src/ui/svelte/components/OutcomeLadder.svelte': 1 },
  ],
  [
    "per-item props carry the caller's data-* hook onto the row",
    { 'src/ui/svelte/components/OutcomeLadder.svelte': 1 },
  ],
  [
    "per-item `attrs` carry the caller's data-* hooks; Required for and Produced by need two " +
      'hook names with different values, which one `<part>DataAttr` cannot carry',
    { 'src/ui/svelte/components/XrefList.svelte': 1 },
  ],
  [
    'drawn only under `.fabricate-manager`; flat-ui-style-contract keeps the gradient in the sheet',
    { 'src/ui/svelte/util/chanceColorScale.js': 1 },
  ],
  [
    'a one-shot GM pick that gates the drop; DialogV2 re-serialises its body, so the select ' +
      'stays native',
    { 'src/canvas/environmentDialog.js': 1 },
  ],
  [
    "a one-shot pick from core's Compendium directory menu; DialogV2 re-serialises its body, so " +
      'the select stays native',
    { 'src/ui/compendiumDirectoryContext.js': 1 },
  ],
  [
    'the capped-cookbook learn picker is a one-shot choice; DialogV2 re-serialises its body, so ' +
      'the select stays native',
    { 'src/ui/foundryCompat.js': 1 },
  ],
]);

const keyOf = (file, reason) => `${file}\u{0}${reason}`;
const pairOf = (key) => key.replace('\u{0}', ': ');

/** The family's markers in `files`, read through `readFile`, as `{ file, line, reason }`. */
function markersIn(readFile, files) {
  return files.flatMap((file) =>
    parseMarkers(file, readFile(file) ?? '')
      .filter((marker) => marker.family === DESIGN_SYSTEM_FAMILY)
      .map(({ line, reason }) => ({ file, line, reason }))
  );
}

/**
 * The markers no entry pins, the pinned `file: reason` pairs no marker states, and the pairs
 * stated a different number of times than pinned.
 */
function compareToAllowlist(markers, allowlist) {
  const pinned = new Map(
    allowlist.flatMap(([reason, files]) =>
      Object.entries(files).map(([file, count]) => [keyOf(file, reason), count])
    )
  );
  const stated = new Map();
  for (const { file, reason } of markers) {
    stated.set(keyOf(file, reason), (stated.get(keyOf(file, reason)) ?? 0) + 1);
  }
  return {
    unpinned: markers
      .filter(({ file, reason }) => !pinned.has(keyOf(file, reason)))
      .map(({ file, line, reason }) => `${file}:${line} ${reason}`),
    stale: [...pinned.keys()]
      .filter((key) => !stated.has(key))
      .map(pairOf)
      .sort(byCodePoint),
    miscounted: [...pinned]
      .filter(([key, count]) => stated.has(key) && stated.get(key) !== count)
      .map(([key, count]) => `${pairOf(key)} (pinned ${count}, stated ${stated.get(key)})`)
      .sort(byCodePoint),
  };
}

/** Every Svelte file, stylesheet and module under `src/` and `styles/`. */
function treeMarkers() {
  const { readFile, listFiles } = workingTree(STYLE_CORPUS, MODULE_CORPUS);
  return markersIn(readFile, listFiles());
}

test('every design-system marker under src and styles is pinned with its reason', () => {
  const { unpinned } = compareToAllowlist(treeMarkers(), ALLOWLIST);
  assert.deepEqual(
    unpinned,
    [],
    'a `ratchet-exempt(design-system)` marker has no allowlist entry. A marker states a non-debt ' +
      'reason: its library specimen, issue 2257, or why the site is not a control or a record ' +
      'tile. Add its reason and file to ALLOWLIST, or pay the debt instead:\n  ' +
      unpinned.join('\n  ')
  );
});

test('every allowlist entry is still stated by a marker', () => {
  const { stale } = compareToAllowlist(treeMarkers(), ALLOWLIST);
  assert.deepEqual(
    stale,
    [],
    'an allowlist entry names a marker the tree no longer carries, or carries reworded. Delete ' +
      'the entry, or move it with the marker:\n  ' +
      stale.join('\n  ')
  );
});

test('each file states each allowlisted reason as many times as its entry pins', () => {
  const { miscounted } = compareToAllowlist(treeMarkers(), ALLOWLIST);
  assert.deepEqual(
    miscounted,
    [],
    'a marker was copied to a new site or one of several was deleted. Review the site, then ' +
      'pin the count the tree now states:\n  ' +
      miscounted.join('\n  ')
  );
});

test('an allowlist entry pins each file and reason once', () => {
  const keys = ALLOWLIST.flatMap(([reason, files]) =>
    Object.keys(files).map((file) => keyOf(file, reason))
  );
  assert.equal(new Set(keys).size, keys.length, 'a file and reason are pinned twice');
});

test('every computed-census ruling states an allowlisted reason', () => {
  const reasons = new Set(ALLOWLIST.map(([reason]) => reason));
  assert.deepEqual(
    RULED_KINDS.filter(({ reason }) => !reasons.has(reason)).map(({ selector }) => selector),
    [],
    'a `RULED_KINDS` entry in scripts/lib/viewLabComputedCensus.js rounds a box off its band ' +
      'for a reason no site marker states. Mark the site that draws the box and reuse its reason.'
  );
});

test('the comparison fails a marker added, dropped, reworded, copied or deleted, in every form', () => {
  const sources = {
    'probe/a.svelte': [
      '<!-- ratchet-exempt(design-system): kept -->',
      '<style>',
      '  /* ratchet-exempt(design-system): worded */',
      '</style>',
    ].join('\n'),
    'probe/b.js': [
      '// ratchet-exempt(design-system): kept',
      '// ratchet-exempt(design-system): kept',
      '// ratchet-exempt(source-pin): other',
      '// ratchet-exempt(design-system): twice',
    ].join('\n'),
    'probe/c.css': '/* ratchet-exempt(design-system): added */\n',
  };
  const allowlist = [
    ['kept', { 'probe/a.svelte': 1, 'probe/b.js': 1 }],
    ['twice', { 'probe/b.js': 2 }],
    ['reworded', { 'probe/a.svelte': 1 }],
    ['dropped', { 'probe/c.css': 1 }],
  ];
  const markers = markersIn((file) => sources[file], Object.keys(sources));
  assert.deepEqual(compareToAllowlist(markers, allowlist), {
    unpinned: ['probe/a.svelte:3 worded', 'probe/c.css:1 added'],
    stale: ['probe/a.svelte: reworded', 'probe/c.css: dropped'],
    miscounted: ['probe/b.js: kept (pinned 1, stated 2)', 'probe/b.js: twice (pinned 2, stated 1)'],
  });
});
