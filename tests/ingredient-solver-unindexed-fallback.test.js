/**
 * The solver's unindexed fallbacks (issue 1812): `createIngredientSolver` always mints a pass
 * index, so `scannedEssenceCarriers` and the matcher-filter branch of `candidateStacksForOption`
 * are reachable only by calling the modules directly. Each must answer exactly what the indexed
 * branch answers, while consulting the probe or matcher the index would have made unnecessary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { buildPassIndexDefault } = await import('../src/models/ingredientAssignment.js');
const { buildEssenceIndex, essenceBlockMember, resolveEssenceBlock } =
  await import('../src/models/ingredientEssenceBlock.js');
const { candidateStacksForOption, seedRemaining } =
  await import('../src/models/ingredientLedger.js');

const stack = (uuid, quantity, extra = {}) => ({
  uuid,
  system: { quantity },
  componentId: null,
  tags: [],
  essences: {},
  ...extra,
});

/** Includes a repeated uuid (deduped by both paths) and stacks the ledger can mark exhausted. */
const ITEMS = [
  stack('held-0', 3, { componentId: 'cmp-a', tags: ['iron'], essences: { fire: 2 } }),
  stack('held-1', 2, { componentId: 'cmp-b', tags: ['wood'], essences: { earth: 1 } }),
  stack('held-1', 5, { componentId: 'cmp-b', tags: ['wood'], essences: { earth: 4 } }),
  stack('held-2', 4, {
    componentId: 'cmp-a',
    tags: ['iron', 'ember'],
    essences: { fire: 1, earth: 1 },
  }),
  stack('held-3', 1, { tags: ['ember'], essences: { fire: 3 } }),
  stack('held-4', 6, { componentId: 'cmp-c' }),
];

const MATCHER = (option, item) => {
  const match = option?.match;
  if (match?.type === 'component') return item.componentId === match.componentId;
  if (match?.type === 'tags') return (match.tags || []).some((tag) => item.tags.includes(tag));
  return false;
};

const componentOption = (componentId) => ({
  quantity: 1,
  match: { type: 'component', componentId },
});
const tagOption = (...tags) => ({ quantity: 1, match: { type: 'tags', tags, tagMatch: 'any' } });
const essenceOption = (essenceId, amount) => ({
  quantity: 1,
  match: { type: 'essence', essenceId, amount },
});

/** A probe that counts its calls, reading the fixture's own essence map. */
function countingProbe() {
  const probe = (item) => {
    probe.calls += 1;
    return item.essences;
  };
  probe.calls = 0;
  return probe;
}

const ESSENCE_CASES = [
  ['one essence, plentiful', [essenceOption('fire', 2)], {}],
  ['two essences from shared carriers', [essenceOption('fire', 3), essenceOption('earth', 2)], {}],
  ['an essence nobody carries', [essenceOption('water', 1)], {}],
  [
    'a carrier exhausted by the other groups',
    [essenceOption('fire', 2)],
    { exhausted: ['held-0', 'held-3'] },
  ],
  [
    'a caller allocation clamped to the carriers',
    [essenceOption('fire', 2), essenceOption('earth', 1)],
    { essenceAllocation: { 'held-0': 99, 'held-2': 1 } },
  ],
];

for (const [label, options, { exhausted = [], essenceAllocation } = {}] of ESSENCE_CASES) {
  test(`resolveEssenceBlock: no pass index answers what the built essence index answers (${label})`, () => {
    const group = { id: 'g-essence', options };
    const members = options.map((option) => essenceBlockMember(group, option));
    const remainingFor = () => {
      const remaining = seedRemaining(ITEMS);
      for (const key of exhausted) remaining.set(key, 0);
      return remaining;
    };

    const scanProbe = countingProbe();
    const scanned = resolveEssenceBlock(members, ITEMS, remainingFor(), {
      resolveEssences: scanProbe,
      essenceAllocation,
    });

    const indexProbe = countingProbe();
    const ctx = { resolveEssences: indexProbe, essenceAllocation };
    ctx.index = { essence: buildEssenceIndex(ITEMS, members, ctx) };
    const buildCalls = indexProbe.calls;
    const indexed = resolveEssenceBlock(members, ITEMS, remainingFor(), ctx);

    assert.deepEqual(scanned, indexed);
    assert.ok(scanProbe.calls > 0, 'the unindexed branch probed the held stacks');
    assert.equal(indexProbe.calls, buildCalls, 'the indexed branch probed nothing after the build');
  });
}

test('resolveEssenceBlock: the unindexed scan finds carriers and dedupes a repeated stack key', () => {
  const group = { id: 'g-essence', options: [essenceOption('fire', 2), essenceOption('earth', 2)] };
  const members = group.options.map((option) => essenceBlockMember(group, option));

  const result = resolveEssenceBlock(members, ITEMS, seedRemaining(ITEMS), {
    resolveEssences: (item) => item.essences,
  });

  assert.deepEqual(
    result.carriers.map((carrier) => carrier.itemKey),
    ['held-0', 'held-1', 'held-2', 'held-3'],
    'each carrier once, in held order, the repeated key kept at its first stack'
  );
  assert.ok(result.carriers[1].item === ITEMS[1], 'the first stack with the repeated key wins');
});

const CANDIDATE_CASES = [
  ['a component option', componentOption('cmp-a'), MATCHER],
  ['a component option matching two stacks of one key', componentOption('cmp-b'), MATCHER],
  ['a tag option', tagOption('ember'), MATCHER],
  ['an option nothing matches', componentOption('cmp-none'), MATCHER],
  [
    'an option carrying its own matches() and no matcher',
    { quantity: 1, match: { type: 'component' }, matches: (item) => item.componentId === 'cmp-c' },
    null,
  ],
];

for (const [label, option, matcher] of CANDIDATE_CASES) {
  for (const restrictItemId of [null, 'held-2', 'held-4']) {
    test(`candidateStacksForOption: no pass index answers what the built index answers (${label}, restrict ${restrictItemId})`, () => {
      let scans = 0;
      const countingMatcher = matcher
        ? (opt, item) => {
            scans += 1;
            return matcher(opt, item);
          }
        : null;

      const scanned = candidateStacksForOption(option, restrictItemId, {
        index: null,
        matcher: countingMatcher,
        availableItems: ITEMS,
      });
      const scansWithoutIndex = scans;

      const index = buildPassIndexDefault(
        ITEMS,
        matcher,
        {},
        { ingredientGroups: [{ options: [option] }] }
      );
      scans = 0;
      const indexed = candidateStacksForOption(option, restrictItemId, {
        index,
        matcher: countingMatcher,
        availableItems: ITEMS,
      });

      assert.deepEqual(scanned, indexed);
      if (matcher) {
        assert.equal(
          scansWithoutIndex,
          ITEMS.length,
          'the unindexed branch matched every held stack'
        );
        assert.equal(scans, 0, 'the indexed branch never re-ran the matcher');
      }
    });
  }
}

test('candidateStacksForOption: the unindexed branch returns a non-empty answer for a matching option', () => {
  const answer = candidateStacksForOption(componentOption('cmp-a'), null, {
    index: null,
    matcher: MATCHER,
    availableItems: ITEMS,
  });
  assert.deepEqual(
    answer.map((item) => item.uuid),
    ['held-0', 'held-2']
  );
});
