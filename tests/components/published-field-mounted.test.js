/**
 * The published `Field` on Fabricate's real Svelte runtime (issue 2601), through a fresh seam
 * registered with the adapter's own table, under a Fabricate window root: the column root and its
 * content slot, a companion's caption and text input inside it, an `update` that keeps focus on
 * that input, the host element `as` draws, every refusal the entry adds, and the standalone style
 * root it is drawn under in a companion's own shell (issue 2679).
 * Limit: happy-dom computes no accessible name and shows no focus ring, so a name is read off
 * `aria-labelledby` and a rule's reach off `matches`.
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
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
  standaloneRootIn,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const COLUMN = Object.freeze({ as: 'div', children: true });
const FOCUSABLE = 'button, a, input, select, textarea, [tabindex]';

/** The module rules a companion's text input in the slot takes: its chrome and its inset ring. */
const TEXT_INPUT_CHROME =
  ".fabricate-field.fabricate-field input:not(.fab-stepper-input, [data-recipe-option-formula]):not([type='radio'], [type='checkbox'], [type='search']):not([type='range'])";
const INSET_RING =
  ".fabricate-field :is(input, textarea):where(:not([type='checkbox'], [type='radio'], [type='range'], [type='color'], [type='file'], [type='button'], [type='submit'], [type='reset'], [type='image']))";

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-field-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let warnings;
let targets;
let stopRecording;
let consoleWarn;

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
  warnings = [];
  targets = [];
  consoleWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args);
  };
});

afterEach(() => {
  console.warn = consoleWarn;
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** A field mounted with `props` into `target`: its handle and its root as drawn now. */
function mountField(props = COLUMN, target = fabricateTarget(targets)) {
  const handle = ui().mount('Field', { target, props });
  return { target, handle, root: () => target.firstElementChild };
}

/** A caption `<span id>` and a text input it names, appended to `slot` as a companion draws them. */
function drawCaptionAndInput(slot, id = 'companion-field-caption') {
  const caption = slot.ownerDocument.createElement('span');
  caption.id = id;
  const input = slot.ownerDocument.createElement('input');
  input.type = 'text';
  input.setAttribute('aria-labelledby', id);
  slot.append(caption, input);
  return { caption, input };
}

/** The refusal `mount` throws for `props`, with nothing rendered. */
function assertRefused(props, tail, target = fabricateTarget(targets)) {
  assert.throws(() => ui().mount('Field', { target, props }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published Field draws its column', () => {
  it('is described as its pin', () => {
    assert.deepEqual(ui().describe('Field'), {
      version: 1,
      props: { as: { kind: 'data', required: true }, children: { kind: 'slot', required: false } },
      rest: true,
      root: 'any',
      overlays: false,
    });
  });

  for (const under of ['fabricate', 'fabricate fabricate-app', 'fabricate fabricate-manager']) {
    it(`draws one div root holding the content slot under a frame classed ${under}`, async () => {
      const target = fabricateTarget(targets, under);
      const { handle, root } = mountField({ ...COLUMN, 'data-companion-field': 'name' }, target);
      await settle();
      assert.equal(target.children.length, 1, 'one root in target');
      assert.equal(root().localName, 'div');
      assert.equal(root().className, 'fabricate-field');
      assert.equal(root().getAttribute('data-companion-field'), 'name', 'rest on the root');
      const slot = handle.slot('children');
      assert.equal(slot.localName, 'div');
      assert.ok(root().contains(slot), 'the slot is attached inside the column');
      assert.ok(!target.querySelector(FOCUSABLE), 'Fabricate draws no control');
      handle.destroy();
      assert.equal(target.childNodes.length, 0, 'destroy leaves target empty');
      assert.deepEqual(reports, []);
      assert.deepEqual(warnings, [], 'a published as draws no warning');
    });
  }

  it('draws no slot until children is requested, and attaches it on an update', async () => {
    const { handle, root } = mountField({ as: 'div' });
    await settle();
    assert.equal(root().children.length, 0, 'an empty column');
    assert.ok(handle.slot('children') === null, 'never requested');
    assert.equal(handle.update(COLUMN), true);
    await settle();
    assert.ok(root().contains(handle.slot('children')));
    handle.destroy();
  });
});

describe("a companion's caption and input in the published Field", () => {
  it('takes the text input chrome and the inset ring, and names the input by its caption', async () => {
    const { handle, root } = mountField();
    await settle();
    const { caption, input } = drawCaptionAndInput(handle.slot('children'));
    assert.ok(input.matches(TEXT_INPUT_CHROME), 'the text-like input chrome reaches it');
    assert.ok(input.matches(INSET_RING), 'so does the inset 1px ring');
    assert.equal(input.getAttribute('aria-labelledby'), caption.id);
    assert.ok(
      root().ownerDocument.querySelector(`#${caption.id}`) === caption,
      'the id resolves across the mount'
    );
    handle.destroy();
  });

  it("holds the caption as a child of the content slot's element, never of the column, so the sheet draws no kicker on it", async () => {
    const { handle, target } = mountField();
    await settle();
    const { caption } = drawCaptionAndInput(handle.slot('children'));
    assert.ok(!caption.matches('.fabricate-field > span'), 'not a child of the column');
    assert.ok(!target.querySelector(':scope > .fabricate-field > span'), 'no span is');
    handle.destroy();
  });

  it('draws a published Kicker mounted in the caption span, which the id on that span names', async () => {
    const seam = ui();
    const target = fabricateTarget(targets);
    const field = seam.mount('Field', { target, props: COLUMN });
    await settle();
    const { caption, input } = drawCaptionAndInput(field.slot('children'));
    const kicker = seam.mount('Kicker', {
      target: caption,
      props: { as: 'span', children: 'Display name' },
    });
    await settle();
    const drawn = caption.querySelector('.fab-kicker');
    assert.equal(drawn.localName, 'span', 'phrasing content in the caption span');
    assert.equal(getComputedStyle(drawn).fontSize, '8.5px', 'the kicker type');
    assert.equal(caption.textContent, 'Display name', 'the text aria-labelledby reads');
    assert.equal(input.getAttribute('aria-labelledby'), caption.id);
    kicker.destroy();
    field.destroy();
    assert.equal(target.childNodes.length, 0);
  });

  it('keeps focus on the companion input across an update', async () => {
    const { handle } = mountField();
    await settle();
    const { input } = drawCaptionAndInput(handle.slot('children'));
    input.focus();
    assert.ok(document.activeElement === input, 'the input holds focus');
    assert.equal(handle.update({ ...COLUMN, 'data-companion-field': 'renamed' }), true);
    await settle();
    assert.ok(document.activeElement === input, 'still the input');
    assert.ok(handle.slot('children').contains(input), 'still in the slot');
    handle.destroy();
  });
});

// The clause `DYNAMIC_ELEMENTS` names for the field's pinned tags. The console warning such an `as`
// draws is Field's own development diagnostic, private and outside the published contract.
describe("Field's host element", () => {
  it('draws a <div> for an as outside its three hosts, every control tag included', async () => {
    const values = ['button', 'a', 'input', 'select', 'textarea', 'span', 'h1'];
    for (const as of values) {
      const { target, handle, root } = mountField({ ...COLUMN, as });
      await settle();
      assert.equal(target.children.length, 1, 'one root');
      assert.equal(root().localName, 'div', `as: '${as}'`);
      assert.ok(!target.querySelector(FOCUSABLE), 'nothing focusable');
      handle.destroy();
    }
    assert.deepEqual(reports, [], 'the seam reports nothing');
    assert.deepEqual(
      warnings.map(([message]) => String(message).startsWith('Fabricate | Field: ')),
      values.map(() => true),
      'one Field warning per mount, and none from the seam'
    );
  });
});

describe('the published Field refuses', () => {
  it('a missing or empty as (M9), before it draws or warns', () => {
    assertRefused({ children: true }, 'Field requires a non-empty "as"');
    assertRefused({ as: '' }, 'Field requires a non-empty "as"');
    assert.deepEqual(warnings, [], 'the missing-host warning never runs');
  });

  it('an unpublished key, which is no data attribute (M13)', () => {
    for (const key of ['class', 'label', 'caption']) {
      assertRefused({ ...COLUMN, [key]: 'x' }, `"${key}" is not a data attribute`);
    }
  });

  it('a slot value that is no boolean (M15)', () => {
    assertRefused({ as: 'div', children: 'Name' }, '"children" is a slot and takes true or false');
  });
});

describe('the published Field in a companion’s own shell', () => {
  it('draws its column inside one standalone style root, a control in its slot is reached, and destroy leaves the shell empty', async () => {
    const target = companionTarget(targets);
    const { handle, root } = mountField(COLUMN, target);
    await settle();
    const column = standaloneRootIn(target).firstElementChild;
    assert.equal(column.className, 'fabricate-field');
    const { input } = drawCaptionAndInput(handle.slot('children'));
    assert.ok(target.querySelector(FOCUSABLE) === input, 'the companion’s input is all it focuses');
    assert.ok(root().classList.contains('fabricate-standalone-root'), 'the root is the only child');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });
});
