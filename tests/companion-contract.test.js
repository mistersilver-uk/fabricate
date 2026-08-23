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
  COMPANION_CONTRACT,
  COMPANION_CONTRACT_SCHEMA_VERSION,
  COMPANION_MEMBERS,
  COMPANION_MEMBER_HOSTS,
  COMPANION_MEMBER_KINDS,
  COMPANION_OUTCOMES,
  COMPANION_PROMISES,
  GRANTED_BY_MAX_LENGTH,
  GRANTED_SOURCE_MESSAGE_KEYS,
  KNOWLEDGE_GRANT_MESSAGE_KEYS,
  affordabilityResult,
  knowledgeGrantResult,
  normalizeGrantedBy,
} from '../src/systems/companionContract.js';
import {
  assertContractResult,
  assertLocalizationKey,
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

test('the descriptor publishes exactly the three contract fields, frozen', () => {
  assert.ok(Object.isFrozen(COMPANION_CONTRACT), 'the descriptor is frozen');
  assert.deepEqual(Object.keys(COMPANION_CONTRACT), ['schemaVersion', 'members', 'outcomes']);
  assert.equal(COMPANION_CONTRACT.schemaVersion, COMPANION_CONTRACT_SCHEMA_VERSION);
  assert.equal(Number.isInteger(COMPANION_CONTRACT_SCHEMA_VERSION), true);
  assert.ok(COMPANION_CONTRACT_SCHEMA_VERSION >= 1, 'a published version starts at 1');
  assert.equal(COMPANION_CONTRACT.members, COMPANION_MEMBERS);
  assert.equal(COMPANION_CONTRACT.outcomes, COMPANION_OUTCOMES);
  assert.ok(Object.isFrozen(COMPANION_CONTRACT.members), 'the member table is frozen');
  assert.ok(Object.isFrozen(COMPANION_CONTRACT.outcomes), 'the outcome vocabulary is frozen');
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
  const emittable = new Set([
    ...Object.keys(KNOWLEDGE_GRANT_MESSAGE_KEYS),
    ...Object.keys(AFFORDABILITY_MESSAGE_KEYS),
  ]);
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

test('each member answers the shared gate outcomes in its OWN words', () => {
  for (const shared of ['gmOnly', 'noActor', 'notReady']) {
    const grantKey = KNOWLEDGE_GRANT_MESSAGE_KEYS[shared];
    const affordabilityKey = AFFORDABILITY_MESSAGE_KEYS[shared];
    assert.ok(grantKey && affordabilityKey, `${shared} is answered by both stable members`);
    assert.notEqual(
      grantKey,
      affordabilityKey,
      `a refused ${shared} grant must not report itself in the currency check's words`
    );
  }
  const overlap = Object.values(KNOWLEDGE_GRANT_MESSAGE_KEYS).filter((key) =>
    Object.values(AFFORDABILITY_MESSAGE_KEYS).includes(key)
  );
  assert.deepEqual(overlap, [], 'the two members share no message string');
});

test('every outcome message key resolves to a string leaf in lang/en.json', () => {
  for (const [outcome, key] of Object.entries(KNOWLEDGE_GRANT_MESSAGE_KEYS)) {
    assertLocalizationKey(key, `the grant's ${outcome}`);
  }
  for (const [outcome, key] of Object.entries(AFFORDABILITY_MESSAGE_KEYS)) {
    assertLocalizationKey(key, `the affordability check's ${outcome}`);
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

test('the learned-recipes flag key names the shape already persisted in every world', () => {
  // A pin, not a tautology: this constant is adopted by every writer of the learned map, so a
  // rename here would write a SECOND flag that reads back empty forever with nothing failing.
  assert.equal(LEARNED_RECIPES_FLAG_KEY, 'learnedRecipes');
});
