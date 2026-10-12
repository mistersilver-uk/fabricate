/**
 * Issue 2448's seven published leaves on Fabricate's real Svelte runtime, each through a fresh seam
 * registered with the adapter's own table, into a bare companion target: mount, update on one root
 * and destroy; the seam's refusal of an unpublished or missing prop; and what each leaf draws from
 * its own stylesheet under no Fabricate ancestor.
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
  assertClipped,
  companionTarget,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const FAULT_REPORT = 'Fabricate | Published component render failed:';
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

/** Runs `run` with `css` in the document and a theme named on its root, then removes both. */
async function underSheet(css, run) {
  const root = document.documentElement;
  const sheet = document.createElement('style');
  sheet.textContent = css;
  document.head.append(sheet);
  root.setAttribute('data-fabricate-theme', 'probe');
  try {
    await run();
  } finally {
    root.removeAttribute('data-fabricate-theme');
    sheet.remove();
  }
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

/** Each leaf's root, a mount and an update that changes `read`, and the keys its manifest requires. */
const LEAVES = Object.freeze([
  {
    name: 'Avatar',
    root: '.fab-avatar',
    props: { name: 'Mira Voss' },
    next: { name: 'Tam Oakes' },
    read: (root) => root.querySelector('.fab-avatar-initials').textContent,
    drawn: ['MV', 'TO'],
    required: ['name'],
  },
  {
    name: 'Medallion',
    root: '.fab-medallion',
    props: { size: 26 },
    next: { size: 26, icon: 'fas fa-gem' },
    read: (root) => root.querySelector('i').classList.contains('fa-gem'),
    drawn: [false, true],
    required: ['size'],
  },
  {
    name: 'FillBar',
    root: '.fab-fill-bar',
    props: { value: 25 },
    next: { value: 64 },
    read: (root) => root.querySelector('.fab-fill-bar-fill').style.width,
    drawn: ['25%', '64%'],
    required: [],
  },
  {
    name: 'Meter',
    root: '.fab-meter',
    props: { value: 1, max: 4, label: 'Stamina' },
    next: { value: 3, max: 4, label: 'Stamina' },
    read: (root) => root.getAttribute('aria-valuenow'),
    drawn: ['1', '3'],
    required: ['label'],
  },
  {
    name: 'BandedBar',
    root: '.fab-banded-bar',
    props: { rows: [{ name: 'Event chance', percent: 62 }] },
    next: { rows: [{ name: 'Event chance', percent: 20 }] },
    read: (root) => root.querySelector('[data-banded-bar-percent]').textContent,
    drawn: ['62%', '20%'],
    required: ['rows'],
  },
  {
    name: 'StatBox',
    root: '.fab-stat-box',
    props: { value: '12', label: 'Runs' },
    next: { value: '13', label: 'Runs' },
    read: (root) => root.querySelector('.fab-stat-box-figure').textContent,
    drawn: ['12', '13'],
    required: ['value', 'label'],
  },
  {
    name: 'InfoStrip',
    root: '.fabricate-info-strip',
    props: { label: 'Conditions', facts: [{ value: 'Clear' }] },
    next: { label: 'Conditions', facts: [{ value: 'Storm' }] },
    read: (root) => root.querySelector('.fabricate-info-strip-value').textContent,
    drawn: ['Clear', 'Storm'],
    required: ['label', 'facts'],
  },
]);

const propsOf = (name) => LEAVES.find((leaf) => leaf.name === name).props;

describe('each published leaf through the seam', () => {
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

describe('a prop a leaf declares but does not publish', () => {
  const UNPUBLISHED = [
    ['Avatar', 'class', 'is not a prop of Avatar'],
    ['Medallion', 'src', 'is not a prop of Medallion'],
    ['FillBar', 'class', 'is not a data attribute'],
    ['StatBox', 'valueDataAttr', 'is not a data attribute'],
    ['Meter', 'aria-label', 'is not a data attribute'],
    ['Meter', 'labelId', 'is not a data attribute'],
    ['InfoStrip', 'ariaLabel', 'is not a data attribute'],
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
  for (const { name, props, required } of LEAVES) {
    for (const key of required) {
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
  before(() => process.on('uncaughtException', recordEscape));
  after(() => process.off('uncaughtException', recordEscape));

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
  });
});
