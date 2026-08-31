/**
 * The two WORLD essence screens, mounted (issue 1372, epic 1357).
 *
 * ── WHAT ONLY A MOUNT CAN ANSWER ──────────────────────────────────────────────────────────────
 * Two questions here are about the rendered DOM and nothing else:
 *
 *  - an essence catalogue renders NO source-item affordance and no `<img>` at all, because an
 *    essence's lifted identity is `name` / `icon` / `colorToken` / `description` and carries no
 *    source link. That is an ABSENCE, and an absence is the assertion most easily satisfied by a
 *    screen that rendered nothing — so it is paired with a positive control on the same shell fed
 *    a COMPONENT scope, which does render the badge and the image;
 *  - the per-system indicator distinguishes THREE states. `enabled: false` keeps the membership
 *    record and its overrides, so "not a member" and "a member that is off" are different
 *    authored states with different repairs. A shell modelled on the component pair cannot say
 *    which of the two a GM is looking at.
 *
 * ── TWO HARNESSES, ONE FIXTURE FACTORY ────────────────────────────────────────────────────────
 * The page and the shell are mounted separately because the positive control has to reach the
 * shell with a scope the PAGE would never pass it. Both take a projection built by
 * `projectWorldScopeEntity` from a corpus this file states outright, so neither is asserting
 * against a hand-written projection that could disagree with the shipped one.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const SCOPED_RAW_MODULES = [
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/apps/manager/scoped/essenceScoped.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
  'src/migration/worldScopeEntityGrouping.js',
  'src/utils/definitionIndex.js',
  'src/utils/sourceReferenceUnion.js',
  'src/utils/browserPagination.js',
  'src/utils/bulkSelectionModel.js',
  'src/utils/scopedEntityListModel.js',
];

const SHELL_MODULES = [
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/Pagination.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/StatusPill.svelte',
  'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
  'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
  'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
];

const pageHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-essence-catalogue-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: [
    ...SHELL_MODULES,
    'src/ui/svelte/apps/manager/scoped/WorldEssenceCataloguePage.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldEssenceCataloguePage.svelte',
});

const shellHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-essence-control-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: SHELL_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
});

const ROSTER = [
  { id: 'sys-a', name: 'Mythwright Forge' },
  { id: 'sys-b', name: 'Ironblood' },
  { id: 'sys-c', name: 'Emberwatch' },
];

/**
 * An ESSENCE projection with one entity whose three per-system rows are in the three states.
 *
 * `sys-a` holds it and has it ON, `sys-b` holds it and has it OFF, `sys-c` does not hold it. That
 * is the whole three-state vocabulary, in one entry, so the assertion is a SET equality rather
 * than three separate existence checks that would each pass on a screen rendering one state.
 *
 * @returns {object}
 */
function essenceScope() {
  return projectWorldScopeEntity({
    entityType: 'essence',
    corpus: {
      entities: [
        { id: 'ash', name: 'Ash', icon: 'fas fa-fire', colorToken: 'ember', description: 'Cinders' },
        { id: 'brine', name: 'Brine', icon: 'fas fa-water', colorToken: 'tide', description: 'Salt' },
      ],
      defaults: [{ id: 'ash', effectSource: 'Item.ember' }],
      membership: [
        { entityId: 'ash', systemId: 'sys-a', enabled: true, inherit: {} },
        { entityId: 'ash', systemId: 'sys-b', enabled: false, inherit: {} },
        { entityId: 'brine', systemId: 'sys-a', enabled: true, inherit: {} },
      ],
    },
    systems: ROSTER,
  });
}

/**
 * A COMPONENT projection over the SAME shape, for the positive control.
 *
 * Each entry carries an `img` and a source link, which is exactly the pair an essence lacks — so
 * the shell rendering them here is what makes their absence on the essence screen a measurement.
 *
 * @returns {object}
 */
function componentScope() {
  return projectWorldScopeEntity({
    entityType: 'component',
    corpus: {
      entities: [
        {
          id: 'iron',
          name: 'Iron',
          description: 'Ore',
          img: 'icons/commodities/metal/ingot-iron.webp',
          originItemUuid: 'Item.iron',
        },
      ],
      defaults: [],
      membership: [{ entityId: 'iron', systemId: 'sys-a', inherit: {} }],
    },
    systems: ROSTER,
  });
}

function pageProps(extra = {}) {
  return { scope: essenceScope(), actions: {}, systems: ROSTER, onOpenEntry: () => {}, ...extra };
}

before(async () => {
  await pageHarness.setup();
  await shellHarness.setup();
});

after(() => {
  pageHarness.teardown();
  shellHarness.teardown();
});

describe('criterion 4 — the essence catalogue renders NO source-item affordance', () => {
  it('renders the identity as a GLYPH, with no image and no source badge anywhere', async () => {
    const root = await pageHarness.mount(pageProps());

    // THE POSITIVE HALF FIRST, so the two negatives below are known to be measured over a screen
    // that actually rendered rows.
    const glyphs = root.querySelectorAll('[data-scoped-essence-glyph]');
    assert.equal(glyphs.length, 2, 'both world essences render their own identity glyph');
    assert.ok(glyphs[0].querySelector('i'), 'and the glyph is a Font Awesome class, not a path');

    assert.equal(
      root.querySelectorAll('[data-scoped-list-source], [data-scoped-source]').length,
      0,
      'an essence has no source-item link, so no row may carry a source badge'
    );
    assert.equal(
      root.querySelectorAll('img').length,
      0,
      'and no `<img>`: an essence identity is a glyph plus a colour token, never an item image'
    );
    pageHarness.remount();
  });

  it('and the SAME shell renders both for a component scope, so the absence above is measured', async () => {
    // Without this control, "no source badge" and "no rows at all" are the same green.
    const root = await shellHarness.mount({
      scope: componentScope(),
      actions: {},
      systems: ROSTER,
      hookValue: 'world-components',
      title: 'Component catalogue',
    });
    assert.ok(
      root.querySelector('[data-scoped-list-source]'),
      'the shell DOES render a source badge for an entity type that has one'
    );
    assert.ok(root.querySelector('img'), 'and it DOES render the item image');
    shellHarness.remount();
  });
});

describe('criterion 5 — the per-system indicator has three distinct states', () => {
  it('renders exactly {absent, disabled, enabled} across three fixture systems', async () => {
    const root = await pageHarness.mount(pageProps());
    const row = root.querySelector('[data-scoped-list-row="ash"]');
    assert.ok(row, 'the fixture entity has a row');

    const states = [...row.querySelectorAll('[data-scoped-system-state]')].map((node) =>
      node.getAttribute('data-scoped-system-state')
    );
    // A SET EQUALITY, not three existence checks. `enabled: false` keeps the record and its
    // overrides, so collapsing `disabled` into `absent` is the defect this measures — and it
    // leaves three cells rendering two values, which only a set comparison catches.
    assert.deepEqual([...new Set(states)].sort(), ['absent', 'disabled', 'enabled']);
    assert.equal(states.length, 3, 'one cell per crafting system in the roster');

    // Each cell names its system too, so the state is legible without decoding a colour.
    const bySystem = new Map(
      [...row.querySelectorAll('[data-scoped-system]')].map((node) => [
        node.getAttribute('data-scoped-system'),
        node.getAttribute('data-scoped-system-state'),
      ])
    );
    assert.equal(bySystem.get('sys-a'), 'enabled');
    assert.equal(bySystem.get('sys-b'), 'disabled');
    assert.equal(bySystem.get('sys-c'), 'absent');
    pageHarness.remount();
  });

  it('states the membership count beside the cells, so a collapsed rail still says how many', async () => {
    const root = await pageHarness.mount(pageProps());
    const count = root.querySelector('[data-scoped-essence-membership-count="ash"]');
    assert.ok(count, 'the row carries its own membership count');
    assert.match(count.textContent, /2/, 'two systems hold it, and it says so');
    pageHarness.remount();
  });
});

describe('the catalogue creates from a NAME, with no drop target presupposed', () => {
  it('mints a slugged id and calls createEntity with the identity an essence actually has', async () => {
    const created = [];
    const root = await pageHarness.mount(
      pageProps({ actions: { createEntity: (entity) => created.push(entity) } })
    );
    const field = root.querySelector('[data-scoped-essence-new-name]');
    assert.ok(field, 'the create affordance is a NAME field, not an item drop target');
    field.value = 'Ember Dust';
    field.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    // FLUSHED BEFORE THE CLICK. The button is `disabled` until the name is non-empty, and a
    // disabled button swallows a click silently — so without the flush this test would report
    // "createEntity was never called" for a screen that works.
    flushSync();
    root.querySelector('[data-scoped-essence-create-action]').click();
    await Promise.resolve();

    assert.equal(created.length, 1);
    assert.equal(created[0].id, 'ember-dust');
    assert.equal(created[0].name, 'Ember Dust');
    // AND NO SOURCE FIELD. A component or a tool is created by linking an Item; an essence is
    // created from nothing, so writing one of the three source-link names here would author a
    // field `normalizeWorldEntities` does not carry for this type.
    assert.deepEqual(
      Object.keys(created[0]).sort(),
      ['colorToken', 'description', 'icon', 'id', 'name']
    );
    pageHarness.remount();
  });
});
