/**
 * The companion contract's vocabulary (issue 1289).
 *
 * `src/systems/companionContract.js` is what a companion module reads BEFORE it calls
 * anything: the version it can check, the member set it may depend on, the outcome tokens it
 * branches on, and the two normalizers that decide what a caller is allowed to persist. None
 * of it touches Foundry, so all of it is testable here — and all of it is a published
 * promise, so the parts that may not drift are pinned by equality rather than by spot-check.
 *
 * The member RESOLUTION assertion — that each row's `host` and `path` find a real member on
 * the live facade — belongs to the facade suite, because `src/main.js` cannot be imported
 * under `node --test`. What is checked here is the property that makes that assertion
 * mechanical: every row declares a host from the closed host set and a path that is a bare
 * property name.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { LEARNED_RECIPES_FLAG_KEY } from '../src/config/flags.js';
import {
  AFFORDABILITY_MESSAGE_KEYS,
  BULK_CHECK_DECISION_MESSAGE_KEYS,
  CHECK_ROLL_DEFAULT_LABEL,
  CHECK_ROLL_MESSAGE_KEYS,
  COMPANION_CALL_SITES,
  COMPANION_CONTRACT,
  COMPANION_CONTRACT_SCHEMA_VERSION,
  COMPANION_MEMBERS,
  COMPANION_MEMBER_HOSTS,
  COMPANION_MEMBER_KINDS,
  COMPANION_OUTCOMES,
  COMPANION_PROMISES,
  COMPONENT_AWARD_ENTRY_OUTCOMES,
  COMPONENT_AWARD_MESSAGE_KEYS,
  CURRENCY_CREDIT_MESSAGE_KEYS,
  AWARD_ENTRIES_MAX,
  GRANTED_BY_MAX_LENGTH,
  GRANTED_SOURCE_MESSAGE_KEYS,
  KNOWLEDGE_GRANT_MESSAGE_KEYS,
  POOLED_ACTORS_MAX,
  POOLED_COSTS_MAX,
  POOLED_HOLDINGS_CONSUME_ENTRY_OUTCOMES,
  POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS,
  POOLED_HOLDINGS_READ_ENTRY_OUTCOMES,
  POOLED_HOLDINGS_READ_MESSAGE_KEYS,
  affordabilityResult,
  bulkCheckDecisionResult,
  checkRollResult,
  componentAwardResult,
  currencyCreditResult,
  knowledgeGrantResult,
  normalizeGrantedBy,
  pooledHoldingsConsumeResult,
  pooledHoldingsReadResult,
} from '../src/systems/companionContract.js';
import {
  assertContractResult,
  assertLocalizationKey,
  assertMessageIsFromTable,
  localizedString,
} from './helpers/companionContractOutcomes.js';

/**
 * The declared member set, as `[name, host, promise, kind]`.
 *
 * Hoisted and frozen so the refusal and shape tables below are data rather than repeated
 * literals. Adding a member is deliberately a change HERE too: the compatibility promise
 * allows a new member without a version bump, and this row is where that addition becomes
 * visible to a reviewer alongside the docs table it must also appear in.
 */
const EXPECTED_MEMBERS = Object.freeze([
  ['schemaVersion', 'contract', 'stable', 'value'],
  ['grantRecipeKnowledge', 'facade', 'stable', 'method'],
  ['checkAffordability', 'facade', 'stable', 'method'],
  ['getCurrencyConfigStore', 'facade', 'handle', 'accessor'],
  ['getActorPropertyCoinSpender', 'facade', 'handle', 'accessor'],
  ['getActorInventoryCoinSpender', 'facade', 'handle', 'accessor'],
  ['getCraftingEngine', 'facade', 'handle', 'accessor'],
  ['getCraftingEngine().findComponentItems', 'craftingEngine', 'handle', 'method'],
  // APPENDED, never interleaved: `getCraftingEngine().findComponentItems` is named as "the
  // eighth member" at four sites — twice in `tests/companion-facade.test.js`, once below, and
  // once in `companionContract.js` itself — and a row inserted above it would falsify all four
  // with nothing failing.
  ['rollActorCheck', 'facade', 'stable', 'method'],
  ['resolveBulkCheckDecision', 'facade', 'stable', 'method'],
  ['awardComponents', 'facade', 'stable', 'method'],
  ['creditCurrency', 'facade', 'stable', 'method'],
  // Appended again for the same reason, one issue later (1342). These two are the first
  // members addressed by actor UUID rather than by id, and `consumePooledHoldings` is the
  // first that REMOVES value.
  ['readPooledHoldings', 'facade', 'stable', 'method'],
  ['consumePooledHoldings', 'facade', 'stable', 'method'],
]);

/** Every outcome token declared for this `schemaVersion`, closed by enumeration. */
const EXPECTED_OUTCOMES = Object.freeze([
  'gmOnly',
  'noActor',
  'notReady',
  'granted',
  'alreadyKnown',
  'recipeNotFound',
  'systemNotFound',
  'knowledgeNotObservable',
  'invalidGrantedBy',
  'grantedByTooLong',
  'grantFailed',
  'affordable',
  'notAffordable',
  'unitNotFound',
  'invalidAmount',
  'ladderEmpty',
  'ladderInvalid',
  'checkUnavailable',
  'checkPassed',
  'checkFailed',
  'rolled',
  'rollFailed',
  'engineUnavailable',
  'noFormula',
  'invalidRollDecision',
  'cancelled',
  'invalidCallSite',
  'notElected',
  'decided',
  'nothingToDecide',
  // awardComponents (issue 1301). `awarded` and `awardFailed` are answered at BOTH levels; the
  // three after them are ENTRY-level only and can never be a call-level `outcome`.
  'awarded',
  'partiallyAwarded',
  'awardFailed',
  'componentNotFound',
  'invalidQuantity',
  'multiUnitUnsupported',
  'invalidAwards',
  // creditCurrency (issue 1301): four outcomes carrying three values of `credited`.
  'credited',
  'creditFailed',
  'creditUnavailable',
  'creditNotConfigured',
  // readPooledHoldings (issue 1342). `read` and `readFailed` are answered at BOTH levels; the
  // six after them are READING-level only and can never be a call-level `outcome`, and
  // `invalidCosts`/`invalidActorUuids` are the two call-level request refusals.
  'read',
  'readFailed',
  'balanceNotConfigured',
  'toolNotFound',
  'invalidCostType',
  'costTypeUnsupported',
  'invalidCosts',
  'invalidActorUuids',
  // consumePooledHoldings (issue 1342). Neither `costNotFound` nor `partiallyConsumed` is
  // here, and their absence is asserted rather than remembered further down.
  'consumed',
  'consumeFailed',
  'insufficient',
  'notAttempted',
]);

/**
 * Every `stable` member's own key table, with the SHARED gate outcomes that member can answer.
 *
 * `shared` differs per member and that is the point: `resolveBulkCheckDecision` takes no
 * `actorId`, reads no actor and is GM-gated inline, so `noActor` is not merely unused there —
 * it is unanswerable, and declaring a key for it would be dead vocabulary a caller would
 * nonetheless write a branch for.
 */
const MEMBER_KEY_TABLES = Object.freeze([
  Object.freeze({
    name: 'grantRecipeKnowledge',
    keys: KNOWLEDGE_GRANT_MESSAGE_KEYS,
    shared: Object.freeze(['gmOnly', 'noActor', 'notReady']),
  }),
  Object.freeze({
    name: 'checkAffordability',
    keys: AFFORDABILITY_MESSAGE_KEYS,
    shared: Object.freeze(['gmOnly', 'noActor', 'notReady']),
  }),
  Object.freeze({
    name: 'rollActorCheck',
    keys: CHECK_ROLL_MESSAGE_KEYS,
    shared: Object.freeze(['gmOnly', 'noActor', 'notReady']),
  }),
  Object.freeze({
    name: 'resolveBulkCheckDecision',
    keys: BULK_CHECK_DECISION_MESSAGE_KEYS,
    shared: Object.freeze(['gmOnly', 'notReady']),
  }),
  Object.freeze({
    name: 'awardComponents',
    keys: COMPONENT_AWARD_MESSAGE_KEYS,
    shared: Object.freeze(['gmOnly', 'noActor', 'notReady']),
  }),
  Object.freeze({
    name: 'creditCurrency',
    keys: CURRENCY_CREDIT_MESSAGE_KEYS,
    shared: Object.freeze(['gmOnly', 'noActor', 'notReady']),
  }),
  Object.freeze({
    name: 'readPooledHoldings',
    keys: POOLED_HOLDINGS_READ_MESSAGE_KEYS,
    shared: Object.freeze(['gmOnly', 'noActor', 'notReady']),
  }),
  Object.freeze({
    name: 'consumePooledHoldings',
    keys: POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS,
    shared: Object.freeze(['gmOnly', 'noActor', 'notReady']),
  }),
]);

/** The two grant outcomes that answer `success: true`. */
const GRANT_SUCCESSES = Object.freeze(['granted', 'alreadyKnown']);
/** The two affordability outcomes that answer `success: true`. */
const AFFORDABILITY_ANSWERS = Object.freeze([
  ['affordable', true],
  ['notAffordable', false],
]);

const SIXTY_FOUR = 'f'.repeat(GRANTED_BY_MAX_LENGTH);

/**
 * `grantedBy` values the contract ACCEPTS, with the value it persists.
 *
 * The boundary rows are the point: 64 characters after trimming is accepted, and whitespace
 * is trimmed BEFORE the length is measured, so a padded label at the limit is not refused for
 * padding the caller never meant to send.
 */
const ACCEPTED_GRANTED_BY = Object.freeze([
  Object.freeze({ label: 'omitted', input: undefined, value: null }),
  Object.freeze({ label: 'null', input: null, value: null }),
  Object.freeze({ label: 'an empty string', input: '', value: null }),
  Object.freeze({ label: 'whitespace only', input: '   \t\n ', value: null }),
  Object.freeze({
    label: 'a padded label',
    input: '  downtime-companion  ',
    value: 'downtime-companion',
  }),
  Object.freeze({ label: 'exactly the limit', input: SIXTY_FOUR, value: SIXTY_FOUR }),
  Object.freeze({ label: 'the limit, padded', input: `  ${SIXTY_FOUR}  `, value: SIXTY_FOUR }),
]);

/**
 * `grantedBy` values the contract REFUSES, each with the outcome it refuses with.
 *
 * Every non-string type is its own row rather than a single "not a string" case, because they
 * fail for different reasons in a reader's head — a number and a boolean look coercible, an
 * ARRAY looks like it would be dropped by the entry-boundary reader and is not, and a
 * `String` object passes a `typeof`-free duck test. Nothing here is truncated or coerced: an
 * over-long module id names a DIFFERENT module.
 */
const REFUSED_GRANTED_BY = Object.freeze([
  Object.freeze({
    label: 'one character over the limit',
    input: `${SIXTY_FOUR}f`,
    outcome: 'grantedByTooLong',
  }),
  Object.freeze({
    label: 'a long label with padding inside the limit',
    input: `${SIXTY_FOUR} f `,
    outcome: 'grantedByTooLong',
  }),
  Object.freeze({ label: 'a number', input: 12, outcome: 'invalidGrantedBy' }),
  Object.freeze({ label: 'zero', input: 0, outcome: 'invalidGrantedBy' }),
  Object.freeze({ label: 'NaN', input: Number.NaN, outcome: 'invalidGrantedBy' }),
  Object.freeze({ label: 'true', input: true, outcome: 'invalidGrantedBy' }),
  Object.freeze({ label: 'false', input: false, outcome: 'invalidGrantedBy' }),
  Object.freeze({ label: 'a plain object', input: { id: 'x' }, outcome: 'invalidGrantedBy' }),
  Object.freeze({ label: 'an empty array', input: [], outcome: 'invalidGrantedBy' }),
  Object.freeze({ label: 'an array of strings', input: ['x'], outcome: 'invalidGrantedBy' }),
  Object.freeze({ label: 'a function', input: () => 'x', outcome: 'invalidGrantedBy' }),
  Object.freeze({ label: 'a symbol', input: Symbol('x'), outcome: 'invalidGrantedBy' }),
  Object.freeze({ label: 'a boxed String', input: new String('x'), outcome: 'invalidGrantedBy' }),
]);

/**
 * The interpolation bag each outcome's STRING needs, spelled the way the members supply it.
 *
 * `message` is a localization key and Foundry's `format()` leaves an unsupplied `{name}`
 * verbatim, so an answer that omits one shows a GM the braces. The shared
 * `assertMessageDataCovers` checks that for every answer; these tables are what let the loops
 * below build an answer that is COMPLETE rather than one no member would ever emit.
 *
 * Deliberately LITERAL, not derived from the strings. Deriving the bag from the very text the
 * completeness assertion reads would make that assertion a tautology at exactly the two loops
 * that walk every outcome — whereas written out, a placeholder added to a string with no
 * author here fails instead.
 */
const GRANT_MESSAGE_DATA = Object.freeze({
  granted: Object.freeze({ recipe: 'Balm', actor: 'Idrin' }),
  alreadyKnown: Object.freeze({ recipe: 'Balm', actor: 'Idrin' }),
  systemNotFound: Object.freeze({ recipe: 'Balm', actor: 'Idrin' }),
  knowledgeNotObservable: Object.freeze({
    recipe: 'Balm',
    actor: 'Idrin',
    visibilityMode: 'global',
    resolutionMode: 'simple',
  }),
  grantedByTooLong: Object.freeze({ max: GRANTED_BY_MAX_LENGTH }),
});

/** The same, for `checkAffordability`. `detail` carries the currency layer's free text. */
const AFFORDABILITY_MESSAGE_DATA = Object.freeze({
  affordable: Object.freeze({ actor: 'Idrin', amount: 1, unit: 'gp' }),
  notAffordable: Object.freeze({ actor: 'Idrin', amount: 1, unit: 'gp' }),
  unitNotFound: Object.freeze({ unit: 'quatloo' }),
  ladderInvalid: Object.freeze({ detail: 'a cycle' }),
  checkUnavailable: Object.freeze({ detail: 'a cycle' }),
});

function grantAnswer(outcome, messageData = null) {
  const expected = {
    success: GRANT_SUCCESSES.includes(outcome),
    outcome,
    message: KNOWLEDGE_GRANT_MESSAGE_KEYS[outcome],
  };
  if (messageData) expected.messageData = messageData;
  return expected;
}

function affordabilityAnswer(outcome, affordable, messageData = null) {
  const expected = {
    success: affordable !== null,
    affordable,
    outcome,
    message: AFFORDABILITY_MESSAGE_KEYS[outcome],
  };
  if (messageData) expected.messageData = messageData;
  return expected;
}

test('the descriptor publishes exactly the four contract fields, frozen', () => {
  assert.ok(Object.isFrozen(COMPANION_CONTRACT), 'the descriptor is frozen');
  assert.deepEqual(Object.keys(COMPANION_CONTRACT), [
    'schemaVersion',
    'members',
    'outcomes',
    'callSites',
  ]);
  assert.equal(COMPANION_CONTRACT.schemaVersion, COMPANION_CONTRACT_SCHEMA_VERSION);
  assert.equal(Number.isInteger(COMPANION_CONTRACT_SCHEMA_VERSION), true);
  assert.ok(COMPANION_CONTRACT_SCHEMA_VERSION >= 1, 'a published version starts at 1');
  assert.equal(COMPANION_CONTRACT.members, COMPANION_MEMBERS);
  assert.equal(COMPANION_CONTRACT.outcomes, COMPANION_OUTCOMES);
  // `callSite` is the one REQUIRED, no-default, refused-on-mismatch input the contract has,
  // and the docs' worked examples are what an author copies. Publishing the pair is what lets
  // them read `COMPANION.callSites.broadcast` instead of retyping a literal whose only
  // punishment for a typo is `invalidCallSite`.
  assert.equal(COMPANION_CONTRACT.callSites, COMPANION_CALL_SITES);
  assert.ok(Object.isFrozen(COMPANION_CONTRACT.members), 'the member table is frozen');
  assert.ok(Object.isFrozen(COMPANION_CONTRACT.outcomes), 'the outcome vocabulary is frozen');
  assert.ok(Object.isFrozen(COMPANION_CONTRACT.callSites), 'the call-site pair is frozen');
});

test('the member table is exactly the declared set at its declared promise tiers', () => {
  assert.deepEqual(
    COMPANION_MEMBERS.map((member) => [member.name, member.host, member.promise, member.kind]),
    EXPECTED_MEMBERS.map((row) => [...row]),
    'members, hosts, promise tiers and kinds are the published contract'
  );
  const names = COMPANION_MEMBERS.map((member) => member.name);
  assert.equal(new Set(names).size, names.length, 'member names are unique');
});

test('AC-1 — the member table grew by APPENDING, and the eighth member did not move', () => {
  assert.equal(
    COMPANION_MEMBERS.length,
    14,
    'ten members, plus the award and the credit, plus the pooled read and the pooled consume'
  );
  assert.deepEqual(
    [COMPANION_MEMBERS[10].name, COMPANION_MEMBERS[11].name],
    ['awardComponents', 'creditCurrency'],
    'the award and the credit did not move off indices 10 and 11'
  );
  assert.deepEqual(
    [COMPANION_MEMBERS[12].name, COMPANION_MEMBERS[13].name],
    ['readPooledHoldings', 'consumePooledHoldings'],
    'the two pooled rows are at indices 12 and 13, appended after them'
  );
  // The index assertion is the point: four sites name this row "the eighth member", and an
  // interleaved row falsifies all of them with no assertion noticing.
  assert.equal(COMPANION_MEMBERS[7].name, 'getCraftingEngine().findComponentItems');
});

test('AC-2 — success is DERIVED, and every new token is declared in all three places', () => {
  // `buildResult` computes `success` as membership of `SUCCESSFUL_OUTCOMES` AND the presence
  // of the outcome in the member's OWN key table, so an omission from EITHER place flips a
  // published boolean with nothing else failing. That trap already nearly fired once: omitting
  // the two bulk outcomes would have made both of `resolveBulkCheckDecision`'s answers report
  // `success: false`.
  const SUCCEEDS = [
    ['awarded', () => componentAwardResult('awarded', null, { placements: [] })],
    ['partiallyAwarded', () => componentAwardResult('partiallyAwarded', null, { placements: [] })],
    ['credited', () => currencyCreditResult('credited', null, { amount: 1 })],
  ];
  for (const [outcome, build] of SUCCEEDS) {
    assert.equal(build().success, true, `${outcome} is an act that HAPPENED`);
  }

  const FAILS = [
    ['awardFailed', () => componentAwardResult('awardFailed', null, { placements: [] })],
    ['creditFailed', () => currencyCreditResult('creditFailed', { detail: '' })],
    ['creditUnavailable', () => currencyCreditResult('creditUnavailable', { detail: '' })],
    ['creditNotConfigured', () => currencyCreditResult('creditNotConfigured', { detail: '' })],
  ];
  for (const [outcome, build] of FAILS) {
    assert.equal(build().success, false, `${outcome} is an act that did NOT happen`);
  }

  // All three places, named: the vocabulary, the member's key table, and the success list —
  // the last asserted THROUGH the boolean above rather than by reaching into a private const.
  for (const outcome of ['awarded', 'partiallyAwarded', 'awardFailed', 'invalidAwards']) {
    assert.ok(COMPANION_OUTCOMES[outcome], `${outcome} is declared`);
    assert.ok(COMPONENT_AWARD_MESSAGE_KEYS[outcome], `${outcome} has a key`);
  }
  for (const outcome of ['credited', 'creditFailed', 'creditUnavailable', 'creditNotConfigured']) {
    assert.ok(COMPANION_OUTCOMES[outcome], `${outcome} is declared`);
    assert.ok(CURRENCY_CREDIT_MESSAGE_KEYS[outcome], `${outcome} has a key`);
  }
  // And the entry-only three are keys WITHOUT being call-level answers, which is what the
  // dead-vocabulary sweep forces and what makes the call-level set computable by subtraction.
  for (const outcome of COMPONENT_AWARD_ENTRY_OUTCOMES) {
    assert.ok(COMPONENT_AWARD_MESSAGE_KEYS[outcome], `${outcome} is a table key`);
  }
  assert.equal(COMPONENT_AWARD_ENTRY_OUTCOMES.length, 3);
  assert.ok(Object.isFrozen(COMPONENT_AWARD_ENTRY_OUTCOMES));
  assert.equal(AWARD_ENTRIES_MAX, 64, 'the published bound is a value a caller can read');
});

test('every member row carries a resolvable host and path shape', () => {
  const hosts = new Set(Object.values(COMPANION_MEMBER_HOSTS));
  const promises = new Set(Object.values(COMPANION_PROMISES));
  const kinds = new Set(Object.values(COMPANION_MEMBER_KINDS));
  for (const member of COMPANION_MEMBERS) {
    assert.ok(Object.isFrozen(member), `${member.name} is frozen`);
    assert.deepEqual(Object.keys(member), ['name', 'host', 'path', 'promise', 'kind'], member.name);
    assert.ok(member.name.length > 0, 'a member is named');
    assert.ok(hosts.has(member.host), `${member.name} declares a known host, got ${member.host}`);
    assert.match(
      member.path,
      /^[A-Za-z_$][A-Za-z0-9_$]*$/,
      `${member.name} reads a bare property name off its host, so a resolver needs no parsing`
    );
    assert.ok(promises.has(member.promise), `${member.name} declares a promise tier`);
    assert.ok(kinds.has(member.kind), `${member.name} declares a member kind`);
  }
});

test('the one contract-hosted member resolves through its own declared path', () => {
  // The other seven hosts do not exist until `src/main.js` builds the facade, but this row
  // can be resolved here — and it is the row a flat name list could not have described,
  // because the value it names is a number rather than a function.
  const [version] = COMPANION_MEMBERS.filter(
    (member) => member.host === COMPANION_MEMBER_HOSTS.contract
  );
  assert.equal(version.name, 'schemaVersion');
  assert.equal(COMPANION_CONTRACT[version.path], COMPANION_CONTRACT_SCHEMA_VERSION);
  assert.equal(typeof COMPANION_CONTRACT[version.path], 'number');
});

test('the outcome vocabulary is complete for this schema version and maps token to token', () => {
  assert.deepEqual(Object.keys(COMPANION_OUTCOMES), [...EXPECTED_OUTCOMES]);
  for (const [name, token] of Object.entries(COMPANION_OUTCOMES)) {
    assert.equal(token, name, 'each outcome maps to its own token so callers never guess');
  }
});

test('every declared outcome is emittable by a member, and every member outcome is declared', () => {
  const declared = new Set(Object.values(COMPANION_OUTCOMES));
  const emittable = new Set(MEMBER_KEY_TABLES.flatMap(({ keys }) => Object.keys(keys)));
  assert.deepEqual(
    [...declared].filter((outcome) => !emittable.has(outcome)),
    [],
    'a declared outcome no member can answer with is dead vocabulary'
  );
  assert.deepEqual(
    [...emittable].filter((outcome) => !declared.has(outcome)),
    [],
    'a member outcome missing from the vocabulary is an undeclared refusal'
  );
});

test('each member answers its OWN shared gate outcomes, in its OWN words', () => {
  // PER MEMBER, not a four-way product. `resolveBulkCheckDecision` takes no `actorId`, reads
  // no actor and is GM-gated inline, so it can never answer `noActor` — a fixed
  // `['gmOnly','noActor','notReady']` loop asserted over every table would demand a key it
  // must not have, and would contradict the criterion that pins its absence.
  for (const { name, keys, shared } of MEMBER_KEY_TABLES) {
    for (const outcome of shared) {
      assertLocalizationKey(keys[outcome], `${name}'s ${outcome}`);
    }
    for (const outcome of ['gmOnly', 'noActor', 'notReady']) {
      assert.equal(
        keys[outcome] !== undefined,
        shared.includes(outcome),
        `${name} declares exactly the shared gate outcomes it can actually answer`
      );
    }
  }
  // Pairwise distinctness across ALL FOUR members: a failed grant must not report itself in
  // the currency check's words, and a refused check roll must not report itself in either's.
  for (const left of MEMBER_KEY_TABLES) {
    for (const right of MEMBER_KEY_TABLES) {
      if (left.name === right.name) continue;
      const overlap = Object.values(left.keys).filter((key) =>
        Object.values(right.keys).includes(key)
      );
      assert.deepEqual(overlap, [], `${left.name} and ${right.name} share a message string`);
    }
  }
});

test('every outcome message key resolves to a string leaf in lang/en.json', () => {
  for (const { name, keys } of MEMBER_KEY_TABLES) {
    for (const [outcome, key] of Object.entries(keys)) {
      assertLocalizationKey(key, `${name}'s ${outcome}`);
    }
  }
  assert.match(
    localizedString(KNOWLEDGE_GRANT_MESSAGE_KEYS.knowledgeNotObservable),
    /\{visibilityMode\}[\s\S]*\{resolutionMode\}/,
    'a GM refused for observability is told which two modes decided it'
  );
  for (const outcome of ['ladderInvalid', 'checkUnavailable']) {
    assert.match(
      localizedString(AFFORDABILITY_MESSAGE_KEYS[outcome]),
      /\{detail\}/,
      `${outcome} carries the currency layer's free text as messageData.detail`
    );
  }
  // The literal `{detail}` is what makes `assertMessageDataCovers` derive the requirement
  // automatically, so a `rollFailed` answer that forgot its bag fails at the member rather
  // than showing a GM the braces.
  assert.match(
    localizedString(CHECK_ROLL_MESSAGE_KEYS.rollFailed),
    /\{detail\}/,
    "a failed roll carries the runner's free text as messageData.detail"
  );
  // `assertMessageDataCovers` derives its requirement FROM the string, which makes it a
  // one-way guard: it catches a string that GAINS a placeholder and is blind to one that
  // LOSES it. These are the other direction. Dropping `{count}` from `Decided` would leave
  // every answer's bag over-supplied and silently correct, while a GM reads a sentence that
  // no longer says how much of their batch was covered.
  assert.match(
    localizedString(BULK_CHECK_DECISION_MESSAGE_KEYS.decided),
    /\{count\}[\s\S]*\{total\}/,
    'a settled decision names how many of how many checks it covers, count first'
  );
  for (const outcome of ['checkPassed', 'checkFailed']) {
    assert.match(
      localizedString(CHECK_ROLL_MESSAGE_KEYS[outcome]),
      /\{label\}[\s\S]*\{total\}[\s\S]*\{dc\}/,
      `the graded ${outcome} names the DC it was measured against`
    );
  }
  assert.match(
    localizedString(CHECK_ROLL_MESSAGE_KEYS.rolled),
    /\{label\}[\s\S]*\{total\}/,
    'the ungraded answer names no DC, because it was measured against none'
  );
  assert.doesNotMatch(
    localizedString(CHECK_ROLL_MESSAGE_KEYS.rolled),
    /\{dc\}/,
    'and must not, because the ungraded arm supplies no dc to interpolate'
  );
  // The two graded strings are otherwise IDENTICAL but for one word, so nothing above can see
  // them swapped in `lang/en.json` — and swapped, every passing check reports itself as a
  // failure to the GM's chat log. The word is the only thing that distinguishes them.
  assert.match(localizedString(CHECK_ROLL_MESSAGE_KEYS.checkPassed), /passed/);
  assert.doesNotMatch(localizedString(CHECK_ROLL_MESSAGE_KEYS.checkPassed), /failed/);
  assert.match(localizedString(CHECK_ROLL_MESSAGE_KEYS.checkFailed), /failed/);
  assert.doesNotMatch(localizedString(CHECK_ROLL_MESSAGE_KEYS.checkFailed), /passed/);
  // The three refusals the FACADE DELEGATOR answers with are emitted before any label has
  // been resolved, so a placeholder in one of them would put literal braces in front of a GM
  // with nothing able to supply them. Same for the two the call-site gate answers with.
  for (const outcome of ['gmOnly', 'noActor', 'notReady', 'invalidCallSite', 'notElected']) {
    assert.doesNotMatch(
      localizedString(CHECK_ROLL_MESSAGE_KEYS[outcome]),
      /\{/,
      `the check roll's ${outcome} is answered before a label exists, so it interpolates nothing`
    );
  }
  for (const outcome of ['gmOnly', 'notReady', 'invalidCallSite', 'notElected']) {
    assert.doesNotMatch(
      localizedString(BULK_CHECK_DECISION_MESSAGE_KEYS[outcome]),
      /\{/,
      `the bulk decision's ${outcome} is answered before anything is computed`
    );
  }
});

test('the default check label is an activity noun that composes with the template', () => {
  assertLocalizationKey(CHECK_ROLL_DEFAULT_LABEL.key, 'the default check label');
  assert.equal(localizedString(CHECK_ROLL_DEFAULT_LABEL.key), CHECK_ROLL_DEFAULT_LABEL.fallback);
  assert.equal(CHECK_ROLL_DEFAULT_LABEL.fallback, 'Fabricate');
  // NORMATIVE, and asserted so a later translator cannot reintroduce the defect: the flavor
  // template appends the literal word ` check`, so a default that itself ends in "check"
  // renders "Check check (DC 15)".
  assert.doesNotMatch(
    localizedString(CHECK_ROLL_DEFAULT_LABEL.key),
    /check$/i,
    'the default label must be an activity NOUN that does not itself end in the word "check"'
  );
});

test('the call sites are a closed pair mapping token to token', () => {
  assert.ok(Object.isFrozen(COMPANION_CALL_SITES));
  assert.deepEqual(Object.keys(COMPANION_CALL_SITES), ['gmAction', 'broadcast']);
  for (const [name, token] of Object.entries(COMPANION_CALL_SITES)) assert.equal(token, name);
});

test('the two granted display rungs hold the shipped source ladder parallel', () => {
  const labelled = localizedString(GRANTED_SOURCE_MESSAGE_KEYS.labelled);
  const unlabelled = localizedString(GRANTED_SOURCE_MESSAGE_KEYS.unlabelled);
  assertLocalizationKey(GRANTED_SOURCE_MESSAGE_KEYS.labelled, 'the labelled granted rung');
  assertLocalizationKey(GRANTED_SOURCE_MESSAGE_KEYS.unlabelled, 'the label-less granted rung');
  assert.notEqual(
    GRANTED_SOURCE_MESSAGE_KEYS.labelled,
    GRANTED_SOURCE_MESSAGE_KEYS.unlabelled,
    'the two rungs are separately addressable, never one string with an empty label'
  );
  assert.match(
    labelled,
    /\{grantedBy\}/,
    "the labelled rung interpolates {grantedBy}: beside the book rung's own {source}, a second " +
      '{source} would tell a translator this rung names a book too'
  );
  assert.doesNotMatch(labelled, /\{source\}/, 'the book vocabulary stays with the book rung');
  assert.doesNotMatch(unlabelled, /\{/, 'the label-less rung interpolates nothing');
  const byCrafting = localizedString('FABRICATE.Admin.Manager.Knowledge.LearnedByCrafting');
  const fromBook = localizedString('FABRICATE.Admin.Manager.Knowledge.LearnedFrom');
  assert.equal(byCrafting, 'Learned by crafting');
  assert.equal(unlabelled, 'Learned by grant');
  assert.ok(
    unlabelled.startsWith('Learned by ') && byCrafting.startsWith('Learned by '),
    'a GM reads the label-less rung beside "Learned by crafting" in one position'
  );
  assert.ok(
    labelled.startsWith(unlabelled) && fromBook.startsWith('Learned from'),
    'the labelled rung extends its own label-less form, as "Learned from {source}" does'
  );
});

test('normalizeGrantedBy accepts, trims and never coerces', () => {
  for (const { label, input, value } of ACCEPTED_GRANTED_BY) {
    const result = normalizeGrantedBy(input);
    assert.ok(Object.isFrozen(result), `${label}: the normalizer answers frozen data`);
    assert.deepEqual({ ...result }, { ok: true, value }, `${label} is accepted as ${value}`);
  }
});

test('normalizeGrantedBy refuses every value it cannot persist as written', () => {
  for (const { label, input, outcome } of REFUSED_GRANTED_BY) {
    const result = normalizeGrantedBy(input);
    assert.ok(Object.isFrozen(result), `${label}: the normalizer answers frozen data`);
    assert.deepEqual({ ...result }, { ok: false, outcome }, `${label} is refused with ${outcome}`);
    assert.equal('value' in result, false, `${label}: a refusal carries no persistable value`);
  }
});

test('the 64-character boundary refuses rather than truncating', () => {
  const accepted = normalizeGrantedBy(SIXTY_FOUR);
  assert.equal(accepted.value, SIXTY_FOUR);
  assert.equal(accepted.value.length, GRANTED_BY_MAX_LENGTH);
  const refused = normalizeGrantedBy(`${SIXTY_FOUR}f`);
  assert.equal(refused.ok, false);
  assert.equal(refused.outcome, COMPANION_OUTCOMES.grantedByTooLong);
  assert.equal('value' in refused, false, 'an over-long label is not silently shortened');
});

test('knowledgeGrantResult answers success for granted and alreadyKnown alone', () => {
  for (const outcome of Object.keys(KNOWLEDGE_GRANT_MESSAGE_KEYS)) {
    const messageData = GRANT_MESSAGE_DATA[outcome] ?? null;
    const result = knowledgeGrantResult(outcome, messageData);
    assertContractResult(result, grantAnswer(outcome, messageData));
    assert.equal(
      result.success,
      GRANT_SUCCESSES.includes(outcome),
      `${outcome} answers the documented success boolean`
    );
  }
});

test('an already-known grant is a success, distinguished by outcome rather than by boolean', () => {
  const granted = knowledgeGrantResult(COMPANION_OUTCOMES.granted, {
    actor: 'Idrin',
    recipe: 'Balm',
  });
  const known = knowledgeGrantResult(COMPANION_OUTCOMES.alreadyKnown, {
    actor: 'Idrin',
    recipe: 'Balm',
  });
  assertContractResult(granted, grantAnswer('granted', { actor: 'Idrin', recipe: 'Balm' }));
  assertContractResult(known, grantAnswer('alreadyKnown', { actor: 'Idrin', recipe: 'Balm' }));
  assert.equal(
    granted.success,
    known.success,
    'a re-run of a correct automation tick is not a failure'
  );
  assert.notEqual(granted.outcome, known.outcome, 'the outcome is what separates them');
});

test('a grant answer omits messageData entirely when there is none', () => {
  const result = knowledgeGrantResult(COMPANION_OUTCOMES.gmOnly);
  assert.equal('messageData' in result, false, 'no empty interpolation bag crosses the boundary');
  assert.deepEqual(Object.keys(result), ['success', 'outcome', 'message']);
});

test('affordabilityResult derives affordable from the outcome and never guesses', () => {
  for (const [outcome, affordable] of AFFORDABILITY_ANSWERS) {
    const messageData = AFFORDABILITY_MESSAGE_DATA[outcome] ?? null;
    assertContractResult(
      affordabilityResult(outcome, messageData),
      affordabilityAnswer(outcome, affordable, messageData)
    );
  }
});

test('an affordability refusal answers affordable null, never a confident false', () => {
  const refusals = Object.keys(AFFORDABILITY_MESSAGE_KEYS).filter(
    (outcome) => !AFFORDABILITY_ANSWERS.some(([answered]) => answered === outcome)
  );
  assert.ok(refusals.length >= 7, 'every non-answer outcome is covered');
  for (const outcome of refusals) {
    // `detail` rides on EVERY refusal, not only the two that interpolate it, so the bag is
    // still proven to cross the boundary untouched; the per-outcome entry only completes it.
    const messageData = { detail: 'why', ...AFFORDABILITY_MESSAGE_DATA[outcome] };
    const result = affordabilityResult(outcome, messageData);
    assertContractResult(result, affordabilityAnswer(outcome, null, messageData));
    assert.equal(result.affordable, null, `${outcome} must not read as "the actor is short"`);
    assert.equal(result.success, false, `${outcome} means the question could not be answered`);
  }
});

test('an outcome a member does not declare degrades to that member’s own generic refusal', () => {
  // The rule the contract asks of callers, applied to itself: an unrecognised outcome is a
  // generic refusal. A `stable` member may not throw, and a `message` of `undefined` is not
  // localizable, so neither escape is available here.
  const grant = knowledgeGrantResult('someOutcomeFromALaterVersion');
  assertContractResult(grant, {
    success: false,
    outcome: 'someOutcomeFromALaterVersion',
    message: KNOWLEDGE_GRANT_MESSAGE_KEYS.grantFailed,
  });
  // The generic affordability refusal interpolates `detail`, which is why
  // `AFFORDABILITY_MESSAGE_KEYS` documents it as a bag its caller MUST supply: degrading to
  // that key without one would put a literal `{detail}` in front of a GM.
  const detail = Object.freeze({ detail: 'an outcome from a later version' });
  const affordability = affordabilityResult(COMPANION_OUTCOMES.granted, detail);
  assertContractResult(affordability, {
    success: false,
    affordable: null,
    outcome: COMPANION_OUTCOMES.granted,
    message: AFFORDABILITY_MESSAGE_KEYS.checkUnavailable,
    messageData: detail,
  });
});

/** A complete expected `rollActorCheck` refusal: every derived field at its refusal value. */
function checkRollRefusal(outcome, messageData = null) {
  const expected = {
    success: false,
    passed: null,
    total: null,
    diceGroups: [],
    resolvedFormula: null,
    outcome,
    message: CHECK_ROLL_MESSAGE_KEYS[outcome],
  };
  if (messageData) expected.messageData = messageData;
  return expected;
}

test('every rollActorCheck refusal answers the WHOLE refusal shape', () => {
  // Complete expected records, so the field SET is asserted by equality rather than by
  // spot-check. `assertContractResult` reads `node:assert/strict`, under which `deepEqual` IS
  // `deepStrictEqual`: `{ total: undefined }` does not satisfy `total: null`.
  const refusals = ['gmOnly', 'noActor', 'notReady', 'invalidCallSite', 'notElected'];
  for (const outcome of refusals) {
    const result = checkRollResult(outcome);
    assertContractResult(result, checkRollRefusal(outcome));
    assertMessageIsFromTable(result, CHECK_ROLL_MESSAGE_KEYS, `the ${outcome} answer`);
    // A LIST's absence is empty; a scalar's absence is meaningful. `0` or `false` here would
    // be a confident wrong answer, and a `null` list would force every caller to guard a
    // `.length` read.
    assert.deepEqual(result.diceGroups, []);
    assert.equal(result.total, null);
  }
  for (const outcome of ['noFormula', 'engineUnavailable', 'cancelled']) {
    assertContractResult(
      checkRollResult(outcome, { label: 'Fabricate' }),
      checkRollRefusal(outcome, { label: 'Fabricate' })
    );
  }
});

test('derived fields are computed from the outcome and cannot be overridden by a bag', () => {
  // The sharpest cell is `success`, not `passed` or `total`: `buildResult` WRITES `success`
  // and only then spreads its extra fields, so a caller-supplied bag reaching that spread
  // could override the computed boolean and not merely a derived scalar.
  const label = { label: 'Fabricate' };
  const hostile = checkRollResult('cancelled', label, { success: true, passed: true, total: 99 });
  assert.equal(hostile.success, false, 'a refusal is a refusal whatever the record claims');
  assert.equal(hostile.passed, null);
  assert.equal(hostile.total, null);
  assertContractResult(hostile, checkRollRefusal('cancelled', label));

  const bulkHostile = bulkCheckDecisionResult('cancelled', null, {
    success: true,
    choice: { bonus: '+9' },
    allowAdvantage: true,
    covered: [0, 1, 2],
  });
  assert.equal(bulkHostile.success, false);
  assert.equal(bulkHostile.decision, null);
  assert.equal(bulkHostile.allowAdvantage, null);
  assert.deepEqual(bulkHostile.covered, []);
});

test('a legitimate rolled zero answers 0, and never the null a refusal answers', () => {
  const zero = checkRollResult(
    'checkFailed',
    { label: 'Fabricate', total: 0, dc: 15 },
    {
      total: 0,
      diceGroups: [{ groupId: 0, group: '1d20', sum: 5, results: [5] }],
      resolvedFormula: '1d20 - 5',
    }
  );
  assert.ok(Object.is(zero.total, 0), 'a real zero is 0; null is reserved for "no answer"');
  assert.equal(zero.passed, false);
  assert.equal(zero.success, true, 'the check WAS rolled; it simply did not pass');
  assert.equal(zero.diceGroups.length, 1);

  const refusal = checkRollResult('engineUnavailable', { label: 'Fabricate' });
  assert.equal(refusal.total, null, 'and the two are distinguishable, which is the whole point');
});

test('an ungraded roll has no pass, and a bulk answer derives its own three fields', () => {
  const ungraded = checkRollResult(
    'rolled',
    { label: 'Fabricate', total: 7 },
    {
      total: 7,
      diceGroups: [],
      resolvedFormula: '1d20 + 2',
    }
  );
  assert.equal(ungraded.passed, null, 'an ungraded roll is not graded, so it has no pass');
  assert.equal(ungraded.success, true);

  const decided = bulkCheckDecisionResult(
    'decided',
    { count: 2, total: 4 },
    {
      choice: { bonus: '+2', rollMode: 'gmroll', advantage: 'advantage' },
      allowAdvantage: true,
      covered: [0, 2],
    }
  );
  assertContractResult(decided, {
    success: true,
    decision: { bonus: '+2', rollMode: 'gmroll', advantage: 'advantage' },
    allowAdvantage: true,
    covered: [0, 2],
    outcome: 'decided',
    message: BULK_CHECK_DECISION_MESSAGE_KEYS.decided,
    messageData: { count: 2, total: 4 },
  });
  assert.equal('confirmed' in decided.decision, false, 'the decision is the prompt shape MINUS it');
});

test('an undeclared outcome degrades to each new member own generic refusal', () => {
  const roll = checkRollResult('someOutcomeFromALaterVersion', { label: 'x', detail: 'why' });
  assert.equal(roll.success, false);
  assert.equal(roll.message, CHECK_ROLL_MESSAGE_KEYS.rollFailed);
  // The bulk member's generic refusal is spelled OUTSIDE its table on purpose: none of its
  // seven outcomes means "the decision could not be obtained", `rollFailed` would be a lie
  // about a member that never rolls, and `cancelled` would report a malfunction as "the GM
  // declined" — the exact collapse the discriminator ladder exists to prevent.
  const bulk = bulkCheckDecisionResult('someOutcomeFromALaterVersion');
  assert.equal(bulk.success, false);
  assertLocalizationKey(bulk.message, "the bulk decision's generic refusal");
  assert.equal(
    Object.values(BULK_CHECK_DECISION_MESSAGE_KEYS).includes(bulk.message),
    false,
    'and it is not one of the seven, so no outcome is minted for a path no member can reach'
  );
  // "Not one of the seven" and "resolves to a string" are both satisfied by ANY other
  // member's key — `FABRICATE.Check.Roll.RollFailed` passes both — and that would be a
  // cross-member vocabulary leak on exactly the path this deviation exists to reason about:
  // the bulk member telling a GM its decision "could not be rolled". The namespace is the
  // claim, so the namespace is what is pinned.
  assert.ok(
    bulk.message.startsWith('FABRICATE.Check.BulkDecision.'),
    `the bulk member's generic refusal must speak in its OWN namespace, got ${bulk.message}`
  );
});

test('the learned-recipes flag key names the shape already persisted in every world', () => {
  // A pin, not a tautology: this constant is adopted by every writer of the learned map, so a
  // rename here would write a SECOND flag that reads back empty forever with nothing failing.
  assert.equal(LEARNED_RECIPES_FLAG_KEY, 'learnedRecipes');
});
