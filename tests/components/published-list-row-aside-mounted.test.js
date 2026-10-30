/**
 * The published `ListRow`'s `aside` content slot (issue 2793) on Fabricate's real Svelte runtime,
 * through a fresh seam registered with the adapter's own table, under a Fabricate window root: the
 * `<div>` slot element on the row's own line beneath its content, the button's description, its
 * detach and re-attach on `update`, the one row and slot kept while `onOpen` comes and goes, a
 * mount nested in it, and M15.
 * Limit: happy-dom paints no layer, so that a press on the aside presses the button is
 * `list-row-rendered.test.js`'s.
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
  fabricateTarget,
  harnessLoaders,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const NAME = 'Moonpetal tincture';
const ROOT = 'fabricate-list-row';
const HOST = 'fabricate-list-row-aside';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-list-row-aside-',
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
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
  assert.deepEqual(reports, [], 'nothing was reported');
});

/** A row mounted with `props` over a name, `aside` requested unless `props` says otherwise. */
function mountRow(props = {}, fabUi = ui()) {
  const target = fabricateTarget(targets);
  const handle = fabUi.mount('ListRow', { target, props: { name: NAME, aside: true, ...props } });
  return {
    target,
    handle,
    row: () => target.querySelector(`.${ROOT}`),
    host: () => target.querySelector(`.${HOST}`),
    button: () => target.querySelector('button'),
  };
}

/** Appends the companion's one element, holding a line of text, to the row's slot element. */
function drawLine(handle, text = 'Stage 2 of 3, due at dusk') {
  const line = handle.slot('aside').ownerDocument.createElement('p');
  line.textContent = text;
  handle.slot('aside').append(line);
  return line;
}

describe('the published ListRow aside', () => {
  for (const [form, props] of [
    ['the read-only row', {}],
    ['the button row', { onOpen() {} }],
  ]) {
    it(`draws a <div> slot element beneath ${form}'s content, on a line of its own`, async () => {
      const { handle, row, host } = mountRow(props);
      await settle();
      const slot = handle.slot('aside');
      assert.equal(slot.localName, 'div');
      assert.equal(slot.getAttribute('style'), 'display: contents;', 'no other attribute');
      assert.ok(host()?.parentElement === row(), 'its host is a child of the root');
      assert.ok(row().lastElementChild === host(), 'after the row’s content');
      assert.ok(host().contains(slot), 'holding the slot element');
      assert.ok(row().classList.contains('is-form'), 'the form that wraps the aside beneath');
      const line = drawLine(handle);
      assert.ok(host().contains(line), 'the companion’s element is drawn there');
      handle.destroy();
    });
  }

  it('makes its text the button’s description, and draws nothing focusable of its own', async () => {
    const { target, handle, host, button } = mountRow({ onOpen() {} });
    await settle();
    drawLine(handle);
    const described = button().getAttribute('aria-describedby');
    assert.ok(described, 'the button names a description');
    assert.equal(host().id, described, 'the aside’s host');
    assert.equal(host().textContent.trim(), 'Stage 2 of 3, due at dusk');
    assert.equal(target.querySelectorAll('button, a, input, [tabindex]').length, 1);
    assert.ok(!host().contains(button()), 'the aside is outside the button');
    handle.destroy();
  });

  it('detaches its element with its content on an update that omits it, and attaches the same one again', async () => {
    const { handle, row, host, button } = mountRow({ onOpen() {} });
    await settle();
    const slot = handle.slot('aside');
    const line = drawLine(handle);
    assert.equal(handle.update({ name: NAME, onOpen() {} }), true);
    await settle();
    assert.ok(!host(), 'no aside host');
    assert.equal(slot.isConnected, false, 'the slot element is detached');
    assert.ok(handle.slot('aside') === slot && slot.contains(line), 'kept, with its content');
    assert.ok(!button().hasAttribute('aria-describedby'), 'and the button describes nothing');
    assert.equal(handle.update({ name: NAME, onOpen() {}, aside: true }), true);
    await settle();
    assert.ok(host().contains(slot) && slot.contains(line), 'the same element, attached again');
    assert.ok(row().classList.contains('is-form'));
    handle.destroy();
  });

  it('keeps the row and its slot in place while an update passes or omits onOpen', async () => {
    const { handle, row, host, button } = mountRow();
    await settle();
    const [root, place, slot] = [row(), host(), handle.slot('aside')];
    const line = drawLine(handle);
    let detached = 0;
    const watch = new MutationObserver((records) => {
      detached += records.filter(({ removedNodes }) => [...removedNodes].includes(place)).length;
    });
    watch.observe(root, { childList: true });
    for (const props of [{ onOpen() {} }, {}, { onOpen() {}, selected: true }]) {
      assert.equal(handle.update({ name: NAME, aside: true, ...props }), true);
      await settle();
      assert.equal(Boolean(button()), 'onOpen' in props, 'the button follows onOpen');
      assert.ok(row() === root && host() === place, 'the same row and aside host');
      assert.ok(place.contains(slot) && slot.contains(line), 'holding the same slot');
    }
    watch.disconnect();
    assert.equal(detached, 0, 'the aside host was never removed');
    handle.destroy();
  });

  it('holds a published mount the companion makes in it, ended with the row', async () => {
    const fabUi = ui();
    const { handle, host } = mountRow({ onOpen() {} }, fabUi);
    await settle();
    const barTarget = handle.slot('aside').ownerDocument.createElement('div');
    handle.slot('aside').append(barTarget);
    const bar = fabUi.mount('FillBar', { target: barTarget, props: { value: 64 } });
    await settle();
    assert.ok(host().contains(barTarget.querySelector('.fab-fill-bar')), 'the bar in the aside');
    handle.destroy();
    assert.equal(barTarget.childNodes.length, 0, 'the nested mount ended with the row');
    assert.equal(bar.update({ value: 10 }), false, 'and is no longer live');
  });

  it('runs the spec scenario: a bar in the aside, onOpen omitted, then the aside omitted', async () => {
    const fabUi = ui();
    const { handle, row, host, button } = mountRow({ onOpen() {} }, fabUi);
    const slot = handle.slot('aside');
    const barTarget = slot.ownerDocument.createElement('div');
    slot.append(barTarget);
    fabUi.mount('FillBar', { target: barTarget, props: { value: 64 } });
    await settle();
    const bar = barTarget.querySelector('.fab-fill-bar');
    assert.ok(host().contains(bar), 'the bar is drawn in the aside');
    assert.equal(button().getAttribute('aria-describedby'), host().id);
    const root = row();
    assert.equal(handle.update({ name: NAME, aside: true }), true);
    await settle();
    assert.ok(!button(), 'the button is removed');
    assert.ok(row() === root && host().contains(slot), 'the row and the slot element stay');
    assert.equal(handle.update({ name: NAME }), true);
    await settle();
    assert.equal(slot.isConnected, false, 'the slot element is detached');
    assert.ok(slot.contains(bar), 'with the bar inside it');
    handle.destroy();
  });

  it('M15: refuses a value that is not a boolean, and renders nothing', () => {
    for (const value of ['yes', 1, null]) {
      const target = fabricateTarget(targets);
      assert.throws(() => ui().mount('ListRow', { target, props: { name: NAME, aside: value } }), {
        name: 'TypeError',
        message: /"aside" is a slot and takes true or false$/,
      });
      assert.equal(target.childNodes.length, 0);
    }
  });
});
