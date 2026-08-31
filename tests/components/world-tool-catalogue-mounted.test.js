/**
 * The world Tools Catalogue, mounted (issue 1373, epic 1357).
 *
 * ## What this is FOR, and why an essence-shaped shell would have shipped past it
 *
 * `src/migration/worldScopeEntityGrouping.js` lifts SIX identity fields for a component and a
 * tool - name, img, description, and the three source-Item links - and only FOUR for an
 * essence, with no link among them. A catalogue built against the essence shape renders a row
 * that looks entirely correct and silently drops the affordance a tool needs most: which
 * game-world Item this record is, and the flag for a record that names none.
 *
 * So both states are asserted from the REAL projection rather than a hand-built `scope`. That
 * matters: `hasSourceLink` is answered inside `buildEntry`, beside the ONE list of source-link
 * field names, and a fixture that stamped the flag itself would go on passing after a rename
 * while every real row started reporting itself unlinked.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-tool-catalogue-',
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldToolCataloguePage.svelte',
  rawModules: [
    'src/config/flags.js',
    'src/migration/worldScopeEntityGrouping.js',
    'src/models/Ingredient.js',
    'src/models/IngredientGroup.js',
    'src/models/Tool.js',
    'src/models/match/matchTypes.js',
    'src/models/reconstructibleDefaults.js',
    'src/models/toolDisplay.js',
    'src/systems/componentScope.js',
    'src/systems/essenceScope.js',
    'src/systems/scopedDefinitionStore.js',
    'src/systems/scopedDefinitions.js',
    'src/systems/toolScope.js',
    'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
    'src/ui/svelte/apps/manager/scoped/worldToolStudio.js',
    'src/ui/svelte/apps/manager/tools/toolStudio.js',
    'src/ui/svelte/stores/worldScopeProjection.js',
    'src/ui/svelte/util/foundryBridge.js',
    'src/utils/browserPagination.js',
    'src/utils/bulkSelectionModel.js',
    'src/utils/scopedEntityListModel.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/apps/manager/Callout.svelte',
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldToolCataloguePage.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
    'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
  ],
});

const SYSTEMS = [
  { id: 'sys-forge', name: 'Forge' },
  { id: 'sys-alchemy', name: 'Alchemy' },
];

/**
 * A tool world corpus with ONE linked record and ONE that names no source Item.
 *
 * @param {object} [options]
 * @param {object|null} [options.toolBreakage]
 * @returns {object}
 */
function corpus({ toolBreakage = null } = {}) {
  return {
    entities: [
      {
        id: 'hammer',
        name: 'Smith Hammer',
        description: 'A hammer.',
        img: 'icons/tools/smithing/hammer-worn-steel-grey.webp',
        originItemUuid: 'Item.hammer-source',
      },
      { id: 'orphan', name: 'Unlinked Awl', description: 'No Item behind it.' },
    ],
    defaults: [
      { id: 'hammer', breakage: { mode: 'breakageChance', breakageChance: 12 } },
      { id: 'orphan', breakage: { mode: 'limitedUses', maxUses: 3 } },
    ],
    membership: [{ entityId: 'hammer', systemId: 'sys-forge', inherit: {}, enabled: true }],
    ...(toolBreakage ? { toolBreakage } : {}),
  };
}

function scopeFor(options) {
  return projectWorldScopeEntity({
    entityType: 'tool',
    corpus: corpus(options),
    systems: SYSTEMS,
  });
}

describe('world Tools Catalogue (issue 1373)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  it('renders the source-item badge for a linked tool and the UNLINKED flag for one with none', async () => {
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });

    const linked = target.querySelector('[data-scoped-list-row="hammer"] [data-scoped-list-source]');
    assert.ok(Boolean(linked), 'the linked row renders a source affordance at all');
    assert.equal(
      linked.getAttribute('data-scoped-list-source'),
      'linked',
      'a tool naming an origin Item reads as LINKED. An essence-shaped identity list carries no ' +
        'link field at all, so this whole affordance disappears while the row still renders'
    );

    const orphan = target.querySelector('[data-scoped-list-row="orphan"] [data-scoped-list-source]');
    assert.ok(Boolean(orphan), 'the unlinked row renders the affordance too, in its other state');
    assert.equal(
      orphan.getAttribute('data-scoped-list-source'),
      'unlinked',
      'a record with no source reference of its own is FLAGGED rather than omitted: validation ' +
        'has to be able to surface it'
    );
  });

  it('badges each row with the world breakage summary, read under the WORLD break mode', async () => {
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
    assert.match(
      target.querySelector('[data-world-tool-row-badges="hammer"]').textContent,
      /12% break/,
      'the badge states what the world default means, not merely that a section exists'
    );
  });

  it('draws TWO break-mode options and selects the AUTHORED one', async () => {
    const target = await harness.mount({
      scope: scopeFor({ toolBreakage: { authority: 'checkDriven' } }),
      systems: SYSTEMS,
      actions: {},
    });
    const segments = [...target.querySelectorAll('[data-world-tool-break-segment]')];
    assert.equal(segments.length, 2, 'the world authors this value, so there is no third option');
    assert.deepEqual(
      segments.filter((segment) => segment.classList.contains('is-selected')).map(
        (segment) => segment.dataset.worldToolBreakSegment
      ),
      ['checkDriven']
    );
  });

  it('selects NEITHER option when the world has authored nothing', async () => {
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
    assert.deepEqual(
      [...target.querySelectorAll('[data-world-tool-break-segment].is-selected')].map(
        (segment) => segment.dataset.worldToolBreakSegment
      ),
      [],
      'an unauthored world value is not the same as an authored toolSpecific, and drawing one ' +
        'as current is how a GM mints a value they never chose'
    );
  });

  it('states NO override count when the roster cannot answer one', async () => {
    // THE ROSTER THIS PAGE RECEIVES IS `$viewState.systems`, a hand-built allowlist in
    // `adminStore.js` that carries no `toolBreakage`. Answering `0` off an absent field reads
    // as "nothing overrides it" and is a WRONG number rather than a missing one, so the line
    // is withheld. This assertion is the gate on that decision: it reds the day the roster
    // starts carrying the field and the line is not turned back on.
    const target = await harness.mount({ scope: scopeFor(), systems: SYSTEMS, actions: {} });
    assert.ok(
      !target.querySelector('[data-world-tool-break-overrides]'),
      'a roster with no toolBreakage on any system cannot answer the override count'
    );

    const answerable = await harness.mount({
      scope: scopeFor({ toolBreakage: { authority: 'toolSpecific' } }),
      systems: [
        { id: 'sys-forge', name: 'Forge', toolBreakage: { authority: 'checkDriven' } },
        { id: 'sys-alchemy', name: 'Alchemy', toolBreakage: { authority: 'toolSpecific' } },
      ],
      actions: {},
    });
    assert.match(
      answerable.querySelector('[data-world-tool-break-overrides]').textContent,
      /1 system overrides it/,
      'and it counts only the system whose AUTHORED token DIFFERS: a system that authored the ' +
        'same token the world did is unaffected by a world change either way'
    );
  });

  it('forwards the chosen world authority to the tool-family write action', async () => {
    const calls = [];
    const target = await harness.mount({
      scope: scopeFor(),
      systems: SYSTEMS,
      actions: { setWorldToolBreakage: (authority) => calls.push(authority) },
    });
    target
      .querySelector('[data-world-tool-break-segment="checkDriven"] input[type="radio"]')
      .click();
    assert.deepEqual(calls, ['checkDriven']);
  });
});
