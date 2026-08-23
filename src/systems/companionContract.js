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
 * uniformly, because two of the ten members are not facade functions: `schemaVersion` is a
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
 * The single factory exists so the table below is ten TUPLES rather than ten repeated
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
 * Exactly ONE of the ten members awards anything; the rest read state, roll a check, settle
 * one roll decision, or hand back a collaborator — which is why the contract is named for the
 * companion rather than for awards.
 *
 * `getCraftingEngine().findComponentItems` is named with its full deviations, because a
 * companion that guards only against a null actor still crashes: it takes DOCUMENTS, NOT
 * IDS; its third argument is a crafting-system OBJECT, not an id; and it THROWS on a null
 * actor AND on a null component, with only the system argument tolerant. It is still
 * declared, because it is the one route that lets a component award STACK rather than
 * duplicate, and excluding it would not stop the call — only the deviation being written
 * down.
 *
 * NEW ROWS ARE APPENDED, never interleaved (issue 1293). `getCraftingEngine().findComponentItems`
 * is named as "the eighth member" by two comments in `tests/companion-facade.test.js`, and
 * inserting a row above it would falsify both without any assertion noticing.
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
    ['rollActorCheck', HOST_FACADE, 'rollActorCheck', STABLE, METHOD],
    ['resolveBulkCheckDecision', HOST_FACADE, 'resolveBulkCheckDecision', STABLE, METHOD],
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
 * The authorization/readiness tokens are SHARED, but NOT uniformly: `gmOnly` and `notReady`
 * are answered by all FOUR `stable` members, while `noActor` is answered by the THREE that
 * target an actor — `resolveBulkCheckDecision` reads no actor and takes no `actorId`, so it
 * can never answer it. Each member answers with its OWN message key, because a failed grant
 * must not report itself in the words of a failed currency check.
 */
export const COMPANION_OUTCOMES = Object.freeze({
  // Shared by every `stable` member, in the gate order GM -> actor -> readiness. `noActor` is
  // shared by the three ACTOR-TARGETED members only.
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

  // rollActorCheck (issue 1293). `checkPassed`/`checkFailed` carry the `check` prefix
  // deliberately: a bare `failed` answering `success: true` is a trap, because `success: false`
  // already means "failed" generically across the whole contract. The prefix says THE CHECK
  // failed, not THE CALL.
  checkPassed: 'checkPassed',
  checkFailed: 'checkFailed',
  rolled: 'rolled',
  rollFailed: 'rollFailed',
  engineUnavailable: 'engineUnavailable',
  noFormula: 'noFormula',
  invalidRollDecision: 'invalidRollDecision',

  // Shared by rollActorCheck and resolveBulkCheckDecision: the call-site rule, which asks a
  // different question from the authorization preamble and is therefore its own rule.
  // `cancelled` is the shipped word for a dismissed roll prompt (`checkRoll.js` returns
  // `cancelled: true`, both runners propagate it, and the canonical specs already use it);
  // a second word for the shipped concept is how a caller ends up branching on both.
  cancelled: 'cancelled',
  invalidCallSite: 'invalidCallSite',
  notElected: 'notElected',

  // resolveBulkCheckDecision
  decided: 'decided',
  nothingToDecide: 'nothingToDecide',
});

/**
 * WHERE a caller is calling from, which is a different question from WHO is calling.
 *
 * Required, with NO default: nothing in the request or the environment distinguishes a GM's
 * deliberate click from a synced `updateWorldTime` tick that fires on every connected client,
 * so a default would be a coin flip rather than a bad inference.
 *
 * - `gmAction` — a single-client, user-initiated GM action. Gated on `isGM` alone: there is
 *   no duplicate-execution risk, and requiring election would lock out the assistant GMs the
 *   surface already admits.
 * - `broadcast` — a handler that fires on EVERY connected client. Additionally gated on the
 *   elected executor, refusing `notElected` otherwise. The harm election prevents is not the
 *   duplicated dialog: N clients each roll N DIFFERENT totals and hand them to N companion
 *   instances, which then apply N sets of consequences Fabricate cannot see or reconcile.
 *
 * The declaration is the ONLY signal Fabricate has, and nothing in the environment can check
 * it — which is why an unrecognised or missing one is a first-class `invalidCallSite` REFUSAL
 * rather than a thrown `TypeError` a member that may never throw could not raise anyway.
 */
export const COMPANION_CALL_SITES = Object.freeze({
  gmAction: 'gmAction',
  broadcast: 'broadcast',
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
  // A check that ROLLED answered the question, whichever way it landed — so all three rolled
  // outcomes are successes and the caller reads `outcome` to learn what happened. FIVE tokens
  // here, not three: `buildResult` computes `success` as membership of this list AND the
  // presence of a message key, so omitting the two bulk outcomes would make both of
  // `resolveBulkCheckDecision`'s answers silently report `success: false`.
  COMPANION_OUTCOMES.checkPassed,
  COMPANION_OUTCOMES.checkFailed,
  COMPANION_OUTCOMES.rolled,
  COMPANION_OUTCOMES.decided,
  // "There is nothing to prompt about" is a CORRECT answer, not a failure: asking a GM for a
  // situational bonus for a batch in which nothing rolls is a dialog with no consequence.
  COMPANION_OUTCOMES.nothingToDecide,
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
 * `rollActorCheck`'s outcome -> localization key table (issue 1293).
 *
 * The namespace is `Check.Roll.*` and NOT a `Companion` one. (Both written without their
 * dotted `FABRICATE.` prefix on purpose, following the shipped note on the grant's table: a
 * partial key literal in a comment is captured by the localization guards as a namespace BASE,
 * and a base declared only by a comment is a reference nothing renders.) Every top-level
 * namespace in `lang/en.json` names WHAT IT IS ABOUT — `Knowledge`, `Currency`, `Chat`,
 * `Gathering`, `Tool`, `System`, `Alchemy` — never WHO IS ASKING, and `grantRecipeKnowledge`
 * uses the `Knowledge.Grant.*` namespace for exactly that reason.
 *
 * `RollFailed` is the one string that interpolates `messageData.detail`, which is where the
 * runner's FREE TEXT is carried so that `message` stays a localization key. It is also this
 * member's generic refusal, so a caller degrading to it MUST supply `detail`.
 *
 * The three refusals the FACADE answers with — `gmOnly`, `noActor`, `notReady` — interpolate
 * NOTHING, and that is load-bearing rather than incidental: the delegator emits them before
 * it has resolved a label, so a placeholder here would put literal braces in front of a GM.
 * `InvalidCallSite` and `NotElected` are placeholder-free for the same reason.
 */
export const CHECK_ROLL_MESSAGE_KEYS = Object.freeze({
  [COMPANION_OUTCOMES.checkPassed]: 'FABRICATE.Check.Roll.Passed',
  [COMPANION_OUTCOMES.checkFailed]: 'FABRICATE.Check.Roll.Failed',
  [COMPANION_OUTCOMES.rolled]: 'FABRICATE.Check.Roll.Rolled',
  [COMPANION_OUTCOMES.rollFailed]: 'FABRICATE.Check.Roll.RollFailed',
  [COMPANION_OUTCOMES.cancelled]: 'FABRICATE.Check.Roll.Cancelled',
  [COMPANION_OUTCOMES.engineUnavailable]: 'FABRICATE.Check.Roll.EngineUnavailable',
  [COMPANION_OUTCOMES.noFormula]: 'FABRICATE.Check.Roll.NoFormula',
  [COMPANION_OUTCOMES.invalidRollDecision]: 'FABRICATE.Check.Roll.InvalidRollDecision',
  [COMPANION_OUTCOMES.invalidCallSite]: 'FABRICATE.Check.Roll.InvalidCallSite',
  [COMPANION_OUTCOMES.notElected]: 'FABRICATE.Check.Roll.NotElected',
  [COMPANION_OUTCOMES.gmOnly]: 'FABRICATE.Check.Roll.GMOnly',
  [COMPANION_OUTCOMES.noActor]: 'FABRICATE.Check.Roll.NoActor',
  [COMPANION_OUTCOMES.notReady]: 'FABRICATE.Check.Roll.NotReady',
});

/**
 * The DEFAULT display label a Standalone Check Roll rolls under when the caller supplies none.
 *
 * `buildInteractiveRollOptions` composes its chat flavor as `` `${activity} check${dcLabel}` ``
 * with no guard, so an omitted label would post "undefined check (DC 15)" to a GM's chat log.
 * The default must therefore be an ACTIVITY NOUN that composes with the literal word ` check`
 * the template appends — which is why it is not `Check`, a value that renders the grammatical
 * nonsense "Check check (DC 15)". **A translation of this key must not itself end in the word
 * "check".**
 *
 * The key and its English fallback travel together because the member that reads them is a
 * Foundry-free leaf: it resolves the pair through its injected `localize` seam rather than
 * touching `game.i18n` itself.
 */
export const CHECK_ROLL_DEFAULT_LABEL = Object.freeze({
  key: 'FABRICATE.Check.Roll.DefaultLabel',
  fallback: 'Fabricate',
});

/**
 * `resolveBulkCheckDecision`'s outcome -> localization key table (issue 1293).
 *
 * SEVEN entries, and the absence of `noActor` is the point: this member takes no `actorId`,
 * reads no actor and writes nothing, so it is GM-gated INLINE rather than through the shared
 * actor-targeted preamble and can never answer an actor refusal. A key here would be dead
 * vocabulary that a caller would nonetheless write a branch for.
 */
export const BULK_CHECK_DECISION_MESSAGE_KEYS = Object.freeze({
  [COMPANION_OUTCOMES.decided]: 'FABRICATE.Check.BulkDecision.Decided',
  [COMPANION_OUTCOMES.nothingToDecide]: 'FABRICATE.Check.BulkDecision.NothingToDecide',
  [COMPANION_OUTCOMES.cancelled]: 'FABRICATE.Check.BulkDecision.Cancelled',
  [COMPANION_OUTCOMES.invalidCallSite]: 'FABRICATE.Check.BulkDecision.InvalidCallSite',
  [COMPANION_OUTCOMES.notElected]: 'FABRICATE.Check.BulkDecision.NotElected',
  [COMPANION_OUTCOMES.gmOnly]: 'FABRICATE.Check.BulkDecision.GMOnly',
  [COMPANION_OUTCOMES.notReady]: 'FABRICATE.Check.BulkDecision.NotReady',
});

/**
 * The generic refusal `resolveBulkCheckDecision` degrades an UNDECLARED outcome to.
 *
 * Spelled outside the table on purpose. Every other member's generic refusal is one of its own
 * declared outcomes (`grantFailed`, `checkUnavailable`, `rollFailed`), but none of this
 * member's seven means "the decision could not be obtained": it rolls nothing, so `rollFailed`
 * would be a lie about a member that never rolls, and `cancelled` would report a malfunction
 * as "the GM declined" — the exact collapse the discriminator ladder exists to prevent.
 * Minting a thirteenth outcome to name a path no member can reach would enlarge a published
 * vocabulary for a case that is a programming error, so the STRING is provided without an
 * outcome to key it.
 */
const BULK_CHECK_DECISION_FALLBACK_KEY = 'FABRICATE.Check.BulkDecision.Failed';

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
 * The three outcomes that mean A DIE WAS ROLLED, and so the three that carry roll data.
 *
 * Every other outcome is a REFUSAL, and a refusal answers `total: null` / `diceGroups: []`.
 */
const ROLLED_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.checkPassed,
  COMPANION_OUTCOMES.checkFailed,
  COMPANION_OUTCOMES.rolled,
]);

/**
 * Build `rollActorCheck`'s answer (issue 1293).
 *
 * Every answer field beyond `outcome`/`message` is DERIVED — from the outcome and from an
 * INTERNAL roll record the member builds — and none of them is overridable by a caller bag.
 * That is the shipped pattern rather than a new one: {@link affordabilityResult} derives
 * `affordable` from the outcome for the same reason. It matters more here than there, because
 * `buildResult` writes `success` BEFORE it spreads `extra`, so a caller-supplied bag reaching
 * the spread could override the computed `success` and not merely a derived scalar.
 *
 * - `passed` — `true` for `checkPassed`, `false` for `checkFailed`, and `null` for everything
 *   else INCLUDING the ungraded `rolled`: an ungraded roll is not graded, so it has no pass.
 * - `total` — the RAW roll total for the three rolled outcomes, `null` for every refusal
 *   (`engineUnavailable` and `noFormula` explicitly included). A legitimate rolled `0` answers
 *   `0` and never `null`, which is why the coalesce below is nullish rather than truthy: `null`
 *   is reserved for "no answer", and a caller must be able to tell a real zero from a refusal.
 *   It is ALWAYS the raw total and this member never forces an outcome — it passes `triggers:
 *   []` explicitly — so the runner's forced-award divergence is unreachable and a later change
 *   admitting triggers cannot silently redefine this field.
 * - `diceGroups` — the rolled groups, or `[]` on every refusal. A LIST, so its absence is
 *   empty; `null` would force every caller to guard a `.length` read. The scalars are `null`
 *   for the opposite reason: their absence is meaningful, and `0`/`false` would be a confident
 *   wrong answer.
 * - `resolvedFormula` — the `@`-resolved formula string, or `null`.
 *
 * @param {string} outcome one of {@link COMPANION_OUTCOMES}
 * @param {object|null} [messageData] interpolation data; carries `detail` for `rollFailed`,
 *   whose underlying failure is the runner's free text
 * @param {{total: number, diceGroups: Array<object>, resolvedFormula: string|null}|null} [roll]
 *   the member's INTERNAL record of what was rolled; ignored for every non-rolled outcome
 * @returns {Readonly<{success: boolean, passed: boolean|null, total: number|null,
 *   diceGroups: Array<object>, resolvedFormula: string|null, outcome: string, message: string,
 *   messageData?: object}>}
 */
export function checkRollResult(outcome, messageData = null, roll = null) {
  const rolled = ROLLED_OUTCOMES.includes(outcome);
  let passed = null;
  if (outcome === COMPANION_OUTCOMES.checkPassed) passed = true;
  else if (outcome === COMPANION_OUTCOMES.checkFailed) passed = false;
  return buildResult(
    outcome,
    CHECK_ROLL_MESSAGE_KEYS,
    CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.rollFailed],
    messageData,
    {
      passed,
      total: rolled ? (roll?.total ?? null) : null,
      diceGroups: Object.freeze(rolled ? (roll?.diceGroups ?? []) : []),
      resolvedFormula: rolled ? (roll?.resolvedFormula ?? null) : null,
    }
  );
}

/**
 * The two outcomes for which a batch WAS assessed, and so the two that carry coverage.
 */
const ASSESSED_BULK_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.decided,
  COMPANION_OUTCOMES.nothingToDecide,
]);

/**
 * Build `resolveBulkCheckDecision`'s answer (issue 1293).
 *
 * Derived from the outcome and an INTERNAL decision record, on the same rule as
 * {@link checkRollResult}.
 *
 * - `decision` — the `{ bonus, rollMode, advantage }` the GM settled, and ONLY for `decided`.
 *   It carries no `confirmed` key: that flag is what `evaluateCheckRoll` reads as a
 *   cancellation, so carrying it through would turn every roll the caller then makes into one.
 * - `allowAdvantage` — whether Advantage was offered, for the two assessed outcomes; `null`
 *   for every refusal. `false` for `nothingToDecide` is a TRUE statement rather than a vacuous
 *   one: with no usable formula, no roll could have honoured Advantage.
 * - `covered` — the INDICES into the caller's own `formulas` array that the decision covers,
 *   and `[]` otherwise. Indices rather than formulas, because two subjects may share a formula
 *   and the caller must be able to map the answer back onto its own subjects.
 *
 * @param {string} outcome one of {@link COMPANION_OUTCOMES}
 * @param {object|null} [messageData] interpolation data for the localized message
 * @param {{choice: object|null, allowAdvantage: boolean, covered: number[]}|null} [decision]
 *   the member's INTERNAL decision record
 * @returns {Readonly<{success: boolean, decision: object|null, allowAdvantage: boolean|null,
 *   covered: number[], outcome: string, message: string, messageData?: object}>}
 */
export function bulkCheckDecisionResult(outcome, messageData = null, decision = null) {
  const assessed = ASSESSED_BULK_OUTCOMES.includes(outcome);
  return buildResult(
    outcome,
    BULK_CHECK_DECISION_MESSAGE_KEYS,
    BULK_CHECK_DECISION_FALLBACK_KEY,
    messageData,
    {
      decision:
        outcome === COMPANION_OUTCOMES.decided && decision?.choice
          ? Object.freeze({ ...decision.choice })
          : null,
      allowAdvantage: assessed ? decision?.allowAdvantage === true : null,
      covered: Object.freeze(assessed ? (decision?.covered ?? []) : []),
    }
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
