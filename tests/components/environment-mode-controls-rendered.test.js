/* The environment editor's two mode controls are native radio groups (issue 2257, D5). */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { createViteFixtureServer } from '../helpers/vite-fixture-server.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const componentPath = 'src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte';
const compiledModules = [
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/components/ArtPicker.svelte',
  'src/ui/svelte/components/Select.svelte',
  'src/ui/svelte/components/SearchablePopover.svelte',
  'src/ui/svelte/components/SearchablePopoverPanel.svelte',
  'src/ui/svelte/components/Button.svelte',
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/components/Field.svelte',
  'src/ui/svelte/components/EmptyState.svelte',
  'src/ui/svelte/components/SegmentedControl.svelte',
  'src/ui/svelte/apps/manager/environment/CompositionModeControl.svelte',
  componentPath,
];
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-environment-mode-controls-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    'src/gatheringImageDefaults.js',
    'src/ui/svelte/util/gatheringFormat.js',
    'src/ui/svelte/apps/manager/environment/environmentSelectOptions.js',
  ],
  compiledModules,
  componentPath,
});

const CONTROLS = Object.freeze([
  { section: 'player', hook: 'data-selection-mode-option', checked: 'targeted', other: 'blind' },
  {
    section: 'composition',
    hook: 'data-composition-mode-option',
    checked: 'automatic',
    other: 'manual',
  },
]);

function mountOverview(calls) {
  return harness.mount({
    environment: { id: 'env-1', name: 'Moonlit Forest', enabled: true, biomes: [] },
    onUpdate: (patch) => {
      calls.push(['update', patch]);
    },
    onSetCompositionMode: (mode) => {
      calls.push(['composition', mode]);
    },
  });
}

function sectionOf(target, section) {
  return target.querySelector(`[data-overview-section="${section}"]`);
}

describe('the environment mode controls are native radio groups', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('expose only their two radios, one non-empty name per control, and no other tab stop', async () => {
    const target = await mountOverview([]);
    const names = CONTROLS.map(({ section, hook, checked, other }) => {
      const root = sectionOf(target, section);
      const focusables = [
        ...root.querySelectorAll('button, input, select, textarea, a[href], [tabindex]'),
      ];
      assert.deepEqual(
        focusables.map((element) => `${element.tagName}:${element.type}`),
        ['INPUT:radio', 'INPUT:radio'],
        `${section}: the radios are the only focusables`
      );
      const [name] = new Set(focusables.map((input) => input.name));
      assert.ok(name && focusables.every((input) => input.name === name), `${section}: one name`);
      assert.deepEqual(
        focusables.map((input) => [input.closest(`[${hook}]`)?.getAttribute(hook), input.checked]),
        [
          [checked, true],
          [other, false],
        ],
        `${section}: the hooks carry each value and the stored mode is checked`
      );
      const group = root.querySelector('[role="radiogroup"]');
      const hint = target.querySelector(`[id="${group.getAttribute('aria-describedby')}"]`);
      assert.ok(Boolean(hint?.textContent.trim()), `${section}: the hint describes the group`);
      assert.ok(!group.contains(hint), `${section}: and sits outside it`);
      return name;
    });
    assert.notEqual(names[0], names[1], 'the two controls are separate groups');
    harness.remount();
  });

  it('report a change on the unchecked radio to the host once, and a checked one not at all', async () => {
    const calls = [];
    const target = await mountOverview(calls);
    for (const { section, hook, checked, other } of CONTROLS) {
      const root = sectionOf(target, section);
      root.querySelector(`[${hook}="${checked}"] input`).click();
      root.querySelector(`[${hook}="${other}"] input`).click();
    }
    assert.deepEqual(calls, [
      ['update', { selectionMode: 'blind' }],
      ['composition', 'manual'],
    ]);
    harness.remount();
  });
});

describe('the environment mode controls in Chromium', () => {
  const fixtureServer = createViteFixtureServer({ styleMountPrefix: '/@manager-select-styles/' });

  before(() => fixtureServer.start());
  after(() => fixtureServer.stop());

  /** The real overview, its two controls started on `modes`, with nothing reported yet. */
  async function openOverview(modes = {}) {
    const page = await fixtureServer.newPage({ viewport: { width: 1280, height: 900 } });
    const query = new URLSearchParams({ subject: 'environment-overview', ...modes });
    await page.goto(fixtureServer.url(`/tests/fixtures/manager-select/index.html?${query}`), {
      waitUntil: 'load',
    });
    await page.waitForFunction(() => globalThis.__managerSelectFixtureReady === true);
    return page;
  }

  const hostCalls = (page) => page.evaluate(() => globalThis.__fixtureCalls ?? []);

  const KEYBOARD_LEGS = [
    {
      section: 'player',
      param: 'selectionMode',
      values: ['targeted', 'blind'],
      report: (mode) => ['update', { selectionMode: mode }],
    },
    {
      section: 'composition',
      param: 'compositionMode',
      values: ['automatic', 'manual'],
      report: (mode) => ['composition', mode],
    },
  ].flatMap(({ section, param, values, report }) => {
    const [first, second] = values;
    return [
      {
        section,
        modes: {},
        checked: first,
        key: 'ArrowRight',
        next: second,
        report: report(second),
      },
      {
        section,
        modes: { [param]: second },
        checked: second,
        key: 'ArrowLeft',
        next: first,
        report: report(first),
      },
    ];
  });

  for (const { section, modes, checked, key, next, report } of KEYBOARD_LEGS) {
    it(`${section}: one Tab lands on ${checked}, the checked radio, and ${key} reports ${next}`, async () => {
      const page = await openOverview(modes);
      try {
        // A focused button just before the group, so one Tab is all that separates them.
        await page.evaluate((sectionName) => {
          const start = document.createElement('button');
          document
            .querySelector(`[data-overview-section="${sectionName}"] [role="radiogroup"]`)
            .before(start);
          start.focus();
        }, section);
        const focused = () =>
          page.evaluate((sectionName) => {
            const active = document.activeElement;
            const group = document.querySelector(
              `[data-overview-section="${sectionName}"] [role="radiogroup"]`
            );
            return { value: active.value ?? null, inGroup: group.contains(active) };
          }, section);
        await page.keyboard.press('Tab');
        assert.deepEqual(await focused(), { value: checked, inGroup: true });
        assert.deepEqual(await hostCalls(page), [], 'focusing the checked radio reports nothing');
        await page.keyboard.press(key);
        assert.deepEqual(await focused(), { value: next, inGroup: true });
        assert.deepEqual(await hostCalls(page), [report]);
        await page.keyboard.press('Tab');
        assert.equal((await focused()).inGroup, false, 'the next Tab leaves the group');
      } finally {
        await page.close();
      }
    });
  }

  for (const { section, hook, other, report } of [
    {
      section: 'player',
      hook: 'data-selection-mode-option',
      other: 'blind',
      report: ['update', { selectionMode: 'blind' }],
    },
    {
      section: 'composition',
      hook: 'data-composition-mode-option',
      other: 'manual',
      report: ['composition', 'manual'],
    },
  ]) {
    it(`${section}: a pointer click on the ${other} segment reports it`, async () => {
      const page = await openOverview();
      try {
        await page.click(`[data-overview-section="${section}"] [${hook}="${other}"]`);
        assert.deepEqual(await hostCalls(page), [report]);
      } finally {
        await page.close();
      }
    });
  }
});
