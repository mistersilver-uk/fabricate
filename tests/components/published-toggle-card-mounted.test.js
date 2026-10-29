/**
 * The published `ToggleCard` on Fabricate's real Svelte runtime (issue 2775), through a fresh seam
 * registered with the adapter's own table, under a Fabricate window root: the card it draws, its
 * `sub` and `icon`, the switch it composes and the name that switch takes from `title`, a press and
 * its `onToggle`, an update that keeps the node and its focus, the `semantics` closed set, every
 * refusal the entry adds, and the standalone style root it is drawn under in a companion's shell.
 * Limit: happy-dom activates no button from a key, so the View Lab's toggles case holds the Space
 * press, and no accessible name is computed here: this suite reads `aria-label` off the button.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
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
const TITLE = 'Spend when this stage begins';
const SUB = 'The ingredient is used up as the stage starts.';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-toggle-card-',
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

/** The props of an off, titled card with a no-op `onToggle`, with `overrides` over them. */
const base = (overrides = {}) => ({ title: TITLE, on: false, onToggle() {}, ...overrides });

/** A card mounted with `props` over an off state, a title and a recording `onToggle`. */
function mountCard(props = {}, under = 'fabricate') {
  const press = recorder();
  const target = fabricateTarget(targets, under);
  const handle = ui().mount('ToggleCard', {
    target,
    props: base({ onToggle: press.record, ...props }),
  });
  return {
    target,
    handle,
    calls: press.calls,
    card: () => target.querySelector('.fabricate-toggle-card'),
    button: () => target.querySelector('button'),
  };
}

const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));
const announced = (node) =>
  ['role', 'aria-pressed', 'aria-checked'].map((name) => node.getAttribute(name));

/** The refusal `mount` throws for `props` over a titled card, with nothing rendered. */
function assertRefused(props, tail) {
  const target = fabricateTarget(targets);
  assert.throws(() => ui().mount('ToggleCard', { target, props: base(props) }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published ToggleCard draws', () => {
  for (const under of ['fabricate', 'fabricate fabricate-app', 'fabricate fabricate-manager']) {
    it(`one card under a frame classed ${under}: glyph, title, second line and a switch named by the title`, async () => {
      const { target, handle, card, button } = mountCard({ sub: SUB }, under);
      await settle();
      assert.equal(target.children.length, 1, 'the only element drawn directly in target');
      assert.ok(card() === target.firstElementChild, 'and it is the card');
      assert.deepEqual(authoredClasses(card()), [
        'fabricate-toggle-card',
        'manager-recipe-status-card',
        'is-off',
      ]);
      assert.equal(card().querySelector('.manager-recipe-status-title').textContent, TITLE);
      assert.equal(card().querySelector('.manager-recipe-status-sub').textContent.trim(), SUB);
      assert.equal(
        card().querySelector(':scope .manager-recipe-status-icon i').className,
        'fas fa-circle'
      );
      assert.equal(target.querySelectorAll('button, a, input, [tabindex]').length, 1);
      assert.equal(button().getAttribute('aria-label'), TITLE, 'the switch takes the title');
      assert.equal(button().getAttribute('data-keyboard-focus'), 'true');
      assert.deepEqual(announced(button()), [null, 'false', null]);
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      assert.deepEqual(reports, []);
    });
  }

  it('draws is-on and a pressed switch for on: true, with no tone class', async () => {
    const { handle, card, button } = mountCard({ on: true });
    await settle();
    assert.deepEqual(authoredClasses(card()), [
      'fabricate-toggle-card',
      'manager-recipe-status-card',
      'is-on',
    ]);
    assert.deepEqual(announced(button()), [null, 'true', null]);
    handle.destroy();
  });

  it('draws the glyph icon names, none for an empty icon, and an empty second line when sub is omitted', async () => {
    const { handle, card } = mountCard({ icon: 'fa-solid fa-hammer' });
    await settle();
    const glyph = () => card().querySelector(':scope .manager-recipe-status-icon i');
    assert.equal(glyph().className, 'fa-solid fa-hammer');
    assert.equal(card().querySelector('.manager-recipe-status-sub').textContent.trim(), '');
    assert.equal(handle.update(base({ icon: '', sub: SUB })), true);
    await settle();
    assert.ok(!card().querySelector('.manager-recipe-status-icon'), 'no glyph slot at all');
    assert.equal(card().querySelector('.manager-recipe-status-sub').textContent.trim(), SUB);
    assert.equal(handle.update(base()), true);
    await settle();
    assert.equal(glyph().className, 'fas fa-circle', 'omitting icon draws the default glyph');
    assert.equal(card().querySelector('.manager-recipe-status-sub').textContent.trim(), '');
    handle.destroy();
  });

  it('renames the same focused switch when an update changes only the title', async () => {
    const { handle, card, button } = mountCard();
    await settle();
    const node = button();
    node.focus();
    const root = card();
    assert.equal(handle.update(base({ title: 'Hidden tasks' })), true);
    await settle();
    assert.ok(card() === root && button() === node, 'the same nodes');
    assert.ok(document.activeElement === node, 'focus stays on the switch');
    assert.equal(node.getAttribute('aria-label'), 'Hidden tasks');
    assert.equal(root.querySelector('.manager-recipe-status-title').textContent, 'Hidden tasks');
    handle.destroy();
  });
});

describe('the published ToggleCard names', () => {
  it('names its switch by title in both states, and never by sub', async () => {
    const { handle, button } = mountCard({ sub: SUB });
    await settle();
    assert.equal(button().getAttribute('aria-label'), TITLE);
    assert.equal(handle.update(base({ on: true, sub: SUB })), true);
    await settle();
    assert.equal(button().getAttribute('aria-label'), TITLE, 'the same name while on');
    assert.ok(!button().hasAttribute('aria-describedby'), 'the second line is no description');
    handle.destroy();
  });
});

describe('a press on the published ToggleCard', () => {
  it('calls onToggle once, with no argument, and changes no state itself', async () => {
    const { handle, calls, card, button } = mountCard();
    await settle();
    button().click();
    await settle();
    assert.deepEqual(calls, [[]], 'once, with an empty argument list');
    assert.equal(button().getAttribute('aria-pressed'), 'false', 'until an update passes on');
    assert.ok(card().classList.contains('is-off'));
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('draws the new state on the same focused switch when onToggle updates it', async () => {
    let on = false;
    const props = () =>
      base({
        on,
        onToggle: () => {
          on = !on;
          held.handle.update(props());
        },
      });
    const held = mountCard(props());
    await settle();
    const node = held.button();
    node.focus();
    node.click();
    await settle();
    assert.ok(held.button() === node && document.activeElement === node, 'same node, focus kept');
    assert.equal(node.getAttribute('aria-pressed'), 'true');
    assert.ok(held.card().classList.contains('is-on'));
    node.click();
    await settle();
    assert.equal(node.getAttribute('aria-pressed'), 'false', 'and back');
    held.handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('presses nothing from a click on the title or the second line', async () => {
    const { handle, calls, card } = mountCard({ sub: SUB });
    await settle();
    card().querySelector('.manager-recipe-status-title').click();
    card().querySelector('.manager-recipe-status-sub').click();
    card().click();
    assert.deepEqual(calls, []);
    handle.destroy();
  });

  it('reports an onToggle that throws, and stays drawn and live', async () => {
    const failure = new Error('the companion write failed');
    const { handle, button } = mountCard({
      onToggle: () => {
        throw failure;
      },
    });
    await settle();
    button().click();
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'ToggleCard', 'onToggle', failure]]);
    assert.equal(handle.update(base({ on: true })), true);
    await settle();
    assert.equal(button().getAttribute('aria-pressed'), 'true');
    handle.destroy();
  });
});

describe('the semantics key of the published ToggleCard', () => {
  for (const [on, checked] of [
    [false, 'false'],
    [true, 'true'],
  ]) {
    it(`announces "switch" as role switch with aria-checked="${checked}" and no aria-pressed`, async () => {
      const { handle, calls, button } = mountCard({ semantics: 'switch', on });
      await settle();
      assert.deepEqual(announced(button()), ['switch', null, checked]);
      assert.equal(button().getAttribute('aria-label'), TITLE);
      button().click();
      assert.deepEqual(calls, [[]]);
      handle.destroy();
    });
  }

  it('moves the same button between the two announcements on update, and omitting it is pressed', async () => {
    const { handle, button } = mountCard({ semantics: 'switch' });
    await settle();
    const node = button();
    assert.deepEqual(announced(node), ['switch', null, 'false']);
    assert.equal(handle.update(base()), true);
    await settle();
    assert.ok(button() === node);
    assert.deepEqual(announced(node), [null, 'false', null]);
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  for (const value of ['Switch', 'toggle', '', true, 1]) {
    it(`draws pressed for the out-of-set value ${JSON.stringify(value)}`, async () => {
      const { handle, button } = mountCard({ semantics: value });
      await settle();
      assert.deepEqual(announced(button()), [null, 'false', null]);
      assert.deepEqual(reports, []);
      handle.destroy();
    });
  }
});

describe('what the published ToggleCard refuses', () => {
  for (const [claim, props, tail] of [
    ['an absent title', { title: undefined }, 'ToggleCard requires a non-empty "title"'],
    ['an empty title', { title: '' }, 'ToggleCard requires a non-empty "title"'],
    ['an absent on', { on: undefined }, 'ToggleCard requires a non-empty "on"'],
    ['an absent onToggle', { onToggle: undefined }, 'ToggleCard requires a non-empty "onToggle"'],
    ['a string for onToggle', { onToggle: 'press' }, '"onToggle" must be a function'],
    ['a function as its title', { title: () => TITLE }, '"title" must not hold a function'],
  ]) {
    it(`refuses ${claim} on mount`, () => {
      assertRefused(props, tail);
    });
  }

  for (const key of [
    'variant',
    'toggleLabel',
    'toggleTitle',
    'disabled',
    'section',
    'field',
    'subDataAttr',
    'toggleDataAttr',
    'class',
    'data-x',
    'aria-pressed',
    'aria-checked',
    'role',
  ]) {
    it(`refuses ${key}, which it does not publish, on mount and on update`, async () => {
      const tail = `"${key}" is not a prop of ToggleCard`;
      assertRefused({ [key]: 'x' }, tail);
      const { handle, button } = mountCard();
      await settle();
      assert.throws(() => handle.update(base({ [key]: 'x' })), {
        name: 'TypeError',
        message: REFUSAL + tail,
      });
      await settle();
      assert.equal(button().getAttribute('aria-label'), TITLE, 'the earlier card stays drawn');
      handle.destroy();
    });
  }
});

describe('the published ToggleCard in a companion’s own shell', () => {
  it('draws its card inside one standalone style root, and destroy leaves the shell empty', async () => {
    const target = companionTarget(targets);
    const press = recorder();
    const handle = ui().mount('ToggleCard', { target, props: base({ onToggle: press.record }) });
    await settle();
    const card = standaloneRootIn(target).firstElementChild;
    assert.ok(card.classList.contains('fabricate-toggle-card'));
    card.querySelector('button').click();
    assert.deepEqual(press.calls, [[]]);
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });
});
