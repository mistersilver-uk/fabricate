/**
 * Issue 2448's seven published leaves, and issue 2451's `Kicker`, `Chip`, `Rail`, `InspectorCard`,
 * `EmptyState` and `Notice`, on Fabricate's real Svelte runtime, each through a fresh seam
 * registered with the adapter's own table, into a bare companion target or the shell its root
 * needs: mount, update on one root and destroy; the seam's refusal of an unpublished or missing
 * prop; a `text` key drawn as text and a `slot` key filled, omitted and requested again; what
 * each `any` leaf draws from its own stylesheet under no Fabricate ancestor; and `Notice`'s action
 * button with its `onAction` callback (issue 2452). The published `Button` mounts here as a leaf;
 * what it draws and refuses is `published-button-mounted.test.js`'s.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import {
  CALLBACK_REPORT,
  FAULT_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  assertClipped,
  companionTarget,
  fabricateTarget,
  recordEscapes,
  settle,
  shippedSeam,
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-leaves-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let targets;
const recordEscape = (error) => {
  escaped.push(error);
};

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

/** An empty target for `name`: bare, or inside the shell its entry in `LEAVES` names. */
function targetFor(name) {
  const under = LEAVES.find((leaf) => leaf.name === name)?.under;
  return under ? fabricateTarget(targets, under) : companionTarget(targets);
}

function mountLeaf(name, props) {
  const target = targetFor(name);
  return { target, handle: ui().mount(name, { target, props }) };
}

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components };
});

after(() => harness.teardown());

beforeEach(() => {
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
});

/** Each leaf's root, a mount and an update that changes `read`, and the shell its root needs. */
const LEAVES = Object.freeze([
  {
    name: 'Avatar',
    root: '.fab-avatar',
    props: { name: 'Mira Voss' },
    next: { name: 'Tam Oakes' },
    read: (root) => root.querySelector('.fab-avatar-initials').textContent,
    drawn: ['MV', 'TO'],
  },
  {
    name: 'Medallion',
    root: '.fab-medallion',
    props: { size: 26 },
    next: { size: 26, icon: 'fas fa-gem' },
    read: (root) => root.querySelector('i').classList.contains('fa-gem'),
    drawn: [false, true],
  },
  {
    name: 'FillBar',
    root: '.fab-fill-bar',
    props: { value: 25 },
    next: { value: 64 },
    read: (root) => root.querySelector('.fab-fill-bar-fill').style.width,
    drawn: ['25%', '64%'],
  },
  {
    name: 'Meter',
    root: '.fab-meter',
    props: { value: 1, max: 4, label: 'Stamina' },
    next: { value: 3, max: 4, label: 'Stamina' },
    read: (root) => root.getAttribute('aria-valuenow'),
    drawn: ['1', '3'],
  },
  {
    name: 'BandedBar',
    root: '.fab-banded-bar',
    props: { rows: [{ name: 'Event chance', percent: 62 }] },
    next: { rows: [{ name: 'Event chance', percent: 20 }] },
    read: (root) => root.querySelector('[data-banded-bar-percent]').textContent,
    drawn: ['62%', '20%'],
  },
  {
    name: 'StatBox',
    root: '.fab-stat-box',
    props: { value: '12', label: 'Runs' },
    next: { value: '13', label: 'Runs' },
    read: (root) => root.querySelector('.fab-stat-box-figure').textContent,
    drawn: ['12', '13'],
  },
  {
    name: 'InfoStrip',
    root: '.fabricate-info-strip',
    props: { label: 'Conditions', facts: [{ value: 'Clear' }] },
    next: { label: 'Conditions', facts: [{ value: 'Storm' }] },
    read: (root) => root.querySelector('.fabricate-info-strip-value').textContent,
    drawn: ['Clear', 'Storm'],
  },
  {
    name: 'Kicker',
    root: '.fab-kicker',
    props: { children: 'Standing' },
    next: { children: 'Renown', tone: 'accent' },
    read: (root) => root.textContent,
    drawn: ['Standing', 'Renown'],
  },
  {
    name: 'Chip',
    root: '.manager-chip',
    props: { children: 'Locked', tone: 'neutral', density: 'list' },
    next: { children: 'Open', tone: 'positive', density: 'list' },
    read: (root) => root.textContent,
    drawn: ['Locked', 'Open'],
  },
  {
    name: 'Rail',
    root: '.fab-rail',
    props: { label: 'Standing' },
    next: { label: 'Renown' },
    read: (root) => root.querySelector('.fab-rail-label').textContent,
    drawn: ['Standing', 'Renown'],
  },
  {
    name: 'InspectorCard',
    under: 'fabricate',
    root: '.fabricate-card',
    props: {},
    next: { children: true },
    read: (root) => root.children.length,
    drawn: [0, 1],
  },
  {
    name: 'EmptyState',
    root: '.manager-empty',
    props: { title: 'No factions yet' },
    next: { title: 'No standing yet' },
    read: (root) => root.querySelector('h3').textContent,
    drawn: ['No factions yet', 'No standing yet'],
  },
  {
    name: 'Notice',
    root: '.fab-notice',
    props: { title: 'Over the limit' },
    next: { title: 'Back under the limit' },
    read: (root) => root.querySelector('.fab-notice-title').textContent,
    drawn: ['Over the limit', 'Back under the limit'],
  },
  {
    name: 'Button',
    under: 'fabricate',
    root: '.fabricate-button',
    props: { children: 'Clear filters', onclick() {} },
    next: { children: 'Filters cleared', onclick() {} },
    read: (root) => root.textContent,
    drawn: ['Clear filters', 'Filters cleared'],
  },
]);

const propsOf = (name) => LEAVES.find((leaf) => leaf.name === name).props;

/** A node's authored classes, without Svelte's scope hash. */
const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));
const FOCUSABLE = 'button, a, input, [tabindex]';

const publishedProps = (name) =>
  PUBLISHED_COMPONENT_MANIFEST.find((entry) => entry.name === name).props;

function requiredKeysOf(name) {
  const props = publishedProps(name);
  return Object.keys(props).filter((key) => props[key].required);
}

/** What a required key refuses `value` with: M9, or M17 for `''` on a `callback` key. */
function requiredRefusal(name, key, value) {
  const notAFunction = value === '' && publishedProps(name)[key].kind === 'callback';
  return notAFunction ? `"${key}" must be a function` : `${name} requires a non-empty "${key}"`;
}

describe('each published leaf through the seam', () => {
  it('is every manifest entry but TierTrack, which the seam suite mounts', () => {
    assert.deepEqual(
      LEAVES.map((leaf) => leaf.name),
      PUBLISHED_COMPONENT_MANIFEST.map((entry) => entry.name).filter((name) => name !== 'TierTrack')
    );
  });

  for (const { name, root, props, next, read, drawn } of LEAVES) {
    it(`${name} mounts its root, updates on that root, and destroys`, async () => {
      const { target, handle } = mountLeaf(name, props);
      const node = target.querySelector(root);
      assert.ok(node?.parentElement === target, `${root} is in place when mount returns`);
      assert.equal(read(node), drawn[0]);
      assert.equal(handle.update(next), true);
      await settle();
      assert.ok(target.querySelector(root) === node, 'the same root node, so nothing remounted');
      assert.equal(read(node), drawn[1]);
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      await settle();
      assert.deepEqual(reports, []);
    });
  }
});

describe('a key a leaf does not publish', () => {
  const UNPUBLISHED = [
    ['Avatar', 'class', 'is not a prop of Avatar'],
    ['Medallion', 'src', 'is not a prop of Medallion'],
    ['FillBar', 'class', 'is not a data attribute'],
    ['StatBox', 'valueDataAttr', 'is not a data attribute'],
    ['Meter', 'aria-label', 'is not a data attribute'],
    ['Meter', 'labelId', 'is not a data attribute'],
    ['InfoStrip', 'ariaLabel', 'is not a data attribute'],
    ['Kicker', 'class', 'is not a data attribute'],
    ['Chip', 'class', 'is not a data attribute'],
    ['Chip', 'tag', 'is not a data attribute'],
    ['Chip', 'removable', 'is not a data attribute'],
    ['Chip', 'element', 'is not a data attribute'],
    ['Rail', 'class', 'is not a data attribute'],
    ['InspectorCard', 'class', 'is not a data attribute'],
    ['EmptyState', 'contextClass', 'is not a data attribute'],
    ['EmptyState', 'compact', 'is not a data attribute'],
    ['EmptyState', 'inline', 'is not a data attribute'],
    ['EmptyState', 'field', 'is not a data attribute'],
    ['EmptyState', 'fill', 'is not a data attribute'],
    ['EmptyState', 'note', 'is not a data attribute'],
    ['Notice', 'dismissable', 'is not a data attribute'],
    ['Notice', 'dismissLabel', 'is not a data attribute'],
    ['Notice', 'blocking', 'is not a data attribute'],
    ['Notice', 'evidence', 'is not a data attribute'],
    ['Button', 'size', 'is not a data attribute'],
    ['Button', 'tag', 'is not a data attribute'],
    ['Button', 'type', 'is not a data attribute'],
    ['Button', 'class', 'is not a data attribute'],
  ];
  for (const [name, key, refusal] of UNPUBLISHED) {
    it(`${name} refuses ${key}, and renders nothing`, () => {
      const target = targetFor(name);
      assert.throws(() => ui().mount(name, { target, props: { ...propsOf(name), [key]: 'x' } }), {
        name: 'TypeError',
        message: `${REFUSAL}"${key}" ${refusal}`,
      });
      assert.equal(target.childNodes.length, 0);
    });
  }
});

describe('a required prop', () => {
  for (const { name, props } of LEAVES) {
    for (const key of requiredKeysOf(name)) {
      for (const value of [undefined, '']) {
        it(`${name} refuses ${value === '' ? 'an empty' : 'an absent'} ${key}`, () => {
          const given = { ...props };
          if (value === undefined) delete given[key];
          else given[key] = value;
          const target = targetFor(name);
          assert.throws(() => ui().mount(name, { target, props: given }), {
            name: 'TypeError',
            message: REFUSAL + requiredRefusal(name, key, value),
          });
          assert.equal(target.childNodes.length, 0);
        });
      }
    }
  }
});

describe('the order a rest entry refuses in', () => {
  const FUNCTION = (key) => `"${key}" must not hold a function`;
  for (const [claim, name, props, refusal] of [
    [
      'a function inside its action (M10) before a missing title (M9)',
      'Notice',
      { action: { label: 'Review', onClick: () => {} } },
      FUNCTION('action'),
    ],
    [
      'a missing title (M9) when its action holds data alone',
      'Notice',
      { action: { label: 'Review' } },
      'Notice requires a non-empty "title"',
    ],
    [
      'a value that is no function for onAction (M17) before a missing title (M9)',
      'Notice',
      { onAction: 'review' },
      '"onAction" must be a function',
    ],
    [
      'a function for its unpublished evidence (M10)',
      'Notice',
      { evidence: () => {} },
      FUNCTION('evidence'),
    ],
    [
      'a function for its content slot (M10)',
      'EmptyState',
      { children: () => {} },
      FUNCTION('children'),
    ],
  ]) {
    it(`${name} refuses ${claim}, and renders nothing`, () => {
      const target = targetFor(name);
      assert.throws(() => ui().mount(name, { target, props }), {
        name: 'TypeError',
        message: `${REFUSAL}${refusal}`,
      });
      assert.equal(target.childNodes.length, 0);
    });
  }
});

const TEXT_LEAVES = [
  ['Kicker', '.fab-kicker'],
  ['Chip', '.manager-chip'],
];

describe('a text key through the shipped seam', () => {
  for (const [name, root] of TEXT_LEAVES) {
    it(`${name} draws its label as text in one element, in place when mount returns`, () => {
      const { target, handle } = mountLeaf(name, { children: '<b>x</b>' });
      const node = target.querySelector(root);
      assert.equal(node.textContent, '<b>x</b>', 'drawn as written');
      assert.equal(node.children.length, 1, 'one element holds the label');
      const [span] = node.children;
      assert.equal(span.localName, 'span');
      assert.equal(span.attributes.length, 0);
      assert.equal(span.children.length, 0, 'the string is never parsed as markup');
      assert.ok(!target.querySelector('b'), 'no <b>');
      handle.destroy();
      assert.deepEqual(reports, []);
    });

    it(`${name} keeps its root, its label element and an unchanged text node across updates`, async () => {
      const { target, handle } = mountLeaf(name, { children: 'Rank', tone: 'accent' });
      const node = target.querySelector(root);
      const [span] = node.children;
      const textNode = span.firstChild;
      assert.equal(handle.update({ children: 'Rank' }), true);
      await settle();
      assert.ok(target.querySelector(root) === node, 'the same root');
      assert.ok(node.children[0] === span, 'the same label element');
      assert.ok(span.firstChild === textNode, 'a tone-only update rewrites no text');
      assert.equal(handle.update({ children: 'Standing' }), true);
      await settle();
      assert.ok(node.children[0] === span, 'a new label is written into the same element');
      assert.equal(node.textContent, 'Standing');
      handle.destroy();
    });

    for (const [value, what] of [
      [7, 'a number'],
      [null, 'null'],
      [['x'], 'an array'],
    ]) {
      it(`${name} refuses ${what} as its label (M14), and renders nothing`, () => {
        const target = companionTarget(targets);
        assert.throws(() => ui().mount(name, { target, props: { children: value } }), {
          name: 'TypeError',
          message: `${REFUSAL}"children" must be a string`,
        });
        assert.equal(target.childNodes.length, 0);
      });
    }
  }

  it('Chip refuses a function for onRemove (M10), so no published input draws a control', () => {
    const target = companionTarget(targets);
    const props = { children: 'Locked', onRemove: () => {} };
    assert.throws(() => ui().mount('Chip', { target, props }), {
      name: 'TypeError',
      message: `${REFUSAL}"onRemove" must not hold a function`,
    });
    assert.equal(target.childNodes.length, 0);
  });

  it('Chip draws a span that is no control, whatever its published keys', () => {
    const { target, handle } = mountLeaf('Chip', {
      children: 'Locked',
      tone: 'warning',
      density: 'list',
    });
    const chip = target.querySelector('.manager-chip');
    assert.equal(chip.localName, 'span');
    assert.deepEqual(
      authoredClasses(chip),
      ['manager-chip', 'is-warning', 'is-list'],
      'the root class, then only what the published keys write'
    );
    assert.ok(!chip.hasAttribute('role') && !chip.hasAttribute('tabindex'), 'no role, no focus');
    assert.ok(!target.querySelector(FOCUSABLE), 'nothing focusable');
    handle.destroy();
  });
});

/** Each leaf that publishes a content slot, and the element of its own that draws it. */
const SLOT_LEAVES = [
  ['Rail', '.fab-rail'],
  ['InspectorCard', '.fabricate-card'],
  ['EmptyState', '.manager-empty > div'],
];

describe('a slot key through the shipped seam', () => {
  for (const [name, drawnIn] of SLOT_LEAVES) {
    it(`${name} hands back a <div> slot element, drawn one private wrapper below ${drawnIn} when mount returns`, async () => {
      const { target, handle } = mountLeaf(name, { ...propsOf(name), children: true });
      const slot = handle.slot('children');
      assert.equal(slot.localName, 'div');
      assert.ok(target.firstElementChild.contains(slot), 'inside the root');
      assert.ok(slot.parentElement.parentElement === target.querySelector(drawnIn), drawnIn);
      handle.destroy();
      assert.equal(target.childNodes.length, 0);
      await settle();
      assert.deepEqual(reports, []);
    });

    for (const [value, what] of [
      ['x', 'a string'],
      [1, 'a number'],
      [null, 'null'],
    ]) {
      it(`${name} refuses ${what} for its content slot (M15), and renders nothing`, () => {
        const target = targetFor(name);
        const props = { ...propsOf(name), children: value };
        assert.throws(() => ui().mount(name, { target, props }), {
          name: 'TypeError',
          message: `${REFUSAL}"children" is a slot and takes true or false`,
        });
        assert.equal(target.childNodes.length, 0);
      });
    }

    it(`${name} draws a Kicker mounted in its content slot, and its destroy ends both`, async () => {
      const seam = ui();
      const target = targetFor(name);
      const outer = seam.mount(name, { target, props: { ...propsOf(name), children: true } });
      const inner = target.ownerDocument.createElement('div');
      outer.slot('children').append(inner);
      const kicker = seam.mount('Kicker', { target: inner, props: { children: 'Renown' } });
      await settle();
      assert.equal(target.firstElementChild.querySelector('.fab-kicker').textContent, 'Renown');
      outer.destroy();
      assert.equal(kicker.update({ children: 'Again' }), false, 'the nested mount ended');
      assert.equal(inner.childNodes.length, 0);
      assert.equal(target.childNodes.length, 0);
      await settle();
      assert.deepEqual(reports, []);
    });
  }
});

describe('Rail under a bare ancestor', () => {
  it('names itself a group by its label, drawn as a paragraph', () => {
    const { target, handle } = mountLeaf('Rail', { label: 'Standing' });
    const rail = target.querySelector('.fab-rail');
    assert.equal(rail.localName, 'section');
    assert.equal(rail.getAttribute('role'), 'group');
    const label = rail.querySelector('p.fab-rail-label');
    assert.equal(label.textContent, 'Standing');
    assert.ok(label.id.length > 0, 'the label carries an id');
    assert.equal(rail.getAttribute('aria-labelledby'), label.id);
    handle.destroy();
  });

  it('is an unnamed section with no label', () => {
    const { target, handle } = mountLeaf('Rail', {});
    const rail = target.querySelector('.fab-rail');
    assert.equal(rail.localName, 'section');
    assert.ok(!rail.hasAttribute('role') && !rail.hasAttribute('aria-labelledby'), 'no naming');
    assert.ok(!rail.querySelector('p'), 'no paragraph');
    assert.equal(rail.children.length, 0);
    handle.destroy();
  });

  it('lays its children out in a column, and its label in its own ink and case', async () => {
    const theme = ':root[data-fabricate-theme] { --fab-text-muted: rgb(1, 2, 3); }';
    await underSheet(theme, async () => {
      const { target, handle } = mountLeaf('Rail', { label: 'Standing', children: true });
      await settle();
      const rail = getComputedStyle(target.querySelector('.fab-rail'));
      assert.equal(rail.display, 'flex');
      assert.equal(rail.flexDirection, 'column');
      const label = getComputedStyle(target.querySelector('.fab-rail-label'));
      assert.equal(label.color, 'rgb(1, 2, 3)');
      assert.equal(label.fontSize, '8.5px');
      assert.equal(label.textTransform, 'uppercase');
      handle.destroy();
    });
  });
});

describe('EmptyState under a bare ancestor', () => {
  /** The panel's one element child, the column that spaces its content. */
  const columnOf = (target) => target.querySelector('.manager-empty').firstElementChild;

  it('draws the panel and nothing in its column with no props, and is no live region', async () => {
    const { target, handle } = mountLeaf('EmptyState', {});
    const panel = target.querySelector('.manager-empty');
    assert.deepEqual(authoredClasses(panel), ['manager-empty']);
    assert.ok(!panel.hasAttribute('role') && !panel.hasAttribute('aria-live'), 'no role');
    assert.equal(columnOf(target).children.length, 0);
    assert.equal(columnOf(target).textContent.trim(), '');
    await settle();
    assert.deepEqual(reports, []);
    handle.destroy();
  });

  it('draws a glyph tile, a level-3 title and a hint, and writes filtered as its one state class', () => {
    const { target, handle } = mountLeaf('EmptyState', {
      icon: 'fas fa-feather',
      title: 'No factions yet',
      hint: 'Add a faction to begin.',
      filtered: true,
      children: true,
    });
    assert.deepEqual(authoredClasses(target.querySelector('.manager-empty')), [
      'manager-empty',
      'is-filtered',
    ]);
    const [glyph, title, hint, wrapper] = columnOf(target).children;
    assert.deepEqual(
      [glyph, title, hint, wrapper].map((node) => node.localName),
      ['i', 'h3', 'p', 'div']
    );
    assert.equal(glyph.getAttribute('aria-hidden'), 'true');
    assert.equal(title.textContent, 'No factions yet');
    assert.ok(!target.querySelector(FOCUSABLE), 'nothing focusable, whatever its published keys');
    handle.destroy();
  });

  it('draws a requested content slot left empty as one wrapper holding the slot element, neither taking a box', async () => {
    const { target, handle } = mountLeaf('EmptyState', { children: true });
    const column = columnOf(target);
    const slot = handle.slot('children');
    assert.equal(column.children.length, 1, 'one wrapper');
    const [wrapper] = column.children;
    assert.ok(wrapper.children.length === 1 && wrapper.children[0] === slot, 'the slot element');
    assert.equal(wrapper.style.display, 'contents');
    assert.equal(slot.style.display, 'contents');
    assert.equal(slot.childNodes.length, 0);
    handle.destroy();
    await settle();
    assert.deepEqual(reports, []);
  });

  it('detaches its content slot when it is omitted, and attaches the same element when it is requested again', async () => {
    const seam = ui();
    const target = companionTarget(targets);
    const title = 'No factions yet';
    const handle = seam.mount('EmptyState', { target, props: { title, children: true } });
    const slot = handle.slot('children');
    const inner = target.ownerDocument.createElement('div');
    slot.append(inner);
    const chip = seam.mount('Chip', { target: inner, props: { children: 'Locked' } });
    await settle();
    const column = columnOf(target);

    assert.equal(handle.update({ title }), true);
    await settle();
    assert.deepEqual(
      [...column.children].map((child) => child.localName),
      ['h3'],
      'the column holds the heading alone'
    );
    assert.ok(handle.slot('children') === slot, 'the same slot element');
    assert.equal(slot.isConnected, false);
    assert.equal(chip.update({ children: 'Open' }), true, 'the nested mount is still live');

    assert.equal(handle.update({ title, children: true }), true);
    await settle();
    assert.ok(handle.slot('children') === slot, 'the same slot element again');
    assert.ok(slot.parentElement.parentElement === column, 'one wrapper below the column');
    assert.equal(slot.querySelector('.manager-chip').textContent, 'Open');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
    await settle();
    assert.deepEqual(reports, []);
  });

  it('lays its column out and inks its title from its own stylesheet', async () => {
    const theme = ':root[data-fabricate-theme] { --fab-text-secondary: rgb(1, 2, 3); }';
    await underSheet(theme, async () => {
      const { target, handle } = mountLeaf('EmptyState', { title: 'No factions yet' });
      await settle();
      const column = getComputedStyle(columnOf(target));
      assert.equal(column.display, 'flex');
      assert.equal(column.flexDirection, 'column');
      assert.equal(getComputedStyle(target.querySelector('h3')).color, 'rgb(1, 2, 3)');
      handle.destroy();
    });
  });
});

describe('Notice under a bare ancestor', () => {
  it('is a polite status region, on the same root across an update of its title', async () => {
    const { target, handle } = mountLeaf('Notice', { title: 'Over the limit' });
    const notice = target.querySelector('.fab-notice');
    const announces = () => [notice.getAttribute('role'), notice.getAttribute('aria-live')];
    assert.deepEqual(announces(), ['status', 'polite']);
    assert.equal(handle.update({ title: 'Back under the limit' }), true);
    await settle();
    assert.ok(target.querySelector('.fab-notice') === notice, 'the same root');
    assert.deepEqual(announces(), ['status', 'polite']);
    assert.equal(notice.querySelector('.fab-notice-title').textContent, 'Back under the limit');
    handle.destroy();
    await settle();
    assert.deepEqual(reports, []);
  });

  it('keeps its root and its title node across an update that changes no text', async () => {
    const { target, handle } = mountLeaf('Notice', { tone: 'warning', title: 'Over the limit' });
    const notice = target.querySelector('.fab-notice');
    const title = notice.querySelector('.fab-notice-title');
    const next = { tone: 'success', title: 'Over the limit', icon: 'fas fa-bell' };
    assert.equal(handle.update(next), true);
    await settle();
    assert.ok(target.querySelector('.fab-notice') === notice, 'the same root, so no new region');
    assert.ok(notice.querySelector('.fab-notice-title') === title, 'the same title node');
    assert.deepEqual(authoredClasses(notice), ['fab-notice', 'is-success']);
    assert.ok(Boolean(notice.querySelector('i.fa-bell')), 'the glyph is repainted in place');
    handle.destroy();
    await settle();
    assert.deepEqual(reports, []);
  });

  it('writes its root class and one tone class, and draws no control without an action', () => {
    const { target, handle } = mountLeaf('Notice', {
      tone: 'warning',
      title: 'Over the limit',
      detail: 'Remove a project to continue.',
      icon: 'fas fa-bell',
    });
    const notice = target.querySelector('.fab-notice');
    assert.deepEqual(authoredClasses(notice), ['fab-notice', 'is-warning']);
    assert.ok(Boolean(notice.querySelector('i.fa-bell[aria-hidden="true"]')), 'the passed glyph');
    assert.ok(!target.querySelector(FOCUSABLE), 'nothing focusable');
    handle.destroy();
  });

  it('resolves its warning ink from :root[data-fabricate-theme]', async () => {
    const theme = ':root[data-fabricate-theme] { --fab-warning-text: rgb(4, 5, 6); }';
    await underSheet(theme, async () => {
      const { target, handle } = mountLeaf('Notice', { tone: 'warning', title: 'Over the limit' });
      await settle();
      const title = getComputedStyle(target.querySelector('.fab-notice-title'));
      assert.equal(title.color, 'rgb(4, 5, 6)');
      handle.destroy();
    });
  });
});

describe('Notice with an action under a bare ancestor', () => {
  let stopRecording;
  before(() => {
    stopRecording = recordEscapes(recordEscape);
  });
  after(() => stopRecording());
  afterEach(() => {
    assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
  });

  const TITLE = 'This stage is held by the failed check.';
  const LABEL = 'Allow another attempt';
  const actionOf = (target) => target.querySelector('[data-notice-action]');

  /**
   * A notice mounted with `props` over a title: its target, the faults its `onFault` was told of,
   * and its handle, which a callback reads from the answer once `mount` has returned.
   */
  function mountNotice(props) {
    const target = companionTarget(targets);
    const held = { target, faults: [] };
    const onFault = (fault) => {
      held.faults.push(fault);
    };
    held.handle = ui().mount('Notice', { target, props: { title: TITLE, ...props }, onFault });
    return held;
  }

  /** An element the companion owns beside `target`, focusable as a region heading is. */
  function ownedHeading(target) {
    const heading = target.ownerDocument.createElement('h2');
    heading.tabIndex = -1;
    target.before(heading);
    return heading;
  }

  it('draws one button named by its label, the only focusable element, and calls onAction with no argument on a press', async () => {
    const calls = [];
    const onAction = (...args) => {
      calls.push(args);
    };
    const { target, handle } = mountNotice({ action: { label: LABEL }, onAction });
    await settle();
    const focusable = [...target.querySelectorAll(FOCUSABLE)];
    assert.equal(focusable.length, 1, 'one focusable element');
    const [button] = focusable;
    assert.ok(button === actionOf(target), 'the action button');
    assert.equal(button.localName, 'button');
    assert.equal(button.getAttribute('type'), 'button');
    assert.equal(button.getAttribute('data-keyboard-focus'), 'true');
    assert.equal(button.textContent, LABEL);
    assert.ok(!button.hasAttribute('aria-describedby'), 'nothing describes it');
    button.click();
    assert.deepEqual(calls, [[]], 'once, inside the click, with no argument');
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('keeps the same focused button across an update that keeps action and onAction', async () => {
    const onAction = () => {};
    const { target, handle } = mountNotice({ action: { label: LABEL }, onAction });
    await settle();
    const button = actionOf(target);
    button.focus();
    assert.ok(document.activeElement === button, 'the button takes focus');
    const next = { title: TITLE, tone: 'warning', action: { label: 'Working…' }, onAction };
    assert.equal(handle.update(next), true);
    await settle();
    assert.ok(actionOf(target) === button, 'the same button node');
    assert.equal(button.textContent, 'Working…');
    assert.ok(document.activeElement === button, 'focus stays on it');
    handle.destroy();
  });

  it('is empty when a press whose onAction destroys it returns, and focus is not Fabricate’s to move', async () => {
    const held = mountNotice({
      action: { label: LABEL },
      onAction: () => held.handle.destroy(),
    });
    await settle();
    const button = actionOf(held.target);
    button.focus();
    button.click();
    assert.equal(held.target.childNodes.length, 0, 'empty when the press returns');
    assert.equal(held.handle.update({ title: TITLE }), false);
    // happy-dom's model, not a browser's: it answers the body once the focused node is detached.
    assert.ok(document.activeElement === document.body, 'focus fell to the body');
    await settle();
    assert.deepEqual(reports, []);
  });

  for (const [what, end] of [
    ['updates without action', (handle) => handle.update({ title: 'The hold has cleared.' })],
    ['destroys', (handle) => handle.destroy()],
  ]) {
    it(`leaves focus on the companion’s own element when onAction focuses it and then ${what}`, async () => {
      const held = mountNotice({
        action: { label: LABEL },
        onAction() {
          held.heading.focus();
          end(held.handle);
        },
      });
      held.heading = ownedHeading(held.target);
      await settle();
      const button = actionOf(held.target);
      button.focus();
      button.click();
      await settle();
      assert.ok(!actionOf(held.target), 'the button is gone');
      assert.ok(document.activeElement === held.heading, 'focus is where the companion put it');
      held.heading.remove();
      held.handle.destroy();
      assert.deepEqual(reports, []);
    });
  }

  const failure = new Error('the companion write failed');
  for (const [what, onAction] of [
    [
      'throws',
      () => {
        throw failure;
      },
    ],
    ['rejects', () => Promise.reject(failure)],
  ]) {
    it(`reports an onAction that ${what} once, stays drawn and live, and never calls onFault`, async () => {
      const { target, handle, faults } = mountNotice({ action: { label: LABEL }, onAction });
      await settle();
      actionOf(target).click();
      await settle();
      assert.deepEqual(reports, [[CALLBACK_REPORT, 'Notice', 'onAction', failure]]);
      assert.ok(Boolean(actionOf(target)), 'the button is still drawn');
      assert.equal(handle.update({ title: TITLE }), true);
      assert.deepEqual(faults, []);
      handle.destroy();
    });
  }

  for (const [what, props] of [
    ['action without onAction', { action: { label: LABEL } }],
    ['onAction without action', { onAction: () => {} }],
    ['an action with no label', { action: {}, onAction: () => {} }],
    ['an action whose label is empty', { action: { label: '' }, onAction: () => {} }],
    ['an action whose label is blank', { action: { label: ' ' }, onAction: () => {} }],
    ['an action whose label is an object', { action: { label: {} }, onAction: () => {} }],
    ['an action whose label is true', { action: { label: true }, onAction: () => {} }],
    ['an action that is a string', { action: 'x', onAction: () => {} }],
  ]) {
    it(`draws no button for ${what}`, async () => {
      const { target, handle } = mountNotice(props);
      await settle();
      assert.equal(target.querySelector('.fab-notice-title').textContent, TITLE);
      assert.ok(!target.querySelector(FOCUSABLE), 'nothing focusable');
      handle.destroy();
      assert.deepEqual(reports, []);
    });
  }

  it('calls onAction once for an action that carries a string onClick, and throws and reports nothing', async () => {
    const calls = [];
    const onAction = (...args) => {
      calls.push(args);
    };
    const { target, handle } = mountNotice({ action: { label: LABEL, onClick: 'x' }, onAction });
    await settle();
    assert.equal(actionOf(target).textContent, LABEL, 'the button is drawn');
    actionOf(target).click();
    await settle();
    assert.deepEqual(calls, [[]]);
    assert.deepEqual(reports, []);
    handle.destroy();
  });

  it('removes the button on an update that omits onAction, and draws it again when both are passed', async () => {
    const action = { label: LABEL };
    const { target, handle } = mountNotice({ action, onAction: () => {} });
    await settle();
    assert.ok(Boolean(actionOf(target)), 'drawn');
    assert.equal(handle.update({ title: TITLE, action }), true);
    await settle();
    assert.ok(!actionOf(target), 'no callback, so no inert button');
    assert.equal(handle.update({ title: TITLE, action, onAction: () => {} }), true);
    await settle();
    assert.equal(actionOf(target).textContent, LABEL);
    handle.destroy();
  });

  // The known gap: a `data` key is copied whole, so a member the group does not state is drawn.
  it('draws a passed description as the button’s hidden description, which the group does not publish', async () => {
    const action = { label: LABEL, description: 'Clears the hold on this stage.' };
    const { target, handle } = mountNotice({ action, onAction: () => {} });
    await settle();
    const id = actionOf(target).getAttribute('aria-describedby');
    assert.ok(id, 'the button is described');
    const description = target.querySelector(`#${id}`);
    assert.equal(description.textContent, 'Clears the hold on this stage.');
    assertClipped(description, 'the action description');
    assert.equal(target.querySelectorAll(FOCUSABLE).length, 1, 'still one focusable element');
    handle.destroy();
  });

  it('draws no dismissal whatever its published props, and still refuses dismissable (M13)', async () => {
    const { target, handle } = mountNotice({
      tone: 'success',
      detail: 'Remove a project to continue.',
      icon: 'fas fa-bell',
      action: { label: LABEL },
      onAction: () => {},
      'data-companion-notice': 'hold',
    });
    await settle();
    assert.ok(!target.querySelector('[data-notice-dismiss]'), 'no dismiss control');
    assert.throws(() => handle.update({ title: TITLE, dismissable: true }), {
      name: 'TypeError',
      message: `${REFUSAL}"dismissable" is not a data attribute`,
    });
    handle.destroy();
  });

  it('raises no click from a key press on the button, so the key press is the View Lab’s', async () => {
    const calls = [];
    const { target, handle } = mountNotice({
      action: { label: LABEL },
      onAction: () => {
        calls.push('press');
      },
    });
    await settle();
    const button = actionOf(target);
    button.focus();
    const KeyboardEvent = target.ownerDocument.defaultView.KeyboardEvent;
    for (const type of ['keydown', 'keyup']) {
      button.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', bubbles: true }));
    }
    assert.deepEqual(calls, [], 'happy-dom activates no button from a key');
    handle.destroy();
  });
});

describe('InspectorCard and its required root', () => {
  it('refuses a bare target (M16), and renders nothing', () => {
    const target = companionTarget(targets);
    assert.throws(() => ui().mount('InspectorCard', { target, props: {} }), {
      name: 'TypeError',
      message: `${REFUSAL}InspectorCard needs a Fabricate window ancestor`,
    });
    assert.equal(target.childNodes.length, 0);
  });

  it('draws an unnamed section whose one class is the card root, under a .fabricate shell', () => {
    const { target, handle } = mountLeaf('InspectorCard', { 'data-companion-card': 'renown' });
    const card = target.firstElementChild;
    assert.equal(card.localName, 'section');
    assert.deepEqual([...card.classList], ['fabricate-card']);
    assert.ok(!card.hasAttribute('role') && !card.hasAttribute('aria-labelledby'), 'no naming');
    assert.equal(card.getAttribute('data-companion-card'), 'renown');
    handle.destroy();
  });
});

describe("Kicker's host element", () => {
  it('replaces its root when as changes, on the same mount, handle and claim', async () => {
    const seam = ui();
    const target = companionTarget(targets);
    const handle = seam.mount('Kicker', { target, props: { children: 'Standing' } });
    const paragraph = target.querySelector('p.fab-kicker');
    assert.ok(Boolean(paragraph), 'a <p> by default');
    assert.equal(handle.update({ as: 'h3', children: 'Renown' }), true);
    await settle();
    assert.ok(!target.contains(paragraph), 'the <p> is gone');
    assert.equal(target.children.length, 1, 'one root');
    const [heading] = target.children;
    assert.equal(heading.localName, 'h3');
    assert.equal(heading.children.length, 1, 'holding one label element');
    assert.equal(heading.children[0].localName, 'span');
    assert.equal(heading.textContent, 'Renown', 'reading the current text');
    assert.throws(() => seam.mount('Kicker', { target, props: { children: 'Second' } }), {
      name: 'TypeError',
      message: `${REFUSAL}target already holds a published component`,
    });
    assert.equal(handle.update({ as: 'h3', children: 'Still live' }), true);
    await settle();
    assert.equal(heading.textContent, 'Still live');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
    assert.deepEqual(reports, []);
  });

  // The clause `DYNAMIC_ELEMENTS` names for the kicker's pinned tags.
  it('draws a <p> for an as outside its three hosts, every control tag included, so as draws no control', async () => {
    for (const as of ['button', 'a', 'input', 'select', 'textarea', 'h1']) {
      const { target, handle } = mountLeaf('Kicker', { as, children: 'Standing' });
      await settle();
      assert.equal(target.children.length, 1, 'one root');
      assert.equal(target.children[0].localName, 'p', `as: '${as}'`);
      assert.ok(!target.querySelector(FOCUSABLE), 'nothing focusable');
      handle.destroy();
    }
    assert.deepEqual(reports, []);
  });

  it('draws 8.5px upper case in a literal face, with no Foundry variable defined', async () => {
    const { target, handle } = mountLeaf('Kicker', { children: 'Standing' });
    await settle();
    const style = getComputedStyle(target.querySelector('.fab-kicker'));
    assert.equal(style.fontFamily, 'sans-serif');
    assert.equal(style.fontSize, '8.5px');
    assert.equal(style.textTransform, 'uppercase');
    handle.destroy();
  });

  it('resolves its accent ink from :root[data-fabricate-theme]', async () => {
    await underSheet(':root[data-fabricate-theme] { --fab-accent: rgb(1, 2, 3); }', async () => {
      const { target, handle } = mountLeaf('Kicker', { children: 'Standing', tone: 'accent' });
      await settle();
      assert.equal(getComputedStyle(target.querySelector('.fab-kicker')).color, 'rgb(1, 2, 3)');
      handle.destroy();
    });
  });
});

describe('Chip under a bare ancestor', () => {
  it('resolves its warning ink from :root[data-fabricate-theme]', async () => {
    const theme = ':root[data-fabricate-theme] { --fab-warning-text: rgb(4, 5, 6); }';
    await underSheet(theme, async () => {
      const { target, handle } = mountLeaf('Chip', {
        children: 'Preview',
        tone: 'warning',
        density: 'list',
      });
      await settle();
      const style = getComputedStyle(target.querySelector('.manager-chip'));
      assert.equal(style.color, 'rgb(4, 5, 6)');
      assert.equal(style.fontSize, '9px', 'the list density, from its own stylesheet');
      handle.destroy();
    });
  });
});

describe('Meter under a bare ancestor', () => {
  const READING = Object.freeze({ value: 7, max: 11, label: 'Labourers', valueText: '7 / 11' });

  it('is named by its own hidden label, clipped from its own stylesheet', async () => {
    const { target, handle } = mountLeaf('Meter', READING);
    await settle();
    const meter = target.querySelector('.fab-meter');
    const hidden = meter.querySelector('.fab-meter-hidden');
    assert.equal(hidden.textContent, 'Labourers');
    assert.ok(hidden.id.length > 0, 'the label carries an id');
    assert.equal(meter.getAttribute('aria-labelledby'), hidden.id);
    assert.equal(meter.getAttribute('aria-valuetext'), '7 / 11');
    assertClipped(hidden, 'the meter label');
    handle.destroy();
  });

  it('positions its root to contain that label', async () => {
    const { target, handle } = mountLeaf('Meter', READING);
    await settle();
    assert.equal(getComputedStyle(target.querySelector('.fab-meter')).position, 'relative');
    handle.destroy();
  });
});

describe('FillBar under a bare ancestor', () => {
  it('lands a data attribute on its root', () => {
    const { target, handle } = mountLeaf('FillBar', { value: 10, 'data-track': 'stamina' });
    assert.equal(target.querySelector('.fab-fill-bar').getAttribute('data-track'), 'stamina');
    handle.destroy();
  });

  it('resolves its fill from :root[data-fabricate-theme]', async () => {
    await underSheet(':root[data-fabricate-theme] { --fab-success: rgb(1, 2, 3); }', async () => {
      const { target, handle } = mountLeaf('FillBar', { value: 50 });
      await settle();
      const fill = getComputedStyle(target.querySelector('.fab-fill-bar-fill'));
      assert.equal(fill.backgroundColor, 'rgb(1, 2, 3)');
      handle.destroy();
    });
  });
});

describe("Medallion's glyph ink under a bare ancestor", () => {
  const INKS =
    ':root[data-fabricate-theme] { --fab-tag-rose: rgb(7, 8, 9); --fab-success-text: rgb(1, 2, 3); --fab-danger-text: rgb(4, 5, 6); }';
  const PRECEDENCE = [
    ['a tone outranks a tint', { tint: 'rose', tone: 'danger' }],
    ['an ink outranks a tone', { tone: 'success', ink: 'danger' }],
  ];
  for (const [claim, props] of PRECEDENCE) {
    it(`${claim}, so the glyph draws the danger ink`, async () => {
      await underSheet(INKS, async () => {
        const { target, handle } = mountLeaf('Medallion', { size: 26, ...props });
        await settle();
        const glyph = getComputedStyle(target.querySelector('i'));
        assert.equal(glyph.color, 'rgb(4, 5, 6)');
        handle.destroy();
      });
    });
  }
});

describe("StatBox's kicker under a bare ancestor", () => {
  const faceOf = (target) => getComputedStyle(target.querySelector('.fab-kicker')).fontFamily;

  it('draws the host UI face when the document defines --font-body', async () => {
    await underSheet(':root { --font-body: ProbeBody; }', async () => {
      const { target, handle } = mountLeaf('StatBox', propsOf('StatBox'));
      await settle();
      assert.equal(faceOf(target), 'ProbeBody');
      handle.destroy();
    });
  });

  it('falls back to a literal face with neither --font-body nor --font-primary defined', async () => {
    const { target, handle } = mountLeaf('StatBox', propsOf('StatBox'));
    await settle();
    assert.equal(faceOf(target), 'sans-serif');
    handle.destroy();
  });
});

describe('BandedBar with no drawable rows', () => {
  let stopRecording;
  before(() => {
    stopRecording = recordEscapes(recordEscape);
  });
  after(() => stopRecording());

  it('contains rows: null as a fault: reported once under its name, target emptied, handle inert', async () => {
    const { target, handle } = mountLeaf('BandedBar', { rows: null });
    await settle();
    assert.deepEqual(escaped, [], 'nothing escapes the boundary');
    assert.equal(reports.length, 1);
    assert.deepEqual(reports[0].slice(0, 2), [FAULT_REPORT, 'BandedBar']);
    assert.ok(reports[0][2] instanceof TypeError, 'the read of a null collection');
    assert.equal(target.childNodes.length, 0);
    assert.equal(handle.update(propsOf('BandedBar')), false);
  });

  it('draws no element for rows: [], keeps the claim, and draws the meter on a later update', async () => {
    const seam = ui();
    const target = companionTarget(targets);
    const handle = seam.mount('BandedBar', { target, props: { rows: [] } });
    await settle();
    assert.equal(target.children.length, 0, 'no element');
    assert.throws(() => seam.mount('BandedBar', { target, props: { rows: [] } }), {
      name: 'TypeError',
      message: `${REFUSAL}target already holds a published component`,
    });
    assert.equal(handle.update(propsOf('BandedBar')), true);
    await settle();
    const meter = target.querySelector('.fab-banded-bar.is-single');
    assert.equal(meter.getAttribute('role'), 'meter');
    assert.equal(meter.getAttribute('aria-label'), 'Event chance');
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
    assert.deepEqual(reports, []);
    assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
  });
});
