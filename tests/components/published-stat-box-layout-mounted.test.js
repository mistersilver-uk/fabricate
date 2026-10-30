/**
 * The published `StatBox`'s `layout` and `note` (issue 2819) on Fabricate's real Svelte runtime,
 * through a fresh seam registered with the adapter's own table, into a companion target under no
 * Fabricate ancestor: the order each layout draws and announces, what a value outside the closed
 * set draws, the note in both layouts, an `update` that removes either key, and the default form
 * every in-app caller keeps.
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
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const ROOT = 'fab-stat-box';
const BASE = { value: '3 of 5', label: 'Stages done' };

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-stat-box-layout-',
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

/** A stat box mounted with `props`: its handle and the box as drawn now. */
function mountBox(props = {}) {
  const target = companionTarget(targets);
  const handle = ui().mount('StatBox', { target, props: { ...BASE, ...props } });
  return { handle, box: () => target.querySelector(`.${ROOT}`) };
}

/** A node's authored classes, without Svelte's scope hash. */
const classesOf = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The box's element children as the part each is: label, figure or note. */
const partsOf = (box) =>
  [...box.children].map((child) => {
    if (child.classList.contains('fab-kicker')) return 'label';
    if (child.classList.contains('fab-stat-box-value')) return 'figure';
    if (child.classList.contains('fab-stat-box-note')) return 'note';
    return child.className;
  });

/** The box's markup with comment anchors and inter-element whitespace removed. */
const structure = (box) =>
  box.outerHTML
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/>\s+</gu, '><')
    .replaceAll(/\sclass="svelte-[\w-]+"/gu, '')
    .replaceAll(/(class="[^"]*?)\s*svelte-[\w-]+/gu, '$1');

describe('the published StatBox, layout', () => {
  it('reads label, figure, note at the start layout, and figure, label by default', async () => {
    const start = mountBox({ layout: 'start', note: 'Two to go' });
    await settle();
    assert.deepEqual(partsOf(start.box()), ['label', 'figure', 'note']);
    assert.deepEqual(classesOf(start.box()), [ROOT, 'is-start']);
    assert.equal(
      start.box().textContent.replaceAll(/\s+/gu, ' ').trim(),
      'Stages done 3 of 5 Two to go'
    );
    start.handle.destroy();

    const plain = mountBox({ note: 'Two to go' });
    await settle();
    assert.deepEqual(partsOf(plain.box()), ['figure', 'label', 'note']);
    assert.deepEqual(classesOf(plain.box()), [ROOT]);
    assert.equal(
      plain.box().textContent.replaceAll(/\s+/gu, ' ').trim(),
      '3 of 5 Stages done Two to go'
    );
    plain.handle.destroy();
  });

  it('moves between layouts on update, keeping the same root', async () => {
    const { handle, box } = mountBox({ layout: 'start' });
    await settle();
    const before = box();
    assert.deepEqual(partsOf(before), ['label', 'figure']);
    assert.equal(handle.update({ ...BASE }), true);
    await settle();
    assert.ok(box() === before, 'the same root, redrawn in place');
    assert.deepEqual(partsOf(box()), ['figure', 'label']);
    assert.deepEqual(classesOf(box()), [ROOT]);
    assert.equal(handle.update({ ...BASE, layout: 'start' }), true);
    await settle();
    assert.deepEqual(partsOf(box()), ['label', 'figure']);
    handle.destroy();
  });

  for (const value of [
    '',
    'default',
    'center',
    'Start',
    ' start',
    'start ',
    'end',
    1,
    true,
    null,
  ]) {
    it(`draws the default layout for ${JSON.stringify(value)}, a value outside the closed set`, async () => {
      const { handle, box } = mountBox({ layout: value });
      await settle();
      assert.deepEqual(partsOf(box()), ['figure', 'label']);
      assert.deepEqual(classesOf(box()), [ROOT]);
      handle.destroy();
    });
  }

  it('draws the start layout start-aligned with a mono figure, and the default centred', async () => {
    const drawn = {};
    for (const layout of ['start', 'default']) {
      const { handle, box } = mountBox({ layout });
      await settle();
      const figure = box().querySelector('.fab-stat-box-value');
      drawn[layout] = [
        getComputedStyle(box()).textAlign,
        getComputedStyle(figure).fontSize,
        getComputedStyle(figure).fontWeight,
      ];
      handle.destroy();
    }
    assert.deepEqual(drawn, {
      start: ['start', '14px', '500'],
      default: ['center', '17px', '700'],
    });
  });

  it('keeps the tone and the icon at the start layout', async () => {
    const { handle, box } = mountBox({
      layout: 'start',
      tone: 'danger',
      icon: 'fas fa-skull',
    });
    await settle();
    assert.deepEqual(classesOf(box()), [ROOT, 'is-danger', 'is-start']);
    assert.equal(box().getAttribute('data-stat-tone'), 'danger');
    const glyph = box().querySelector(':scope > .fab-stat-box-value > i');
    assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.deepEqual(partsOf(box()), ['label', 'figure']);
    handle.destroy();
  });
});

describe('the published StatBox, note', () => {
  for (const layout of ['default', 'start']) {
    it(`draws the note last at the ${layout} layout, as text, and removes it when an update omits it`, async () => {
      const { handle, box } = mountBox({ layout, note: '<b>Two</b> to go' });
      await settle();
      const note = box().lastElementChild;
      assert.ok(note.classList.contains('fab-stat-box-note'));
      assert.equal(note.textContent, '<b>Two</b> to go');
      assert.equal(note.children.length, 0, 'the note is text and never markup');
      assert.equal(handle.update({ ...BASE, layout }), true);
      await settle();
      assert.equal(box().querySelector('.fab-stat-box-note'), null);
      handle.destroy();
    });
  }

  it('draws nothing for an empty note, and redraws the text on update', async () => {
    const { handle, box } = mountBox({ layout: 'start', note: '' });
    await settle();
    assert.equal(box().querySelector('.fab-stat-box-note'), null);
    assert.equal(handle.update({ ...BASE, layout: 'start', note: 'Two to go' }), true);
    await settle();
    assert.equal(box().querySelector('.fab-stat-box-note').textContent, 'Two to go');
    assert.equal(handle.update({ ...BASE, layout: 'start', note: 'One to go' }), true);
    await settle();
    assert.equal(box().querySelector('.fab-stat-box-note').textContent, 'One to go');
    handle.destroy();
  });

  it('draws the note as a 10px block in the UI face', async () => {
    const { handle, box } = mountBox({ layout: 'start', note: 'Two to go' });
    await settle();
    const style = getComputedStyle(box().querySelector('.fab-stat-box-note'));
    assert.deepEqual(
      [style.display, style.fontSize, style.fontFamily],
      ['block', '10px', 'sans-serif']
    );
    handle.destroy();
  });
});

describe('how the published StatBox is announced', () => {
  it('adds no role, name, title or tabindex at either layout, with the glyph hidden', async () => {
    for (const layout of ['default', 'start']) {
      const { handle, box } = mountBox({ layout, icon: 'fas fa-flag', note: 'Two to go' });
      await settle();
      const named = [box(), ...box().querySelectorAll('*')].flatMap((node) =>
        [...node.attributes]
          .map((attribute) => attribute.name)
          .filter((name) => /^(role|title|tabindex|aria-(?!hidden$))/u.test(name))
          .map((name) => `${node.localName}.${name}`)
      );
      assert.deepEqual(named, [], `${layout}: nothing names or focuses a part`);
      assert.deepEqual(
        [...box().querySelectorAll('[aria-hidden]')].map((node) => node.localName),
        ['i'],
        `${layout}: only the glyph is hidden`
      );
      assert.equal(box().querySelector('h1, h2, h3, h4, h5, h6, [role]'), null);
      handle.destroy();
    }
  });

  it('reads each of label, figure and note once, in the order it is drawn', async () => {
    for (const [layout, order] of [
      ['default', ['3 of 5', 'Stages done', 'Two to go']],
      ['start', ['Stages done', '3 of 5', 'Two to go']],
    ]) {
      const { handle, box } = mountBox({ layout, note: 'Two to go' });
      await settle();
      const leaves = [...box().querySelectorAll('*')]
        .filter((node) => node.children.length === 0)
        .map((node) => node.textContent.trim());
      assert.deepEqual(leaves, order, layout);
      handle.destroy();
    }
  });
});

describe('the default StatBox every in-app caller draws', () => {
  it('is the same element tree as before layout and note existed', async () => {
    const { handle, box } = mountBox({ icon: 'fas fa-hourglass-half', tone: 'info' });
    await settle();
    assert.equal(
      structure(box()),
      '<div class="fab-stat-box is-info" data-stat-tone="info">' +
        '<span class="fab-stat-box-value has-icon"><i aria-hidden="true" class="fas fa-hourglass-half"></i>' +
        '<span class="fab-stat-box-figure">3 of 5</span></span>' +
        '<span class="fab-kicker">Stages done</span></div>'
    );
    handle.destroy();
  });

  it('draws no note element and no start class when neither key is passed', async () => {
    const { handle, box } = mountBox();
    await settle();
    assert.deepEqual(classesOf(box()), [ROOT]);
    assert.equal(box().querySelector('.fab-stat-box-note'), null);
    handle.destroy();
  });
});
