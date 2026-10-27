/**
 * The Manage Interactables row's source chip, mounted through the real root (issue 2335): a resolved
 * source is the neutral label, a configured source that no longer resolves is the warning
 * `Unresolved` chip carrying its id for pointer and assistive technology, and an unconfigured row
 * says `Needs configuration` and shows no id, no sentinel and a placeholder title.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  createMountedComponentHarness,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  TYPEAHEAD_RUNE_MODULES,
} from '../helpers/svelte-component-harness.js';

const ROOT_PATH = 'src/ui/svelte/apps/interactables/InteractablesManagerRoot.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-interactables-source-chip-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/ui/svelte/util/systemDisambiguation.js',
  ],
  runeModules: TYPEAHEAD_RUNE_MODULES,
  compiledModules: [
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/SegmentedControl.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/apps/interactables/InteractableRowChips.svelte',
    ROOT_PATH,
  ],
  componentPath: ROOT_PATH,
});

const STATE = Object.freeze({ enabled: true, locked: false, consumed: false });

/** A scan row, with the fields a test overrides. */
function row(behaviorId, fields) {
  return {
    ref: { sceneId: 's1', regionId: 'r1', behaviorId },
    interactableType: 'tool',
    state: STATE,
    markerStatus: 'region-only',
    sourceConfigured: true,
    ...fields,
  };
}

const RESOLVED = row('resolved', {
  name: 'Old Anvil',
  sourceLabel: "Smith's Anvil",
  sourceResolved: true,
  sourceId: 'tool-1',
});
const UNRESOLVED = row('unresolved', {
  name: 'Orphaned smelter',
  sourceLabel: '',
  sourceResolved: false,
  sourceId: 'gone-tool',
});
const UNCONFIGURED = row('unconfigured', {
  name: '',
  sourceLabel: '',
  sourceResolved: false,
  sourceConfigured: false,
  sourceId: '',
});

async function mountRows(rows) {
  const target = await harness.mount({ services: { listRows: () => rows } });
  return Object.fromEntries(
    [...target.querySelectorAll('.fab-im-row')].map((element, index) => [
      rows[index].ref.behaviorId,
      element,
    ])
  );
}

const sourceChip = (rowElement) =>
  rowElement.querySelector('[data-interactable-manager-chip-source]');
const rowName = (rowElement) => rowElement.querySelector('.fab-im-row-name').textContent.trim();

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('Manage Interactables source chip', () => {
  it('draws a resolved source as the neutral label, with no title and no hidden id', async () => {
    const { resolved } = await mountRows([RESOLVED, UNRESOLVED, UNCONFIGURED]);
    const chip = sourceChip(resolved);
    assert.equal(chip.getAttribute('data-interactable-manager-chip-source'), '');
    assert.equal(chip.textContent.trim(), "Smith's Anvil");
    assert.ok(!chip.classList.contains('is-warning'), 'a resolved source is not warned about');
    assert.ok(!chip.hasAttribute('title'), 'and has no tooltip');
    assert.ok(!chip.querySelector('.visually-hidden'), 'and no hidden id');
    assert.equal(rowName(resolved), 'Old Anvil');
  });

  it('draws a configured source that no longer resolves as the warning Unresolved chip with its id', async () => {
    const { unresolved } = await mountRows([RESOLVED, UNRESOLVED, UNCONFIGURED]);
    const chip = sourceChip(unresolved);
    assert.equal(chip.getAttribute('data-interactable-manager-chip-source'), 'unresolved');
    assert.ok(chip.classList.contains('is-warning'), 'in the warning tone');
    const visible = [...chip.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent)
      .join('');
    assert.equal(visible.trim(), 'Unresolved', 'reading Unresolved, not the title');
    assert.equal(chip.getAttribute('title'), 'gone-tool', 'the id is the tooltip');
    const hidden = chip.querySelector('.visually-hidden');
    assert.ok(Boolean(hidden), 'and is exposed as visually hidden text');
    assert.ok(hidden.textContent.includes('gone-tool'));
    assert.equal(rowName(unresolved), 'Orphaned smelter', 'the title stays the stored name');
  });

  it('draws an unconfigured row as Needs configuration with no id, no sentinel and a placeholder title', async () => {
    const { unconfigured } = await mountRows([RESOLVED, UNRESOLVED, UNCONFIGURED]);
    const chip = sourceChip(unconfigured);
    assert.equal(chip.getAttribute('data-interactable-manager-chip-source'), 'unconfigured');
    assert.ok(chip.classList.contains('is-warning'));
    assert.equal(chip.textContent.trim(), 'Needs configuration');
    assert.ok(!chip.hasAttribute('title'), 'there is no id to offer');
    assert.ok(!chip.querySelector('.visually-hidden'));
    assert.equal(rowName(unconfigured), 'Untitled interactable');
    assert.ok(!unconfigured.textContent.includes('Fabricate.unconfigured'), 'no sentinel renders');
  });

  it('draws the type, state and marker chips of a disabled, locked row with a missing marker', async () => {
    const odd = row('odd', {
      name: 'Odd',
      sourceLabel: 'Anvil',
      sourceResolved: true,
      sourceId: 'tool-1',
      interactableType: 'gatheringTask',
      state: { enabled: false, locked: true, consumed: true },
      markerStatus: 'missing',
    });
    const { odd: element } = await mountRows([odd]);
    const text = (selector) =>
      [...element.querySelectorAll(selector)].map((chip) => chip.textContent.trim());
    assert.deepEqual(text('[data-interactable-manager-chip-type]'), ['Gathering task']);
    assert.deepEqual(text('[data-interactable-manager-chip-state]'), [
      'Disabled',
      'Locked',
      'Consumed',
    ]);
    const marker = element.querySelector('[data-interactable-manager-chip-marker="missing"]');
    assert.ok(Boolean(marker), 'the missing-marker chip is drawn');
    assert.equal(marker.textContent.trim(), 'Missing');
    assert.ok(marker.classList.contains('is-danger'), 'in the danger tone');
  });
});
