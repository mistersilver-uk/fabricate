/**
 * Development-time parity contract for issue 1179's World navigation.
 *
 * Prototype capture: `GM Downtime Studio.html`, WORLD rail DOM beginning at the divider
 * immediately before the `WORLD / every system` heading. The prototype is measured at its
 * authored 1330x900 viewport. The subject is always the real Manager rendered by View Lab.
 *
 *   node scripts/visual-parity/extract.mjs --spec tmp/downtime/world-navigation.spec.mjs \
 *     --out tmp/downtime/world-navigation.fixture.json
 *   node scripts/visual-parity/compare.mjs --spec tmp/downtime/world-navigation.spec.mjs \
 *     --fixture tmp/downtime/world-navigation.fixture.json
 *   node scripts/visual-parity/inventory.mjs --spec tmp/downtime/world-navigation.spec.mjs
 */
import { resolve } from 'node:path';

import { openViewLab } from '../../scripts/visual-parity/lib/view-lab.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const viewport = { width: 1330, height: 900 };

const prototypeText = (text) => [
  { op: 'select', css: 'span, div' },
  { op: 'where', text, leaf: true },
  { op: 'at', index: 0 },
];
const prototypeRow = (text) => [...prototypeText(text), { op: 'parent', times: 1 }];

export const parityMetadata = {
  issue: 1179,
  prototypeDomCapture:
    'WORLD heading row plus sibling Parties, neutral Travel, Realms, Map Region Links, and Downtime analogue rows',
  subjectUrl:
    'tests/view-lab/index.html?app=fabricate-crafting-system-manager&system=lab-smithing&w=1330&h=900',
  subjectCaseIds: [
    'manager-world-default-collapsed',
    'manager-world-travel-expanded-neutral',
    'manager-world-parties-normal',
    'manager-world-realms-normal',
    'manager-world-realms-stacked',
    'manager-world-map-collapsed',
  ],
  measuredAssertions: [
    'collapsed default is captured as subject-only View Lab evidence; prototype comparisons use expanded states',
    'WORLD heading and every system scope typography',
    'divider, row padding, row gaps, count placement, and child indentation',
    'Parties direct-active and Travel expanded/group-active treatment',
    'users, route, mountain-sun, and map-location-dot glyph geometry',
    'shared left and right rail-row alignment',
    'prototype-to-subject structural inventory',
  ],
  exemptions: {
    downtime:
      'STATED SCOPE. The prototype Downtime parent and its children are excluded by issue 1179.',
    behavior:
      'FABRICATE AUTHORITY. Disclosure controls, ARIA state, focus-visible styling, and collapsed rail behavior are absent from the prototype.',
    data:
      'WORLD DATA. Party names, realm records, map links, and the dynamic party total come from the View Lab world rather than the prototype.',
  },
};

export const prototype = {
  path: 'tmp/downtime/GM Downtime Studio.html',
  viewport,
  readySelector: 'x-dc',
  settleMs: 1500,
  screen: 'WORLD / every system',
  domCapture: parityMetadata.prototypeDomCapture,
  subjectUrl: parityMetadata.subjectUrl,
  subjectCaseIds: parityMetadata.subjectCaseIds,
};

// The prototype authors visible children permanently, so computed parity compares only expanded
// subject states. The real collapsed default is pinned by manager-world-default-collapsed instead.
export const screens = ['travel-expanded-neutral', 'parties-selected', 'travel-active-analogue'];

export async function navigate(page, screen) {
  if (screen === 'parties-selected') {
    await page.getByText('Parties', { exact: true }).first().click();
  } else if (screen === 'travel-active-analogue') {
    await page.getByText('Downtime', { exact: true }).first().click();
  }
  await page.waitForTimeout(150);
}

export const propertyGroups = {
  surface: ['backgroundColor'],
  border: ['borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderTopLeftRadius'],
  type: ['color', 'fontSize', 'fontWeight', 'textTransform'],
  tracking: ['letterSpacing'],
  box: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  gap: ['columnGap', 'rowGap'],
  blockSize: ['height'],
  glyph: ['color', 'fontSize'],
  vertical: ['marginTop', 'marginBottom'],
};

const baseRegions = (screen, suffix = screen) => [
  {
    name: `world-heading-${suffix}`,
    screen,
    groups: ['type', 'tracking'],
    locator: prototypeText('WORLD'),
  },
  {
    name: `world-scope-${suffix}`,
    screen,
    groups: ['type'],
    locator: prototypeText('every system'),
  },
  {
    name: `parties-row-${suffix}`,
    screen,
    groups: ['surface', 'border', 'box', 'gap', 'type'],
    locator: prototypeRow('Parties'),
  },
  {
    name: `travel-row-${suffix}`,
    screen,
    groups: ['surface', 'border', 'box', 'gap', 'type'],
    locator: prototypeRow('Travel'),
  },
  {
    name: `realms-row-${suffix}`,
    screen,
    groups: ['box', 'gap', 'type'],
    locator: prototypeRow('Realms'),
  },
  {
    name: `map-row-${suffix}`,
    screen,
    groups: ['box', 'gap', 'type'],
    locator: prototypeRow('Map Region Links'),
  },
];

export const regions = [
  ...baseRegions('travel-expanded-neutral', 'neutral'),
  ...baseRegions('parties-selected', 'parties'),
  ...baseRegions('travel-active-analogue', 'travel'),
];

export const alignments = screens.flatMap((screen) => {
  const suffix =
    screen === 'travel-expanded-neutral'
      ? 'neutral'
      : screen === 'parties-selected'
        ? 'parties'
        : 'travel';
  return [
    {
      name: `world-row-edges-${suffix}`,
      screen,
      edges: ['left', 'right'],
      regions: [`parties-row-${suffix}`, `travel-row-${suffix}`],
    },
    {
      name: `world-child-edges-${suffix}`,
      screen,
      edges: ['left', 'right'],
      regions: [`realms-row-${suffix}`, `map-row-${suffix}`],
    },
  ];
});

const subjectLocators = Object.fromEntries(
  regions.map((region) => {
    const base = region.name.replace(/-(neutral|parties|travel)$/, '');
    const selector = {
      'world-heading': '#manager-world-heading',
      'world-scope': '#manager-world-scope',
      'parties-row': '#manager-world-nav-parties',
      'travel-row': '#manager-world-nav-travel',
      'realms-row': '#manager-world-nav-realms',
      'map-row': '#manager-world-nav-map',
    }[base];
    return [region.name, { locator: selector }];
  })
);

async function resetSubject(page) {
  const collapsed = await page.locator('.manager-body.is-rail-collapsed').count();
  if (collapsed) await page.locator('[data-manager-rail-toggle]').press('Enter');
  if (await page.locator('[data-world-nav-section] [aria-current="page"]').count()) {
    await page.locator('[data-nav-system-edit]').press('Enter');
  }
  const toggle = page.locator('#manager-world-travel-toggle');
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.press('Space');
}

export const subject = {
  viewport,
  root: '.fabricate-manager',
  requiredAncestors: ['.manager-body', '.manager-sidebar', '[data-world-nav-section]'],
  chromeSweep: {
    selectors: ['.manager-sidebar', '[data-world-nav-section]'],
    forbidden: [],
  },
  async open(browser) {
    return openViewLab(browser, {
      repoRoot,
      app: 'fabricate-crafting-system-manager',
      query: { system: 'lab-smithing', w: '1330', h: '900' },
      viewport,
      afterOpen: resetSubject,
    });
  },
  async navigate(page, screen) {
    await resetSubject(page);
    await page.locator('#manager-world-travel-toggle').press('Space');
    if (screen === 'parties-selected') {
      await page.locator('#manager-world-nav-parties').press('Enter');
    } else if (screen === 'travel-active-analogue') {
      await page.locator('#manager-world-nav-realms').press('Enter');
    }
    await page.waitForTimeout(150);
  },
  locators: subjectLocators,
};

export const inventory = {
  roots: Object.fromEntries(
    screens.map((screen) => [
      screen,
      {
        prototype: [...prototypeRow('Parties'), { op: 'parent', times: 1 }],
        subject: '[data-world-nav-section]',
      },
    ])
  ),
  limits: { maxTextLength: 40 },
};

// Standard inventory exemptions stay empty: the inventory root deliberately ends before the
// prototype's Downtime group. The complete scope/data/behavior exemptions remain recorded in
// parityMetadata above so a future widening of the root cannot silently absorb them.
export const inventoryExemptions = {};
