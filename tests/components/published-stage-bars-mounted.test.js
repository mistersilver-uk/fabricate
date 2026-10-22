/**
 * The published `StageBars` (issue 2455) on Fabricate's real Svelte runtime, through a fresh seam
 * registered with the adapter's own table, into a bare companion target: the group and its bars
 * named as its group states, an empty `stages`, and its caption drawn from its own stylesheet.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { getCaseById } from '../../scripts/lib/viewLabCases.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  settle,
  shippedSeam,
  underSheet,
} from '../helpers/publishedComponentModules.js';
import { stageBarsFixtureGroups } from '../helpers/labFixtureLiterals.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-stage-bars-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let targets;

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
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
});

/** `StageBars` mounted with `props` into a bare companion target. */
function mountStages(props) {
  const ui = shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });
  const target = companionTarget(targets);
  return { target, handle: ui.mount('StageBars', { target, props }) };
}

const groupOf = (target) => target.querySelector('[role="group"]');
const barNames = (target) =>
  [...target.querySelectorAll('[role="progressbar"]')].map((bar) => bar.getAttribute('aria-label'));

describe('the published StageBars under a bare ancestor', () => {
  it('draws a group named by ariaLabel, each bar named by its label, else its name', async () => {
    const { target, handle } = mountStages({
      stages: [
        { name: 'Gather', value: 100 },
        { name: 'Refine', label: 'Refine the ore', value: 40 },
        { value: 0 },
      ],
      currentIndex: 1,
      ariaLabel: 'Forging progress',
      'data-acme-stage': 'forge',
    });
    const group = groupOf(target);
    assert.ok(
      group?.parentElement === target,
      'the group is the root, in place when mount returns'
    );
    assert.equal(group.getAttribute('aria-label'), 'Forging progress');
    assert.equal(group.dataset.acmeStage, 'forge', 'a rest data attribute lands on the group');
    assert.deepEqual(
      barNames(target),
      ['Gather', 'Refine the ore', null],
      'a stage of several with neither label nor name has no name'
    );
    assert.deepEqual(
      [...group.querySelectorAll('[role="progressbar"]')].map((bar) => [
        bar.getAttribute('aria-valuenow'),
        bar.getAttribute('aria-current'),
      ]),
      [
        ['100', null],
        ['40', 'step'],
        ['0', null],
      ]
    );
    assert.deepEqual(
      [...group.querySelectorAll('.fab-stage-bars-caption')].map((caption) => [
        caption.textContent,
        caption.getAttribute('aria-hidden'),
      ]),
      [
        ['1 Gather', 'true'],
        ['2 Refine', 'true'],
        ['3 ', 'true'],
      ],
      'each caption is its position and its name, hidden from assistive technology'
    );
    assert.ok(!group.querySelector('button, a, input, [tabindex]'), 'it draws no control');
    handle.destroy();
    await settle();
    assert.deepEqual(reports, []);
  });

  it("names a lone unnamed bar by the group's name, and draws no bar for an empty stages", async () => {
    const { target, handle } = mountStages({
      stages: [{ value: 30 }],
      ariaLabel: 'Forging progress',
    });
    const group = groupOf(target);
    assert.deepEqual(barNames(target), ['Forging progress']);
    assert.equal(handle.update({ stages: [], ariaLabel: 'Forging progress' }), true);
    await settle();
    assert.ok(groupOf(target) === group, 'the same group, so nothing remounted');
    assert.equal(group.children.length, 0, 'an empty named group');
    assert.equal(group.getAttribute('aria-label'), 'Forging progress');
    handle.update({
      stages: [
        { name: 'Gather', value: 10 },
        { name: 'Refine', value: 0 },
      ],
      ariaLabel: 'Forging progress',
    });
    await settle();
    assert.deepEqual(barNames(target), ['Gather', 'Refine']);
    handle.destroy();
    await settle();
    assert.equal(target.children.length, 0, 'destroy leaves the companion target empty');
    assert.deepEqual(reports, []);
  });

  it('moves the current bar on update and keeps the bar it moved from', async () => {
    const { target, handle } = mountStages({
      stages: [
        { name: 'Gather', value: 10 },
        { name: 'Refine', value: 0 },
        { name: 'Temper', value: 0 },
      ],
      currentIndex: 0,
      ariaLabel: 'Forging progress',
    });
    const [before] = target.querySelectorAll('[role="progressbar"]');
    const currents = () =>
      [...target.querySelectorAll('[role="progressbar"]')].map((bar) =>
        bar.getAttribute('aria-current')
      );
    assert.deepEqual(currents(), ['step', null, null]);
    assert.equal(
      handle.update({
        stages: [
          { name: 'Gather', value: 10 },
          { name: 'Refine', value: 0 },
          { name: 'Temper', value: 0 },
        ],
        currentIndex: 2,
        ariaLabel: 'Forging progress',
      }),
      true
    );
    await settle();
    assert.deepEqual(currents(), [null, null, 'step']);
    assert.ok(
      target.querySelector('[role="progressbar"]') === before,
      'the same bar node, so nothing remounted'
    );
    handle.destroy();
    await settle();
    assert.equal(target.children.length, 0);
    assert.deepEqual(reports, []);
  });

  it('draws one caption line in its muted ink from :root[data-fabricate-theme]', async () => {
    await underSheet(
      ':root[data-fabricate-theme] { --fab-text-muted: rgb(7, 8, 9); }',
      async () => {
        const { target, handle } = mountStages({
          stages: [{ name: 'Gather', value: 50 }],
          ariaLabel: 'Forging progress',
        });
        await settle();
        const caption = getComputedStyle(target.querySelector('.fab-stage-bars-caption'));
        assert.equal(caption.color, 'rgb(7, 8, 9)');
        assert.equal(caption.whiteSpace, 'nowrap');
        assert.equal(
          getComputedStyle(target.querySelector('.fab-stage-bars-number')).fontWeight,
          '500',
          'the position is set in the mono face, which ships no weight above 500'
        );
        handle.destroy();
      }
    );
  });
});

describe('the stage bars View Lab specimen case against the DOM the fixture draws', () => {
  const { expectSelector } = getCaseById('manager-published-stage-bars-specimen');

  /** The fixture's ground, with a section for each group mounted into its last child; `rename` maps each section's key. */
  function drawFixture(rename = (key) => key) {
    const ground = document.createElement('div');
    ground.setAttribute('data-lab-stage-bars-ground', '');
    const mounted = [];
    for (const [key, props] of stageBarsFixtureGroups()) {
      const section = document.createElement('section');
      section.setAttribute('data-lab-stage-bars', rename(key));
      const heading = document.createElement('p');
      const slot = document.createElement('div');
      section.append(heading, slot);
      ground.append(section);
      const ui = shippedSeam({ ...seamParts, report: () => {} });
      mounted.push(ui.mount('StageBars', { target: slot, props }));
    }
    const shell = companionTarget(targets);
    shell.append(ground);
    return { mounted };
  }

  it('matches once each group the fixture mounts is drawn', () => {
    const { mounted } = drawFixture();
    assert.ok(
      document.querySelector(expectSelector),
      'the case waits on a frame the fixture draws'
    );
    for (const handle of mounted) handle.destroy();
  });

  it('matches nothing once a section the selector names is not the one drawn', () => {
    for (const renamed of ['forge', 'brew', 'copy']) {
      const { mounted } = drawFixture((key) => (key === renamed ? `${key}-renamed` : key));
      assert.equal(
        document.querySelector(expectSelector),
        null,
        `a section no longer keyed ${renamed} is not found`
      );
      for (const handle of mounted) handle.destroy();
      for (const shell of targets) shell.remove();
      targets.length = 0;
    }
  });

  it('names the stage, label and name the fixture draws', () => {
    const [[, forge], [, brew], [, copy]] = stageBarsFixtureGroups();
    assert.ok(
      expectSelector.includes(`[data-stage-bars-stage="${forge.currentIndex}"]`),
      'the forge group’s current stage'
    );
    assert.ok(
      expectSelector.includes(`[aria-label="${brew.stages[2].label}"]`),
      'the brew group’s third bar'
    );
    assert.ok(
      expectSelector.includes(`[aria-label="${copy.stages[0].name}"]`),
      'the copy group’s lone bar'
    );
  });
});
