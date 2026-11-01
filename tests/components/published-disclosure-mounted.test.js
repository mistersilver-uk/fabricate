/**
 * The published `Disclosure` on Fabricate's real Svelte runtime (issue 2862), through a fresh seam
 * registered with the adapter's own table: the heading and its one button, `aria-expanded` and
 * `aria-controls`, the body hidden and kept, a press and its `onToggle`, `level`, `disabled`, the
 * head and body slots, the head's rule that nothing inside it is focusable, the refusals the entry
 * adds, the standalone style root, and a Fabricate that predates the entry.
 * Limit: happy-dom activates no button from a key and computes no accessible name, so
 * `published-disclosure-rendered.test.js` holds the keyboard, focus order and accessibility tree.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { FOCUSABLE_CONTENT } from '../../src/ui/svelte/actions/watchFocusable.js';
import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  FAULT_REPORT,
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
const HEAD_FAULT = 'Fabricate | Disclosure: "head" must hold nothing focusable, and it holds a ';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-disclosure-',
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

const report = (...args) => {
  reports.push(args);
};
const ui = () => shippedSeam({ ...seamParts, report });

/** A seam over `table`, as a Fabricate whose manifest is that table draws it. */
function seamOver(table) {
  const { createPublishedComponents, runtime, components } = seamParts;
  const instance = createPublishedComponents({ table, isReady: () => true, report });
  const unloaded = () => Promise.reject(new Error('this suite loads no lazy entry'));
  const lazy = table.filter((entry) => entry.lazy === true);
  const loaders = Object.fromEntries(lazy.map(({ path }) => [path, unloaded]));
  instance.register({ ...runtime, components, loaders });
  return instance.publicApi;
}

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

/** The props of a closed card with a head and a body, a no-op `onToggle`, and `overrides`. */
const base = (overrides = {}) => ({ head: true, body: true, onToggle() {}, ...overrides });

/** A card mounted with `props` over `base`, its `onToggle` recorded and its fault noted. */
function mountCard(props = {}, { under = 'fabricate', target } = {}) {
  const press = recorder();
  const faults = [];
  const into = target ?? fabricateTarget(targets, under);
  const handle = ui().mount('Disclosure', {
    target: into,
    props: base({ onToggle: press.record, ...props }),
    onFault: (fault) => {
      faults.push(fault);
    },
  });
  const card = () => into.querySelector('.fabricate-disclosure');
  return {
    target: into,
    handle,
    calls: press.calls,
    faults,
    card,
    heading: () => card().firstElementChild,
    button: () => into.querySelector('button.fabricate-disclosure-head'),
    region: () => into.querySelector('.fabricate-disclosure-body'),
  };
}

const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));

/** The refusal `mount` throws for `props` over `base`, with nothing rendered. */
function assertRefused(props, tail) {
  const target = fabricateTarget(targets);
  assert.throws(() => ui().mount('Disclosure', { target, props: base(props) }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published Disclosure draws', () => {
  for (const under of ['fabricate', 'fabricate fabricate-app', 'fabricate fabricate-manager']) {
    it(`one card under a frame classed ${under}: a level-3 heading, one button, a hidden body`, async () => {
      const { target, handle, card, heading, button, region } = mountCard({}, { under });
      await settle();
      assert.equal(target.children.length, 1, 'the only element drawn directly in target');
      assert.ok(card() === target.firstElementChild, 'and it is the card');
      assert.deepEqual(authoredClasses(card()), ['fabricate-disclosure']);
      assert.deepEqual(
        [...card().children].map((node) => node.localName),
        ['h3', 'div'],
        'the heading, then the body'
      );
      assert.ok(heading().firstElementChild === button(), 'the heading holds the button alone');
      assert.equal(heading().children.length, 1);
      assert.equal(button().getAttribute('type'), 'button');
      assert.equal(button().getAttribute('aria-expanded'), 'false');
      assert.equal(button().getAttribute('data-keyboard-focus'), 'true');
      assert.equal(button().getAttribute('aria-controls'), region().id);
      assert.match(region().id, /^fabricate-disclosure-\S+-body$/u);
      assert.ok(region().hidden, 'the closed body is hidden');
      assert.ok(!region().hasAttribute('role'), 'the body is no region landmark');
      assert.equal(target.querySelectorAll('button, a, input, [tabindex]').length, 1);
      const chevron = button().querySelector('.fabricate-disclosure-chevron');
      assert.equal(chevron.getAttribute('aria-hidden'), 'true');
      assert.ok(button().lastElementChild === chevron, 'the chevron trails the head');
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      assert.deepEqual(reports, []);
    });
  }

  it('draws its card inside one standalone style root in a companion shell', async () => {
    const { target, handle, calls } = mountCard({}, { target: companionTarget(targets) });
    await settle();
    const card = standaloneRootIn(target).firstElementChild;
    assert.ok(card.classList.contains('fabricate-disclosure'));
    card.querySelector('button').click();
    assert.deepEqual(calls, [[true]]);
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
  });

  it('gives each mount its own body id, which its own button controls', async () => {
    const first = mountCard();
    const second = mountCard();
    await settle();
    const ids = [first.region().id, second.region().id];
    assert.notEqual(ids[0], ids[1]);
    for (const { button, target } of [first, second]) {
      const id = button().getAttribute('aria-controls');
      const controlled = target.ownerDocument.querySelector(`[id="${id}"]`);
      assert.ok(target.contains(controlled), 'the controlled body is in the same target');
    }
    first.handle.destroy();
    second.handle.destroy();
  });

  it('lands a rest data attribute on the root, not on the button', async () => {
    const { handle, card, button } = mountCard({ 'data-faction': 'guild' });
    await settle();
    assert.equal(card().getAttribute('data-faction'), 'guild');
    assert.ok(!button().hasAttribute('data-faction'));
    handle.destroy();
  });
});

describe('open on the published Disclosure', () => {
  it('shows the body and writes aria-expanded="true" while truthy, on the same nodes', async () => {
    const { handle, button, region } = mountCard({ open: true });
    await settle();
    const [node, body] = [button(), region()];
    assert.equal(node.getAttribute('aria-expanded'), 'true');
    assert.ok(!body.hidden);
    assert.equal(handle.update(base({ open: false })), true);
    await settle();
    assert.ok(button() === node && region() === body, 'the same button and body');
    assert.equal(node.getAttribute('aria-expanded'), 'false');
    assert.ok(body.hidden);
    assert.equal(node.getAttribute('aria-controls'), body.id, 'the closed body is still named');
    handle.destroy();
  });

  for (const [value, expanded] of [
    ['false', 'true'],
    [1, 'true'],
    [{}, 'true'],
    [0, 'false'],
    ['', 'false'],
    [null, 'false'],
    [undefined, 'false'],
    [false, 'false'],
  ]) {
    it(`reads open: ${JSON.stringify(value)} for truthiness, as aria-expanded="${expanded}"`, async () => {
      const { handle, button, region } = mountCard({ open: value });
      await settle();
      assert.equal(button().getAttribute('aria-expanded'), expanded);
      assert.equal(region().hidden, expanded === 'false');
      handle.destroy();
    });
  }
});

describe('a press on the published Disclosure', () => {
  for (const [open, asked] of [
    [false, true],
    [true, false],
  ]) {
    it(`asks for open: ${asked} while ${open ? 'open' : 'closed'}, and changes no state itself`, async () => {
      const { handle, calls, button, region } = mountCard({ open });
      await settle();
      button().click();
      await settle();
      assert.deepEqual(calls, [[asked]], 'once, with the state asked for');
      assert.equal(button().getAttribute('aria-expanded'), String(open), 'until an update');
      assert.equal(region().hidden, !open);
      handle.destroy();
    });
  }

  it('draws the new state on the same focused button when onToggle updates it', async () => {
    let open = false;
    const props = () =>
      base({
        open,
        onToggle: (next) => {
          open = next;
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
    assert.equal(node.getAttribute('aria-expanded'), 'true');
    assert.ok(!held.region().hidden);
    node.click();
    await settle();
    assert.equal(node.getAttribute('aria-expanded'), 'false', 'and back');
    held.handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('presses nothing from a click on the body', async () => {
    const { handle, calls, region } = mountCard({ open: true });
    await settle();
    region().click();
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
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'Disclosure', 'onToggle', failure]]);
    assert.equal(handle.update(base({ open: true })), true);
    await settle();
    assert.equal(button().getAttribute('aria-expanded'), 'true');
    handle.destroy();
  });
});

describe("the published Disclosure's heading element", () => {
  for (const value of [true, 'false', 1]) {
    it(`marks the button aria-disabled for disabled: ${JSON.stringify(value)}, keeps it focusable, and a press calls nothing`, async () => {
      const { handle, calls, button } = mountCard({ disabled: value, open: true });
      await settle();
      assert.equal(button().getAttribute('aria-disabled'), 'true');
      assert.ok(
        !button().disabled && !button().hasAttribute('disabled'),
        'never natively disabled'
      );
      assert.equal(button().getAttribute('aria-expanded'), 'true', 'the state stays written');
      button().focus();
      assert.ok(document.activeElement === button(), 'it takes focus');
      button().click();
      assert.deepEqual(calls, []);
      handle.destroy();
    });
  }

  for (const value of [false, 0, '', null]) {
    it(`leaves the button unmarked for disabled: ${JSON.stringify(value)}`, async () => {
      const { handle, button } = mountCard({ disabled: value });
      await settle();
      assert.ok(!button().hasAttribute('aria-disabled') && !button().disabled);
      handle.destroy();
    });
  }

  it('keeps focus on the same button when an update disables it while it holds focus, and back', async () => {
    const press = recorder();
    const props = (disabled) => base({ disabled, onToggle: press.record });
    const { handle, button } = mountCard(props(false));
    await settle();
    const node = button();
    node.focus();
    assert.equal(handle.update(props(true)), true);
    await settle();
    assert.ok(button() === node && document.activeElement === node, 'focus stays on the head');
    node.click();
    assert.deepEqual(press.calls, [], 'and a press asks for nothing');
    assert.equal(handle.update(props(false)), true);
    await settle();
    assert.ok(document.activeElement === node);
    node.click();
    assert.deepEqual(press.calls, [[true]]);
    handle.destroy();
  });

  for (const level of [2, 3, 4, 5, 6]) {
    it(`wraps the button in an h${level} for level: ${level}`, async () => {
      const { handle, heading, button } = mountCard({ level });
      await settle();
      assert.equal(heading().localName, `h${level}`);
      assert.ok(heading().firstElementChild === button());
      handle.destroy();
    });
  }

  for (const level of [1, 7, 0, -2, 3.5, '4', NaN, true, null, [4]]) {
    it(`draws an h3 for the out-of-range level ${JSON.stringify(level)}`, async () => {
      const { handle, heading } = mountCard({ level });
      await settle();
      assert.equal(heading().localName, 'h3');
      assert.deepEqual(reports, []);
      handle.destroy();
    });
  }

  it('draws a new heading and button, its head slot intact, when an update changes level, and keeps both otherwise', async () => {
    const { handle, heading, button, region } = mountCard({ level: 3 });
    await settle();
    handle.slot('head').append('Ironwrights’ Guild');
    const [before, body] = [button(), region()];
    assert.equal(handle.update(base({ level: 3, open: true })), true);
    await settle();
    assert.ok(button() === before, 'an update that keeps level keeps the button');
    assert.equal(handle.update(base({ level: 5, open: true })), true);
    await settle();
    assert.equal(heading().localName, 'h5');
    assert.ok(heading().firstElementChild === button());
    assert.ok(button() !== before, 'the button is drawn again');
    assert.ok(button().contains(handle.slot('head')), 'the same head slot, moved into it');
    assert.equal(button().textContent, 'Ironwrights’ Guild');
    assert.ok(region() === body, 'the body element is kept');
    handle.destroy();
  });
});

describe('the head and body slots of the published Disclosure', () => {
  it('draws the head inside the button, before the chevron, and the body in the controlled element', async () => {
    const { handle, button, region } = mountCard();
    await settle();
    const head = handle.slot('head');
    const body = handle.slot('body');
    assert.equal(head.localName, 'span');
    assert.equal(body.localName, 'div');
    assert.ok(button().contains(head), 'the head lies in the button');
    assert.ok(region().contains(body), 'the body lies in the controlled element');
    head.append('Ironwrights’ Guild', document.createElement('span'));
    head.lastChild.textContent = ' Honoured';
    await settle();
    assert.equal(button().textContent, 'Ironwrights’ Guild Honoured', 'the head is the name');
    assert.deepEqual(faultsOf(), []);
    handle.destroy();
  });

  it('keeps a typed value in the body across a close and an open', async () => {
    const { handle, region } = mountCard({ open: true });
    await settle();
    const input = document.createElement('input');
    handle.slot('body').append(input);
    input.value = 'Standing note';
    assert.equal(handle.update(base({ open: false })), true);
    await settle();
    assert.ok(region().hidden && region().contains(input), 'hidden, still holding the field');
    assert.ok(input.isConnected);
    assert.equal(handle.update(base({ open: true })), true);
    await settle();
    assert.ok(handle.slot('body').firstChild === input, 'the same field');
    assert.equal(input.value, 'Standing note');
    handle.destroy();
  });

  it('draws an empty head and body when neither slot is requested', async () => {
    const { handle, button, region } = mountCard({ head: false, body: undefined });
    await settle();
    assert.ok(!handle.slot('head') && !handle.slot('body'));
    assert.equal(button().textContent, '');
    assert.equal(region().childElementCount, 0);
    handle.destroy();
  });
});

const faultsOf = () => reports.filter(([first]) => first === FAULT_REPORT);

/** An element named `tag` with `attributes`, as a companion draws it. */
const element = (tag, attributes = {}) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
};

/** One element of each kind `FOCUSABLE_CONTENT` refuses, by the selector that matches it. */
const REFUSED_KINDS = Object.freeze([
  ['a[href]', () => element('a', { href: '#guild' })],
  ['area[href]', () => element('area', { href: '#guild' })],
  ['audio[controls]', () => element('audio', { controls: '' })],
  ['button', () => element('button')],
  ['details', () => element('details')],
  ['embed', () => element('embed')],
  ['iframe', () => element('iframe')],
  ['img[usemap]', () => element('img', { usemap: '#holdings' })],
  ['input:not([type="hidden"])', () => element('input')],
  ['label', () => element('label')],
  ['object', () => element('object')],
  ['select', () => element('select')],
  ['summary', () => element('summary')],
  ['textarea', () => element('textarea')],
  ['video[controls]', () => element('video', { controls: '' })],
  ['[tabindex]', () => element('span', { tabindex: '-1' })],
  [
    '[contenteditable]:not([contenteditable="false"])',
    () => element('div', { contenteditable: 'true' }),
  ],
]);

/** Each watched attribute, set later on an element the head already holds, and the tag it faults. */
const LATER_FLIPS = Object.freeze([
  ['type', () => element('input', { type: 'hidden' }), 'type', 'text', 'input'],
  ['href', () => element('a'), 'href', '#guild', 'a'],
  ['controls', () => element('video'), 'controls', '', 'video'],
  ['usemap', () => element('img'), 'usemap', '#holdings', 'img'],
  ['contenteditable', () => element('span'), 'contenteditable', 'true', 'span'],
  ['tabindex', () => element('span'), 'tabindex', '0', 'span'],
]);

/** The fault a refused element brings: told once, reported, `target` emptied, the handle dead. */
function assertFaulted({ target, handle, faults }, tag) {
  assert.equal(faults.length, 1, 'onFault is told once');
  assert.equal(faults[0].name, 'TypeError');
  assert.equal(faults[0].message, `${HEAD_FAULT}<${tag}>`);
  assert.equal(faultsOf().length, 1, 'and the seam reports it');
  assert.equal(target.childNodes.length, 0, 'the target is emptied');
  assert.equal(handle.update(base()), false, 'the handle is dead');
}

describe('the head of the published Disclosure holds nothing focusable', () => {
  it('covers every selector the watch refuses', () => {
    assert.deepEqual(
      REFUSED_KINDS.map(([selector]) => selector),
      FOCUSABLE_CONTENT.split(', ')
    );
  });

  for (const [selector, make] of REFUSED_KINDS) {
    it(`faults the mount when an element matching ${selector} is drawn in the head`, async () => {
      const card = mountCard();
      await settle();
      const node = make();
      const wrapper = document.createElement('span');
      wrapper.append(node);
      card.handle.slot('head').append(wrapper);
      await settle();
      await settle();
      assertFaulted(card, node.localName);
    });
  }

  for (const [attribute, make, name, value, tag] of LATER_FLIPS) {
    it(`faults when a later ${attribute} makes a drawn head element focusable`, async () => {
      const card = mountCard();
      await settle();
      const node = make();
      card.handle.slot('head').append(node);
      await settle();
      assert.deepEqual(card.faults, [], 'nothing faults before the attribute');
      node.setAttribute(name, value);
      await settle();
      await settle();
      assertFaulted(card, tag);
    });
  }

  it('faults for a focusable element appended synchronously after mount, before any flush', async () => {
    const card = mountCard();
    card.handle.slot('head').append(element('button'));
    await settle();
    await settle();
    assertFaulted(card, 'button');
  });

  it('admits text, marks and elements that take no focus in the head, and anything in the body', async () => {
    const { handle, faults, button } = mountCard({ open: true });
    await settle();
    handle
      .slot('head')
      .append(
        'Guild',
        element('i', { 'aria-hidden': 'true' }),
        element('input', { type: 'hidden' }),
        element('a'),
        element('audio'),
        element('video'),
        element('img', { alt: '' }),
        element('span', { contenteditable: 'false' })
      );
    handle.slot('body').append(element('button'), element('input'));
    await settle();
    await settle();
    assert.deepEqual(faults, []);
    assert.deepEqual(faultsOf(), []);
    assert.ok(button().isConnected, 'still drawn');
    handle.destroy();
  });
});

describe('what the published Disclosure refuses', () => {
  for (const [claim, props, tail] of [
    ['an absent onToggle', { onToggle: undefined }, 'Disclosure requires a non-empty "onToggle"'],
    ['a string for onToggle', { onToggle: 'press' }, '"onToggle" must be a function'],
    ['a string for head', { head: 'Guild' }, '"head" is a slot and takes true or false'],
    ['a string for body', { body: 'Notes' }, '"body" is a slot and takes true or false'],
    ['a function as open', { open: () => true }, '"open" must not hold a function'],
    ['an id rest key', { id: 'guild' }, '"id" is not a data attribute'],
    ['an aria rest key', { 'aria-label': 'Guild' }, '"aria-label" is not a data attribute'],
    ['a class rest key', { class: 'wide' }, '"class" is not a data attribute'],
    ['an object data attribute', { 'data-x': {} }, '"data-x" is not a data attribute'],
  ]) {
    it(`refuses ${claim} on mount`, () => {
      assertRefused(props, tail);
    });
  }

  it('refuses on update and keeps the earlier card drawn', async () => {
    const { handle, button } = mountCard();
    await settle();
    assert.throws(() => handle.update(base({ head: 'Guild' })), {
      name: 'TypeError',
      message: `${REFUSAL}"head" is a slot and takes true or false`,
    });
    assert.ok(button().isConnected);
    handle.destroy();
  });
});

describe('describe and a Fabricate that predates the Disclosure', () => {
  it('describes the entry at version 1 on the any root', () => {
    assert.deepEqual(ui().describe('Disclosure'), {
      version: 1,
      props: {
        open: { kind: 'data', required: false },
        onToggle: { kind: 'callback', required: true },
        level: { kind: 'data', required: false },
        disabled: { kind: 'data', required: false },
        head: { kind: 'slot', required: false },
        body: { kind: 'slot', required: false },
      },
      rest: true,
      root: 'any',
      overlays: false,
    });
    assert.ok(ui().components.includes('Disclosure'));
  });

  it('is refused by name, and described as null, by a seam whose table predates it', async () => {
    const { PUBLISHED_COMPONENT_MANIFEST: manifest } = await harness.loadRawModule(
      'src/ui/publishedComponentManifest.js'
    );
    const older = seamOver(manifest.filter(({ name }) => name !== 'Disclosure'));
    const target = fabricateTarget(targets);
    assert.throws(() => older.mount('Disclosure', { target, props: base() }), {
      name: 'TypeError',
      message: `${REFUSAL}"Disclosure" is not published`,
    });
    assert.equal(older.describe('Disclosure'), null);
    assert.ok(!older.components.includes('Disclosure'));
    assert.equal(target.childNodes.length, 0);
  });
});
