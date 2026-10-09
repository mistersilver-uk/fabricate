/* The environment editor's two mode controls are native radio groups (issue 2257, D5). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { borrowBrowser } from '../helpers/layout-harness.js';
import { collectScopedCss, managerShellPage } from '../helpers/renderedManagerShell.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

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
  const fabricateCss = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
  let markup = '';
  let browser;
  let page;

  before(async () => {
    await harness.setup();
    try {
      const target = await mountOverview([]);
      // Svelte sets `checked` as a property, which `innerHTML` does not serialise.
      for (const input of target.querySelectorAll('input:checked'))
        input.setAttribute('checked', '');
      markup = target.innerHTML;
    } finally {
      harness.teardown();
    }
    const { css } = collectScopedCss({ repoRoot, compiledModules });
    browser = await borrowBrowser();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const productMarkup = `<main class="manager-main">${markup}</main>`;
    await page.setContent(
      managerShellPage({ fabricateCss, view: 'environment-edit', productMarkup, scopedCss: css }),
      { waitUntil: 'load' }
    );
  });

  after(() => browser?.close());

  for (const { section, checked, other } of CONTROLS) {
    it(`${section}: one Tab lands on the checked radio, ArrowRight checks and reports the other`, async () => {
      // A focused button just before the group, so one Tab is all that separates them; the group
      // records each `change` it hears on its own dataset.
      await page.evaluate((sectionName) => {
        const group = document.querySelector(
          `[data-overview-section="${sectionName}"] [role="radiogroup"]`
        );
        const start = document.createElement('button');
        group.before(start);
        group.dataset.probeChanges = '';
        group.addEventListener('change', (event) => {
          group.dataset.probeChanges += `${event.target.value};`;
        });
        start.focus();
      }, section);
      const focused = () =>
        page.evaluate((sectionName) => {
          const active = document.activeElement;
          const group = document.querySelector(
            `[data-overview-section="${sectionName}"] [role="radiogroup"]`
          );
          return {
            value: active.value ?? null,
            inGroup: group.contains(active),
            checked: active.checked ?? null,
            changes: group.dataset.probeChanges,
          };
        }, section);
      await page.keyboard.press('Tab');
      assert.deepEqual(await focused(), {
        value: checked,
        inGroup: true,
        checked: true,
        changes: '',
      });
      await page.keyboard.press('ArrowRight');
      assert.deepEqual(await focused(), {
        value: other,
        inGroup: true,
        checked: true,
        changes: `${other};`,
      });
      await page.keyboard.press('Tab');
      assert.equal((await focused()).inGroup, false, 'the next Tab leaves the group');
    });
  }
});
