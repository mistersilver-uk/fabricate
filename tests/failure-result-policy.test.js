/**
 * The FAILURE-RESULT POLICY (issue 1098), end to end through the seams that persist,
 * project, migrate and RESOLVE it.
 *
 * The engine capabilities the policy governs are pinned where their harnesses already
 * live: the salvage failure award in `tests/salvage-engine.test.js` (group 8), the routed
 * tier resolution in `tests/routed-resolution.test.js`, and the gathering award gate in
 * `tests/gathering-failure-results.test.js`. What this file owns is the FIELD — the shared
 * derivation, the three whitelist rebuilds it has to reach, the projection that decides
 * whether the UI can see it, and the seed migration that keeps every upgraded world on
 * today's behaviour.
 *
 * EVERY VALUE ASSERTED HERE IS NON-DEFAULT. `perRecord` is the read-time default, so a
 * fixture carrying it is no oracle at all: a normalizer that dropped the key entirely
 * would produce it and the assertion would still pass.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_FAILURE_RESULT_POLICY,
  FAILURE_RESULT_POLICIES,
  SEEDED_FAILURE_RESULT_POLICY,
  activityFailureResultPolicy,
  activityPermitsFailureResults,
  normalizeFailureResultPolicy,
  permitsFailureResults,
} from '../src/utils/failureResultPolicy.js';
import {
  applySeededFailureResultPolicy,
  migrateSeedFailureResultPolicy,
} from '../src/migration/migrateSeedFailureResultPolicy.js';
import {
  routedOutcomeTierNamesForPolicy,
  routedTierOptionsForPolicy,
  resolveRecipeFixedOutcomeTierOptions,
} from '../src/utils/routedOutcomeKeywords.js';

globalThis.foundry = globalThis.foundry || {
  utils: { randomID: () => `rid-${Math.random().toString(36).slice(2)}` },
};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

const CHECK_KEYS = ['craftingCheck', 'salvageCraftingCheck', 'gatheringCraftingCheck'];

/** A manager instance with no Foundry settings behind it — the normalizers are pure. */
function makeManager() {
  return new CraftingSystemManager();
}

// ── The shared derivation ───────────────────────────────────────────────────────────

test('the policy normalizes to perRecord for absence and for junk, and permits accordingly', () => {
  assert.deepEqual([...FAILURE_RESULT_POLICIES], ['never', 'perRecord', 'always']);
  assert.equal(DEFAULT_FAILURE_RESULT_POLICY, 'perRecord');
  assert.equal(SEEDED_FAILURE_RESULT_POLICY, 'never');

  for (const policy of FAILURE_RESULT_POLICIES) {
    assert.equal(normalizeFailureResultPolicy(policy), policy, `${policy} survives`);
  }
  for (const junk of [undefined, null, '', 'sometimes', 0, true, {}]) {
    assert.equal(normalizeFailureResultPolicy(junk), 'perRecord', `${String(junk)} defaults`);
  }

  // The ONE runtime predicate. `perRecord` and `always` share it deliberately: the policy
  // SELECTS an authored failure output and never fabricates one, so a second runtime
  // branch could only differ by inventing an output the record never authored.
  assert.equal(permitsFailureResults('never'), false);
  assert.equal(permitsFailureResults('perRecord'), true);
  assert.equal(permitsFailureResults('always'), true);
  // Junk reads as the default, which PERMITS: a typo in an imported payload must not
  // silently disable a capability the GM authored.
  assert.equal(permitsFailureResults('sometimes'), true);
});

test('the per-activity readers key on the right check block, and do not cross-read', () => {
  const system = {
    craftingCheck: { failureResultPolicy: 'always' },
    salvageCraftingCheck: { failureResultPolicy: 'never' },
    gatheringCraftingCheck: {},
  };
  assert.equal(activityFailureResultPolicy(system, 'crafting'), 'always');
  assert.equal(activityFailureResultPolicy(system, 'salvage'), 'never');
  assert.equal(activityFailureResultPolicy(system, 'gathering'), 'perRecord');
  assert.equal(activityPermitsFailureResults(system, 'crafting'), true);
  assert.equal(activityPermitsFailureResults(system, 'salvage'), false);
  // An unknown activity reads the default rather than another activity's value.
  assert.equal(activityFailureResultPolicy(system, 'alchemy'), 'perRecord');
});

// ── The three whitelist rebuilds ────────────────────────────────────────────────────

test('all THREE check normalizers emit the policy, at NON-DEFAULT values', () => {
  const manager = makeManager();
  const emitters = {
    craftingCheck: (check) => manager._normalizeCraftingCheck(check),
    salvageCraftingCheck: (check) => manager._normalizeSalvageCraftingCheck(check),
    gatheringCraftingCheck: (check) => manager._normalizeGatheringCraftingCheck(check),
  };

  for (const key of CHECK_KEYS) {
    for (const policy of ['never', 'always']) {
      assert.equal(
        emitters[key]({ failureResultPolicy: policy }).failureResultPolicy,
        policy,
        `${key} emits ${policy} — each is a whitelist rebuild, so an unemitted key is DROPPED`
      );
    }
    // An unrecognized value normalizes on READ rather than being preserved verbatim, so
    // no engine ever has to interpret one.
    assert.equal(emitters[key]({ failureResultPolicy: 'sometimes' }).failureResultPolicy, 'perRecord');
    // A newly-created system — no key at all — gets the permitting default. The seed
    // migration is what keeps an UPGRADED world off it.
    assert.equal(emitters[key]({}).failureResultPolicy, 'perRecord');
  }
});

test('the whole-system normalizer round-trips the policy on all three checks', () => {
  const manager = makeManager();
  const normalized = manager._normalizeSystem({
    id: 'sys-policy',
    name: 'Policies',
    craftingCheck: { failureResultPolicy: 'always' },
    salvageCraftingCheck: { failureResultPolicy: 'never' },
    gatheringCraftingCheck: { failureResultPolicy: 'always' },
  });

  assert.equal(normalized.craftingCheck.failureResultPolicy, 'always');
  assert.equal(normalized.salvageCraftingCheck.failureResultPolicy, 'never');
  assert.equal(normalized.gatheringCraftingCheck.failureResultPolicy, 'always');

  // Re-normalizing is stable, which is what a save/load cycle does.
  const again = manager._normalizeSystem(normalized);
  for (const key of CHECK_KEYS) {
    assert.equal(again[key].failureResultPolicy, normalized[key].failureResultPolicy, key);
  }
});

test('salvage failure CONSUMPTION survives the normalizer at its two trap defaults', () => {
  const manager = makeManager();

  // `consumeComponentOnFail` defaults TRUE via `!== false`, so `false` is the only value
  // that can catch a normalizer or projection dropping it: absence and `false` read
  // differently, and dropping it INVERTS rather than blanks.
  const authored = manager._normalizeSalvageCraftingCheck({
    consumption: { consumeComponentOnFail: false, breakToolsOnFail: true },
  });
  assert.equal(authored.consumption.consumeComponentOnFail, false);
  assert.equal(authored.consumption.breakToolsOnFail, true);

  // `breakToolsOnFail` is read NEW-THEN-LEGACY against the 1.7.0 `consumeCatalystsOnFail`
  // rename. A reader that took the new key alone would flip a pre-1.7.0 system from ON to
  // OFF on its first save.
  const legacyOnly = manager._normalizeSalvageCraftingCheck({
    consumption: { consumeCatalystsOnFail: true },
  });
  assert.equal(legacyOnly.consumption.breakToolsOnFail, true, 'the legacy alias is honoured');
  // …and the NEW key wins when both are present, in both directions.
  assert.equal(
    manager._normalizeSalvageCraftingCheck({
      consumption: { breakToolsOnFail: false, consumeCatalystsOnFail: true },
    }).consumption.breakToolsOnFail,
    false,
    'an explicit new-key false is not overridden by the legacy alias'
  );
});

// ── The 1.25.0 seed migration ───────────────────────────────────────────────────────

test('1.25.0 seeds `never` onto every check that EXISTS, and nothing onto one that does not', () => {
  const system = {
    id: 'sys-1',
    craftingCheck: { enabled: true },
    salvageCraftingCheck: { enabled: false },
    // No `gatheringCraftingCheck` at all.
  };

  applySeededFailureResultPolicy(system);

  assert.equal(system.craftingCheck.failureResultPolicy, 'never');
  assert.equal(system.salvageCraftingCheck.failureResultPolicy, 'never');
  // NO STORAGE CHURN: an absent block has no authored failure output to award and no
  // surface to observe the policy on, so seeding one would touch every system in the
  // world to change nothing. It picks up the read-time default when the GM authors it.
  assert.equal(
    Object.hasOwn(system, 'gatheringCraftingCheck'),
    false,
    'an absent check block is not created'
  );
});

test('1.25.0 never overwrites an authored value, and is idempotent', () => {
  const system = {
    craftingCheck: { failureResultPolicy: 'always' },
    salvageCraftingCheck: {},
  };

  applySeededFailureResultPolicy(system);
  assert.equal(system.craftingCheck.failureResultPolicy, 'always', 'an authored value wins');
  assert.equal(system.salvageCraftingCheck.failureResultPolicy, 'never');

  // A SECOND pass finds every check already carrying a value and writes nothing. The lab
  // world depends on this directly: it boots the real runner with no `migrationVersion`,
  // so every migration runs on every build.
  const snapshot = JSON.stringify(system);
  applySeededFailureResultPolicy(system);
  assert.equal(JSON.stringify(system), snapshot, 'a second pass changes nothing');

  // A value this build would normalize AWAY is still not overwritten: the guard is key
  // presence, not validity, because deciding the absent case is this migration's only job.
  const junk = { craftingCheck: { failureResultPolicy: 'sometimes' } };
  applySeededFailureResultPolicy(junk);
  assert.equal(junk.craftingCheck.failureResultPolicy, 'sometimes');
});

test('1.25.0 is pure and clone-first: the runner payload is never mutated', () => {
  const systems = [{ craftingCheck: {} }];
  const data = { systems, recipes: [{ id: 'r1' }] };

  const result = migrateSeedFailureResultPolicy(data);

  assert.equal(result.systems[0].craftingCheck.failureResultPolicy, 'never');
  assert.equal(
    Object.hasOwn(systems[0].craftingCheck, 'failureResultPolicy'),
    false,
    'the INPUT is untouched — the runner spread-merges the return value'
  );
  assert.notEqual(result.systems, systems);
  // A non-array `systems` is handed back verbatim rather than coerced.
  assert.equal(migrateSeedFailureResultPolicy({ systems: null }).systems, null);
});

test("decision 9's hazard: an upgraded world's tolerated failure salvage group awards NOTHING", () => {
  // The concrete case the migration exists for. A salvage component may legally persist a
  // reserved `role: 'failure'` group carrying results — `_normalizeSalvage` tolerates one
  // whenever the Simple salvage check has an authored roll formula — and until issue 1098
  // it awarded nothing, in every world, always.
  const world = [
    {
      id: 'upgraded',
      salvageResolutionMode: 'simple',
      salvageCraftingCheck: { enabled: true, simple: { rollFormula: '1d20', dc: 12 } },
      components: [
        {
          id: 'comp',
          salvage: {
            enabled: true,
            resultGroups: [
              { id: 'rg-success', results: [{ componentId: 'x', quantity: 1 }] },
              { id: 'rg-failure', role: 'failure', results: [{ componentId: 'y', quantity: 1 }] },
            ],
          },
        },
      ],
    },
  ];

  const migrated = migrateSeedFailureResultPolicy({ systems: world, recipes: [] }).systems[0];

  assert.equal(
    activityPermitsFailureResults(migrated, 'salvage'),
    false,
    'after 1.25.0 the world behaves exactly as it did: a failed salvage produces nothing'
  );
  // …and the GM opting in is what turns it on, deliberately, per activity, per system.
  migrated.salvageCraftingCheck.failureResultPolicy = 'perRecord';
  assert.equal(activityPermitsFailureResults(migrated, 'salvage'), true);
});

// ── Decision 7's authoring swap ─────────────────────────────────────────────────────

const ROUTED = {
  type: 'relative',
  relativeOutcomes: [
    { id: 't-master', name: 'Masterwork', success: true },
    { id: 't-standard', name: 'Standard', success: true },
    { id: 't-ruined', name: 'Ruined', success: false },
  ],
  fixedOutcomes: [
    { id: 'f-good', name: 'Good', success: true, start: 10 },
    { id: 'f-botch', name: 'Botch', success: false, start: 1 },
  ],
};

test('the result-authoring tier options SWAP on the policy, and never on anything else', () => {
  const forbidden = routedTierOptionsForPolicy(ROUTED, 'never').map((tier) => tier.id);
  assert.deepEqual(forbidden, ['t-master', 't-standard'], 'success-filtered under `never`');

  for (const policy of ['perRecord', 'always']) {
    assert.deepEqual(
      routedTierOptionsForPolicy(ROUTED, policy).map((tier) => tier.id),
      ['t-master', 't-standard', 't-ruined'],
      `unfiltered under ${policy} — the failure-marked tier becomes assignable`
    );
  }

  // Junk reads as the permitting default, exactly as the runtime predicate does, so the
  // picker and the engine cannot disagree about an unrecognized stored value.
  assert.equal(routedTierOptionsForPolicy(ROUTED, 'sometimes').length, 3);
});

test('minSuccessOutcomeId is UNAFFECTED by the policy, under every value', () => {
  // It names a MINIMUM SUCCESS tier: a failure-marked tier is never a candidate for it,
  // and widening it "for consistency" would let a recipe demand a minimum that fails.
  for (const policy of [...FAILURE_RESULT_POLICIES, 'sometimes', undefined]) {
    // A FIXED-type routed check: the minimum-success picker is offered there and
    // nowhere else, so the fixture has to be the shape the control actually reads.
    const craftingCheck = {
      routed: { ...ROUTED, type: 'fixed' },
      failureResultPolicy: policy,
    };
    assert.deepEqual(
      resolveRecipeFixedOutcomeTierOptions(craftingCheck, 'routedByCheck').map(
        (tier) => tier.id
      ),
      ['f-good'],
      `the fixed success tier list is unchanged under ${String(policy)}`
    );
  }
});

test("the salvage outcomeRouting select's NAMES are policy-conditional too", () => {
  // Unfiltered until issue 1098, so it offered failure tier names as DEAD OPTIONS:
  // `salvage()` returned before `_resolveSalvageResultGroups` on a failed check.
  assert.deepEqual(routedOutcomeTierNamesForPolicy(ROUTED, 'never'), ['Masterwork', 'Standard']);
  assert.deepEqual(routedOutcomeTierNamesForPolicy(ROUTED, 'always'), [
    'Masterwork',
    'Standard',
    'Ruined',
  ]);
});
