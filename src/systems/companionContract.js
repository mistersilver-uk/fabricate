/**
 * The vocabulary of `game.fabricate.api.COMPANION` — Fabricate's named, versioned contract
 * for outbound BEHAVIOURAL consumption by a companion module (issue 1289).
 *
 * This module is deliberately a Foundry-free leaf: it reads no global, touches no document
 * and performs no I/O. It declares WHAT the contract is — its version, its member table,
 * its outcome tokens, the localization key each outcome answers with, and the two value
 * normalizers a member needs before it writes anything. The members themselves live where
 * their behaviour lives (`companionKnowledgeGrant.js`, `currencyAffordance.js`) and the
 * descriptor is assigned onto the facade in `src/main.js`.
 *
 * It sits under `src/systems/` rather than beside `src/ui/managerExtensions.js` because the
 * navigation seam is UI — route chrome pinned against a Svelte component — while this one is
 * behavioural, and because `src/systems/**` is ESLint- and Prettier-gated where `src/ui/**`
 * and `src/main.js` are not.
 *
 * ## The compatibility promise
 *
 * While {@link COMPANION_CONTRACT_SCHEMA_VERSION} is unchanged, every member of
 * {@link COMPANION_MEMBERS} keeps its name, keeps accepting the arguments documented for it,
 * and keeps answering in the documented shape. A member may gain an optional argument or an
 * additional result field; it may not lose one, change the meaning of one, or begin throwing
 * where it returned a result. A NEW member may be added without a version change, because
 * adding one cannot break a companion that does not call it. Removing a member, renaming one,
 * or narrowing what one accepts is a `schemaVersion` bump, announced in the release notes,
 * with the previous member retained as a deprecated delegate for at least one minor release.
 * NOTHING OUTSIDE THE DECLARED SET IS CONTRACT, however reachable it is.
 *
 * ## Two invariants, scoped to the `stable` tier
 *
 * A `stable` member NEVER THROWS: it refuses in the same result shape it succeeds in. A
 * member is called inside a GM's automation tick, after other side effects have committed,
 * where a throw aborts work mid-flight and surfaces as an unhandled rejection nothing
 * attributes to a caller. And `message` is ALWAYS a localization key — never free text — so
 * a caller can localize it; where a lower layer produces free text, the contract carries that
 * text in `messageData.detail` instead.
 *
 * A `handle` member promises only the accessor's name and that it answers the object
 * Fabricate itself uses (or `null` before readiness), and nothing about that object's method
 * surface beyond a declared carve-out.
 */

/**
 * The contract version. A companion reads this BEFORE calling any member and refuses a
 * version it does not understand.
 *
 * Readable from Fabricate's own `init` hook onward, and for the whole of `setup` and `ready`
 * — the descriptor is frozen data and needs no collaborator. It is NOT guaranteed readable
 * from ANOTHER package's `init`: Foundry dispatches `init` listeners in module-script
 * execution order, ordered by the `library` manifest flag and then world module-collection
 * order, and `relationships.requires` does not influence that order. A companion therefore
 * reads the version in `setup` or `ready`, and treats an absent `game.fabricate` as
 * "Fabricate has not loaded yet" — never as "this Fabricate has no contract", and never as a
 * trigger for a degraded path.
 *
 * @type {1}
 */
export const COMPANION_CONTRACT_SCHEMA_VERSION = 1;

/**
 * The two promise tiers a member is declared at. The record field is `promise`, not `tier`:
 * a bare "tier" belongs to the crafting domain's Outcome Tier vocabulary.
 *
 * `handle` is named for what it promises — a HANDLE on the object Fabricate itself uses —
 * rather than for the provenance of the accessor. `CraftingEngine` has hundreds of methods
 * and no reviewer can promise them all, so the honest promise is the accessor's name plus
 * its `null`-before-readiness answer.
 */
export const COMPANION_PROMISES = Object.freeze({
  stable: 'stable',
  handle: 'handle',
});

/**
 * WHERE a member is read from. A flat list of member names cannot resolve this set
 * uniformly, because two of the eight members are not facade functions: `schemaVersion` is a
 * number on the descriptor, and `findComponentItems` is a method on the object a `handle`
 * accessor RETURNS. Every row therefore declares its host and the path read off it, which is
 * what makes the member-resolution test mechanical rather than assumed.
 *
 * - `contract` — the frozen `game.fabricate.api.COMPANION` descriptor itself.
 * - `facade` — the `game.fabricate` facade object.
 * - `craftingEngine` — the object `game.fabricate.getCraftingEngine()` answers.
 */
export const COMPANION_MEMBER_HOSTS = Object.freeze({
  contract: 'contract',
  facade: 'facade',
  craftingEngine: 'craftingEngine',
});

/**
 * WHAT a member is, so a resolution assertion knows what to expect of the resolved value.
 *
 * `accessor` is a narrower `method`: it names exactly the four `handle` getters that answer
 * `null` before `initialize()` has run, which is a promise the contract makes and a test can
 * check as a set.
 */
export const COMPANION_MEMBER_KINDS = Object.freeze({
  value: 'value',
  method: 'method',
  accessor: 'accessor',
});

/**
 * One member row.
 *
 * The single factory exists so the table below is eight TUPLES rather than eight repeated
 * frozen object literals: repeated near-identical literals are how a duplication block gets
 * reported, and a row that silently omits a field is invisible in that shape.
 *
 * @param {[string, string, string, string, string]} tuple `[name, host, path, promise, kind]`
 * @returns {Readonly<{name: string, host: string, path: string, promise: string, kind: string}>}
 */
function companionMember([name, host, path, promise, kind]) {
  return Object.freeze({ name, host, path, promise, kind });
}

const {
  contract: HOST_CONTRACT,
  facade: HOST_FACADE,
  craftingEngine: HOST_ENGINE,
} = COMPANION_MEMBER_HOSTS;
const { stable: STABLE, handle: HANDLE } = COMPANION_PROMISES;
const { value: VALUE, method: METHOD, accessor: ACCESSOR } = COMPANION_MEMBER_KINDS;

/**
 * The declared member set — the whole of the contract's surface, at exactly one promise tier
 * each.
 *
 * Exactly ONE of the eight members awards anything; the rest read state or hand back a
 * collaborator, which is why the contract is named for the companion rather than for awards.
 *
 * `getCraftingEngine().findComponentItems` is named with its full deviations, because a
 * companion that guards only against a null actor still crashes: it takes DOCUMENTS, NOT
 * IDS; its third argument is a crafting-system OBJECT, not an id; and it THROWS on a null
 * actor AND on a null component, with only the system argument tolerant. It is still
 * declared, because it is the one route that lets a component award STACK rather than
 * duplicate, and excluding it would not stop the call — only the deviation being written
 * down.
 */
export const COMPANION_MEMBERS = Object.freeze(
  [
    ['schemaVersion', HOST_CONTRACT, 'schemaVersion', STABLE, VALUE],
    ['grantRecipeKnowledge', HOST_FACADE, 'grantRecipeKnowledge', STABLE, METHOD],
    ['checkAffordability', HOST_FACADE, 'checkAffordability', STABLE, METHOD],
    ['getCurrencyConfigStore', HOST_FACADE, 'getCurrencyConfigStore', HANDLE, ACCESSOR],
    ['getActorPropertyCoinSpender', HOST_FACADE, 'getActorPropertyCoinSpender', HANDLE, ACCESSOR],
    ['getActorInventoryCoinSpender', HOST_FACADE, 'getActorInventoryCoinSpender', HANDLE, ACCESSOR],
    ['getCraftingEngine', HOST_FACADE, 'getCraftingEngine', HANDLE, ACCESSOR],
    ['getCraftingEngine().findComponentItems', HOST_ENGINE, 'findComponentItems', HANDLE, METHOD],
  ].map(companionMember)
);

/**
 * The outcome vocabulary, OPEN BY DECLARATION and CLOSED BY ENUMERATION.
 *
 * This set is complete for {@link COMPANION_CONTRACT_SCHEMA_VERSION}. A member may emit a
 * NEW outcome without a version bump; renaming or removing one is a bump. Callers MUST
 * branch on `success` first and treat an unrecognised `outcome` as a generic refusal — an
 * exhaustive `switch` is a caller bug, not a contract breach. Freezing the vocabulary shut
 * would make every new refusal path a major version, which is the wrong trade for a surface
 * whose whole purpose is to make refusals legible.
 *
 * Each token maps to itself so a caller reads
 * `result.outcome === COMPANION_OUTCOMES.alreadyKnown` rather than a bare string literal.
 * The three authorization/readiness tokens are SHARED by both `stable` members; each member
 * answers them with its OWN message key, because a failed grant must not report itself in
 * the words of a failed currency check.
 */
export const COMPANION_OUTCOMES = Object.freeze({
  // Shared by every `stable` member, in the gate order GM -> actor -> readiness.
  gmOnly: 'gmOnly',
  noActor: 'noActor',
  notReady: 'notReady',

  // grantRecipeKnowledge
  granted: 'granted',
  alreadyKnown: 'alreadyKnown',
  recipeNotFound: 'recipeNotFound',
  systemNotFound: 'systemNotFound',
  knowledgeNotObservable: 'knowledgeNotObservable',
  invalidGrantedBy: 'invalidGrantedBy',
  grantedByTooLong: 'grantedByTooLong',
  grantFailed: 'grantFailed',

  // checkAffordability
  affordable: 'affordable',
  notAffordable: 'notAffordable',
  unitNotFound: 'unitNotFound',
  invalidAmount: 'invalidAmount',
  ladderEmpty: 'ladderEmpty',
  ladderInvalid: 'ladderInvalid',
  checkUnavailable: 'checkUnavailable',
});

/**
 * The outcomes that answer `success: true`.
 *
 * `alreadyKnown` is one of them deliberately. The caller is an automation tick that may
 * legitimately re-run, and `success: false` would make a correct re-run read as a failure;
 * the caller distinguishes GRANTED NOW from ALREADY KNEW by the OUTCOME, never by the
 * boolean. `notAffordable` is one of them for the same reason at the other member: the
 * question WAS answered, and the answer was no. `success: false` is reserved for "the
 * question could not be answered at all", which is what separates telling a player they are
 * short from telling a GM their currency ladder is broken.
 */
const SUCCESSFUL_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.granted,
  COMPANION_OUTCOMES.alreadyKnown,
  COMPANION_OUTCOMES.affordable,
  COMPANION_OUTCOMES.notAffordable,
]);

/**
 * `grantRecipeKnowledge`'s outcome -> localization key table.
 *
 * The grant's keys are a `Grant` namespace beside the shipped `Reset` and `Manage` ones in
 * the Knowledge vocabulary. (Written without its dotted prefix on purpose: a partial key
 * literal in a comment is captured by the localization guards as a namespace BASE, and a
 * base declared by a comment is a reference nothing renders.)
 * `KnowledgeNotObservable` mints a NEW key rather than reusing `LearningDisabled`, because
 * the predicate it reports is no longer learn-mode: the GM is being told that granting would
 * change nothing a player can SEE, and its `messageData` carries the AUTHORED
 * `visibilityMode` and `resolutionMode` — read directly off the system, never the predicate's
 * internally resolved enum — so a GM reading a macro's output can see why in the words their
 * own system editor uses.
 */
export const KNOWLEDGE_GRANT_MESSAGE_KEYS = Object.freeze({
  [COMPANION_OUTCOMES.granted]: 'FABRICATE.Knowledge.Grant.Success',
  [COMPANION_OUTCOMES.alreadyKnown]: 'FABRICATE.Knowledge.Grant.AlreadyKnown',
  [COMPANION_OUTCOMES.gmOnly]: 'FABRICATE.Knowledge.Grant.GMOnly',
  [COMPANION_OUTCOMES.noActor]: 'FABRICATE.Knowledge.Grant.NoActor',
  [COMPANION_OUTCOMES.notReady]: 'FABRICATE.Knowledge.Grant.NotReady',
  [COMPANION_OUTCOMES.recipeNotFound]: 'FABRICATE.Knowledge.Grant.RecipeNotFound',
  [COMPANION_OUTCOMES.systemNotFound]: 'FABRICATE.Knowledge.Grant.SystemNotFound',
  [COMPANION_OUTCOMES.knowledgeNotObservable]: 'FABRICATE.Knowledge.Grant.KnowledgeNotObservable',
  [COMPANION_OUTCOMES.invalidGrantedBy]: 'FABRICATE.Knowledge.Grant.InvalidGrantedBy',
  [COMPANION_OUTCOMES.grantedByTooLong]: 'FABRICATE.Knowledge.Grant.GrantedByTooLong',
  [COMPANION_OUTCOMES.grantFailed]: 'FABRICATE.Knowledge.Grant.Failed',
});

/**
 * `checkAffordability`'s outcome -> localization key table.
 *
 * `LadderInvalid` and `CheckUnavailable` are the two strings that interpolate
 * `messageData.detail`, which is where the currency layer's FREE TEXT is carried so that
 * `message` stays a localization key. A caller of either MUST supply `detail`.
 */
export const AFFORDABILITY_MESSAGE_KEYS = Object.freeze({
  [COMPANION_OUTCOMES.affordable]: 'FABRICATE.Currency.Affordability.Affordable',
  [COMPANION_OUTCOMES.notAffordable]: 'FABRICATE.Currency.Affordability.NotAffordable',
  [COMPANION_OUTCOMES.gmOnly]: 'FABRICATE.Currency.Affordability.GMOnly',
  [COMPANION_OUTCOMES.noActor]: 'FABRICATE.Currency.Affordability.NoActor',
  [COMPANION_OUTCOMES.notReady]: 'FABRICATE.Currency.Affordability.NotReady',
  [COMPANION_OUTCOMES.unitNotFound]: 'FABRICATE.Currency.Affordability.UnitNotFound',
  [COMPANION_OUTCOMES.invalidAmount]: 'FABRICATE.Currency.Affordability.InvalidAmount',
  [COMPANION_OUTCOMES.ladderEmpty]: 'FABRICATE.Currency.Affordability.LadderEmpty',
  [COMPANION_OUTCOMES.ladderInvalid]: 'FABRICATE.Currency.Affordability.LadderInvalid',
  [COMPANION_OUTCOMES.checkUnavailable]: 'FABRICATE.Currency.Affordability.CheckUnavailable',
});

/**
 * The two localization keys the GM Knowledge surface's GRANTED source rungs render.
 *
 * Declared beside the contract, and not only in the renderer, for the reason the navigation
 * seam declares its tone classes beside its tone list: the grant is what WRITES `granted`
 * and `grantedBy`, and a rung added without its string — or a string added without its rung
 * — should be a syntactically visible omission rather than a key that renders as a raw
 * dotted path.
 *
 * The wording holds the ladder's existing parallel rather than reading well alone. The
 * source line renders exactly one rung into one position, so a GM scanning a list reads
 * these beside the shipped "Learned by crafting" and "Learned from {source}":
 * `unlabelled` is the exact structural sibling of the former, and `labelled` extends it the
 * way the shipped book rung extends its own.
 *
 * The labelled rung interpolates `{grantedBy}`, NOT `{source}`, and the placeholder name is
 * the same argument that named the persisted field: `source*` on a learned entry already
 * means THE BOOK, and the labelled granted rung renders directly beside the book rung's
 * "Learned from {source}". Two adjacent keys interpolating the same `{source}` would tell a
 * translator that both name a book — reintroducing at the translator-facing surface exactly
 * the false provenance the field name evicted from the persisted shape. A placeholder can
 * only be renamed before it ships, because renaming one invalidates every translation of its
 * key.
 *
 * Neither rung asserts WHO granted the recipe. Not because the writer is unknown — the
 * facade member is GM-gated, so every entry FABRICATE writes was GM-authorised — but because
 * the flag is public: a third-party module can write `granted: true` directly without
 * passing that gate, and a surface may not assert an authorisation for a value it merely
 * reads.
 */
export const GRANTED_SOURCE_MESSAGE_KEYS = Object.freeze({
  labelled: 'FABRICATE.Admin.Manager.Knowledge.LearnedByGrant',
  unlabelled: 'FABRICATE.Admin.Manager.Knowledge.LearnedByGrantUnlabelled',
});

/**
 * The longest `grantedBy` label the contract accepts, measured AFTER trimming.
 *
 * Bounded because the value is persisted onto a player-owned actor by a caller Fabricate
 * does not control, and rendered into a GM's list. The refusal string interpolates the limit
 * as `max`, so a caller answering `grantedByTooLong` supplies `{ max: GRANTED_BY_MAX_LENGTH }`
 * as its `messageData` rather than restating the number.
 */
export const GRANTED_BY_MAX_LENGTH = 64;

function buildResult(outcome, messageKeys, fallbackKey, messageData, extra) {
  const message = messageKeys[outcome] ?? fallbackKey;
  const result = {
    success: SUCCESSFUL_OUTCOMES.includes(outcome) && messageKeys[outcome] !== undefined,
    ...extra,
    outcome,
    message,
  };
  if (messageData) result.messageData = messageData;
  return Object.freeze(result);
}

/**
 * Build `grantRecipeKnowledge`'s answer.
 *
 * An outcome this member does not declare is answered as a GENERIC REFUSAL carrying the
 * member's own failure string — the same rule the contract asks callers to apply to an
 * unrecognised outcome — rather than by throwing, because a `stable` member may not throw
 * and a `message` of `undefined` is not localizable.
 *
 * @param {string} outcome one of {@link COMPANION_OUTCOMES}
 * @param {object|null} [messageData] interpolation data for the localized message
 * @returns {Readonly<{success: boolean, outcome: string, message: string, messageData?: object}>}
 */
export function knowledgeGrantResult(outcome, messageData = null) {
  return buildResult(
    outcome,
    KNOWLEDGE_GRANT_MESSAGE_KEYS,
    KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.grantFailed],
    messageData,
    null
  );
}

/**
 * Build `checkAffordability`'s answer.
 *
 * `affordable` is DERIVED from the outcome, never passed in: `true` for `affordable`,
 * `false` for `notAffordable`, and `null` for every refusal. That is what keeps "the actor
 * is short" and "the question could not be answered" from collapsing into the same
 * `affordable: false` — an unknown unit or a zero amount would otherwise read as a
 * confident no.
 *
 * @param {string} outcome one of {@link COMPANION_OUTCOMES}
 * @param {object|null} [messageData] interpolation data; carries `detail` for the two
 *   outcomes whose underlying failure is free text
 * @returns {Readonly<{success: boolean, affordable: boolean|null, outcome: string,
 *   message: string, messageData?: object}>}
 */
export function affordabilityResult(outcome, messageData = null) {
  let affordable = null;
  if (outcome === COMPANION_OUTCOMES.affordable) affordable = true;
  else if (outcome === COMPANION_OUTCOMES.notAffordable) affordable = false;
  return buildResult(
    outcome,
    AFFORDABILITY_MESSAGE_KEYS,
    AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.checkUnavailable],
    messageData,
    { affordable }
  );
}

/**
 * Normalize a caller-supplied `grantedBy` label, REFUSING rather than coercing.
 *
 * The field is `grantedBy` and not `source` because `source*` on a learned entry already
 * means THE BOOK (`sourceItemUuid`, `sourceOwned`, `sourceItemName`, `sourceDefinitionName`,
 * `sourceCapped`, `sourceKind`, `sourceName`); a bare `source` beside those would read as a
 * sixth book-provenance field, which is the false provenance this contract exists to remove.
 *
 * Omitted or `null` is ACCEPTED as `null` — a caller with nothing meaningful to say must not
 * be pushed into passing its own module id to satisfy a validator, which would fill a GM's
 * audit pane with noise. A string is trimmed, and an empty result is `null`.
 *
 * Everything else is REFUSED. Truncating an over-long label is refused deliberately: a
 * truncated module id names a DIFFERENT module, which is the same class of lie as silently
 * coercing an object. A non-string is refused rather than stringified for the same reason —
 * and note that the entry-boundary reader excludes ARRAYS from its nested-record test, so an
 * array that reached the flag would survive into an entry view rather than being dropped.
 *
 * @param {*} value the caller's `grantedBy`
 * @returns {Readonly<{ok: true, value: string|null}>|Readonly<{ok: false, outcome: string}>}
 */
export function normalizeGrantedBy(value) {
  if (value === undefined || value === null) return Object.freeze({ ok: true, value: null });
  if (typeof value !== 'string') {
    return Object.freeze({ ok: false, outcome: COMPANION_OUTCOMES.invalidGrantedBy });
  }
  const trimmed = value.trim();
  if (trimmed === '') return Object.freeze({ ok: true, value: null });
  if (trimmed.length > GRANTED_BY_MAX_LENGTH) {
    return Object.freeze({ ok: false, outcome: COMPANION_OUTCOMES.grantedByTooLong });
  }
  return Object.freeze({ ok: true, value: trimmed });
}

/**
 * The descriptor published as `game.fabricate.api.COMPANION`, beside the shipped
 * `api.HOOKS`.
 *
 * Frozen data assembled at module load, so `bindFabricateGlobal` assigns it and nothing
 * more, and so its version is readable before any collaborator exists.
 */
export const COMPANION_CONTRACT = Object.freeze({
  schemaVersion: COMPANION_CONTRACT_SCHEMA_VERSION,
  members: COMPANION_MEMBERS,
  outcomes: COMPANION_OUTCOMES,
});
