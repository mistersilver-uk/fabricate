/**
 * THE PICKER'S EMPTY PANEL IS A NOTE, NOT A NO-STATE PANEL (issue 1373).
 *
 * The maintainer opened the repair row's `+ Tag` picker beside the design and photographed
 * the difference: ours drew `EmptyState`'s dashed hero — a 32px tiled magnifier over a serif
 * heading, centred inside its own bordered box — where the design draws one quiet line
 * (`proto:2262`: `padding:7px; font:500 10px var(--sans); color:var(--subtle)`), no box and
 * no glyph. That treatment belongs to the PRIMITIVE, not to the call site: every one of the
 * 22 `<SearchablePopover>` sites reaches the same branch, and five of them pass no
 * `emptyHint` at all, so their empty panel was a dashed box containing nothing but a
 * magnifier. A hero panel inside a 240px popover is not right for any of them, so the
 * DEFAULT moves rather than a variant being added for one caller.
 *
 * ── AND THE TWO EMPTINESSES READ DIFFERENTLY ────────────────────────────────────────────
 * `openspec/specs/design-system/spec.md` requires an empty state to distinguish "an
 * unfiltered emptiness from a filtered one", and this primitive did not: a GM who typed
 * `zzz` into a picker holding twelve tags was told `No tags defined`, which is false. The
 * caller's `emptyHint` now answers only for the list being empty; a search that filters
 * everything out answers with the design's own words for that state (`proto:2281`,
 * `No matches`), which the primitive localizes itself so no call site has to be edited to
 * stop lying.
 *
 * ── WHY MOUNTED RATHER THAN SOURCE-READ ─────────────────────────────────────────────────
 * Both halves are branch selection, which a source scan cannot evaluate: the glyph is passed
 * as a prop and the message is chosen by a `$derived`, so "no icon reaches `EmptyState`" and
 * "the filtered branch is the one that renders" are facts about a render. The APPEARANCE of
 * the note — that `is-note` releases the panel and the tile — is pinned where appearance
 * lives, in `empty-state-mounted.test.js` against the primitive's own scoped block.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const TAGS = [
  { id: 'metal', label: 'Metal', icon: 'fas fa-tag' },
  { id: 'wood', label: 'Wood', icon: 'fas fa-tag' },
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-picker-empty-note-',
  rawModules: SEARCHABLE_POPOVER_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/SearchablePopover.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/SearchablePopover.svelte',
});

const mountPicker = (props) =>
  harness.mount({
    options: [],
    triggerLabel: 'Tag',
    triggerAriaLabel: 'Add tag',
    dialogAriaLabel: 'Add tag',
    searchPlaceholder: 'Search tags...',
    emptyHint: 'No tags defined',
    onChoose: () => {},
    ...props,
  });

/** Open the picker and return the portaled panel. */
function openPanel() {
  harness.target.querySelector('button').click();
  flushSync();
  return harness.target.querySelector('.fabricate-picker-popover');
}

/** Type into the panel's search field, as a GM filtering the list does. */
function search(panel, term) {
  const field = panel.querySelector('.manager-travel-popover-search input');
  assert.ok(Boolean(field), 'the panel renders a search field');
  field.value = term;
  field.dispatchEvent(new window.Event('input', { bubbles: true }));
  flushSync();
}

/** The empty panel's authored classes, with Svelte's per-component scope hash removed. */
function authoredClasses(node) {
  return [...node.classList].filter((name) => !name.startsWith('svelte-'));
}

describe('1373 SearchablePopover — the empty panel is a note', () => {
  before(harness.setup);
  after(harness.teardown);

  it('draws one quiet line with no box and no glyph when the list is empty', async () => {
    await mountPicker({});
    const panel = openPanel();
    const empty = panel.querySelector('.manager-empty');
    assert.ok(Boolean(empty), 'the empty branch renders the shared no-state primitive');
    assert.ok(
      authoredClasses(empty).includes('is-note'),
      `the popover's empty state is the NOTE variant, not the dashed hero: ${authoredClasses(empty).join(' ')}`
    );
    assert.ok(
      !empty.querySelector('i'),
      'the design draws no glyph beside the line (proto:2262), so no icon reaches EmptyState'
    );
    assert.match(empty.textContent.replace(/\s+/g, ' ').trim(), /No tags defined/);
    harness.remount();
  });

  it('says the list is empty, not that nothing matched, when nothing is authored', async () => {
    await mountPicker({});
    const panel = openPanel();
    search(panel, 'zzz');
    assert.match(
      panel.querySelector('.manager-empty').textContent.replace(/\s+/g, ' ').trim(),
      /No tags defined/,
      'with no options at all the caller`s sentence is the true one whatever is typed'
    );
    harness.remount();
  });

  it('says nothing matched when a search filters an authored list to nothing', async () => {
    await mountPicker({ options: TAGS });
    const panel = openPanel();
    search(panel, 'zzz');
    const empty = panel.querySelector('.manager-empty');
    assert.ok(Boolean(empty), 'a filtered-to-nothing list renders the empty branch');
    const line = empty.textContent.replace(/\s+/g, ' ').trim();
    assert.match(
      line,
      /No matches/,
      `a search that filters twelve tags to none must not claim none are defined: "${line}"`
    );
    assert.doesNotMatch(line, /No tags defined/);
    harness.remount();
  });

  it('keeps the caller`s explanatory sentence when it passes one', async () => {
    await mountPicker({ emptyDetail: 'No actor has a configured player-character type.' });
    const panel = openPanel();
    const empty = panel.querySelector('.manager-empty');
    assert.match(empty.textContent, /No actor has a configured player-character type\./);
    assert.ok(!empty.querySelector('i'), 'the detail line does not bring the glyph back');
    harness.remount();
  });

  it('drops that sentence in the filtered state, where it would be false', async () => {
    // `emptyDetail` explains why a list holds NOTHING — the travel-actor picker names the
    // module setting to change — and that explanation is false of a list that holds plenty and
    // was searched. The player window's actor bar is what proved it: rendered under `No
    // character matches your search`, its body still read `ask your GM to add its actor type`.
    await mountPicker({
      options: TAGS,
      emptyDetail: 'No actor has a configured player-character type.',
    });
    const panel = openPanel();
    search(panel, 'zzz');
    const line = panel.querySelector('.manager-empty').textContent;
    assert.match(line, /No matches/);
    assert.doesNotMatch(
      line,
      /player-character type/,
      'a reason for an EMPTY list must not be given as the reason a search matched nothing'
    );
    harness.remount();
  });
});
