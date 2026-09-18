/** The two scoped-entity patterns whose whole contract is a STRUCTURAL absence (issue 1362). */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { resolve } from 'node:path';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
// The seeded-section list the row set subtracts. Imported so the assertion below is about
// a NON-EMPTY filter rather than about an empty one that removes nothing.
import { SCOPED_SEEDED_SECTIONS } from '../../src/ui/svelte/apps/manager/scoped/scopedStudio.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const SCOPED_RAW_MODULES = [
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  // Issue 1392 (epic 1357, PR 7a): `worldScopeProjection.js` counts the World Vocabulary's
  // per-entry references now, so its own static closure reaches the vocabulary core and the
  // shipped counter. The harness validates this closure and names the miss, unlike the
  // hand-rolled trees elsewhere.
  'src/systems/worldVocabulary.js',
  'src/utils/vocabularyUsage.js',
  'src/utils/componentCategories.js',
  // #1663: the ONE implementation behind both category shims; imports nothing.
  'src/utils/categoryNormalization.js',
  'src/utils/recipeCategories.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
  'src/utils/scalars.js',
  // Issue 1370: the store now derives the DELETE half of the read union's key rule from the
  // one lifted-identity field list in the tree, which lives beside the migration that wrote it.
  'src/migration/worldScopeEntityGrouping.js',
];

/**
 * The class the shipped no-state primitive actually renders.
 * Named once and asserted from BOTH directions below, because the version of this that read
 * `.manager-empty-state` matched nothing in the repository and therefore could never fail —
 * acceptance criterion 5's "no group chrome" half was decorative for the whole of PR 5.
 */
const EMPTY_STATE_SELECTOR = '.manager-empty';

const emptyStateHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-empty-state-',
  rawModules: [],
  compiledModules: ['src/ui/svelte/apps/manager/EmptyState.svelte'],
  componentPath: 'src/ui/svelte/apps/manager/EmptyState.svelte',
});

const inheritHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-inherit-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
});

const membershipHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-scoped-membership-',
  rawModules: SCOPED_RAW_MODULES,
  compiledModules: [
    'src/ui/svelte/components/Chip.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
});

/**
 * ONE props factory for both mounts. The entity type is the ONLY difference.
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
    // The positive control for the negative above: the cluster DID render.
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

  /**
   * THE REMOVE SENTENCE IS THE ENTITY TYPE'S, NOT THE CALLER'S (issue 1371 r10, r9-cat finding 5b).
   */
  it('announces the RECIPE CASCADE for a component, and not for an essence or a tool', async () => {
    const noteFor = (root) => {
      const remove = root.querySelector('[data-arm-token]');
      assert.ok(Boolean(remove), 'the member cluster rendered its armed Remove');
      return remove.getAttribute('aria-label');
    };

    const component = noteFor(await membershipHarness.mount(membershipProps('component')));
    assert.match(component, /Remove Ash Salt from Mythwright Forge/, 'it names the pair');
    assert.match(component, /rewrites every recipe in that system that names it/);
    assert.match(component, /disables any recipe left without a usable ingredient set or result/);
    assert.match(component, /The world record is untouched, and no other system changes\./);

    for (const entityType of ['essence', 'tool']) {
      const other = noteFor(await membershipHarness.mount(membershipProps(entityType)));
      // The POSITIVE half first, so the refusal below is measured over a sentence that rendered.
      assert.match(other, /Remove Ash Salt from Mythwright Forge/, `${entityType} names the pair`);
      assert.match(
        other,
        /Its overrides go with it; the world record and every other system are untouched\./,
        `${entityType} states what its own store does`
      );
      assert.equal(
        /recipe/.test(other),
        false,
        `nothing on an ${entityType} row may promise a recipe repair its store never performs`
      );
    }
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

describe('the empty-state selector the InheritRow negative depends on', () => {
  before(() => emptyStateHarness.setup());
  after(() => emptyStateHarness.teardown());
  afterEach(() => emptyStateHarness.remount());

  it('MATCHES the shipped no-state primitive, so the negative above is a measurement', async () => {
    // A NEGATIVE ASSERTION IS ONLY WORTH ITS POSITIVE CONTROL. `querySelectorAll(x).length === 0`
    // is satisfied by a selector naming a class nothing renders, which is exactly what
    // `.manager-empty-state` was. Mounting the real primitive and requiring the SAME constant to
    // find it is what makes "InheritRow renders no empty state" a measurement rather than a
    // sentence.
    const root = await emptyStateHarness.mount({ icon: 'fas fa-inbox', title: 'Nothing here' });
    assert.equal(
      root.querySelectorAll(EMPTY_STATE_SELECTOR).length,
      1,
      `${EMPTY_STATE_SELECTOR} must match the rendered EmptyState, or every "no empty state" ` +
        'assertion in this file is vacuous'
    );
  });
});

describe('InheritRow (mounted)', () => {
  before(() => inheritHarness.setup());
  after(() => inheritHarness.teardown());
  afterEach(() => inheritHarness.remount());

  it('draws exactly TWO rows for a component, and no group chrome around them', async () => {
    const root = await inheritHarness.mount({ entityType: 'component' });
    const rows = [...root.querySelectorAll('[data-scoped-inherit-row]')];
    assert.deepEqual(
      rows.map((row) => row.getAttribute('data-scoped-inherit-row')),
      ['category', 'essences'] // issue 1371 r18 (M31): category and the world essence section
    );
    // No header, no divider, no empty state.
    // `.manager-empty` IS THE SHIPPED CLASS. This read `.manager-empty-state`, which occurs
    // NOWHERE in the repository — `EmptyState.svelte` renders `class="manager-empty …"` — so
    // the assertion could not have failed on any tree at all. The suite below mounts the real
    // primitive and asserts this same selector MATCHES, which is what stops the negative going
    // quietly vacuous again.
    assert.equal(root.querySelectorAll('h2, h3, h4, hr').length, 0, 'no group chrome');
    assert.equal(root.querySelectorAll(EMPTY_STATE_SELECTOR).length, 0, 'no empty state');
  });

  it('draws exactly FOUR rows for a tool, and none for the SEEDED section', async () => {
    // NON-VACUITY FIRST. "A seeded section renders none" is satisfied by an EMPTY seeded list,
    // which removes nothing — and the tool list is inert today for a second reason:
    assert.ok(
      SCOPED_SEEDED_SECTIONS.tool.length > 0,
      'the tool seeded-section list is empty, so "a seeded section renders none" filters nothing'
    );
    const root = await inheritHarness.mount({ entityType: 'tool' });
    const rows = [...root.querySelectorAll('[data-scoped-inherit-row]')].map((row) =>
      row.getAttribute('data-scoped-inherit-row')
    );
    // FOUR since `1.31.0` (issue 1373).
    assert.deepEqual(rows, ['breakage', 'onBreak', 'prerequisites', 'bonus']);
    for (const seeded of SCOPED_SEEDED_SECTIONS.tool) {
      assert.equal(
        rows.includes(seeded),
        false,
        `${seeded} is SEEDED: it has no live parent to fall back to, so it draws no switch`
      );
    }
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
    assert.deepEqual(
      states,
      ['overridden', 'inherited', 'inherited', 'inherited'],
      'an absent key reads as inheriting'
    );
    const toggles = [...root.querySelectorAll('[data-scoped-inherit-toggle]')];
    // ON IS OVERRIDDEN. The switch means "this system sets its own".
    assert.deepEqual(
      toggles.map((toggle) => toggle.getAttribute('aria-pressed')),
      // FOUR rows, because issue 1373 gave a tool `prerequisites` and `bonus` alongside the two
      // breakage sections, and the `states` assertion above counts the same four. The DIRECTION
      // is issue 1372's: only the overridden row is pressed.
      ['true', 'false', 'false', 'false']
    );
    // And the CLASS the sheet paints from, which is what a frame actually shows.
    assert.deepEqual(
      toggles.map((toggle) => (toggle.classList.contains('is-on') ? 'is-on' : 'is-off')),
      ['is-on', 'is-off', 'is-off', 'is-off'],
      'the painted state agrees with the pressed state'
    );
    // The pair must never agree with each other by accident.
    const chips = [...root.querySelectorAll('[data-scoped-inherit-state]')];
    for (const [index, chip] of chips.entries()) {
      const overridden = chip.getAttribute('data-scoped-inherit-state') === 'overridden';
      assert.equal(
        toggles[index].getAttribute('aria-pressed'),
        String(overridden),
        'the switch and the pill beside it cannot disagree'
      );
    }
  });

  it('names the switch by what turning it ON does, and never says "discard"', async () => {
    const root = await inheritHarness.mount({ entityType: 'component' });
    // THE ACCESSIBLE NAME, not a visible caption. The caption span was removed because
    // `.manager-status-toggle-label` is `overflow: hidden` inside a compact switch, so the
    // sentence truncated to a meaningless first word — and the row already states the section,
    // the state and the inherited value.
    // It names the OVERRIDE, not the fallback, because ON is overridden (issue 1372). The
    // reassurance that the override is RETAINED did not go away with the old wording: it is in
    // the section NOTE — "Turn off to fall back to {name}." — which is where the corpus states
    // it, and this still asserts that nothing anywhere says the override is thrown away.
    const toggle = root.querySelector('[data-scoped-inherit-toggle]');
    const label = toggle.getAttribute('aria-label').toLowerCase();
    assert.match(label, /override/);
    assert.equal(label.includes('discard'), false);
    assert.equal(label.includes('fall back'), false, 'it does not name the OFF position');
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
      ['prerequisites', false],
      ['bonus', false],
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
