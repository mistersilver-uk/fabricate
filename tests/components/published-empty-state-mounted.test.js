/**
 * The published `EmptyState`'s `compact`, `inline` and `note` (issue 2783) on Fabricate's real
 * Svelte runtime, through a fresh seam registered with the adapter's own table, into a companion
 * target under no Fabricate ancestor: the one class each key writes beside the root, its removal
 * on `update`, what a value outside `true` and `false` draws, the keys composed, and the sheet
 * that releases the panel for `note`.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  recordEscapes,
  settle,
  shippedSeam,
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-empty-state-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let targets;
let stopRecording;

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
  assert.deepEqual(reports, [], 'nothing was reported');
});

/** A panel mounted with `props`: its handle and the panel as drawn now. */
function mountPanel(props = {}) {
  const target = companionTarget(targets);
  const handle = ui().mount('EmptyState', { target, props: { title: 'Nothing here', ...props } });
  return { handle, panel: () => target.querySelector('.manager-empty') };
}

/** A node's authored classes, without Svelte's scope hash. */
const classesOf = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

describe('the published EmptyState, compact, inline and note', () => {
  for (const key of ['compact', 'inline', 'note']) {
    it(`writes is-${key} beside the root, and removes it when an update omits it`, async () => {
      const { handle, panel } = mountPanel({ icon: 'fas fa-feather', [key]: true });
      await settle();
      assert.deepEqual(classesOf(panel()), ['manager-empty', `is-${key}`]);
      assert.equal(handle.update({ title: 'Nothing here', icon: 'fas fa-feather' }), true);
      await settle();
      assert.deepEqual(classesOf(panel()), ['manager-empty']);
      handle.destroy();
    });

    it(`writes no class for ${key}: false`, async () => {
      const { handle, panel } = mountPanel({ [key]: false });
      await settle();
      assert.deepEqual(classesOf(panel()), ['manager-empty']);
      handle.destroy();
    });

    it(`counts the string 'false' as true for ${key}, since the seam coerces no boolean`, async () => {
      const { handle, panel } = mountPanel({ [key]: 'false' });
      await settle();
      assert.deepEqual(classesOf(panel()), ['manager-empty', `is-${key}`]);
      handle.destroy();
    });

    it(`draws the plain panel for ${key}: 0, an empty string and null`, async () => {
      for (const value of [0, '', null]) {
        const { handle, panel } = mountPanel({ [key]: value });
        await settle();
        assert.deepEqual(classesOf(panel()), ['manager-empty'], JSON.stringify(value));
        handle.destroy();
      }
    });
  }

  it('writes each of the three beside filtered, in the root, state order', async () => {
    const { handle, panel } = mountPanel({
      compact: true,
      inline: true,
      note: true,
      filtered: true,
      hint: 'No match.',
    });
    await settle();
    assert.deepEqual(classesOf(panel()), [
      'manager-empty',
      'is-compact',
      'is-inline',
      'is-note',
      'is-filtered',
    ]);
    handle.destroy();
  });

  it('keeps the stack, glyph, title and hint under the root whatever the form', async () => {
    const { handle, panel } = mountPanel({
      note: true,
      icon: 'fas fa-feather',
      hint: 'Add one to begin.',
    });
    await settle();
    const column = panel().firstElementChild;
    assert.deepEqual(
      [...column.children].map((node) => node.localName),
      ['i', 'h3', 'p']
    );
    assert.equal(column.firstElementChild.getAttribute('aria-hidden'), 'true');
    handle.destroy();
  });

  it('refuses a key it does not publish beside them', () => {
    const target = companionTarget(targets);
    for (const key of ['field', 'fill', 'contextClass']) {
      assert.throws(() => ui().mount('EmptyState', { target, props: { [key]: true } }), {
        name: 'TypeError',
        message: /is not a data attribute/u,
      });
    }
  });
});

describe('the published EmptyState, the form each key draws', () => {
  const PROBE =
    ':root { --fab-space-4: 16px; --fab-space-3: 12px; --fab-space-chip: 7px; --fab-border-strong: rgb(9, 9, 9); }';

  it('draws the dashed panel by default and releases it for note', async () => {
    await underSheet(PROBE, async () => {
      const plain = mountPanel({ icon: 'fas fa-feather' });
      const note = mountPanel({ icon: 'fas fa-feather', note: true });
      await settle();
      const [boxed, released] = [plain, note].map(({ panel }) => getComputedStyle(panel()));
      assert.equal(boxed.borderTopStyle, 'dashed');
      assert.equal(boxed.borderTopWidth, '1px');
      assert.equal(released.borderTopWidth, '0px', 'no dashed edge');
      assert.equal(released.borderTopLeftRadius, '0px', 'no corner');
      plain.handle.destroy();
      note.handle.destroy();
    });
  });

  it('releases the panel for inline with note, and leaves its stack a row', async () => {
    await underSheet(PROBE, async () => {
      const both = mountPanel({ icon: 'fas fa-feather', inline: true, note: true });
      await settle();
      const panel = getComputedStyle(both.panel());
      assert.equal(panel.borderTopWidth, '0px');
      assert.equal(getComputedStyle(both.panel().firstElementChild).flexDirection, 'row');
      both.handle.destroy();
    });
  });

  it('flips the stack to a row for inline, and keeps the column for compact', async () => {
    await underSheet(PROBE, async () => {
      const compact = mountPanel({ icon: 'fas fa-feather', compact: true });
      const inline = mountPanel({ icon: 'fas fa-feather', inline: true });
      await settle();
      const direction = ({ panel }) => getComputedStyle(panel().firstElementChild).flexDirection;
      assert.equal(direction(compact), 'column');
      assert.equal(direction(inline), 'row');
      compact.handle.destroy();
      inline.handle.destroy();
    });
  });
});
