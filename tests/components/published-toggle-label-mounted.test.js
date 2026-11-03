/**
 * The published `StatusToggle`'s `label` (issues 2902, 2795) on Fabricate's real Svelte runtime,
 * through a fresh seam registered with the adapter's own table: the label drawn inside the one
 * button beside the track, so a press on its words is a press on the switch; the name it gives
 * the button, or the `ariaLabel` that must hold its words (M22); the M9 that asks for one of the
 * two, the M14 for a non-string label, the blank label dropped beside an `ariaLabel`; an update
 * that renames or drops it on the same focused node; and the track-only form left as it was.
 * Limit: happy-dom computes no accessible name, wraps no text and hit-tests no point:
 * `published-toggle-label-rendered.test.js` reads all three in Chromium.
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
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const LABEL = 'Required';
const NAME = 'Group by category';
const HINT_ID = 'acme-required-hint';
const NAME_SPAN = '.manager-status-toggle-name';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-toggle-label-',
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

/** The props of an off switch labelled `Required`, with `overrides` over them. */
const labelled = (overrides = {}) => ({ on: false, label: LABEL, onclick() {}, ...overrides });

/** A switch mounted with `props`: its target, handle, recorded presses and the button drawn now. */
function mountToggle(props) {
  const press = recorder();
  const target = fabricateTarget(targets);
  const handle = ui().mount('StatusToggle', { target, props: { ...props, onclick: press.record } });
  return { target, handle, calls: press.calls, button: () => target.querySelector('button') };
}

const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The refusal `mount` and an `update` each throw for `props`, with nothing new drawn. */
async function assertRefused(props, tail) {
  const target = fabricateTarget(targets);
  assert.throws(() => ui().mount('StatusToggle', { target, props }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
  const { handle, button } = mountToggle(labelled());
  await settle();
  assert.throws(() => handle.update(props), { name: 'TypeError', message: REFUSAL + tail });
  await settle();
  assert.equal(button().querySelector(NAME_SPAN).textContent, LABEL, 'the earlier label stays');
  handle.destroy();
}

describe('the published StatusToggle names', () => {
  it('draws the label inside the one button, after the track, and names the button by it alone', async () => {
    const { target, handle, button } = mountToggle(labelled());
    await settle();
    assert.equal(target.children.length, 1, 'one element drawn in target');
    const drawn = button();
    assert.ok(drawn === target.firstElementChild, 'and it is the button');
    assert.deepEqual(authoredClasses(drawn), ['fabricate-toggle', 'has-name', 'is-off']);
    const [track, name, ...others] = drawn.children;
    assert.equal(others.length, 0, 'the track and the label, nothing else');
    assert.ok(track.classList.contains('manager-status-toggle-track'), 'the track leads');
    assert.equal(track.getAttribute('aria-hidden'), 'true', 'and is hidden from the name');
    assert.ok(name.matches(NAME_SPAN), 'the label follows it inside the button');
    assert.equal(name.textContent, LABEL);
    assert.equal(drawn.textContent.trim(), LABEL, 'the button’s only text is the label');
    assert.ok(!drawn.hasAttribute('aria-label'), 'no aria-label overrides the content name');
    assert.equal(drawn.getAttribute('aria-pressed'), 'false');
    assert.ok(!target.querySelector('.manager-status-toggle-label'), 'not the in-app reading');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });

  it('calls onclick once for a press on the label’s words', async () => {
    const { handle, calls, button } = mountToggle(labelled());
    await settle();
    button().querySelector(NAME_SPAN).click();
    await settle();
    assert.deepEqual(calls, [[]], 'the words are part of the pressable target');
    handle.destroy();
  });

  it('writes no aria-label for a name that is blank or no string (issue 2882)', async () => {
    for (const ariaLabel of [true, {}, ' ']) {
      const { handle, button } = mountToggle(labelled({ ariaLabel }));
      await settle();
      assert.ok(!button().hasAttribute('aria-label'), `${JSON.stringify(ariaLabel)} writes none`);
      assert.equal(button().querySelector(NAME_SPAN).textContent, LABEL, 'the label names it');
      handle.destroy();
    }
  });

  it('writes an ariaLabel that holds the label’s words as the name, and still draws the label', async () => {
    const { handle, button } = mountToggle(labelled({ ariaLabel: 'Required ingredients' }));
    await settle();
    assert.equal(button().getAttribute('aria-label'), 'Required ingredients');
    assert.equal(button().querySelector(NAME_SPAN).textContent, LABEL);
    handle.destroy();
  });

  it('keeps the state on the same button under either semantics', async () => {
    const { handle, button } = mountToggle(labelled({ on: true, semantics: 'switch' }));
    await settle();
    const node = button();
    assert.deepEqual(
      ['role', 'aria-checked', 'aria-pressed'].map((name) => node.getAttribute(name)),
      ['switch', 'true', null]
    );
    assert.equal(handle.update(labelled({ on: false })), true);
    await settle();
    assert.ok(button() === node, 'the same node');
    assert.deepEqual(
      ['role', 'aria-checked', 'aria-pressed'].map((name) => node.getAttribute(name)),
      [null, null, 'false']
    );
    handle.destroy();
  });

  it('lands aria-describedby on the button beside the label', async () => {
    const { handle, button } = mountToggle(labelled({ 'aria-describedby': HINT_ID }));
    await settle();
    assert.equal(button().getAttribute('aria-describedby'), HINT_ID);
    assert.ok(!button().querySelector(`#${HINT_ID}`), 'the sentence is the companion’s own');
    handle.destroy();
  });

  it('renames the same focused button when an update changes the label', async () => {
    const { handle, button } = mountToggle(labelled());
    await settle();
    const node = button();
    node.focus();
    assert.equal(handle.update(labelled({ label: 'Hidden' })), true);
    await settle();
    assert.ok(button() === node && document.activeElement === node, 'same node, focus kept');
    assert.equal(node.querySelector(NAME_SPAN).textContent, 'Hidden');
    handle.destroy();
  });

  it('returns to the track-only markup when an update drops the label for an ariaLabel', async () => {
    const plain = mountToggle({ on: false, ariaLabel: NAME });
    const { handle, button } = mountToggle(labelled());
    await settle();
    const node = button();
    assert.equal(handle.update({ on: false, ariaLabel: NAME, onclick() {} }), true);
    await settle();
    assert.ok(button() === node, 'the same node');
    assert.equal(node.outerHTML, plain.button().outerHTML, 'the track-only form, byte for byte');
    assert.deepEqual(authoredClasses(node), ['fabricate-toggle', 'is-off']);
    plain.handle.destroy();
    handle.destroy();
  });

  it('draws the track-only form for a blank label beside a non-blank ariaLabel', async () => {
    const plain = mountToggle({ on: false, ariaLabel: NAME });
    const blank = mountToggle({ on: false, label: '  ', ariaLabel: NAME });
    await settle();
    assert.equal(blank.button().outerHTML, plain.button().outerHTML, 'the label draws nothing');
    assert.equal(blank.button().getAttribute('aria-label'), NAME, 'and names nothing');
    plain.handle.destroy();
    blank.handle.destroy();
  });
});

describe('what the published StatusToggle refuses of its label', () => {
  for (const [claim, props, tail] of [
    [
      'neither a label nor an ariaLabel (M9)',
      { on: false, onclick() {} },
      'StatusToggle requires a non-empty "label"',
    ],
    [
      'an empty label and an empty ariaLabel (M9)',
      labelled({ label: '', ariaLabel: '' }),
      'StatusToggle requires a non-empty "label"',
    ],
    ['a number as its label (M14)', labelled({ label: 7 }), '"label" must be a string'],
    [
      'a function as its label (M10)',
      labelled({ label: () => LABEL }),
      '"label" must not hold a function',
    ],
    [
      'an ariaLabel that does not hold the label’s words (M22)',
      labelled({ ariaLabel: NAME }),
      `"ariaLabel" must contain the text of "label" (${JSON.stringify(LABEL)} is not in ${JSON.stringify(NAME)})`,
    ],
  ]) {
    it(`refuses ${claim} on mount and on update`, async () => {
      await assertRefused(props, tail);
    });
  }
});
