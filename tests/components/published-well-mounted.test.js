/**
 * The published `Well` on Fabricate's real Svelte runtime (issue 2601), through a fresh seam
 * registered with the adapter's own table: the well root in a Fabricate window, its kicker and
 * group name, its content slot drawn in normal flow, its two fills, an `update` that keeps the slot
 * and focus in place, a well nested in a published `InspectorCard`, its refusals, and the
 * standalone style root it is drawn under in a companion's own shell (issue 2456).
 * Limit: happy-dom computes no accessible name and draws no frame, so a name is read off
 * `aria-label` and a fill off the computed `background-color`.
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
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const LABELLED = Object.freeze({ label: 'Chosen reagents', children: true });
const FOCUSABLE = 'button, a, input, select, textarea, [tabindex]';
const THEME =
  ':root[data-fabricate-theme] { --fab-bg-1: rgb(1, 2, 3); --fab-bg-2: rgb(4, 5, 6); --fab-border: rgb(7, 8, 9); }';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-well-',
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
});

/** A well mounted with `props` into `target`: its handle and its root as drawn now. */
function mountWell(props = LABELLED, target = fabricateTarget(targets)) {
  const handle = ui().mount('Well', { target, props });
  return { target, handle, root: () => target.firstElementChild };
}

/** One element of the companion's own, appended to `slot`, that lays out a line and an input. */
function drawContent(slot) {
  const doc = slot.ownerDocument;
  const content = doc.createElement('div');
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = '8px';
  const line = doc.createElement('p');
  line.textContent = 'Moonpetal and ember salt';
  const input = doc.createElement('input');
  input.type = 'text';
  input.setAttribute('aria-label', 'Batch name');
  content.append(line, input);
  slot.append(content);
  return { content, input };
}

/** An empty target inside Fabricate's own in-window modal, in a Fabricate window. */
function modalTarget() {
  const target = fabricateTarget(targets);
  const modal = document.createElement('div');
  modal.className = 'fabricate-modal';
  target.append(modal);
  const inModal = document.createElement('div');
  modal.append(inModal);
  return inModal;
}

/** The refusal `mount` throws for `props`, with nothing rendered. */
function assertRefused(props, tail, target = fabricateTarget(targets)) {
  assert.throws(() => ui().mount('Well', { target, props }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published Well draws its well', () => {
  it('is described as its pin', () => {
    assert.deepEqual(ui().describe('Well'), {
      version: 1,
      props: {
        label: { kind: 'data', required: false },
        children: { kind: 'slot', required: false },
      },
      rest: true,
      root: 'any',
      overlays: false,
    });
  });

  it('draws one unnamed div root in a Fabricate window, with rest on it and nothing focusable', async () => {
    const { target, handle, root } = mountWell({ children: true, 'data-companion-well': 'batch' });
    await settle();
    assert.equal(target.children.length, 1, 'one root in target');
    assert.equal(root().localName, 'div');
    assert.ok(root().classList.contains('fab-well'));
    assert.ok(!root().hasAttribute('role') && !root().hasAttribute('aria-label'), 'no naming');
    assert.ok(!root().querySelector('.fab-kicker'), 'no kicker without a label');
    assert.equal(root().getAttribute('data-companion-well'), 'batch', 'rest on the root');
    assert.ok(!target.querySelector(FOCUSABLE), 'Fabricate draws nothing focusable');
    handle.destroy();
    assert.equal(target.childNodes.length, 0, 'destroy leaves target empty');
    await settle();
    assert.deepEqual(reports, []);
  });

  it('names itself a group by its label, drawn as a kicker paragraph above the content slot', async () => {
    const { handle, root } = mountWell();
    await settle();
    assert.equal(root().getAttribute('role'), 'group');
    assert.equal(root().getAttribute('aria-label'), 'Chosen reagents');
    const kicker = root().querySelector('.fab-kicker');
    assert.equal(kicker.localName, 'p', 'not a heading');
    assert.equal(kicker.textContent.trim(), 'Chosen reagents', 'the kicker reads the label too');
    const slot = handle.slot('children');
    assert.equal(slot.localName, 'div');
    assert.ok(slot.parentElement.parentElement === root(), 'one private wrapper below the well');
    assert.deepEqual(
      [...root().children].map((child) => child.contains(kicker) || child.contains(slot)),
      [true, true],
      'the kicker first, then the content slot, and nothing else'
    );
    assert.ok(root().firstElementChild.contains(kicker), 'the kicker heads the well');
    handle.destroy();
  });

  it('draws its content slot in normal flow, with no gap of its own, on its two fills', async () => {
    await underSheet(THEME, async () => {
      const { handle, root } = mountWell();
      await settle();
      const well = getComputedStyle(root());
      assert.equal(well.display, 'block', 'normal flow, so no gap spaces its children');
      assert.equal(well.backgroundColor, 'rgb(1, 2, 3)', '--fab-bg-1');
      assert.equal(getComputedStyle(handle.slot('children')).display, 'contents');
      handle.destroy();
      const modal = mountWell(LABELLED, modalTarget());
      await settle();
      assert.equal(getComputedStyle(modal.root()).backgroundColor, 'rgb(4, 5, 6)', '--fab-bg-2');
      modal.handle.destroy();
    });
  });
});

describe("a companion's content in the published Well", () => {
  it('keeps the content slot and focus in place across an update that adds and drops the label', async () => {
    const { handle, root } = mountWell({ children: true });
    await settle();
    const slot = handle.slot('children');
    const { content, input } = drawContent(slot);
    input.focus();
    for (const props of [LABELLED, { children: true }]) {
      assert.equal(handle.update(props), true);
      await settle();
      assert.ok(handle.slot('children') === slot, 'the same slot element');
      assert.ok(root().contains(content), 'still attached in the well');
      assert.ok(document.activeElement === input, 'still the input');
      const named = Boolean(props.label);
      assert.equal(root().getAttribute('role'), named ? 'group' : null, 'role follows the label');
      assert.equal(root().getAttribute('aria-label'), named ? props.label : null);
      assert.equal(Boolean(root().querySelector('.fab-kicker')), named, 'kicker follows the label');
    }
    handle.destroy();
  });

  it('nests in a published InspectorCard, whose destroy ends the well and what it holds', async () => {
    const seam = ui();
    const target = fabricateTarget(targets);
    const card = seam.mount('InspectorCard', { target, props: { children: true } });
    const wellTarget = target.ownerDocument.createElement('div');
    card.slot('children').append(wellTarget);
    const well = seam.mount('Well', { target: wellTarget, props: LABELLED });
    const { content } = drawContent(well.slot('children'));
    const chipTarget = target.ownerDocument.createElement('span');
    chipTarget.style.display = 'flex';
    content.append(chipTarget);
    const chip = seam.mount('Chip', { target: chipTarget, props: { children: 'Ready' } });
    await settle();
    const drawn = target.querySelector(':scope > .fabricate-card .fab-well');
    assert.ok(drawn?.contains(content), 'the companion content sits in the well, in the card');
    assert.equal(drawn.querySelector('.manager-chip').textContent, 'Ready');
    card.destroy();
    assert.equal(well.update(LABELLED), false, 'the nested well ended');
    assert.equal(chip.update({ children: 'Again' }), false, 'and the chip inside it');
    assert.equal(target.childNodes.length, 0, 'destroy leaves target empty');
    await settle();
    assert.deepEqual(reports, []);
  });
});

describe('the published Well refuses', () => {
  it('an unpublished key, which is no data attribute (M13)', () => {
    for (const key of ['class', 'role']) {
      assertRefused({ ...LABELLED, [key]: 'x' }, `"${key}" is not a data attribute`);
    }
  });

  it('a slot value that is no boolean (M15)', () => {
    assertRefused({ children: 'Reagents' }, '"children" is a slot and takes true or false');
  });

  it('a function for its label (M10)', () => {
    assertRefused({ label: () => 'Reagents' }, '"label" must not hold a function');
  });
});

describe('the published Well in a companion’s own shell', () => {
  it('draws its well inside one standalone style root, its slot in it, and destroy leaves the shell empty', async () => {
    const target = companionTarget(targets);
    const { handle } = mountWell(LABELLED, target);
    await settle();
    const well = standaloneRootIn(target).firstElementChild;
    assert.equal(well.localName, 'div');
    assert.ok(well.contains(handle.slot('children')), 'its content slot is inside the well');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });
});
