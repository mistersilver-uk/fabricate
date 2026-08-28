/**
 * The two scoped-entity patterns whose whole contract is a STRUCTURAL absence (issue 1362).
 *
 * Both are proved by mounting the SAME props twice and changing only the descriptor, because
 * both defects this guards are invisible to a single-entity-type test:
 *
 *  - `MembershipActions` must render exactly ONE enabled switch for a tool and NONE for a
 *    component. A negative-only assertion passes on a component that renders no switch at all
 *    — including one that renders nothing whatsoever — which is the anti-guard shape. The
 *    POSITIVE half is therefore mandatory and is asserted from the same factory.
 *  - `InheritRow` must draw one row per INHERITABLE section: one for a component, two for a
 *    tool, and none for the tool's SEEDED `repairRequirements`. A per-entity-type test with
 *    its own fixture could satisfy each half against a different set of props.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const SCOPED_RAW_MODULES = [
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
];

const inheritHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-inherit-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
});

const membershipHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-membership-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
});

/**
 * ONE props factory for both mounts. The entity type is the ONLY difference, which is what
 * makes the pair a comparison rather than two unrelated fixtures.
 *
 * @param {string} entityType
 * @param {object} [overrides]
 * @returns {object}
 */
function membershipProps(entityType, overrides = {}) {
  return {
    entityType,
    entityId: 'ash-salt',
    systemId: 'sys-forge',
    entityName: 'Ash Salt',
    systemName: 'Mythwright Forge',
    member: true,
    enabled: true,
    copyable: true,
    ...overrides,
  };
}

describe('MembershipActions (mounted)', () => {
  before(() => membershipHarness.setup());
  after(() => membershipHarness.teardown());
  afterEach(() => membershipHarness.remount());

  it('renders exactly one enabled switch for a TOOL', async () => {
    const root = await membershipHarness.mount(membershipProps('tool'));
    const switches = root.querySelectorAll('[data-scoped-membership-enabled]');
    assert.equal(switches.length, 1, 'a tool membership record carries an enabled flag');
    assert.equal(switches[0].getAttribute('aria-pressed'), 'true');
  });

  it('renders exactly one enabled switch for an ESSENCE', async () => {
    const root = await membershipHarness.mount(membershipProps('essence', { enabled: false }));
    const switches = root.querySelectorAll('[data-scoped-membership-enabled]');
    assert.equal(switches.length, 1);
    assert.equal(switches[0].getAttribute('aria-pressed'), 'false', 'disabled is not absent');
  });

  it('renders NO enabled switch for a COMPONENT, from the same props', async () => {
    const root = await membershipHarness.mount(membershipProps('component'));
    assert.equal(
      root.querySelectorAll('[data-scoped-membership-enabled]').length,
      0,
      'a component membership record carries no enabled flag at all'
    );
    // The positive control for the negative above: the cluster DID render, so the absent
    // switch is the descriptor's doing rather than an empty mount.
    assert.ok(
      Boolean(root.querySelector('[data-scoped-membership-actions="component"]')),
      'the component cluster still renders'
    );
    assert.ok(
      Boolean(root.querySelector('[data-scoped-membership-copy]')),
      'and still offers copy-from, so the mount is not simply empty'
    );
  });

  it('offers add with the inherit-everything sentence when there is no record', async () => {
    const root = await membershipHarness.mount(membershipProps('tool', { member: false }));
    assert.ok(Boolean(root.querySelector('[data-scoped-membership-add]')));
    assert.match(
      root.querySelector('[data-scoped-membership-hint]').textContent,
      /inherits every world default/
    );
    assert.equal(root.querySelectorAll('[data-scoped-membership-enabled]').length, 0);
  });

  it('arms removal on the entity/system pair rather than a row index', async () => {
    const token = 'scoped-membership-remove:ash-salt|sys-forge';
    const armed = [];
    const removed = [];
    const root = await membershipHarness.mount(
      membershipProps('component', { onArm: (value) => armed.push(value) })
    );
    root.querySelector('[data-arm-token]').click();
    assert.deepEqual(armed, [token], 'the arm token names the document pair');

    const confirmRoot = await membershipHarness.mount(
      membershipProps('component', { armedToken: token, onRemove: () => removed.push('removed') })
    );
    confirmRoot.querySelector('[data-arm-token]').click();
    assert.deepEqual(removed, ['removed']);
  });
});

describe('InheritRow (mounted)', () => {
  before(() => inheritHarness.setup());
  after(() => inheritHarness.teardown());
  afterEach(() => inheritHarness.remount());

  it('draws exactly ONE row for a component, and no group chrome around it', async () => {
    const root = await inheritHarness.mount({ entityType: 'component' });
    const rows = [...root.querySelectorAll('[data-scoped-inherit-row]')];
    assert.deepEqual(
      rows.map((row) => row.getAttribute('data-scoped-inherit-row')),
      ['category']
    );
    // No header, no divider, no empty state: chrome costs more space than the one control
    // it would frame and says nothing the row does not.
    assert.equal(root.querySelectorAll('h2, h3, h4, hr').length, 0, 'no group chrome');
    assert.equal(root.querySelectorAll('.manager-empty-state').length, 0, 'no empty state');
  });

  it('draws exactly TWO rows for a tool, and none for the SEEDED section', async () => {
    const root = await inheritHarness.mount({ entityType: 'tool' });
    const rows = [...root.querySelectorAll('[data-scoped-inherit-row]')].map((row) =>
      row.getAttribute('data-scoped-inherit-row')
    );
    assert.deepEqual(rows, ['breakage', 'onBreak']);
    assert.equal(
      rows.includes('repairRequirements'),
      false,
      'a seeded section has no live parent to fall back to, so it draws no switch'
    );
  });

  it('draws two rows for an essence', async () => {
    const root = await inheritHarness.mount({ entityType: 'essence' });
    assert.deepEqual(
      [...root.querySelectorAll('[data-scoped-inherit-row]')].map((row) =>
        row.getAttribute('data-scoped-inherit-row')
      ),
      ['effectSource', 'macro']
    );
  });

  it('reads an ABSENT switch as inheriting and reports the authored one as overridden', async () => {
    const root = await inheritHarness.mount({
      entityType: 'tool',
      inherited: { breakage: false },
    });
    const states = [...root.querySelectorAll('[data-scoped-inherit-state]')].map((chip) =>
      chip.getAttribute('data-scoped-inherit-state')
    );
    assert.deepEqual(states, ['overridden', 'inherited'], 'an absent key reads as inheriting');
    const toggles = [...root.querySelectorAll('[data-scoped-inherit-toggle]')];
    assert.deepEqual(
      toggles.map((toggle) => toggle.getAttribute('aria-pressed')),
      ['false', 'true']
    );
  });

  it('says "fall back", never "discard" — the override is retained', async () => {
    const root = await inheritHarness.mount({ entityType: 'component' });
    const label = root.querySelector('.manager-status-toggle-label').textContent.toLowerCase();
    assert.match(label, /fall back/);
    assert.equal(label.includes('discard'), false);
  });

  it('reports the NEXT inherit value rather than a toggle of unknown state', async () => {
    const calls = [];
    const root = await inheritHarness.mount({
      entityType: 'tool',
      inherited: { breakage: true, onBreak: false },
      onToggle: (section, next) => calls.push([section, next]),
    });
    for (const toggle of root.querySelectorAll('[data-scoped-inherit-toggle]')) toggle.click();
    assert.deepEqual(calls, [
      ['breakage', false],
      ['onBreak', true],
    ]);
  });

  it('renders the caller-supplied note and omits the paragraph when there is none', async () => {
    const root = await inheritHarness.mount({
      entityType: 'tool',
      notes: { breakage: 'Breaks on a 1 in 20.' },
    });
    assert.equal(
      root.querySelector('[data-scoped-inherit-note="breakage"]').textContent.trim(),
      'Breaks on a 1 in 20.'
    );
    assert.ok(
      !root.querySelector('[data-scoped-inherit-note="onBreak"]'),
      'no empty note paragraph for a section with nothing to say'
    );
  });
});
