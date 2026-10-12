/**
 * Issue 2448's seven published leaves, and issue 2451's `Kicker` and `Chip`, on Fabricate's real
 * Svelte runtime, each through a fresh seam registered with the adapter's own table, into a bare
 * companion target: mount, update on one root and destroy; the seam's refusal of an unpublished or
 * missing prop; a `text` key drawn as text; and what each leaf draws from its own stylesheet under
 * no Fabricate ancestor.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import {
  FAULT_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  assertClipped,
  companionTarget,
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

function mountLeaf(name, props) {
  const target = companionTarget(targets);
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

/** Each leaf's root, and a mount and an update that changes `read`. */
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
]);

const propsOf = (name) => LEAVES.find((leaf) => leaf.name === name).props;

function requiredKeysOf(name) {
  const { props } = PUBLISHED_COMPONENT_MANIFEST.find((entry) => entry.name === name);
  return Object.keys(props).filter((key) => props[key].required);
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
  ];
  for (const [name, key, refusal] of UNPUBLISHED) {
    it(`${name} refuses ${key}, and renders nothing`, () => {
      const target = companionTarget(targets);
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
          const target = companionTarget(targets);
          assert.throws(() => ui().mount(name, { target, props: given }), {
            name: 'TypeError',
            message: `${REFUSAL}${name} requires a non-empty "${key}"`,
          });
          assert.equal(target.childNodes.length, 0);
        });
      }
    }
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
      message: `${REFUSAL}functions are phase 2 (issue 2427)`,
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
      [...chip.classList].filter((name) => !name.startsWith('svelte-')),
      ['manager-chip', 'is-warning', 'is-list'],
      'the root class, then only what the published keys write'
    );
    assert.ok(!chip.hasAttribute('role') && !chip.hasAttribute('tabindex'), 'no role, no focus');
    assert.ok(!target.querySelector('button, a, input, [tabindex]'), 'nothing focusable');
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
