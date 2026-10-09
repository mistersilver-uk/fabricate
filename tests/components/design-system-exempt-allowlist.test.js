/**
 * Every `ratchet-exempt(design-system)` marker under `src/` and `styles/` is pinned here with its
 * reason (issue 1523): a marker no entry names fails, and so does an entry no marker states. Sites,
 * lines and counts are read from the tree, so an entry keeps only the reviewed reason and its
 * files. A `//` marker that runs on is pinned by its first line, the reason `parseMarkers` reads.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { byCodePoint } from '../helpers/codePointOrder.js';
import { DESIGN_SYSTEM_FAMILY } from '../helpers/designSystemRatchet.js';
import { parseMarkers } from '../helpers/mergeBaseRatchet.js';
import { collectWorkingTreeSources } from '../helpers/sourceScan.js';

const PORTRAIT = "an actor portrait, the portrait ladder's 32 single mark, not a control";
const STEPPER_LABELS =
  'the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from ' +
  'GatheringTaskEditView';
const OWN_REST = "the spread is this primitive's own rest, forwarded to the root it composes";

/** Each reviewed reason, and the files whose markers state it. */
const ALLOWLIST = Object.freeze([
  [
    PORTRAIT,
    [
      'src/ui/svelte/apps/crafting/ComponentSourcesBar.svelte',
      'src/ui/svelte/apps/manager/PartyTravelActorPanel.svelte',
      'styles/fabricate.css',
    ],
  ],
  [
    "a tile, not a control: the portrait ladder's 32, the slot PartyTravelActorPanel fills with " +
      'an actor portrait on link',
    ['src/ui/svelte/components/EmptyState.svelte'],
  ],
  [
    "a 14px inline mark inside a 20px text pill, not a record tile; the art ladder's 22 would " +
      'grow every pill',
    ['src/ui/svelte/apps/inventory/detail/salvage/SalvageRollSummary.svelte'],
  ],
  [
    "a 124px preview of the GM's colour and icon choice, not a record tile; the art ladder's 38 " +
      'would shrink it to a speck',
    ['src/ui/svelte/apps/manager/essences/EssenceIdentityTab.svelte'],
  ],
  [
    "a 150px preview of the GM's colour and icon choice, not a record tile; the art ladder's 38 " +
      'would shrink it to a speck',
    ['src/ui/svelte/apps/manager/scoped/WorldEssenceEntryPage.svelte'],
  ],
  [
    "the library's 56px slot tile; its geometry against the specimen is issue 2257's to converge",
    ['src/ui/svelte/components/SlotTile.svelte'],
  ],
  [
    "the compact search's 32, the one exception to the retired 32 the geometry requirement names",
    ['styles/fabricate.css'],
  ],
  [
    "the 22px button's 6px corner outset by the 1px hit-area padding, so the content-box " +
      'background still draws 6; retires if the adjunct moves to the ::before form or a hit-area ' +
      'token lands',
    ['src/ui/svelte/components/Stepper.svelte'],
  ],
  [
    "an alignment, not a step: the header's 8px inset, its 38px thumb and the thumb's 12px gap",
    ['src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte'],
  ],
  [
    "an alignment, not a step: the option's 8px inset, its 12px tick and the tick's 8px gap",
    ['styles/fabricate.css'],
  ],
  [
    'a derived token is declared once on every root a palette is, :root included, so each ' +
      'resolves against its own palette. --fab-control-outline outlines an unchecked selection ' +
      'control at 3:1 on its surface in every palette (issue 2047).',
    ['styles/fabricate.css'],
  ],
  [
    "<PageHeader> ships at target, because its callers keep the manager's shipped header " +
      "geometry, which disagrees with the specimen's (issue 1777 decision E4; geometry converges " +
      'in issue 2257)',
    ['src/ui/svelte/components/PageHeader.svelte'],
  ],
  [
    "<NavSidebar> ships at target, because the manager sidebar's expanded group draws no box and " +
      'the player rail paints its pip in the success ink, both against the specimen (issue 1777 ' +
      'decision E3; geometry converges in issue 2257)',
    ['src/ui/svelte/components/NavSidebar.svelte'],
  ],
  [
    "promoted on its second importer at issue 1644; its icon chip, hint line and a short " +
      "candidate's undimmed reading still disagree with the specimen, carried to issue 2257",
    ['src/ui/svelte/components/ChoiceOptionList.svelte'],
  ],
  [
    'promoted on its third importer at issue 1644; its head glyph, band chip, row yields and ' +
      'kicker disagree with the specimen, recorded in the migrations table, so the row arrives ' +
      'at target',
    ['src/ui/svelte/components/OutcomeLadder.svelte'],
  ],
  [
    'the die tiles are promoted to a shared primitive at target, because the player result box ' +
      'and the salvage roll summary now import them beside the Checks Studio simulator ' +
      '(issue 2006)',
    ['src/ui/svelte/components/DiceTiles.svelte'],
  ],
  [
    'InlineRenameField is a new manager-only member at target, because it replaces ' +
      'PartyNameField and RealmNameField and so has two callers (issue 1521)',
    ['src/ui/svelte/apps/manager/InlineRenameField.svelte'],
  ],
  [
    "CheckOptionGroup is promoted to a manager-only primitive at target, because the Formula " +
      "card's roll-prompt group and its additional-dice group now both draw this well (issue 2008)",
    ['src/ui/svelte/apps/manager/checks/CheckOptionGroup.svelte'],
  ],
  [
    'PlayerDetailHeader is a composition of design-system members (Medallion and Button, with ' +
      "the caller's own Chip row), so it draws no control of its own and takes no manifest row",
    ['src/ui/svelte/apps/PlayerDetailHeader.svelte'],
  ],
  [
    'a composition of the Medallion member and two text runs, shared by the crafting ' +
      "detail's two award lists rather than offered as a vocabulary member",
    ['src/ui/svelte/apps/crafting/detail/AwardPill.svelte'],
  ],
  [
    "the gathering task editor's own card, the chrome and header snippet its view carried at " +
      "base, shared by that editor's tabs and cards rather than offered as a vocabulary member",
    ['src/ui/svelte/apps/manager/gathering-task/GatheringTaskCard.svelte'],
  ],
  [
    'the composition licence of "The primitive set is a closed, versioned vocabulary" — this ' +
      "is `PickerRow`'s amount slot, wholly the members `SegmentedControl`, `Stepper` and " +
      "`RollDataExpressionInput`, so its second caller, the result choice group header's N " +
      '(issue 1773), owes it no manifest row',
    ['src/ui/svelte/apps/manager/recipe/PickerRowAmount.svelte'],
  ],
  [
    STEPPER_LABELS,
    [
      'src/ui/svelte/apps/manager/gathering-task/GatheringTaskCheckOverrideCard.svelte',
      'src/ui/svelte/apps/manager/gathering-task/GatheringTaskNodesCard.svelte',
      'src/ui/svelte/apps/manager/gathering-task/GatheringTaskStaminaCard.svelte',
    ],
  ],
  [
    OWN_REST,
    [
      'src/ui/svelte/components/ModifierPillSelect.svelte',
      'src/ui/svelte/components/SearchField.svelte',
    ],
  ],
  [
    "the spread is this primitive's own rest, forwarded to the field it composes",
    ['src/ui/svelte/components/Typeahead.svelte'],
  ],
  [
    "the spread is `primaryProps`, the caller's extra `class` and the `data-*`, `title` and " +
      '`aria-*` Button takes through rest',
    ['src/ui/svelte/apps/PlayerDetailHeader.svelte'],
  ],
  [
    "the spread is the menu's own trigger contract (ARIA state, handlers, element attachment), " +
      "never a caller's name",
    ['src/ui/svelte/apps/manager/recipe/RecipeResultAdder.svelte'],
  ],
  [
    "the spread is the popover's own trigger contract (type, ARIA state, handlers, element " +
      "attachment), never a caller's name",
    ['src/ui/svelte/apps/manager/component/ComponentSalvageCard.svelte'],
  ],
  [
    "the spread is `runStateNotice`'s `hooks`, which holds `data-journal-*` names only",
    ['src/ui/svelte/apps/journal/RunDetail.svelte'],
  ],
  [
    "the spread is `hook()`'s one `data-*` name from `HOOK_NAMES`",
    ['src/ui/svelte/apps/manager/environment/GatheringModifierEditor.svelte'],
  ],
  [
    "the spread is the one `labelDataAttr` hook the caller names, or nothing",
    ['src/ui/svelte/components/StatBox.svelte'],
  ],
  [
    "per-item props carry the caller's data-* hook onto the pill",
    ['src/ui/svelte/components/OutcomeLadder.svelte'],
  ],
  [
    "per-item props carry the caller's data-* hook onto the band",
    ['src/ui/svelte/components/OutcomeLadder.svelte'],
  ],
  [
    "per-item props carry the caller's data-* hook onto the row",
    ['src/ui/svelte/components/OutcomeLadder.svelte'],
  ],
  ['a one-shot GM pick that gates the drop; DialogV2', ['src/canvas/environmentDialog.js']],
  [
    "a one-shot pick from core's Compendium directory menu;",
    ['src/ui/compendiumDirectoryContext.js'],
  ],
  [
    'the capped-cookbook learn picker is a one-shot choice;',
    ['src/ui/foundryCompat.js'],
  ],
]);

const MARKED_EXTENSIONS = Object.freeze(['.js', '.mjs', '.svelte', '.css']);

const keyOf = (file, reason) => `${file}\u{0}${reason}`;

/** The family's markers in `sources` (`{ path: text }`), as `{ file, line, reason }`. */
function markersIn(sources) {
  return Object.entries(sources).flatMap(([file, text]) =>
    parseMarkers(file, text)
      .filter((marker) => marker.family === DESIGN_SYSTEM_FAMILY)
      .map(({ line, reason }) => ({ file, line, reason }))
  );
}

/** The markers no entry pins, and the pinned `file: reason` pairs no marker states. */
function compareToAllowlist(markers, allowlist) {
  const pinned = new Map(
    allowlist.flatMap(([reason, files]) => files.map((file) => [keyOf(file, reason), file]))
  );
  const stated = new Set(markers.map(({ file, reason }) => keyOf(file, reason)));
  return {
    unpinned: markers
      .filter(({ file, reason }) => !pinned.has(keyOf(file, reason)))
      .map(({ file, line, reason }) => `${file}:${line} ${reason}`),
    stale: [...pinned.keys()]
      .filter((key) => !stated.has(key))
      .map((key) => key.replace('\u{0}', ': '))
      .sort(byCodePoint),
  };
}

const treeMarkers = () =>
  markersIn(collectWorkingTreeSources(['src', 'styles'], [...MARKED_EXTENSIONS]));

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

test('an allowlist entry pins each file and reason once', () => {
  const keys = ALLOWLIST.flatMap(([reason, files]) => files.map((file) => keyOf(file, reason)));
  assert.equal(new Set(keys).size, keys.length, 'a file and reason are pinned twice');
});

test('the comparison fails a marker added, dropped or reworded, in every comment form', () => {
  const sources = {
    'src/a.svelte': [
      '<!-- ratchet-exempt(design-system): kept -->',
      '<style>',
      '  /* ratchet-exempt(design-system): worded */',
      '</style>',
    ].join('\n'),
    'src/b.js': '// ratchet-exempt(design-system): kept\n// ratchet-exempt(source-pin): other\n',
    'styles/c.css': '/* ratchet-exempt(design-system): added */\n',
  };
  const allowlist = [
    ['kept', ['src/a.svelte', 'src/b.js']],
    ['reworded', ['src/a.svelte']],
    ['dropped', ['styles/c.css']],
  ];
  assert.deepEqual(compareToAllowlist(markersIn(sources), allowlist), {
    unpinned: ['src/a.svelte:3 worded', 'styles/c.css:1 added'],
    stale: ['src/a.svelte: reworded', 'styles/c.css: dropped'],
  });
});
