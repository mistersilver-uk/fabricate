import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Shared mounted-component harness (no inlined mount boilerplate — that trips the
// Sonar duplication gate).
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-segmented-',
  rawModules: ['src/ui/svelte/util/foundryBridge.js'],
  compiledModules: ['src/ui/svelte/apps/manager/SegmentedControl.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/SegmentedControl.svelte'
});

const OPTIONS = [
  { value: 'destroyed', labelKey: 'FABRICATE.X.Destroyed', fallback: 'Destroyed', icon: 'fas fa-trash' },
  { value: 'inert', labelKey: 'FABRICATE.X.Inert', fallback: 'Becomes inert' }
];

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('SegmentedControl (mounted)', () => {
  it('renders one radio segment per option with the fallback labels', async () => {
    const root = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'when-spent' });
    const segments = root.querySelectorAll('.manager-segment');
    assert.equal(segments.length, 2);
    const radios = root.querySelectorAll('input[type="radio"]');
    assert.equal(radios.length, 2);
    assert.equal(radios[0].getAttribute('name'), 'when-spent');
    const labels = [...root.querySelectorAll('.manager-segment-label')].map(n => n.textContent);
    assert.deepEqual(labels, ['Destroyed', 'Becomes inert']);
  });

  it('reflects the selected value on the active segment and its radio', async () => {
    const root = await harness.mount({ options: OPTIONS, value: 'inert', groupName: 'g' });
    const active = root.querySelector('.manager-segment.is-active');
    assert.ok(active, 'expected an active segment');
    assert.equal(active.querySelector('.manager-segment-label').textContent, 'Becomes inert');
    const radios = root.querySelectorAll('input[type="radio"]');
    assert.equal(radios[0].checked, false);
    assert.equal(radios[1].checked, true);
  });

  it('calls onChange with the option value when a segment is selected', async () => {
    const calls = [];
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      onChange: (v) => calls.push(v)
    });
    const inertRadio = root.querySelectorAll('input[type="radio"]')[1];
    inertRadio.checked = true;
    inertRadio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(calls, ['inert']);
  });

  it('does not fire onChange when the already-selected segment is chosen', async () => {
    const calls = [];
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      onChange: (v) => calls.push(v)
    });
    const destroyedRadio = root.querySelectorAll('input[type="radio"]')[0];
    destroyedRadio.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    assert.deepEqual(calls, []);
  });

  it('adds the is-fill class to the track only when fill is set', async () => {
    const plain = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'g' });
    assert.equal(
      plain.querySelector('.manager-segmented').classList.contains('is-fill'),
      false,
      'the default track hugs its content (no is-fill)'
    );
    harness.remount();
    const filled = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      fill: true
    });
    assert.ok(
      filled.querySelector('.manager-segmented.is-fill'),
      'fill=true makes the track span its container full-width'
    );
  });

  it('tints only the ACTIVE segment with its per-option variant', async () => {
    const options = [
      { value: 'success', variant: 'success', fallback: 'Automatic success' },
      { value: 'none', variant: 'neutral', fallback: 'No effect' },
      { value: 'failure', variant: 'danger', fallback: 'Automatic failure' }
    ];
    const root = await harness.mount({ options, value: 'failure', groupName: 'g' });
    const seg = (value) =>
      [...root.querySelectorAll('.manager-segment')].find(
        (node) => node.querySelector('input').value === value
      );
    assert.ok(seg('failure').classList.contains('is-danger'), 'the active segment is tinted');
    assert.equal(
      seg('success').classList.contains('is-success'),
      false,
      'an INACTIVE segment carries no variant class — it stays the muted track colour'
    );
    assert.equal(
      seg('none').classList.contains('is-neutral'),
      false,
      'and the neutral variant is likewise inactive-clean'
    );
  });

  it('leaves a variant-free consumer’s markup unchanged', async () => {
    // The three shipped consumers (whenSpent, learning scope, recipe step mode) set no
    // variant, so the conversion must not add a class to their segments.
    const root = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'g' });
    const active = root.querySelector('.manager-segment.is-active');
    // The scoped-style hash class is compiler output, not authored markup.
    const authored = [...active.classList].filter((name) => !name.startsWith('svelte-')).sort();
    assert.deepEqual(authored, ['is-active', 'manager-segment']);
  });

  it('carries `disabled` onto the RADIO, not merely onto a class', async () => {
    const calls = [];
    const options = [
      { value: 'a', fallback: 'A' },
      { value: 'b', fallback: 'B', disabled: true }
    ];
    const root = await harness.mount({
      options,
      value: 'a',
      groupName: 'g',
      optionDataAttr: 'data-seg',
      onChange: (v) => calls.push(v)
    });
    const disabledSegment = root.querySelector('[data-seg="b"]');
    assert.ok(disabledSegment.classList.contains('is-disabled'), 'the segment is marked disabled');
    const radio = disabledSegment.querySelector('input[type="radio"]');
    assert.equal(radio.disabled, true, 'the radio itself is disabled');
    // A dimmed-but-live radio would still fire: `select()` only guards `next !== value`.
    radio.click();
    assert.deepEqual(calls, [], 'a disabled segment cannot change the selection');
    assert.equal(
      root.querySelector('[data-seg="a"] input[type="radio"]').disabled,
      false,
      'its sibling stays interactive'
    );
  });

  // ── The icon-only variant (issue 1036) ──────────────────────────────────────────
  //
  // Opt-in, and the opt-out side is the half worth pinning: the essence library's
  // list/grid toggle is the only consumer that sets it, so the other four must render
  // exactly what they rendered before the flag existed.
  it('adds is-icon-only to the track only when iconOnly is set', async () => {
    const plain = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'g' });
    assert.equal(
      plain.querySelector('.manager-segmented').classList.contains('is-icon-only'),
      false,
      'the default track renders its labels (no is-icon-only)'
    );
    harness.remount();
    const compact = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      iconOnly: true
    });
    assert.ok(
      compact.querySelector('.manager-segmented.is-icon-only'),
      'iconOnly=true compacts the track to glyph tiles'
    );
  });

  // The variant is a pure CSS statement over the SAME DOM. The label span is CLIPPED,
  // never dropped and never `display: none` — the `<label>` IS the radio's accessible
  // name, so removing the text would leave every segment of an icon-only track anonymous
  // to a screen reader. `title` is the pointer half of the same affordance, and it is
  // added ONLY here: a labelled segment whose tooltip repeats its own visible words is
  // noise, and the attribute would be a markup change for the four existing consumers.
  it('keeps the label text as the accessible name and titles the tile, in icon-only only', async () => {
    const compact = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      iconOnly: true
    });
    assert.deepEqual(
      [...compact.querySelectorAll('.manager-segment-label')].map((n) => n.textContent),
      ['Destroyed', 'Becomes inert'],
      'an icon-only segment still carries its words — they are clipped by CSS, not dropped'
    );
    assert.deepEqual(
      [...compact.querySelectorAll('.manager-segment')].map((n) => n.getAttribute('title')),
      ['Destroyed', 'Becomes inert'],
      'and names itself to the pointer'
    );
    harness.remount();

    const plain = await harness.mount({ options: OPTIONS, value: 'destroyed', groupName: 'g' });
    assert.deepEqual(
      [...plain.querySelectorAll('.manager-segment')].map((n) => n.hasAttribute('title')),
      [false, false],
      'a labelled consumer gets no title attribute at all — its markup is untouched'
    );
  });

  // The View Lab's `manager-essences-grid` case steps on `[data-essence-view-option="grid"]`,
  // which is this hook. `view-lab-screenshots.mjs` calls `target.click()`, whose hit-target
  // check requires the element under the click point to BE the target or a DESCENDANT of it —
  // so the hook must stay on the enclosing `<label>` and never move to the radio. A selector
  // that resolves to the 1x1 clipped radio times out for 30s, and one failing case fails the
  // whole capture job and publishes NOTHING, which lets the screenshot gate pass on stale
  // frames. The compaction must not have moved it.
  it('keeps optionDataAttr on the clickable LABEL in the icon-only variant', async () => {
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      iconOnly: true,
      optionDataAttr: 'data-seg'
    });
    const hook = root.querySelector('[data-seg="inert"]');
    assert.ok(Boolean(hook), 'the option hook must resolve to an element');
    assert.equal(hook.tagName, 'LABEL', 'the hook is the label, never the hidden radio');
    assert.equal(
      hook.querySelector('input[type="radio"]').getAttribute('data-seg'),
      null,
      'and the radio does not also carry it, which would make the selector ambiguous'
    );
    // The tile's visible content is the glyph, so a compacted segment that rendered no
    // icon would be an empty click target.
    assert.ok(
      Boolean(root.querySelector('[data-seg="destroyed"] i.fa-trash')),
      'the glyph is what the tile shows'
    );
  });

  it('stamps dataAttr and optionDataAttr hooks', async () => {
    const root = await harness.mount({
      options: OPTIONS,
      value: 'destroyed',
      groupName: 'g',
      dataAttr: 'data-when-spent-control',
      optionDataAttr: 'data-when-spent-option'
    });
    assert.ok(root.querySelector('[data-when-spent-control]'));
    assert.ok(root.querySelector('[data-when-spent-option="inert"]'));
  });
});
