/**
 * The drift guard for "does this environment compose this library record" (issue #1321).
 *
 * That question used to be answered independently in seven places, and the answers disagreed.
 * This change gives it one home — `src/systems/gatheringComposition.js` — and this suite is the
 * mechanism that keeps it one: a case matrix over **composition mode × match shape ×
 * library-enabled × membership in `enabled*Ids` / `disabled*Ids` / `forced*Ids`**, asserted
 * against **every surviving consumer**, so a future change cannot update one and leave the rest.
 *
 * **The rule, and the two sentences that are the whole of it.**
 *
 * - **automatic** — `matches − disabled*Ids`, bounded by NO id list. Neither `enabled*Ids` (a
 *   stale allow-list left over from manual mode) nor `forced*Ids` (a manual-mode affordance) is
 *   consulted.
 * - **manual** — `enabled*Ids ∪ forced*Ids`. A force composes whether or not the record matches;
 *   an `enabled*Ids` entry composes only while it still matches. `disabled*Ids` is IGNORED.
 *
 * Over both: a record disabled in the library (`enabled === false`) composes nowhere.
 *
 * **The oracle is the rule, not the implementation.** {@link COMPOSITION_RULE} spells the answer
 * out as thirty-two literal booleans, and the first test below re-derives every one of them from
 * the two sentences above, written as expressions. Every arm below is
 * compared against that table — including the shared predicate itself. Comparing a consumer to
 * `environmentComposesRecord` instead would prove only that the consumer calls it, which is the
 * one thing that is already obvious from reading it; comparing the predicate to itself would
 * prove nothing at all.
 *
 * **The arms, and the real consumer each one invokes.**
 *
 * | site | consumer invoked here |
 * | --- | --- |
 * | — | `environmentComposesRecord` — the shared home the other six now read from |
 * | 1 | `GatheringRichStateService.composeEnvironment` (the authoritative runtime chain) |
 * | 2 | `createAdminStore(...).viewState.environmentComposition` → `_classifyCompositionRecords` |
 * | 3 | `createAdminStore(...).deleteGatheringLibrary{Task,Event}` → `_environmentComposesGatheringRecord` |
 * | 4 | `GatheringEnvironmentStore._hasMatchingLibraryTask` (the enable gate's fallback ONLY) |
 * | 6 | `tests/stores/admin-store-environments.test.js`'s fake — see the arm; NOT invocable |
 * | 7 | `resolveDraw` (`tests/view-lab/world/labRunStates.js`) |
 * | seam | `activeEnvironmentsForRecord`, which sites 9 and 10 both call |
 *
 * There is deliberately **no site-5 arm and no site-8 arm**: both consumers were deleted rather
 * than converted.
 *
 * **Site 6 is the one arm that cannot invoke its consumer, and it says so where it sits.** The
 * fake is a module-private `function` inside a `.test.js` that exports nothing, and importing a
 * suite to reach it would register that suite's whole test list inside this one. Its arm pins the
 * real gate's behaviour and the fake's source text instead, and names the gap.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { get } from 'svelte/store';

import { SETTING_KEYS } from '../../src/config/settings.js';
import {
  ENVIRONMENT_COMPOSED_COMPOSITION_STATES,
  ENVIRONMENT_COMPOSITION_STATES,
  ENVIRONMENT_INCLUDED_COMPOSITION_STATES,
  activeEnvironmentsForRecord,
  conditionSettingsToCurrent,
  environmentComposesRecord,
  resolveGatheringCompositionMode,
} from '../../src/systems/gatheringComposition.js';
import { GatheringEnvironmentStore } from '../../src/systems/GatheringEnvironmentStore.js';
import { evaluateEnvironmentMatch } from '../../src/systems/gatheringMatch.js';
import { GatheringRichStateService } from '../../src/systems/GatheringRichStateService.js';
import {
  COMPOSITION_STATE_META,
  UNKNOWN_COMPOSITION_STATE_META,
  resolveCompositionStateMeta,
} from '../../src/ui/svelte/apps/manager/environment/compositionStateMeta.js';
import { evaluateEnvironmentReadiness } from '../../src/ui/svelte/apps/manager/environment/environmentReadiness.js';
import { createAdminStore } from '../../src/ui/svelte/stores/adminStore.js';
import { createServices, makeSystem } from '../helpers/adminStoreServices.js';
import { buildLabContent } from '../view-lab/world/labContent.js';
import { resolveDraw } from '../view-lab/world/labRunStates.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Code-unit ordering, supplied explicitly. `Array#sort()`/`toSorted()` without a comparator is
 * both an ESLint error here (`unicorn/require-array-sort-compare`) and a SonarCloud BUG, and every
 * sort below exists only to make a set comparison order-independent.
 */
function byCodeUnit(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

// ---------------------------------------------------------------------------
// The rule, stated as data
// ---------------------------------------------------------------------------

const MODES = Object.freeze(['automatic', 'manual']);

/**
 * The eight ways one record can sit in an environment's three id lists. `E` is
 * `enabled*Ids`, `D` is `disabled*Ids`, `F` is `forced*Ids`; `none` is in none of them.
 */
const MEMBERSHIPS = Object.freeze(['none', 'E', 'D', 'F', 'ED', 'EF', 'DF', 'EDF']);

/**
 * The answer, written out. Keyed `<mode>|<match|nomatch>|<membership>`, and deliberately
 * literal: an oracle expressed as a re-worded copy of the implementation cancels with the
 * implementation's own mistakes, which is precisely the failure mode a "single home" change
 * has to be protected from.
 *
 * The library-enabled axis is not in the table because it is not a case-by-case answer: a
 * record with `enabled === false` composes nowhere, full stop, so {@link ruleSays} applies it
 * as a gate over the whole table rather than doubling its rows.
 */
const COMPOSITION_RULE = Object.freeze({
  // Automatic — `matches − disabled`. E and F are never read, which is why every `E`/`F` row
  // here reads exactly like its `none` counterpart and every `D` row reads false.
  'automatic|match|none': true,
  'automatic|match|E': true,
  'automatic|match|D': false,
  'automatic|match|F': true,
  'automatic|match|ED': false,
  'automatic|match|EF': true,
  'automatic|match|DF': false,
  'automatic|match|EDF': false,
  'automatic|nomatch|none': false,
  'automatic|nomatch|E': false,
  'automatic|nomatch|D': false,
  'automatic|nomatch|F': false,
  'automatic|nomatch|ED': false,
  'automatic|nomatch|EF': false,
  'automatic|nomatch|DF': false,
  'automatic|nomatch|EDF': false,
  // Manual — `enabled ∪ forced`, with `enabled` conditional on still matching and `disabled`
  // ignored. Every `F` row is true whether the record matches or not; every `D` row reads
  // exactly like its non-`D` counterpart.
  'manual|match|none': false,
  'manual|match|E': true,
  'manual|match|D': false,
  'manual|match|F': true,
  'manual|match|ED': true,
  'manual|match|EF': true,
  'manual|match|DF': true,
  'manual|match|EDF': true,
  'manual|nomatch|none': false,
  'manual|nomatch|E': false,
  'manual|nomatch|D': false,
  'manual|nomatch|F': true,
  'manual|nomatch|ED': false,
  'manual|nomatch|EF': true,
  'manual|nomatch|DF': true,
  'manual|nomatch|EDF': true,
});

function ruleKey(mode, matches, membership) {
  return `${mode}|${matches ? 'match' : 'nomatch'}|${membership}`;
}

/**
 * The expected answer for one case. `matches` is always supplied by the REAL
 * `evaluateEnvironmentMatch` at the call site, never asserted by hand.
 */
function ruleSays({ mode, matches, membership, libraryEnabled }) {
  if (!libraryEnabled) return false;
  const key = ruleKey(mode, matches, membership);
  const answer = COMPOSITION_RULE[key];
  assert.equal(typeof answer, 'boolean', `the rule table has no row for ${key}`);
  return answer;
}

// ---------------------------------------------------------------------------
// The case matrix
// ---------------------------------------------------------------------------

const SYSTEM_ID = 'sys1';
const ENV_BIOME = 'forest';
const ENV_DANGER = 'hazardous';

/**
 * The three ways a record can stand against the environment's biome and danger level.
 *
 * `dangerMismatch` earns its place twice over. For an EVENT it is a second, independent route
 * to `matches === false`, so no arm can pass by treating "matches" as a synonym for "shares a
 * biome". For a TASK it is a match, because `includeDanger` is false for tasks — so the same
 * authored record is expected to compose as a task and not as an event, and an arm that fed the
 * wrong `kind` through would fail on exactly these cases.
 */
const SHAPES = Object.freeze({
  matching: Object.freeze({ biomes: [ENV_BIOME], dangerTags: ['unsafe'] }),
  biomeMismatch: Object.freeze({ biomes: ['desert'], dangerTags: ['unsafe'] }),
  dangerMismatch: Object.freeze({ biomes: [ENV_BIOME], dangerTags: ['deadly'] }),
});

const KINDS = Object.freeze(['task', 'event']);

function makeRecord(kind, id, shape, libraryEnabled) {
  const { biomes, dangerTags } = SHAPES[shape];
  const common = { id, name: id, enabled: libraryEnabled, biomes: [...biomes] };
  return kind === 'event'
    ? { ...common, dangerTags: [...dangerTags], dropRate: 10 }
    : { ...common, dangerTags: [...dangerTags], dropRows: [] };
}

function buildCases() {
  const cases = [];
  for (const kind of KINDS) {
    for (const mode of MODES) {
      for (const shape of Object.keys(SHAPES)) {
        for (const libraryEnabled of [true, false]) {
          for (const membership of MEMBERSHIPS) {
            const id = `${kind}-${mode}-${shape}-${libraryEnabled ? 'lib' : 'off'}-${membership}`;
            cases.push({
              id,
              kind,
              mode,
              shape,
              libraryEnabled,
              membership,
              record: makeRecord(kind, id, shape, libraryEnabled),
            });
          }
        }
      }
    }
  }
  return cases;
}

const CASES = Object.freeze(buildCases());

function idsFor(mode, kind, flag) {
  return CASES.filter(
    (entry) => entry.mode === mode && entry.kind === kind && entry.membership.includes(flag)
  ).map((entry) => entry.id);
}

function environmentFor(mode) {
  return {
    id: `env-${mode}`,
    craftingSystemId: SYSTEM_ID,
    name: mode === 'manual' ? 'Manual Environment' : 'Automatic Environment',
    description: 'matrix environment',
    enabled: true,
    selectionMode: 'targeted',
    compositionMode: mode,
    biomes: [ENV_BIOME],
    dangerLevel: ENV_DANGER,
    enabledTaskIds: idsFor(mode, 'task', 'E'),
    disabledTaskIds: idsFor(mode, 'task', 'D'),
    forcedTaskIds: idsFor(mode, 'task', 'F'),
    enabledEventIds: idsFor(mode, 'event', 'E'),
    disabledEventIds: idsFor(mode, 'event', 'D'),
    forcedEventIds: idsFor(mode, 'event', 'F'),
    conditions: { weather: 'clear', timeOfDay: 'day', visibility: '', notes: '' },
  };
}

const MATRIX_ENVIRONMENTS = Object.freeze({
  automatic: environmentFor('automatic'),
  manual: environmentFor('manual'),
});

/** `matches` for one case, from the REAL matcher against the case's own environment. */
function realMatchesFor(entry) {
  return evaluateEnvironmentMatch(
    entry.record,
    MATRIX_ENVIRONMENTS[entry.mode],
    {},
    {
      includeDanger: entry.kind === 'event',
    }
  ).matches;
}

const EXPECTED = new Map(
  CASES.map((entry) => [
    entry.id,
    ruleSays({
      mode: entry.mode,
      matches: realMatchesFor(entry),
      membership: entry.membership,
      libraryEnabled: entry.libraryEnabled,
    }),
  ])
);

function casesOf(mode, kind) {
  return CASES.filter((entry) => entry.mode === mode && entry.kind === kind);
}

function configFor(mode) {
  return {
    systems: {
      [SYSTEM_ID]: {
        tasks: casesOf(mode, 'task').map((entry) => entry.record),
        events: casesOf(mode, 'event').map((entry) => entry.record),
      },
    },
  };
}

/**
 * Report every disagreement at once rather than aborting on the first. A matrix that stops at
 * case 1 of 192 tells you a consumer drifted; a matrix that lists all of them tells you HOW,
 * which is the difference between a five-minute fix and an afternoon.
 */
function assertMatrixArm(entries, actualOf, label) {
  const wrong = [];
  for (const entry of entries) {
    const expected = EXPECTED.get(entry.id);
    const actual = actualOf(entry);
    if (actual !== expected) wrong.push(`${entry.id}: expected ${expected}, got ${actual}`);
  }
  assert.deepEqual(
    wrong,
    [],
    `${label} disagrees with the composition rule on ${wrong.length} of ${entries.length} cases:\n- ${wrong.join('\n- ')}`
  );
}

// ---------------------------------------------------------------------------

describe('the composition rule, stated as data', () => {
  it('says what the prose says, on all thirty-two rows', () => {
    // The double entry. The table above is the oracle every arm is judged against, so a typo in
    // it would quietly redefine "correct" for the whole suite; this re-derives each row from the
    // two sentences in the module docstring, written as expressions rather than as literals.
    const rows = Object.keys(COMPOSITION_RULE);
    assert.equal(rows.length, MODES.length * 2 * MEMBERSHIPS.length, 'the table is complete');
    for (const mode of MODES) {
      for (const matches of [true, false]) {
        for (const membership of MEMBERSHIPS) {
          const inEnabled = membership.includes('E');
          const inDisabled = membership.includes('D');
          const inForced = membership.includes('F');
          const prose =
            mode === 'manual' ? inForced || (inEnabled && matches) : matches && !inDisabled;
          assert.equal(
            COMPOSITION_RULE[ruleKey(mode, matches, membership)],
            prose,
            `${ruleKey(mode, matches, membership)}: the literal row and the stated rule disagree`
          );
        }
      }
    }
  });

  it('a library-disabled record composes nowhere, whatever the table says', () => {
    for (const mode of MODES) {
      for (const matches of [true, false]) {
        for (const membership of MEMBERSHIPS) {
          assert.equal(
            ruleSays({ mode, matches, membership, libraryEnabled: false }),
            false,
            `${ruleKey(mode, matches, membership)} with enabled:false`
          );
        }
      }
    }
  });
});

describe('the case matrix', () => {
  it('is 192 cases and exercises both answers on every axis', () => {
    // The non-vacuity ratchet. Every arm below reads `EXPECTED`, so a matrix that had collapsed
    // to "false everywhere" — one fixture typo away — would let all seven arms pass while
    // proving nothing, exactly the shape of coverage this suite exists to replace.
    assert.equal(CASES.length, 192, 'kind x mode x shape x library-enabled x membership');
    const answers = CASES.map((entry) => EXPECTED.get(entry.id));
    assert.ok(answers.some(Boolean), 'some case composes');
    assert.ok(
      answers.some((value) => !value),
      'some case does not compose'
    );
    for (const axis of [
      (entry) => entry.kind,
      (entry) => entry.mode,
      (entry) => entry.shape,
      (entry) => String(entry.libraryEnabled),
      (entry) => entry.membership,
    ]) {
      const values = [...new Set(CASES.map(axis))];
      for (const value of values) {
        const slice = CASES.filter((entry) => axis(entry) === value).map((entry) =>
          EXPECTED.get(entry.id)
        );
        // Two axis values are one-sided BY THE RULE, and are asserted as such rather than
        // exempted: a library-disabled record composes nowhere, and a record whose only listing
        // is `disabled*Ids` composes nowhere either — automatic excludes it, and manual has
        // neither an enable nor a force to admit it. Anything else being one-sided is a broken
        // fixture, not a property of the rule.
        if (value === 'false' || value === 'D') {
          assert.ok(
            slice.every((answer) => !answer),
            `${value === 'D' ? 'a disabled-only listing' : 'a library-disabled record'} never composes`
          );
          continue;
        }
        assert.ok(slice.some(Boolean), `${value} has a composing case`);
        assert.ok(
          slice.some((answer) => !answer),
          `${value} has a non-composing case`
        );
      }
    }
  });

  it('resolves `matches` from the real matcher, and the danger shape splits task from event', () => {
    // Proof that `matches` is measured rather than assumed, and that the danger axis is live:
    // one authored shape, two kinds, two answers, because `includeDanger` is true only for events.
    const dangerTask = CASES.find(
      (entry) => entry.kind === 'task' && entry.shape === 'dangerMismatch'
    );
    const dangerEvent = CASES.find(
      (entry) => entry.kind === 'event' && entry.shape === 'dangerMismatch'
    );
    assert.equal(realMatchesFor(dangerTask), true, 'tasks are danger-blind');
    assert.equal(realMatchesFor(dangerEvent), false, 'events are danger-matched');
    const biomeMiss = CASES.find((entry) => entry.shape === 'biomeMismatch');
    assert.equal(realMatchesFor(biomeMiss), false, 'a biome mismatch is a mismatch for both kinds');
    assert.equal(
      realMatchesFor(CASES.find((entry) => entry.shape === 'matching')),
      true,
      'the matching shape matches'
    );
  });
});

describe('the shared predicate itself', () => {
  it('answers every case the way the rule table does', () => {
    assertMatrixArm(
      CASES,
      (entry) =>
        environmentComposesRecord(
          MATRIX_ENVIRONMENTS[entry.mode],
          entry.record,
          entry.kind,
          resolveGatheringCompositionMode(MATRIX_ENVIRONMENTS[entry.mode]),
          realMatchesFor(entry)
        ),
      'environmentComposesRecord'
    );
  });

  it('resolveGatheringCompositionMode treats anything but the literal "manual" as automatic', () => {
    assert.equal(resolveGatheringCompositionMode({ compositionMode: 'manual' }), 'manual');
    for (const value of ['automatic', 'Manual', '', null, undefined, 'not-a-mode']) {
      assert.equal(resolveGatheringCompositionMode({ compositionMode: value }), 'automatic');
    }
    assert.equal(resolveGatheringCompositionMode(undefined), 'automatic');
  });
});

// ---------------------------------------------------------------------------
// Site 1 — the engine. `GatheringRichStateService.composeEnvironment` is what actually runs for
// players, so it is the arm the other six exist to agree with.
// ---------------------------------------------------------------------------

function makeEngine(config) {
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  return new GatheringRichStateService({
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
      return value;
    },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    rollD100: () => 1,
  });
}

describe('site 1 — GatheringRichStateService.composeEnvironment', () => {
  it('composes exactly the records the rule admits', () => {
    // The real service, the real setting seam, the real composed output. `_recordIsForced` and
    // `_environmentIncludesLibraryRecord` no longer exist — the chain is one predicate call now —
    // so this asserts what `composeEnvironment` RETURNS rather than reaching for a private helper.
    for (const mode of MODES) {
      const engine = makeEngine(configFor(mode));
      const composed = engine.composeEnvironment(MATRIX_ENVIRONMENTS[mode], { id: SYSTEM_ID });
      const composedTaskIds = new Set(composed.tasks.map((task) => String(task.id)));
      const composedEventIds = new Set(composed.events.map((event) => String(event.id)));
      assertMatrixArm(
        CASES.filter((entry) => entry.mode === mode),
        (entry) => (entry.kind === 'event' ? composedEventIds : composedTaskIds).has(entry.id),
        `composeEnvironment (${mode})`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Sites 2 and 3 — the admin store. Both are closures inside the exported `createAdminStore`
// factory, so both are reached through the public surface: site 2 through `viewState`, site 3
// through the library-record impact path a delete confirmation runs.
//
// The services fixture is the SHARED `tests/helpers/adminStoreServices.js` one. Three suites
// still carry a local `createMockServices`, and a fourth copy of it inside the change whose whole
// subject is removing duplicated rules would be self-defeating (and would fail the new-code
// duplication gate besides).
// ---------------------------------------------------------------------------

function makeAdminStoreFor(mode) {
  const environments = [MATRIX_ENVIRONMENTS[mode]];
  const config = configFor(mode);
  const dialogs = [];
  const services = createServices(
    makeSystem({ id: SYSTEM_ID, features: { gathering: true } }),
    [],
    [],
    {
      getSetting: (key) => {
        if (key === 'lastManagedCraftingSystem') return SYSTEM_ID;
        if (key === SETTING_KEYS.GATHERING_CONFIG) return config;
        return '';
      },
      setSetting: async () => {},
      getGatheringEnvironmentStore: () => ({
        list: () => environments,
        listBySystem: async () => environments,
      }),
      // Every delete below is DECLINED, so the library is never mutated and one store serves the
      // whole arm. The dialog content is the observable: the store writes the composing
      // environments into it before asking.
      confirmDialog: async (options) => {
        dialogs.push(options);
        return false;
      },
    }
  );
  return { store: createAdminStore(services), dialogs, environment: environments[0] };
}

describe('site 2 — adminStore._classifyCompositionRecords, through viewState', () => {
  /** Every classified row for one mode's environment, keyed by record id. */
  async function classifiedRowsFor(mode) {
    const { store } = makeAdminStoreFor(mode);
    await store.selectSystem(SYSTEM_ID);
    const composition = get(store.viewState).environmentComposition;
    const rows = [...composition.tasks, ...composition.events];
    assert.equal(
      rows.length,
      casesOf(mode, 'task').length + casesOf(mode, 'event').length,
      `${mode}: every library record is classified`
    );
    return new Map(rows.map((row) => [row.id, row]));
  }

  it('classifies each record into a vocabulary state the rule would compose', async () => {
    // Claim one of two: the STATE is right. `includedButUnavailable` is shown to the GM as an
    // included row and is NOT composed, so the set this test re-projects through is the
    // three-state `ENVIRONMENT_COMPOSED_COMPOSITION_STATES`, never the four-state included one.
    //
    // Re-projecting HERE is what this test can prove and also exactly what it cannot: the
    // projection happens in the test, so the store could pick either set and this assertion would
    // not move. That hole is closed by the next test, and the two are kept apart because the
    // vocabulary state and the projection of it are two different claims.
    for (const mode of MODES) {
      const rowsById = await classifiedRowsFor(mode);
      assertMatrixArm(
        CASES.filter((entry) => entry.mode === mode),
        (entry) =>
          ENVIRONMENT_COMPOSED_COMPOSITION_STATES.has(rowsById.get(entry.id).compositionState),
        `_classifyCompositionRecords compositionState (${mode})`
      );
    }
  });

  it("projects through the store's OWN set, which re-deriving the projection here cannot see", async () => {
    // Claim two: the store projects the state through the same set this suite does. The store
    // writes `composed = ENVIRONMENT_COMPOSED_COMPOSITION_STATES.has(compositionState)` and then
    // `runtimeState = composed && conditionsMet ? 'available' : 'unavailable'` (`adminStore.js`),
    // and `composed` itself is not published — `runtimeState` is the only read of it available
    // through `viewState`.
    //
    // So the PRECONDITION is that `conditionsMet` holds, and it is measured off the store's own
    // published field for every row rather than assumed from the fixtures: no matrix record
    // declares a `weather` or `timeOfDay` list, so `evaluateEnvironmentMatch` reports both
    // dimensions as `any`. If that ever stops being true this fails loudly here instead of
    // silently narrowing the assertion below to a subset nobody notices.
    //
    // Swapping the store's projection to `ENVIRONMENT_INCLUDED_COMPOSITION_STATES` is a real
    // disagreement with the rule — the two sets differ exactly on `includedButUnavailable`, which
    // is `manual && explicitlyIncluded && !matches` and does not compose — and it is invisible to
    // the test above.
    for (const mode of MODES) {
      const rowsById = await classifiedRowsFor(mode);
      const conditionGated = [...rowsById.values()]
        .filter((row) => row.conditionsMet !== true)
        .map((row) => row.id);
      assert.deepEqual(
        conditionGated,
        [],
        `${mode}: every matrix record must satisfy the current conditions for runtimeState to be a faithful read of the store's \`composed\`; these do not:\n- ${conditionGated.join('\n- ')}`
      );
      assertMatrixArm(
        CASES.filter((entry) => entry.mode === mode),
        (entry) => rowsById.get(entry.id).runtimeState === 'available',
        `_classifyCompositionRecords runtimeState, i.e. the store's own composed projection (${mode})`
      );
    }
  });

  it('reaches every state in the vocabulary, so neither projection is asserted over a stub', async () => {
    // The ratchet on both arms above. A classifier that had collapsed to two states would still
    // project correctly on every case while having lost six distinctions, so the states the
    // matrix actually produces are enumerated and compared against the whole vocabulary.
    const observed = new Set();
    for (const mode of MODES) {
      const rowsById = await classifiedRowsFor(mode);
      for (const row of rowsById.values()) observed.add(row.compositionState);
    }
    assert.deepEqual(
      [...observed].sort(byCodeUnit),
      [...ENVIRONMENT_COMPOSITION_STATES].sort(byCodeUnit),
      'the matrix exercises every composition state'
    );
  });
});

describe('site 3 — adminStore._environmentComposesGatheringRecord, through the library impact path', () => {
  it('names an environment as affected exactly where the rule composes', async () => {
    // `deleteGatheringLibraryTask` / `deleteGatheringLibraryEvent` ask
    // `_gatheringLibraryRecordUsages` which environments surface the record, and that walks
    // `_environmentComposesGatheringRecord` per environment. The confirmation content is where
    // the answer becomes observable, so the arm reads it there rather than reimplementing it.
    for (const mode of MODES) {
      const { store, dialogs, environment } = makeAdminStoreFor(mode);
      await store.selectSystem(SYSTEM_ID);
      const used = `Used by 1 environment: ${environment.name}.`;
      const seen = new Map();
      const modeCases = CASES.filter((candidate) => candidate.mode === mode);
      for (const entry of modeCases) {
        dialogs.length = 0;
        const declined =
          entry.kind === 'event'
            ? await store.deleteGatheringLibraryEvent(SYSTEM_ID, entry.id)
            : await store.deleteGatheringLibraryTask(SYSTEM_ID, entry.id);
        assert.equal(declined, false, `${entry.id}: the delete is declined, not applied`);
        assert.equal(dialogs.length, 1, `${entry.id}: the confirmation was raised`);
        seen.set(entry.id, String(dialogs[0].content).includes(used));
      }
      assertMatrixArm(
        modeCases,
        (entry) => seen.get(entry.id),
        `_environmentComposesGatheringRecord (${mode})`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Site 4 — the enable gate. Only ONE of `_environmentHasTaskSource`'s three branches consumes the
// predicate, and the arm is scoped to that branch on purpose: the two id-list guards ahead of it
// answer a deliberately coarser question ("is there an explicit id parked here"), and converting
// them would change the gate's behaviour twice over.
// ---------------------------------------------------------------------------

function makeEnvironmentStore(getConfig) {
  return new GatheringEnvironmentStore({
    getSetting: (key) => (key === SETTING_KEYS.GATHERING_CONFIG ? getConfig() : undefined),
    setSetting: async () => {},
    getSystems: () => [{ id: SYSTEM_ID, name: 'System One' }],
  });
}

/**
 * A DECOY id, listed alongside the record under test so that every id list is non-empty even when
 * the record is in none of them. It names nothing in the library, so it is rule-neutral by
 * construction — and it is the difference between an arm that can see an "an empty list means
 * allow-all" defect and one that cannot. Verified by mutation: without it, teaching automatic mode
 * to honour `enabledTaskIds` as an allow-list leaves this arm green.
 */
const DECOY_TASK_ID = 'decoy-task-in-no-library';

/**
 * One environment carrying exactly one record's listings — so a gate that answers "does ANY
 * library task compose here" answers the per-record question this matrix asks.
 *
 * `decoys` is off for the guard tests below on purpose: guard 1 fires on ANY non-empty
 * `enabledTaskIds` and guard 2 on any manual-mode `forcedTaskIds`, so a decoy in either would stop
 * the fallback ever being reached and quietly empty the delegation test.
 */
function soleRecordEnvironment(entry, { decoys = false } = {}) {
  const base = decoys ? [DECOY_TASK_ID] : [];
  const listed = (flag) => (entry.membership.includes(flag) ? [...base, entry.id] : [...base]);
  return {
    id: `env-${entry.id}`,
    craftingSystemId: SYSTEM_ID,
    name: entry.id,
    enabled: true,
    selectionMode: 'targeted',
    compositionMode: entry.mode,
    biomes: [ENV_BIOME],
    dangerLevel: ENV_DANGER,
    enabledTaskIds: listed('E'),
    disabledTaskIds: listed('D'),
    forcedTaskIds: listed('F'),
    enabledEventIds: [],
    disabledEventIds: [],
    forcedEventIds: [],
  };
}

describe('site 4 — GatheringEnvironmentStore._hasMatchingLibraryTask', () => {
  it('agrees with the rule on every task case', () => {
    let config = {};
    const store = makeEnvironmentStore(() => config);
    assertMatrixArm(
      CASES.filter((entry) => entry.kind === 'task'),
      (entry) => {
        config = { systems: { [SYSTEM_ID]: { tasks: [entry.record] } } };
        return store._hasMatchingLibraryTask(soleRecordEnvironment(entry, { decoys: true }));
      },
      '_hasMatchingLibraryTask'
    );
  });

  it('_environmentHasTaskSource delegates to it wherever the two coarse guards do not fire', () => {
    // Guard 1 is `enabledTaskIds.length > 0` in ANY mode and guard 2 is a manual-mode
    // `forcedTaskIds`; the fallback governs everything else. This pins the delegation, so a
    // conversion that reached the predicate but never got called still fails.
    let config = {};
    const store = makeEnvironmentStore(() => config);
    const delegating = CASES.filter(
      (entry) =>
        entry.kind === 'task' &&
        !entry.membership.includes('E') &&
        !(entry.mode === 'manual' && entry.membership.includes('F'))
    );
    assert.ok(delegating.length > 0, 'the fallback governs some cases');
    assertMatrixArm(
      delegating,
      (entry) => {
        config = { systems: { [SYSTEM_ID]: { tasks: [entry.record] } } };
        return store._environmentHasTaskSource(soleRecordEnvironment(entry));
      },
      '_environmentHasTaskSource (fallback regime)'
    );
  });

  it('keeps its two id-list guards coarser than the predicate, and they are named divergences', () => {
    // Reported, not absorbed. Each of these is a case where the gate says "this environment has a
    // task source" and the predicate says "this record does not compose" — deliberately, because
    // an authored id is authored intent even when nothing composes from it today.
    let config = {};
    const store = makeEnvironmentStore(() => config);
    const nonComposing = (mode, membership) =>
      CASES.find(
        (entry) =>
          entry.kind === 'task' &&
          entry.mode === mode &&
          entry.shape === 'biomeMismatch' &&
          entry.libraryEnabled &&
          entry.membership === membership
      );

    // Guard 1 fires in AUTOMATIC mode, where `enabledTaskIds` is ignored by composition.
    const staleAllowList = nonComposing('automatic', 'E');
    config = { systems: { [SYSTEM_ID]: { tasks: [staleAllowList.record] } } };
    assert.equal(EXPECTED.get(staleAllowList.id), false, 'the record does not compose');
    assert.equal(
      store._environmentHasTaskSource(soleRecordEnvironment(staleAllowList)),
      true,
      'guard 1 accepts a stale automatic-mode allow-list as a task source'
    );

    // Guard 2 fires in MANUAL mode on a force, which composes — so it is guard 1 in manual mode,
    // on a non-matching enabled id, that is the second divergence.
    const staleManualEntry = nonComposing('manual', 'E');
    config = { systems: { [SYSTEM_ID]: { tasks: [staleManualEntry.record] } } };
    assert.equal(EXPECTED.get(staleManualEntry.id), false, 'the record does not compose');
    assert.equal(
      store._environmentHasTaskSource(soleRecordEnvironment(staleManualEntry)),
      true,
      'guard 1 accepts a no-longer-matching manual-mode entry as a task source'
    );

    // And the divergence the spec amendment records: after conversion the automatic arm of the
    // gate DOES consult `disabledTaskIds`, so an environment whose only matching task is excluded
    // no longer reports a task source. This is the behaviour change task 2 reported.
    const excluded = CASES.find(
      (entry) =>
        entry.kind === 'task' &&
        entry.mode === 'automatic' &&
        entry.shape === 'matching' &&
        entry.libraryEnabled &&
        entry.membership === 'D'
    );
    config = { systems: { [SYSTEM_ID]: { tasks: [excluded.record] } } };
    assert.equal(
      store._environmentHasTaskSource(soleRecordEnvironment(excluded)),
      false,
      'an automatic environment whose only matching task is excluded has no task source'
    );
  });
});

// ---------------------------------------------------------------------------
// Site 6 — the fake in `tests/stores/admin-store-environments.test.js`.
// ---------------------------------------------------------------------------

describe('site 6 — the admin-store-environments fake enable gate', () => {
  it('CANNOT be invoked from here, and this is the arm that says so', () => {
    // `validateEnvironmentForFakeCreate` is a module-private `function` in a `.test.js` that
    // exports nothing, and there is no cross-suite import anywhere in `tests/`. Importing that
    // suite to reach it would register its entire test list inside this one. So this arm does the
    // two things that ARE available, and names the gap rather than implying coverage it lacks:
    // it pins the real gate's guard behaviour (below), and it pins the fake's rule as source text
    // (here), so a change to either side has to touch this file.
    const suite = readFileSync(
      resolve(repoRoot, 'tests/stores/admin-store-environments.test.js'),
      'utf8'
    );
    const collapsed = suite.replaceAll(/\s+/g, ' ');
    assert.ok(
      collapsed.includes(
        "const hasIdTaskSource = (Array.isArray(environment.enabledTaskIds) && environment.enabledTaskIds.length > 0) || (compositionMode === 'manual' && Array.isArray(environment.forcedTaskIds) && environment.forcedTaskIds.length > 0);"
      ),
      'the fake still computes the enable gate as the two id-list guards, unchanged'
    );
    assert.ok(
      collapsed.includes(
        'const hasTaskSource = hasIdTaskSource || (Array.isArray(environment.tasks) && environment.tasks.length > 0);'
      ),
      'the fake still declares its legacy embedded-`tasks` branch as its one deliberate addition'
    );
    assert.ok(
      collapsed.includes('Mirrors GatheringEnvironmentStore#_environmentHasTaskSource'),
      'the fake still declares which production rule it mirrors'
    );
  });

  it('mirrors a real gate whose two guards behave exactly as the fake states', () => {
    // The behavioural half. These four assertions are the rule the fake reimplements, run against
    // the REAL `_environmentHasTaskSource` with an empty library so the fallback contributes
    // nothing — which is the fake's own stated situation. If the real guards move, this reds and
    // the fake has to move with them.
    const store = makeEnvironmentStore(() => ({ systems: { [SYSTEM_ID]: { tasks: [] } } }));
    const gate = (overrides) =>
      store._environmentHasTaskSource({
        id: 'env-gate',
        craftingSystemId: SYSTEM_ID,
        enabledTaskIds: [],
        forcedTaskIds: [],
        disabledTaskIds: [],
        compositionMode: 'automatic',
        biomes: [ENV_BIOME],
        ...overrides,
      });
    assert.equal(gate({ enabledTaskIds: ['t'] }), true, 'enabledTaskIds counts in automatic mode');
    assert.equal(
      gate({ compositionMode: 'manual', enabledTaskIds: ['t'] }),
      true,
      'enabledTaskIds counts in manual mode'
    );
    assert.equal(
      gate({ compositionMode: 'manual', forcedTaskIds: ['t'] }),
      true,
      'forcedTaskIds counts in manual mode'
    );
    assert.equal(
      gate({ forcedTaskIds: ['t'] }),
      false,
      'forcedTaskIds does NOT count in automatic mode'
    );
    assert.equal(gate({}), false, 'no ids and an empty library is no task source');
  });
});

// ---------------------------------------------------------------------------
// Site 7 — `resolveDraw`, the View Lab's blind/targeted run seeder.
// ---------------------------------------------------------------------------

describe('site 7 — labRunStates.resolveDraw', () => {
  it('draws exactly the pool candidates the rule composes', () => {
    // `resolveDraw` has no task library, so its candidate pool is the environment's own
    // `enabledTaskIds ∪ forcedTaskIds` and it calls the predicate with `matches: true` for every
    // candidate. The axes it can therefore reach are mode x membership, with `matches` and
    // `enabled` both asserted rather than varied — stated here rather than left for a reader to
    // infer from a smaller-than-expected case count.
    const failures = [];
    for (const mode of MODES) {
      for (const membership of MEMBERSHIPS) {
        const listed = (flag) => (membership.includes(flag) ? ['t-draw'] : []);
        const environment = {
          id: `env-${mode}-${membership}`,
          compositionMode: mode,
          enabledTaskIds: listed('E'),
          disabledTaskIds: listed('D'),
          forcedTaskIds: listed('F'),
        };
        const inPool = membership.includes('E') || membership.includes('F');
        const expected =
          inPool && ruleSays({ mode, matches: true, membership, libraryEnabled: true });
        let drawn = null;
        try {
          drawn = resolveDraw([environment], () => true, 'drift-matrix').taskId;
        } catch (error) {
          assert.match(
            error.message,
            /composes no task/,
            `${mode}/${membership}: an empty composed set throws rather than degrading`
          );
        }
        if ((drawn === 't-draw') !== expected) {
          failures.push(`${mode}/${membership}: expected ${expected}, drew ${drawn}`);
        }
      }
    }
    assert.deepEqual(
      failures,
      [],
      `resolveDraw disagrees with the composition rule:\n- ${failures.join('\n- ')}`
    );
  });

  it('still draws the tasks the real lab world expects, so the arm is not fixture-only', () => {
    const { environments } = buildLabContent();
    const herbalism = environments.filter((entry) => entry.craftingSystemId === 'lab-herbalism');
    assert.equal(
      resolveDraw(herbalism, (entry) => entry.selectionMode === 'blind', 'blind-selection').taskId,
      'hb-task-forage',
      'the blind thicket run still draws a task the thicket composes'
    );
    assert.equal(
      resolveDraw(
        herbalism,
        (entry) => entry.selectionMode === 'blind',
        'blind-selection',
        'hb-task-forage'
      ).taskId,
      'hb-task-fungi',
      '`avoid` moves the draw to the other composed candidate rather than repeating one'
    );
  });
});

// ---------------------------------------------------------------------------
// The seam — `activeEnvironmentsForRecord`, which sites 9 and 10 both call.
//
// This is the ONE arm that must fail against pre-change behaviour, because the two "Active
// environments" facts it replaces rendered a wrong number to a GM in BOTH directions. It is
// asserted against the real View Lab world, because that world is the corpus the PR's frames are
// captured from and a criterion written against a different fixture would prove nothing about
// them.
// ---------------------------------------------------------------------------

const LAB = buildLabContent();
const LAB_HERBALISM = 'lab-herbalism';
const LAB_ENVIRONMENTS = LAB.environments.filter(
  (entry) => entry.craftingSystemId === LAB_HERBALISM
);
const LAB_CONDITION_SETTINGS = LAB.gatheringConfig.systems[LAB_HERBALISM].conditions;
const LAB_TASKS = LAB.gatheringConfig.systems[LAB_HERBALISM].tasks;
const LAB_EVENTS = LAB.gatheringConfig.systems[LAB_HERBALISM].events;

function labRecord(id) {
  const record = [...LAB_TASKS, ...LAB_EVENTS].find((entry) => entry.id === id);
  assert.ok(record, `the lab world still declares ${id}`);
  return record;
}

function seamIds(id, kind) {
  return activeEnvironmentsForRecord(labRecord(id), LAB_ENVIRONMENTS, kind, {
    conditionSettings: LAB_CONDITION_SETTINGS,
  }).map((environment) => environment.id);
}

/**
 * The DELETED `gatheringTaskAllowedInEnvironment` / `activeGatheringTaskEnvironmentCount` rule
 * (`CraftingSystemManagerRoot.svelte`, site 9 before this change), reproduced here for one
 * purpose: to prove the seam's answers are not merely correct but DIFFERENT, and different in the
 * two specific directions the defect ran in. It excluded on `disabledTaskIds`, applied
 * `enabledTaskIds` as an allow-list in EVERY mode with an empty list meaning allow-all, and never
 * consulted `forcedTaskIds`.
 *
 * The deleted chain also re-implemented weather and time-of-day inline. That half is inert over
 * this corpus — no herbalism task or event declares either — so it is omitted rather than
 * reproduced as dead code, and the conditions axis below covers the same ground against the seam
 * directly.
 */
function deletedTaskCountRule(record) {
  const recordBiomes = (record.biomes ?? []).map(String);
  return LAB_ENVIRONMENTS.filter((environment) => {
    if (environment.enabled === false) return false;
    const disabled = environment.disabledTaskIds ?? [];
    const enabled = environment.enabledTaskIds ?? [];
    if (disabled.includes(record.id)) return false;
    if (enabled.length > 0 && !enabled.includes(record.id)) return false;
    const envBiomes = (environment.biomes ?? []).map(String);
    return recordBiomes.length === 0 || recordBiomes.some((biome) => envBiomes.includes(biome));
  }).map((environment) => environment.id);
}

/** The DELETED site-10 inline IIFE: `enabledEventIds` membership, and nothing else at all. */
function deletedEventCountRule(record) {
  return LAB_ENVIRONMENTS.filter((environment) =>
    (environment.enabledEventIds ?? []).includes(record.id)
  ).map((environment) => environment.id);
}

describe('the seam — activeEnvironmentsForRecord against the real lab world', () => {
  it('returns the composing environments, in input order', () => {
    // The contract is a list, not a count, precisely so an assertion can compare MEMBERSHIP. The
    // order is the caller's input order so a renderer can page it without re-sorting.
    assert.deepEqual(
      LAB_ENVIRONMENTS.map((environment) => environment.id),
      ['hb-env-grove', 'hb-env-thicket', 'hb-env-ridge'],
      'the lab world still declares the three herbalism environments in this order'
    );
    assert.deepEqual(seamIds('hb-task-forage', 'task'), [
      'hb-env-grove',
      'hb-env-thicket',
      'hb-env-ridge',
    ]);
  });

  it('answers every herbalism task with the composed truth', () => {
    assert.deepEqual(seamIds('hb-task-forage', 'task'), [
      'hb-env-grove',
      'hb-env-thicket',
      'hb-env-ridge',
    ]);
    assert.deepEqual(seamIds('hb-task-fungi', 'task'), [
      'hb-env-grove',
      'hb-env-thicket',
      'hb-env-ridge',
    ]);
    assert.deepEqual(seamIds('hb-task-spring', 'task'), ['hb-env-grove', 'hb-env-ridge']);
    assert.deepEqual(seamIds('hb-task-slowbloom', 'task'), ['hb-env-ridge']);
    assert.deepEqual(seamIds('hb-task-icecap', 'task'), ['hb-env-ridge']);
    assert.deepEqual(seamIds('hb-task-ridgemoss', 'task'), ['hb-env-ridge']);
  });

  it('answers both herbalism events with the composed truth', () => {
    assert.deepEqual(seamIds('hb-event-wolves', 'event'), [
      'hb-env-grove',
      'hb-env-thicket',
      'hb-env-ridge',
    ]);
    assert.deepEqual(seamIds('hb-event-storm', 'event'), [
      'hb-env-grove',
      'hb-env-thicket',
      'hb-env-ridge',
    ]);
  });

  it('fixes the automatic under-count: hb-env-ridge carries a non-empty enabledTaskIds', () => {
    // `hb-env-ridge` is AUTOMATIC with `enabledTaskIds: ['hb-task-fungi']`. The deleted rule read
    // that list as an allow-list and dropped every other task from ridge's count; automatic
    // composition ignores it entirely, so the engine composes them and the fact under-reported.
    const ridge = LAB_ENVIRONMENTS.find((entry) => entry.id === 'hb-env-ridge');
    assert.equal(ridge.compositionMode, 'automatic');
    assert.deepEqual(
      ridge.enabledTaskIds,
      ['hb-task-fungi'],
      'the stale allow-list is still there'
    );
    for (const id of ['hb-task-forage', 'hb-task-spring']) {
      assert.ok(
        !deletedTaskCountRule(labRecord(id)).includes('hb-env-ridge'),
        `${id}: the deleted rule dropped ridge`
      );
      assert.ok(seamIds(id, 'task').includes('hb-env-ridge'), `${id}: the seam keeps ridge`);
    }
  });

  it('fixes the manual over-count: hb-env-thicket has an EMPTY enabledTaskIds', () => {
    // `hb-env-thicket` is MANUAL with no `enabledTaskIds` at all and `forcedTaskIds` carrying two
    // tasks. The deleted rule read the empty list as allow-all, so every biome-less task counted
    // thicket; manual composition is `enabled ∪ forced`, so `hb-task-spring` — in neither list —
    // does not compose there.
    const thicket = LAB_ENVIRONMENTS.find((entry) => entry.id === 'hb-env-thicket');
    assert.equal(thicket.compositionMode, 'manual');
    assert.ok(!thicket.enabledTaskIds, 'the manual environment still declares no enabledTaskIds');
    assert.ok(
      deletedTaskCountRule(labRecord('hb-task-spring')).includes('hb-env-thicket'),
      'the deleted rule counted thicket'
    );
    assert.ok(
      !seamIds('hb-task-spring', 'task').includes('hb-env-thicket'),
      'the seam does not compose spring into thicket'
    );
  });

  it('hb-task-spring moves without its integer moving, which is why membership is asserted', () => {
    // The case that makes a count-based criterion useless: two environments before, two after,
    // and not the same two. An assertion on `.length` here passes while the answer changed
    // completely — so this arm compares the SETS, and pins the equal lengths as the reason.
    const before = deletedTaskCountRule(labRecord('hb-task-spring'));
    const after = seamIds('hb-task-spring', 'task');
    assert.deepEqual(before.toSorted(byCodeUnit), ['hb-env-grove', 'hb-env-thicket']);
    assert.deepEqual(after.toSorted(byCodeUnit), ['hb-env-grove', 'hb-env-ridge']);
    assert.equal(before.length, after.length, 'the integer does not move');
    assert.notDeepEqual(
      before.toSorted(byCodeUnit),
      after.toSorted(byCodeUnit),
      'the membership does'
    );
  });

  it('fixes the event fact, which was `enabledEventIds` membership and nothing else', () => {
    // Site 10 was match-blind, mode-blind, forced-blind, `disabledEventIds`-blind and did not even
    // filter disabled environments. `hb-event-wolves` is listed only by thicket, and grove and
    // ridge compose it automatically.
    assert.deepEqual(deletedEventCountRule(labRecord('hb-event-wolves')), ['hb-env-thicket']);
    assert.equal(seamIds('hb-event-wolves', 'event').length, 3, 'the event fact moves 1 to 3');
    assert.deepEqual(deletedEventCountRule(labRecord('hb-event-storm')).length, 3);
    assert.equal(
      seamIds('hb-event-storm', 'event').length,
      3,
      'and the other event does not move, so the fix is not a blanket increase'
    );
  });

  it('applies danger matching for events and not for tasks', () => {
    // Authored OUTSIDE the lab world on purpose: both lab events are danger-tag-less, so nothing
    // in the corpus above distinguishes `includeDanger: true` from `includeDanger: false`. This is
    // the one seam argument no other assertion can see.
    const deadly = { id: 'deadly-event', name: 'Deadly', enabled: true, dangerTags: ['deadly'] };
    const safeEnvironment = {
      id: 'env-safe',
      compositionMode: 'automatic',
      biomes: ['forest'],
      dangerTags: ['safe'],
    };
    const deadlyEnvironment = {
      id: 'env-deadly',
      compositionMode: 'automatic',
      biomes: ['forest'],
      dangerTags: ['deadly'],
    };
    const environments = [safeEnvironment, deadlyEnvironment];
    assert.deepEqual(
      activeEnvironmentsForRecord(deadly, environments, 'event', {}).map((entry) => entry.id),
      ['env-deadly'],
      'a deadly event composes only where the danger level admits it'
    );
    assert.deepEqual(
      activeEnvironmentsForRecord(deadly, environments, 'task', {}).map((entry) => entry.id),
      ['env-safe', 'env-deadly'],
      'the SAME record read as a task is danger-blind, so `kind` is not decoration'
    );
  });

  it('returns [] for a record disabled in the library, without consulting any environment', () => {
    const disabled = { ...labRecord('hb-task-forage'), enabled: false };
    assert.deepEqual(
      activeEnvironmentsForRecord(disabled, LAB_ENVIRONMENTS, 'task', {
        conditionSettings: LAB_CONDITION_SETTINGS,
      }),
      []
    );
    assert.deepEqual(activeEnvironmentsForRecord(null, LAB_ENVIRONMENTS, 'task', {}), []);
  });
});

describe('the seam — the conditions axis', () => {
  // Two kinds of case, because the conditions arguments are the part that decides the number and
  // each of the two is wrong in a way that fails SILENTLY. Sites 1, 3, 4, 6 and 7 consume the
  // condition-BLIND predicate and site 2's arm projects onto the three-state `composed` set rather
  // than the condition-aware `runtimeState`, so the axis belongs here and nowhere else.
  const environments = [
    { id: 'env-a', compositionMode: 'automatic', biomes: ['forest'], dangerTags: ['safe'] },
  ];
  const stormyTask = { id: 'stormy', name: 'Stormy', enabled: true, weather: ['storm'] };
  const nocturnalTask = { id: 'nocturnal', name: 'Nocturnal', enabled: true, timeOfDay: ['night'] };
  const ids = (record, conditionSettings) =>
    activeEnvironmentsForRecord(record, environments, 'task', { conditionSettings }).map(
      (entry) => entry.id
    );

  it('converts the SETTINGS shape to the CURRENT shape rather than passing it through', () => {
    // Passing `{ weather: { enabled, current } }` straight into `evaluateEnvironmentMatch`'s third
    // positional makes `normalizeConditionId` read `.id ?? .value ?? .label` off an object, return
    // `''`, and fail `conditionsMet` for every record with a non-empty weather or time list. The
    // failure is silent: a smaller number, no error. This case reds if the conversion is dropped.
    const stormy = {
      weather: { enabled: true, current: 'storm' },
      timeOfDay: { enabled: true, current: 'day' },
    };
    assert.deepEqual(conditionSettingsToCurrent(stormy), { weather: 'storm', timeOfDay: 'day' });
    assert.deepEqual(ids(stormyTask, stormy), ['env-a'], 'current weather satisfies the record');
  });

  it('reads the current conditions as a live gate, so the conversion is not asserted vacuously', () => {
    const clear = {
      weather: { enabled: true, current: 'clear' },
      timeOfDay: { enabled: true, current: 'day' },
    };
    assert.deepEqual(ids(stormyTask, clear), [], 'clear weather does not satisfy a storm record');
    assert.deepEqual(ids(nocturnalTask, clear), [], 'day does not satisfy a night record');
  });

  it('honours weather.enabled === false, which only `options.conditionSettings` carries', () => {
    // `evaluateEnvironmentMatch` reads the per-dimension enable gates off `options.conditionSettings`
    // and defaults that to `null`, which hard-codes both gates to TRUE. So a seam that passed only
    // the converted positional would start EXCLUDING records from a system that has weather
    // switched off — a fresh wrong number one argument over from the one above.
    assert.deepEqual(
      ids(stormyTask, {
        weather: { enabled: false, current: 'clear' },
        timeOfDay: { enabled: true, current: 'day' },
      }),
      ['env-a'],
      'a disabled weather dimension gates nothing'
    );
  });

  it('honours timeOfDay.enabled === false for the same reason', () => {
    assert.deepEqual(
      ids(nocturnalTask, {
        weather: { enabled: true, current: 'clear' },
        timeOfDay: { enabled: false, current: 'day' },
      }),
      ['env-a'],
      'a disabled time-of-day dimension gates nothing'
    );
  });

  it('substitutes the defaults when no conditions are recorded at all', () => {
    assert.deepEqual(conditionSettingsToCurrent(null), { weather: 'clear', timeOfDay: 'day' });
    assert.deepEqual(conditionSettingsToCurrent({ weather: { current: '' } }), {
      weather: 'clear',
      timeOfDay: 'day',
    });
    assert.deepEqual(ids(stormyTask, null), [], 'the default weather is clear, not "anything"');
  });
});

// ---------------------------------------------------------------------------
// The vocabulary. The three exported sets are the second half of the "one home" this change
// creates, and their exact membership is asserted here because that is what replaces the guard
// retired with `tests/components/environment-editor.test.js:497`'s source regex — a positive
// import assertion restores non-vacuity, but not the "these four are NOT in the included set"
// half at `:498-499`.
// ---------------------------------------------------------------------------

describe('the composition-state vocabulary', () => {
  it('is exactly eight states', () => {
    assert.deepEqual([...ENVIRONMENT_COMPOSITION_STATES].toSorted(byCodeUnit), [
      'candidate',
      'excluded',
      'explicitlyIncluded',
      'forceIncluded',
      'includedButUnavailable',
      'includedByMatch',
      'libraryDisabled',
      'notMatching',
    ]);
  });

  it('the INCLUDED subset is exactly four states, and carries includedButUnavailable', () => {
    assert.deepEqual([...ENVIRONMENT_INCLUDED_COMPOSITION_STATES].toSorted(byCodeUnit), [
      'explicitlyIncluded',
      'forceIncluded',
      'includedButUnavailable',
      'includedByMatch',
    ]);
    // The retired `:498-499` guard, restored as a positive assertion.
    for (const absent of ['excluded', 'candidate', 'notMatching', 'libraryDisabled']) {
      assert.ok(
        !ENVIRONMENT_INCLUDED_COMPOSITION_STATES.has(absent),
        `${absent} is not an included state`
      );
    }
  });

  it('the COMPOSED subset is exactly three states, and does NOT carry includedButUnavailable', () => {
    // The four-state and three-state sets are different things and conflating them is a silent
    // one-record error in either direction: a stale `enabled*Ids` entry for a record that no
    // longer matches is SHOWN to the GM and is NOT composed at runtime.
    assert.deepEqual([...ENVIRONMENT_COMPOSED_COMPOSITION_STATES].toSorted(byCodeUnit), [
      'explicitlyIncluded',
      'forceIncluded',
      'includedByMatch',
    ]);
    assert.ok(!ENVIRONMENT_COMPOSED_COMPOSITION_STATES.has('includedButUnavailable'));
    assert.equal(
      ENVIRONMENT_INCLUDED_COMPOSITION_STATES.size - ENVIRONMENT_COMPOSED_COMPOSITION_STATES.size,
      1,
      'the included set is the composed set plus exactly one shown-but-not-composed state'
    );
  });

  it('both subsets are subsets of the complete vocabulary', () => {
    for (const set of [
      ENVIRONMENT_INCLUDED_COMPOSITION_STATES,
      ENVIRONMENT_COMPOSED_COMPOSITION_STATES,
    ]) {
      for (const state of set) {
        assert.ok(ENVIRONMENT_COMPOSITION_STATES.has(state), `${state} is in the vocabulary`);
      }
    }
  });
});

describe('the vocabulary consumers that cannot import it', () => {
  it('compositionStateMeta.js has one entry per state and no entry for a state that does not exist', () => {
    // `compositionStateMeta.js` is import-free BY DESIGN — four mounted suites compile the pill
    // that renders it, none walks imports transitively, and an omission there hangs a suite rather
    // than failing it. So the mirror is proved here, in the one file that imports both sides.
    assert.deepEqual(
      Object.keys(COMPOSITION_STATE_META).toSorted(byCodeUnit),
      [...ENVIRONMENT_COMPOSITION_STATES].toSorted(byCodeUnit),
      'a state with no META entry renders no chip; a META entry with no state is dead presentation'
    );
    for (const state of ENVIRONMENT_COMPOSITION_STATES) {
      const meta = resolveCompositionStateMeta(state);
      assert.equal(meta, COMPOSITION_STATE_META[state], `${state} resolves to its own entry`);
      assert.ok(!meta.unknown, `${state} is not the unknown fallback`);
      for (const field of ['tone', 'icon', 'key', 'fallback']) {
        assert.ok(meta[field], `${state}.${field} is populated`);
      }
    }
  });

  it('an unrecognised state resolves to the unknown chip, not to a plausible wrong one', () => {
    // The previous fallback was `META[state] || META.candidate`, which drew a confident "Matching
    // candidate" — a state the GM can act on — for a state nothing had registered. #1315 adds a
    // state to this vocabulary, so that branch is one change away from being reachable.
    const meta = resolveCompositionStateMeta('partiallyIncluded');
    assert.equal(meta, UNKNOWN_COMPOSITION_STATE_META);
    assert.equal(meta.unknown, true);
    assert.notEqual(
      meta.icon,
      COMPOSITION_STATE_META.candidate.icon,
      'the unknown glyph is not the candidate glyph, or the fix reproduces the confusion'
    );
  });

  it('every META localization key exists in lang/en.json', () => {
    const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
    const catalogue = lang.FABRICATE.Admin.Manager.EnvironmentEditor.Composition;
    for (const meta of [...Object.values(COMPOSITION_STATE_META), UNKNOWN_COMPOSITION_STATE_META]) {
      assert.ok(catalogue[meta.key], `FABRICATE...Composition.${meta.key} is authored`);
    }
  });

  it('environmentReadiness raises staleIncluded for exactly one state in the vocabulary', () => {
    // `environmentReadiness.js` keeps its `'includedButUnavailable'` STRING LITERAL: it tests a
    // single state rather than set membership, and the module's contract is that it has no import
    // graph. It is also the one home where an unregistered state does not render wrongly — it
    // silently stops raising the critical issue, and an environment ships enabled that should not
    // be. So the guard is behavioural: call the exported predicate once per state.
    const raising = [];
    for (const state of ENVIRONMENT_COMPOSITION_STATES) {
      const { issues } = evaluateEnvironmentReadiness(
        { name: 'Env', enabled: true },
        {
          counts: { availableTasks: 1, availableEvents: 1 },
          tasks: [{ id: 'r', kind: 'task', compositionState: state, record: { name: 'R' } }],
          events: [],
        }
      );
      if (issues.some((issue) => issue.id === 'staleIncluded')) raising.push(state);
    }
    assert.deepEqual(
      raising,
      ['includedButUnavailable'],
      'the stale-included enable blocker fires for exactly the shown-but-not-composed state'
    );
  });

  it('that staleIncluded issue is critical and blocks enable, so the guard above has teeth', () => {
    const { issues } = evaluateEnvironmentReadiness(
      { name: 'Env', enabled: true },
      {
        counts: { availableTasks: 1, availableEvents: 1 },
        tasks: [
          {
            id: 'stale',
            kind: 'task',
            compositionState: 'includedButUnavailable',
            record: { name: 'Stale' },
          },
        ],
        events: [],
      }
    );
    const stale = issues.find((issue) => issue.id === 'staleIncluded');
    assert.ok(stale, 'the issue is raised');
    assert.equal(stale.severity, 'critical');
    assert.equal(stale.recordId, 'stale');
  });
});
