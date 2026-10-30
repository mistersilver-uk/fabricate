/**
 * The published `SegmentedControl`'s `compact` and `field` densities and an option's `title` (issue
 * 2814) on Fabricate's real Svelte runtime, through a fresh seam registered with the adapter's own
 * table: each density's track class, its removal on an `update`, the values outside the set, the
 * hint written as the segment's `data-tooltip-text` and never as a native `title`, its removal and
 * change on an `update`, the radio's name and the radiogroup's roles left as they were, and a hint
 * that makes no `game.tooltip` call under keyboard focus.
 * Limit: happy-dom answers no `:focus-visible` and runs no radio arrow navigation, so the focus
 * clause only guards a future focus handler by asserting `game.tooltip` receives no call;
 * Foundry's own hover listener is core's.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  fabricateTarget,
  harnessLoaders,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { createLabTooltipManager } from '../view-lab/foundry/installFoundryShim.js';

const OPTIONS = Object.freeze([
  { value: 'warn', label: 'Warn', title: 'Keep the item and warn the player' },
  { value: 'fail', label: 'Fail', title: 'Fail the craft and consume the ingredients' },
  { value: 'skip', label: 'Skip' },
]);
const DENSITY_CLASSES = Object.freeze(['is-compact', 'is-field', 'is-inline']);

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-segmented-density-title-',
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
  seamParts = { createPublishedComponents, runtime, components, loaders: harnessLoaders(harness) };
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
  delete globalThis.game.tooltip;
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
  assert.deepEqual(reports, [], 'the seam reported nothing');
});

/** A control over `OPTIONS` mounted under a Fabricate window: its handle, props and parts. */
function mountControl(overrides = {}, target = fabricateTarget(targets)) {
  const change = recorder();
  const props = {
    options: OPTIONS,
    value: 'warn',
    ariaLabel: 'On failure',
    onChange: change.record,
    ...overrides,
  };
  const handle = ui().mount('SegmentedControl', { target, props });
  return {
    target,
    handle,
    props,
    calls: change.calls,
    group: () => target.querySelector('[role="radiogroup"]'),
    radio: (value) => target.querySelector(`input[type="radio"][value="${value}"]`),
    segment: (value) =>
      target.querySelector(`input[type="radio"][value="${value}"]`).closest('label'),
  };
}

const densityClassesOf = (group) =>
  DENSITY_CLASSES.filter((name) => group.classList.contains(name));

describe('the density values the published SegmentedControl draws', () => {
  for (const [density, drawn] of [
    ['compact', 'is-compact'],
    ['field', 'is-field'],
    ['inline', 'is-inline'],
  ]) {
    it(`draws ${density} as ${drawn} alone on the radiogroup`, async () => {
      const { handle, group } = mountControl({ density });
      await settle();
      assert.deepEqual(densityClassesOf(group()), [drawn]);
      handle.destroy();
    });
  }

  it('draws the default, an absent density and a value outside the set with no density class', async () => {
    for (const density of ['default', undefined, 'tag', 'dense', 'Compact', 'field ', 1, true]) {
      const { handle, group } = mountControl({ density });
      await settle();
      assert.deepEqual(densityClassesOf(group()), [], `density ${String(density)}`);
      handle.destroy();
    }
  });

  it('moves between densities on an update and drops the class when the density is removed', async () => {
    const { handle, props, group } = mountControl({ density: 'compact' });
    await settle();
    const root = group();
    for (const [density, expected] of [
      ['field', ['is-field']],
      ['inline', ['is-inline']],
      ['compact', ['is-compact']],
      ['dense', []],
      ['field', ['is-field']],
      [undefined, []],
    ]) {
      assert.equal(handle.update({ ...props, density }), true);
      await settle();
      assert.ok(group() === root, 'the same radiogroup node');
      assert.deepEqual(densityClassesOf(root), expected, `density ${String(density)}`);
    }
    handle.destroy();
  });

  it('composes a density with fill, tone and shape, and leaves the radios native', async () => {
    const { handle, group, target } = mountControl({
      density: 'field',
      fill: true,
      tone: 'accent-soft',
      shape: 'pill',
    });
    await settle();
    for (const name of ['is-field', 'is-fill', 'is-accent-soft', 'is-pill']) {
      assert.ok(group().classList.contains(name), name);
    }
    assert.equal(group().getAttribute('role'), 'radiogroup');
    assert.equal(target.querySelectorAll('input[type="radio"]').length, OPTIONS.length);
    handle.destroy();
  });
});

describe('an option title on the published SegmentedControl', () => {
  it('writes the hint as the segment’s data-tooltip-text and as no native title anywhere', async () => {
    const { handle, target, segment, radio } = mountControl();
    await settle();
    assert.equal(segment('warn').getAttribute('data-tooltip-text'), OPTIONS[0].title);
    assert.equal(segment('fail').getAttribute('data-tooltip-text'), OPTIONS[1].title);
    assert.ok(!segment('skip').hasAttribute('data-tooltip-text'), 'an option with no title');
    assert.equal(target.querySelectorAll('[title]').length, 0, 'no element carries a native title');
    assert.ok(!radio('warn').hasAttribute('data-tooltip-text'), 'the radio carries none');
    handle.destroy();
  });

  it('leaves the radio named by the label alone, and the radiogroup’s roles as they were', async () => {
    const { handle, target, group, segment, radio } = mountControl();
    await settle();
    for (const { value, label } of OPTIONS) {
      assert.equal(segment(value).querySelector('.manager-segment-label').textContent, label);
      assert.equal(segment(value).textContent.trim(), label, 'the hint is not in the name text');
      for (const name of [
        'aria-label',
        'aria-labelledby',
        'aria-describedby',
        'aria-description',
      ]) {
        assert.ok(!radio(value).hasAttribute(name), `${value} radio has no ${name}`);
      }
    }
    assert.equal(group().getAttribute('role'), 'radiogroup');
    assert.equal(group().getAttribute('aria-label'), 'On failure');
    assert.deepEqual(
      [...target.querySelectorAll('input')].map((node) => node.type),
      ['radio', 'radio', 'radio']
    );
    handle.destroy();
  });

  it('writes the hint as text, never as markup', async () => {
    const hint = '<b>Bold</b> & "quoted"';
    const { handle, target, segment } = mountControl({
      options: [{ value: 'a', label: 'A', title: hint }],
      value: 'a',
    });
    await settle();
    assert.equal(segment('a').getAttribute('data-tooltip-text'), hint);
    assert.equal(target.querySelector('b'), null);
    handle.destroy();
  });

  it('draws no tooltip for a title that is blank or is not a string', async () => {
    for (const title of ['', ' '.repeat(3), undefined, null, 5, true, {}, ['hint']]) {
      const { handle, segment, target } = mountControl({
        options: [{ value: 'a', label: 'A', title }],
        value: 'a',
      });
      await settle();
      assert.ok(!segment('a').hasAttribute('data-tooltip-text'), `title ${JSON.stringify(title)}`);
      assert.equal(target.querySelectorAll('[title]').length, 0);
      handle.destroy();
    }
  });

  it('changes and removes the hint on an update, on the same segment', async () => {
    const { handle, props, segment } = mountControl();
    await settle();
    const node = segment('warn');
    const restate = async (title) => {
      const options = OPTIONS.map((option) =>
        option.value === 'warn' ? { value: 'warn', label: 'Warn', title } : option
      );
      assert.equal(handle.update({ ...props, options }), true);
      await settle();
    };
    await restate('Warn the player only');
    assert.ok(segment('warn') === node, 'the same segment node');
    assert.equal(node.getAttribute('data-tooltip-text'), 'Warn the player only');
    await restate(undefined);
    assert.ok(!node.hasAttribute('data-tooltip-text'), 'the hint is gone with the title');
    await restate('Back again');
    assert.equal(node.getAttribute('data-tooltip-text'), 'Back again');
    await restate('  ');
    assert.ok(!node.hasAttribute('data-tooltip-text'), 'a blank title removes it');
    handle.destroy();
  });

  it('is drawn the same under a companion’s own standalone shell', async () => {
    const { handle, segment } = mountControl({}, companionTarget(targets));
    await settle();
    assert.equal(segment('fail').getAttribute('data-tooltip-text'), OPTIONS[1].title);
    handle.destroy();
  });

  it('makes no game.tooltip call under focus today, which guards a future focus handler, and a reached radio still calls onChange once', async () => {
    const tooltip = createLabTooltipManager();
    globalThis.game.tooltip = tooltip;
    const { handle, calls, radio } = mountControl();
    await settle();
    radio('warn').focus();
    radio('fail').focus();
    radio('fail').checked = true;
    radio('fail').dispatchEvent(new Event('change', { bubbles: true }));
    assert.deepEqual(tooltip.calls, [], 'Fabricate calls game.tooltip for no hint');
    assert.deepEqual(calls, [['fail']]);
    handle.destroy();
  });
});
