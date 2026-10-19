/**
 * Issue 2540 — `Button`'s `busy` at the six sites that adopt it. The mounted half flips each site
 * from idle to busy and reads focus, ARIA, `disabled`, the label and the swallowed press; the
 * Chromium half draws both markups under the module sheet and reads what happy-dom cannot: the
 * Tab order, the suppressed hover and the busy focus ring's contrast in two themes.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { chromium } from 'playwright';

import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { staticComponentPage } from '../helpers/staticComponentPage.js';
import {
  CHECK_EVIDENCE_RAW_MODULES,
  MARKS_AND_NOTICES_COMPILED_MODULES,
  PLAYER_APP_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { contrast } from '../helpers/themePaletteContrast.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const RUN_ACTION_BAR = component('RunActionBar');
const AWARD_CHOICE = 'src/ui/svelte/apps/journal/RunAwardChoice.svelte';
const BULK_PANEL = 'src/ui/svelte/apps/inventory/bulk/InventoryBulkPanel.svelte';
const COMPONENT_DETAIL = 'src/ui/svelte/apps/inventory/detail/InventoryComponentDetail.svelte';

/** The WCAG floor for a focus indicator, a non-text contrast. */
const RING_FLOOR = 3;
const THEMES = Object.freeze(['', 'foundry-native']);

const harnessFor = (componentPath, { raw = [], compiled = [], rootClass = 'fabricate-manager' }) =>
  createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-button-busy-',
    rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES, ...raw],
    compiledModules: [...compiled, componentPath],
    componentPath,
    rootClass,
  });

/** A callback that records `name` on `calls`. */
const recorder = (calls, name) => () => {
  calls.push(name);
};

const RUN_ACTION_MODULES = [
  component('Button'),
  component('IconButton'),
  component('Kicker'),
  component('SegmentedControl'),
];

const BULK_RAW = [
  ...STATUS_TONE_RAW_MODULES,
  'src/ui/svelte/util/craftingImageDefaults.js',
  'src/ui/svelte/util/craftingArtResolution.js',
  'src/ui/svelte/util/essenceTint.js',
  'src/ui/svelte/util/listReorderAnnouncement.js',
];
const BULK_COMPILED = [
  ...PLAYER_APP_COMPILED_MODULES,
  component('RowDisclosure'),
  ...MARKS_AND_NOTICES_COMPILED_MODULES,
  component('Chip'),
  component('IconButton'),
  'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
  'src/ui/svelte/apps/inventory/detail/InventoryDetailHeader.svelte',
  'src/ui/svelte/apps/inventory/bulk/InventoryBulkComplicationGroup.svelte',
  'src/ui/svelte/apps/inventory/bulk/InventoryBulkReport.svelte',
  'src/ui/svelte/apps/inventory/bulk/InventoryBulkRow.svelte',
  'src/ui/svelte/apps/inventory/bulk/InventoryBulkSection.svelte',
];

const bulkEntry = {
  key: 'sys:alembic',
  name: 'Cracked Alembic',
  img: 'icons/alembic.webp',
  broken: false,
  systemsCount: 1,
  systemName: 'Herbalism',
  mode: 'simple',
  allowsReorder: false,
  orderIsPlayers: false,
  orderProvenance: 'fixed',
  complications: [],
  yieldRows: [],
};
const bulkProps = (calls) => ({
  counts: { selected: 1, salvageable: 1, blocked: 0, atMax: false },
  entries: [bulkEntry],
  salvageable: [bulkEntry],
  blocked: [],
  yieldRows: [],
  destroyLabel: 'Destroy 1 component (1 unit)',
  onSalvage: recorder(calls, 'salvage'),
  onDestroy: recorder(calls, 'destroy'),
});

const runActionProps = (calls, extra) => ({
  run: { id: 'run-1' },
  runLabel: 'Forge Iron Rivets',
  cancel: { ariaLabel: 'Cancel', confirmLabel: 'Cancel the run', keepLabel: 'Keep it' },
  pause: { label: 'Pause', enabled: true },
  onPrimary: recorder(calls, 'primary'),
  onBegin: recorder(calls, 'begin'),
  ...extra,
});
const PRIMARY = { label: 'Roll check', busyLabel: 'Rolling check…', enabled: true };
const BEGIN = { label: 'Begin', busyLabel: 'Beginning…', enabled: true, prompt: '' };

const awardRun = {
  key: 'run-award',
  id: 'run-award',
  awardChoiceBlocker: null,
  actions: { chooseAward: true },
  awardChoices: [
    {
      choiceId: 'pick',
      stepIndex: 0,
      awardStrategy: 'one',
      count: 1,
      countRoll: null,
      ceiling: 1,
      alternatives: [
        { id: 'gem', kind: 'component', name: 'Gem', quantity: 1, unclaimable: 'unitMissing' },
      ],
    },
  ],
};
const awardJournal = (calls, busyRunKey) => ({
  busyRunKey,
  chooseAward: async () => {
    recorder(calls, 'award')();
    return { success: true };
  },
});

const salvageItem = {
  key: 'sys:c1',
  componentId: 'c1',
  systemId: 'sys',
  name: 'Iron Ore',
  img: null,
  icon: null,
  tags: [],
  tier: null,
  isEssenceSource: false,
  isTool: false,
  totalQuantity: 2,
  sources: [],
  essences: [],
  usedBy: [],
  requiredFor: [],
  producedBy: [],
  contributors: [],
  salvage: {
    enabled: true,
    mode: 'simple',
    checkUsable: false,
    misconfigured: false,
    toolStates: [],
    toolsAvailable: true,
    allowPlayerResultReorder: false,
    results: [{ id: 'r1', componentId: 'c2', name: 'Iron Shard', img: null, quantity: 2 }],
    routedOutcomes: [],
    stages: [],
    awardMode: null,
    targetActorId: 'a1',
  },
};

/**
 * Each adopting site: its harness, the props it mounts idle with, the props that make it busy,
 * the selector of its busy control and an optional step that reveals the control.
 */
const SITES = Object.freeze([
  {
    name: 'run-primary',
    harness: harnessFor(RUN_ACTION_BAR, { compiled: RUN_ACTION_MODULES }),
    idle: (calls) => runActionProps(calls, { primary: PRIMARY }),
    busy: { primary: { ...PRIMARY, busy: true } },
    selector: '[data-run-action="primary"]',
    // The bar's own `.fab-run-action-primary` fill is unlayered and outranks every role hover.
    idleHovers: false,
    styles: [RUN_ACTION_BAR],
  },
  {
    name: 'run-begin',
    harness: harnessFor(RUN_ACTION_BAR, { compiled: RUN_ACTION_MODULES }),
    idle: (calls) => runActionProps(calls, { primary: PRIMARY, begin: BEGIN }),
    busy: { run: { id: 'run-1', busy: true } },
    selector: '[data-run-action="begin"]',
    idleHovers: false,
    styles: [RUN_ACTION_BAR],
  },
  {
    name: 'award-confirm',
    harness: harnessFor(AWARD_CHOICE, {
      raw: [
        'src/ui/svelte/util/focusWhenEnabled.js',
        'src/ui/svelte/util/journalRunReasons.js',
        'src/ui/presenters/resultKindGlyphs.js',
        'src/ui/presenters/awardChoiceRows.js',
        'src/utils/scalars.js',
      ],
      compiled: [
        component('Button'),
        component('Notice'),
        component('Medallion'),
        component('Kicker'),
        component('SlotTile'),
        component('Well'),
        component('RequirementChooser'),
      ],
    }),
    idle: (calls) => ({ run: awardRun, journal: awardJournal(calls, '') }),
    busyFor: (calls) => ({ journal: awardJournal(calls, awardRun.key) }),
    selector: '[data-award-confirm]',
    styles: [AWARD_CHOICE],
  },
  {
    name: 'bulk-destroy',
    harness: harnessFor(BULK_PANEL, { raw: BULK_RAW, compiled: BULK_COMPILED }),
    idle: bulkProps,
    // `InventoryView` names the destroy in flight; `inventory-view.test.js` pins that caller.
    busy: { destroying: true, destroyLabel: 'Destroying…' },
    selector: '[data-inventory-bulk-destroy]',
    styles: [BULK_PANEL],
  },
  {
    name: 'bulk-salvage',
    harness: harnessFor(BULK_PANEL, { raw: BULK_RAW, compiled: BULK_COMPILED }),
    idle: bulkProps,
    busy: { running: true },
    selector: '[data-inventory-bulk-salvage]',
    styles: [BULK_PANEL],
  },
  {
    name: 'component-salvage',
    harness: harnessFor(COMPONENT_DETAIL, {
      raw: [
        ...BULK_RAW,
        ...SEARCHABLE_POPOVER_RAW_MODULES,
        ...CHECK_EVIDENCE_RAW_MODULES,
        'src/ui/svelte/util/overlayHost.js',
        'src/ui/svelte/util/rollPromptOrigin.js',
        'src/ui/svelte/apps/inventory/detail/salvage/salvageAction.js',
        'src/systems/salvageMessages.js',
      ],
      compiled: [
        ...PLAYER_APP_COMPILED_MODULES,
        ...MARKS_AND_NOTICES_COMPILED_MODULES,
        ...SELECT_COMPILED_MODULES,
        component('Pagination'),
        component('IconButton'),
        component('OutcomeLadder'),
        component('SortableList'),
        component('DiceTiles'),
        component('RowDisclosure'),
        'src/ui/svelte/apps/journal/JournalFactRow.svelte',
        'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
        'src/ui/svelte/apps/crafting/detail/CheckEvidenceRows.svelte',
        'src/ui/svelte/apps/crafting/detail/ProgressiveStageBand.svelte',
        'src/ui/svelte/apps/crafting/detail/ProgressiveStageRow.svelte',
        ...[
          'SalvageMisconfiguredBody',
          'SalvageProgressiveBody',
          'SalvageRollSummary',
          'SalvageRoutedBody',
          'SalvageSimpleBody',
          'SalvageToolRequirements',
        ].map((name) => `src/ui/svelte/apps/inventory/detail/salvage/${name}.svelte`),
        component('EditorTabs'),
        component('XrefList'),
        'src/ui/svelte/apps/inventory/detail/InventoryDetailHeader.svelte',
        'src/ui/svelte/apps/inventory/detail/InventoryDetailPager.svelte',
        'src/ui/svelte/apps/inventory/detail/InventorySalvagePanel.svelte',
        'src/ui/svelte/apps/inventory/detail/InventorySystemSelector.svelte',
      ],
      rootClass: 'fabricate-app',
    }),
    idle: (calls) => ({ item: salvageItem, onSalvage: recorder(calls, 'salvage') }),
    busy: { salvaging: true },
    reveal: (target) => target.querySelector('[data-inventory-detail-tab="salvage"]').click(),
    selector: '[data-inventory-salvage-action]',
    styles: ['src/ui/svelte/apps/PlayerDetailHeader.svelte', COMPONENT_DETAIL],
  },
]);

/** One site mounted idle, then flipped busy, with what each state reads. */
async function measureSite(site) {
  const calls = [];
  await site.harness.setup();
  try {
    const target = await site.harness.mount(site.idle(calls));
    if (site.reveal) {
      site.reveal(target);
      await site.harness.setProps({});
    }
    const idle = target.querySelector(site.selector);
    assert.ok(idle, `${site.name}: ${site.selector} is not drawn idle`);
    const idleLabel = idle.textContent.trim();
    const idleMarkup = target.innerHTML;
    idle.focus();
    await site.harness.setProps(site.busyFor ? site.busyFor(calls) : site.busy);
    const busy = target.querySelector(site.selector);
    const focusKept = document.activeElement === busy;
    busy.click();
    await new Promise((settle) => setTimeout(settle, 0));
    return {
      idleLabel,
      idleMarkup,
      focusKept,
      calls: [...calls],
      label: busy.textContent.trim(),
      disabled: busy.disabled,
      hasDisabled: busy.hasAttribute('disabled'),
      ariaBusy: busy.getAttribute('aria-busy'),
      ariaDisabled: busy.getAttribute('aria-disabled'),
      busyMarkup: target.innerHTML,
    };
  } finally {
    site.harness.teardown();
  }
}

/** A colour as `rgb(r g b / a%)`, read through a canvas so every CSS colour syntax resolves. */
function readCase({ name, selector }) {
  const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (value) => {
    canvas.clearRect(0, 0, 1, 1);
    canvas.fillStyle = '#000';
    canvas.fillStyle = value;
    canvas.fillRect(0, 0, 1, 1);
    return [...canvas.getImageData(0, 0, 1, 1).data];
  };
  const button = document.querySelector(`[data-case="${name}"] ${selector}`);
  if (!button) return null;
  const style = getComputedStyle(button);
  const grounds = [];
  for (let node = button.parentElement; node; node = node.parentElement) {
    grounds.push(rgba(getComputedStyle(node).backgroundColor));
  }
  return {
    paint: [style.backgroundColor, style.borderTopColor, style.color].join(' | '),
    cursor: style.cursor,
    opacity: Number(style.opacity),
    focused: document.activeElement === button,
    focusVisible: button.matches(':focus-visible'),
    outline: {
      style: style.outlineStyle,
      width: style.outlineWidth,
      colour: rgba(style.outlineColor),
    },
    grounds,
  };
}

/** Focus a sentinel placed just before the case's control, then press Tab. */
async function tabInto(page, { name, selector }) {
  await page.evaluate(
    ({ host, control }) => {
      let sentinel = document.querySelector(`[data-sentinel="${host}"]`);
      if (!sentinel) {
        sentinel = document.createElement('button');
        sentinel.dataset.sentinel = host;
        document.querySelector(`[data-case="${host}"] ${control}`).before(sentinel);
      }
      sentinel.focus();
    },
    { host: name, control: selector }
  );
  await page.keyboard.press('Tab');
}

const css = ([r, g, b, a]) => `rgb(${r} ${g} ${b} / ${(a / 255) * 100}%)`;

/** The opaque ground behind the button: each ancestor's background over a white canvas. */
function groundOf(grounds) {
  return grounds.reduceRight(
    (base, [r, g, b, a]) => {
      const alpha = a / 255;
      return [r, g, b].map((value, index) => value * alpha + base[index] * (1 - alpha));
    },
    [255, 255, 255]
  );
}

describe('Button busy at its six adopting sites (issue 2540)', () => {
  const measured = new Map();
  let browser;
  let page;

  before(async () => {
    for (const site of SITES) measured.set(site.name, await measureSite(site));
    const hosts = SITES.flatMap((site) => {
      const { idleMarkup, busyMarkup } = measured.get(site.name);
      return [
        `<div data-case="${site.name}-idle">${idleMarkup}</div>`,
        `<div data-case="${site.name}-busy">${busyMarkup}</div>`,
      ];
    });
    const styles = [...new Set(SITES.flatMap((site) => site.styles))];
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(staticComponentPage(styles, hosts), { waitUntil: 'load' });
  });

  after(async () => {
    await browser?.close();
  });

  for (const site of SITES) {
    describe(site.name, () => {
      it('keeps focus, writes the busy ARIA and never disabled', () => {
        const state = measured.get(site.name);
        assert.equal(state.focusKept, true, 'focus stays on the control as it goes busy');
        assert.equal(state.ariaBusy, 'true');
        assert.equal(state.ariaDisabled, 'true');
        assert.equal(state.hasDisabled, false, 'busy never writes `disabled`');
      });

      it('names the act in flight and swallows the press', () => {
        const state = measured.get(site.name);
        assert.notEqual(state.label, state.idleLabel, 'the caller changes the label while busy');
        assert.deepEqual(state.calls, [], 'a press on the busy control reaches no callback');
      });

      it('is reached by Tab in Chromium and keeps the busy face under the pointer', async () => {
        const busyCase = { name: `${site.name}-busy`, selector: site.selector };
        const idleCase = { name: `${site.name}-idle`, selector: site.selector };
        const rest = await page.evaluate(readCase, busyCase);
        assert.ok(rest, `${site.name}: the busy markup draws no ${site.selector}`);
        assert.equal(rest.cursor, 'progress');
        assert.equal(rest.opacity, 0.7);

        const idleRest = await page.evaluate(readCase, idleCase);
        await page.hover(`[data-case="${idleCase.name}"] ${site.selector}`);
        const idleHover = await page.evaluate(readCase, idleCase);
        if (site.idleHovers !== false) {
          assert.notEqual(idleHover.paint, idleRest.paint, 'anti-vacuity: the idle control hovers');
        }
        await page.hover(`[data-case="${busyCase.name}"] ${site.selector}`);
        const busyHover = await page.evaluate(readCase, busyCase);
        assert.equal(busyHover.paint, rest.paint, 'no role hover paints a busy control');
        await page.mouse.move(0, 0);

        await tabInto(page, busyCase);
        const tabbed = await page.evaluate(readCase, busyCase);
        assert.equal(tabbed.focused, true, 'Tab lands on the busy control');
        assert.equal(tabbed.focusVisible, true);
      });

      it(`draws its busy focus ring at ${RING_FLOOR}:1 or better in the default and foundry-native themes`, async () => {
        const busyCase = { name: `${site.name}-busy`, selector: site.selector };
        for (const theme of THEMES) {
          await page.evaluate((id) => {
            const root = document.querySelector('.fabricate');
            if (id) root.dataset.fabricateTheme = id;
            else delete root.dataset.fabricateTheme;
          }, theme);
          await tabInto(page, busyCase);
          const ring = await page.evaluate(readCase, busyCase);
          assert.equal(ring.focusVisible, true);
          assert.notEqual(ring.outline.style, 'none', `${theme || 'default'}: a ring is drawn`);
          const [r, g, b, a] = ring.outline.colour;
          const shown = css([r, g, b, a * ring.opacity]);
          const ground = groundOf(ring.grounds);
          const ratio = contrast(shown, `rgb(${ground.join(' ')})`);
          assert.ok(
            ratio >= RING_FLOOR,
            `${theme || 'default'}: the busy ring reads ${ratio.toFixed(2)}:1 at opacity ${ring.opacity}`
          );
        }
      });
    });
  }
});
