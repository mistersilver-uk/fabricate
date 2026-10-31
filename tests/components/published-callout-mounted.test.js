/**
 * The published `Callout` on Fabricate's real Svelte runtime (issue 2601), through a fresh seam
 * registered with the adapter's own table, into a companion target under no Fabricate ancestor:
 * its two roots, a `p` for `text` alone and a `note` otherwise, its tones and the neutral it draws
 * for any other, its own ink and fill, its glyphs, the `actions` content slot inside the strip, an
 * `update` that keeps the slot and focus in place, and its refusals.
 * Limit: happy-dom computes no accessible name and draws no frame, so an ink is read off the
 * computed `color` and a fill off the computed `background-color`.
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

const REFUSAL = 'Fabricate | published components: ';
const STANDING = Object.freeze({ text: 'Salvage returns half of each component.' });
const TITLED = Object.freeze({
  title: 'Salvage is lossy',
  text: 'Salvage returns half of each component.',
});
const FOCUSABLE = 'button, a, input, select, textarea, [tabindex]';
const TONES = ['neutral', 'info', 'accent', 'warning', 'success', 'danger'];
const THEME = `:root[data-fabricate-theme] {
  --fab-text: rgb(1, 1, 1); --fab-text-muted: rgb(2, 2, 2); --fab-text-subtle: rgb(3, 3, 3);
  --fab-surface-soft: rgb(4, 4, 4); --fab-border: rgb(5, 5, 5);
  --fab-warning-text: rgb(6, 6, 6); --fab-warning-soft: rgb(7, 7, 7);
  --fab-warning-border: rgb(8, 8, 8); --fab-space-2: 8px;
}`;

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-callout-',
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

/** A note mounted with `props` into a companion target: its handle and its root as drawn now. */
function mountCallout(props = STANDING) {
  const target = companionTarget(targets);
  const handle = ui().mount('Callout', { target, props });
  return { target, handle, root: () => target.firstElementChild };
}

/** A node's authored classes, without Svelte's scope hash. */
const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The tone classes a root carries. */
const toneClassesOf = (node) => authoredClasses(node).filter((name) => name.startsWith('is-'));

/** A typed button of the companion's own, appended to the `actions` slot. */
function drawAction(slot, label = 'Open the rules') {
  const button = slot.ownerDocument.createElement('button');
  button.type = 'button';
  button.textContent = label;
  slot.append(button);
  return button;
}

/** The refusal `mount` throws for `props`, with nothing rendered. */
function assertRefused(props, tail) {
  const target = companionTarget(targets);
  assert.throws(() => ui().mount('Callout', { target, props }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published Callout draws its note', () => {
  it('is described as its pin', () => {
    const optional = { kind: 'data', required: false };
    assert.deepEqual(ui().describe('Callout'), {
      version: 1,
      props: {
        tone: optional,
        title: optional,
        text: optional,
        icon: optional,
        items: optional,
        actions: { kind: 'slot', required: false },
        actionsPlacement: optional,
      },
      rest: true,
      root: 'any',
      overlays: false,
    });
  });

  it('draws text alone as a <p> with no role under a bare ancestor, rest on it, nothing focusable', async () => {
    const { target, handle, root } = mountCallout({
      ...STANDING,
      'data-companion-note': 'salvage',
    });
    await settle();
    assert.equal(target.children.length, 1, 'one root in target');
    assert.equal(root().localName, 'p');
    assert.ok(!root().hasAttribute('role'), 'no role');
    assert.ok(!root().hasAttribute('aria-live'), 'never a live region');
    assert.equal(root().textContent.trim(), STANDING.text);
    assert.equal(root().getAttribute('data-companion-note'), 'salvage', 'rest on the root');
    assert.ok(!target.querySelector(FOCUSABLE), 'Fabricate draws nothing focusable');
    handle.destroy();
    assert.equal(target.childNodes.length, 0, 'destroy leaves target empty');
    await settle();
    assert.deepEqual(reports, []);
  });

  it('draws a <div> note for a title or items, the title above the text', async () => {
    const items = [{ icon: 'fas fa-leaf', lead: 'Moonpetal', text: 'returns one' }];
    for (const props of [TITLED, { items }, { text: STANDING.text, items }]) {
      const { handle, root } = mountCallout(props);
      await settle();
      assert.equal(root().localName, 'div', JSON.stringify(Object.keys(props)));
      assert.equal(root().getAttribute('role'), 'note');
      assert.ok(!root().hasAttribute('aria-live'), 'never a live region');
      handle.destroy();
    }
    const { handle, root } = mountCallout(TITLED);
    await settle();
    const body = root().querySelector('.manager-callout-body');
    assert.deepEqual(
      [...body.children].map((child) => child.textContent),
      [TITLED.title, TITLED.text],
      'the title, then the text'
    );
    handle.destroy();
  });

  it('draws its items as a list of glyph-led points, each field only when given', async () => {
    const items = [
      { icon: 'fas fa-leaf', lead: 'Moonpetal', text: 'returns one' },
      { text: 'Ember salt is lost' },
    ];
    const { handle, root } = mountCallout({ items });
    await settle();
    const list = root().querySelector('[role="list"]');
    const points = [...list.querySelectorAll(':scope > [role="listitem"]')];
    assert.equal(points.length, 2);
    assert.ok(Boolean(points[0].querySelector('i.fa-leaf[aria-hidden="true"]')), 'its glyph');
    assert.equal(points[0].querySelector('.manager-callout-item-lead').textContent, 'Moonpetal');
    assert.ok(!points[1].querySelector('i'), 'no glyph where the item gives none');
    assert.ok(!points[1].querySelector('.manager-callout-item-lead'), 'no lead where none');
    handle.destroy();
  });

  it('skips an item that is not an object and draws the rest, reporting nothing', async () => {
    const kept = { icon: 'fas fa-leaf', lead: 'Moonpetal:', text: 'returns one' };
    const { handle, root } = mountCallout({ items: [null, kept, 'loose', 7, undefined] });
    await settle();
    const points = [...root().querySelectorAll(':scope [role="list"] > [role="listitem"]')];
    assert.equal(points.length, 1, 'only the object draws a point');
    assert.equal(points[0].textContent.trim(), 'Moonpetal: returns one');
    handle.destroy();
    await settle();
    assert.deepEqual(reports, [], 'no render failure');
  });

  it('is a bare glyph with none of title, text and items', async () => {
    const { handle, root } = mountCallout({});
    await settle();
    assert.equal(root().localName, 'p');
    assert.equal(root().textContent.trim(), '', 'no text');
    assert.equal(root().querySelectorAll('i').length, 1, 'the one leading glyph');
    handle.destroy();
  });

  it('draws its own ink and fill from :root[data-fabricate-theme], at neutral by default', async () => {
    await underSheet(THEME, async () => {
      const { handle, root } = mountCallout(TITLED);
      await settle();
      const note = getComputedStyle(root());
      assert.equal(note.color, 'rgb(2, 2, 2)', 'the body inks --fab-text-muted');
      assert.equal(note.backgroundColor, 'rgb(4, 4, 4)', '--fab-surface-soft');
      const title = root().querySelector('.manager-callout-title');
      assert.equal(getComputedStyle(title).color, 'rgb(1, 1, 1)', 'the title inks --fab-text');
      const glyph = root().querySelector(':scope > i');
      assert.equal(getComputedStyle(glyph).color, 'rgb(3, 3, 3)', '--fab-text-subtle');
      handle.destroy();
    });
  });
});

describe('the published Callout tones', () => {
  it('writes one tone class and its default glyph for each tone, and none at neutral', async () => {
    const glyphs = {
      neutral: 'fa-circle-info',
      info: 'fa-circle-info',
      accent: 'fa-circle-info',
      warning: 'fa-triangle-exclamation',
      success: 'fa-circle-check',
      danger: 'fa-circle-exclamation',
    };
    for (const tone of TONES) {
      const { handle, root } = mountCallout({ ...STANDING, tone });
      await settle();
      assert.deepEqual(toneClassesOf(root()), tone === 'neutral' ? [] : [`is-${tone}`], tone);
      const glyph = root().querySelector(':scope > i');
      assert.ok(glyph.classList.contains(glyphs[tone]), `${tone} draws ${glyphs[tone]}`);
      assert.equal(glyph.getAttribute('aria-hidden'), 'true');
      handle.destroy();
    }
  });

  it('draws neutral for a tone outside its set', async () => {
    for (const tone of ['notice', 'Warning', 'positive', 7]) {
      await underSheet(THEME, async () => {
        const { handle, root } = mountCallout({ ...TITLED, tone });
        await settle();
        assert.deepEqual(toneClassesOf(root()), [], `tone ${tone} writes no tone class`);
        assert.equal(root().getAttribute('data-callout-tone'), 'neutral');
        assert.ok(root().querySelector(':scope > i').classList.contains('fa-circle-info'));
        assert.equal(getComputedStyle(root()).backgroundColor, 'rgb(4, 4, 4)', 'the neutral fill');
        const title = root().querySelector('.manager-callout-title');
        assert.equal(getComputedStyle(title).color, 'rgb(1, 1, 1)', 'the neutral title ink');
        handle.destroy();
      });
    }
    assert.deepEqual(reports, []);
  });

  it('repaints edge, fill, glyph and title in place across an update of tone, the body staying muted', async () => {
    await underSheet(THEME, async () => {
      const { handle, root } = mountCallout(TITLED);
      await settle();
      const note = root();
      assert.equal(handle.update({ ...TITLED, tone: 'warning' }), true);
      await settle();
      assert.ok(root() === note, 'the same root');
      assert.deepEqual(toneClassesOf(note), ['is-warning']);
      const style = getComputedStyle(note);
      assert.equal(style.backgroundColor, 'rgb(7, 7, 7)', '--fab-warning-soft');
      assert.equal(style.borderTopColor, 'rgb(8, 8, 8)', '--fab-warning-border');
      assert.equal(style.color, 'rgb(2, 2, 2)', 'the body is muted at every tone');
      const title = note.querySelector('.manager-callout-title');
      assert.equal(getComputedStyle(title).color, 'rgb(6, 6, 6)', '--fab-warning-text');
      const glyph = note.querySelector(':scope > i');
      assert.equal(getComputedStyle(glyph).color, 'rgb(6, 6, 6)');
      assert.ok(glyph.classList.contains('fa-triangle-exclamation'), 'the warning glyph');
      assert.equal(handle.update({ ...TITLED, tone: 'neutral' }), true);
      await settle();
      assert.deepEqual(toneClassesOf(note), [], 'and back');
      handle.destroy();
    });
  });

  it('draws the glyph icon names in place of the tone’s own', async () => {
    const { handle, root } = mountCallout({ ...STANDING, tone: 'warning', icon: 'fas fa-bell' });
    await settle();
    const glyph = root().querySelector(':scope > i');
    assert.ok(glyph.classList.contains('fa-bell'));
    assert.ok(!glyph.classList.contains('fa-triangle-exclamation'));
    handle.destroy();
  });
});

// The clause `DYNAMIC_ELEMENTS` names for the note's pinned tags.
describe("Callout's host element", () => {
  it('draws a <p> or a <div> for every value of title, items and actions, never a control', async () => {
    const cases = [
      [{ title: '' }, 'p'],
      [{ title: 'Salvage is lossy' }, 'div'],
      [{ items: [] }, 'p'],
      [{ items: 'button' }, 'p'],
      [{ items: { length: 1 } }, 'p'],
      [{ items: [{}] }, 'div'],
      [{ items: [null, 'point'] }, 'p'],
      [{ actions: false }, 'p'],
      [{ actions: true }, 'div'],
    ];
    for (const [props, tag] of cases) {
      const { target, handle, root } = mountCallout({ ...STANDING, ...props });
      await settle();
      assert.equal(target.children.length, 1, 'one root');
      assert.equal(root().localName, tag, JSON.stringify(props));
      assert.ok(!target.querySelector(FOCUSABLE), 'nothing focusable');
      handle.destroy();
    }
    assert.deepEqual(reports, []);
  });

  it('replaces its root when an update moves it between the two, keeping the mount', async () => {
    const { target, handle, root } = mountCallout(STANDING);
    await settle();
    assert.equal(root().localName, 'p');
    assert.equal(handle.update(TITLED), true);
    await settle();
    assert.equal(root().localName, 'div');
    assert.equal(root().getAttribute('role'), 'note');
    assert.equal(handle.update(STANDING), true);
    await settle();
    assert.equal(root().localName, 'p');
    assert.equal(target.children.length, 1, 'still one root');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });
});

describe("a companion's actions in the published Callout", () => {
  it('hands back a <span> slot element drawn in the strip’s action host after the body, which spaces it by gap', async () => {
    await underSheet(THEME, async () => {
      const { handle, root } = mountCallout({ ...STANDING, actions: true });
      await settle();
      const slot = handle.slot('actions');
      assert.equal(slot.localName, 'span');
      const host = root().querySelector(':scope > .manager-callout-actions');
      assert.equal(host.localName, 'span');
      assert.ok(slot.parentElement.parentElement === host, 'one private wrapper below the host');
      assert.ok(root().lastElementChild === host, 'after the body');
      const style = getComputedStyle(host);
      assert.equal(style.display, 'inline-flex');
      assert.equal(style.gap, '8px', 'its children are spaced by --fab-space-2');
      assert.equal(getComputedStyle(slot).display, 'contents');
      const button = drawAction(slot);
      assert.ok(host.contains(button));
      handle.destroy();
    });
  });

  it('keeps the slot and focus in place across an update of its tone, title and text', async () => {
    const { handle, root } = mountCallout({ ...STANDING, actions: true });
    await settle();
    const slot = handle.slot('actions');
    const button = drawAction(slot);
    button.focus();
    const note = root();
    for (const props of [
      { ...TITLED, tone: 'warning', actions: true },
      { tone: 'danger', items: [{ text: 'Ember salt is lost' }], actions: true },
      { ...STANDING, actions: true },
    ]) {
      assert.equal(handle.update(props), true);
      await settle();
      assert.ok(root() === note, 'the same root, a div while the slot is requested');
      assert.ok(handle.slot('actions') === slot, 'the same slot element');
      assert.ok(note.contains(button), 'still attached in the strip');
      assert.ok(document.activeElement === button, 'still the button');
    }
    handle.destroy();
  });

  it('detaches the slot with its content when an update omits it, and attaches it again', async () => {
    const { target, handle, root } = mountCallout({ ...STANDING, actions: true });
    await settle();
    const slot = handle.slot('actions');
    const button = drawAction(slot);
    assert.equal(handle.update(STANDING), true);
    await settle();
    assert.equal(root().localName, 'p', 'text alone again');
    assert.ok(!slot.isConnected && slot.contains(button), 'detached, its content intact');
    assert.equal(handle.update({ ...STANDING, actions: true }), true);
    await settle();
    assert.ok(handle.slot('actions') === slot, 'the same element');
    assert.ok(root().querySelector('.manager-callout-actions').contains(button), 'attached again');
    handle.destroy();
    assert.equal(target.childNodes.length, 0, 'destroy leaves target empty');
    await settle();
    assert.deepEqual(reports, []);
  });
});

describe('the published Callout refuses', () => {
  it('an unpublished key, which is no data attribute (M13)', () => {
    for (const key of ['class', 'role', 'aria-live']) {
      assertRefused({ ...STANDING, [key]: 'x' }, `"${key}" is not a data attribute`);
    }
  });

  it('a slot value that is no boolean (M15)', () => {
    assertRefused({ actions: 'Open' }, '"actions" is a slot and takes true or false');
  });

  it('a function for its text or inside an item (M10)', () => {
    assertRefused({ text: () => 'Standing' }, '"text" must not hold a function');
    assertRefused({ items: [{ text: () => 'x' }] }, '"items" must not hold a function');
  });
});
