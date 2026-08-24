/**
 * The vocabulary of `game.fabricate.api.COMPANION` — Fabricate's named, versioned contract
 * for outbound BEHAVIOURAL consumption by a companion module (issue 1289).
 *
 * This module is deliberately a Foundry-free leaf: it reads no global, touches no document
 * and performs no I/O. It declares WHAT the contract is — its version, its member table,
 * its outcome tokens, the localization key each outcome answers with, and the two value
 * normalizers a member needs before it writes anything. The members themselves live where
 * their behaviour lives (`companionKnowledgeGrant.js`, `companionCheckRoll.js`,
 * `companionComponentAward.js`, `currencyAffordance.js`) and the descriptor is assigned onto
 * the facade in `src/main.js`.
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
 * uniformly, because two of the twelve members are not facade functions: `schemaVersion` is a
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
 * The single factory exists so the table below is twelve TUPLES rather than twelve repeated
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
 * The members that WRITE are `grantRecipeKnowledge`, `awardComponents` and `creditCurrency`;
 * the rest read state, roll a check, settle one roll decision, or hand back a collaborator —
 * which is why the contract is named for the companion rather than for any one of them. The
 * word AWARD is deliberately not used loosely here any more: **Component Award** is a bound
 * domain term naming what `awardComponents` does, so the knowledge grant is called a grant
 * and the coin credit is called a credit (issue 1301).
 *
 * `getCraftingEngine().findComponentItems` is named with its full deviations, because a
 * companion that guards only against a null actor still crashes: it takes DOCUMENTS, NOT
 * IDS; its third argument is a crafting-system OBJECT, not an id; and it THROWS on a null
 * actor AND on a null component, with only the system argument tolerant. It is still
 * declared, because a companion legitimately holds its answer — but it is NO LONGER the only
 * route to a stacking placement: `awardComponents` consumes this very method internally and
 * is the supported way to place a component on a sheet, so a companion that wants to place
 * one should call that instead of composing the write itself. Excluding this row would not
 * stop the call — only the deviation being written down.
 *
 * NEW ROWS ARE APPENDED, never interleaved (issue 1293). `getCraftingEngine().findComponentItems`
 * is named as "the eighth member" at four sites — twice in `tests/companion-facade.test.js`,
 * once in `tests/companion-contract.test.js`, and once HERE — and inserting a row above it would
 * falsify all four without any assertion noticing.
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
    ['awardComponents', HOST_FACADE, 'awardComponents', STABLE, METHOD],
    ['creditCurrency', HOST_FACADE, 'creditCurrency', STABLE, METHOD],
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
 * are answered by all SIX `stable` members that are METHODS — `schemaVersion` is a `stable`
 * VALUE and answers no outcome at all — while `noActor` is answered by the FIVE of those that
 * target an actor: `resolveBulkCheckDecision` reads no actor and takes no `actorId`, so it can
 * never answer it. Each member answers with its OWN message key, because a failed grant
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

  // awardComponents (issue 1301). `awarded` and `awardFailed` are answered at BOTH levels —
  // by the call and by an individual placement — deliberately: minting a second word (`placed`)
  // for the concept `awarded` already names is how a caller ends up branching on both, which is
  // the reasoning recorded above for keeping the shipped word `cancelled`. The three tokens
  // below them are ENTRY-LEVEL ONLY and can never be a call-level `outcome`; the list that says
  // so as DATA is {@link COMPONENT_AWARD_ENTRY_OUTCOMES}.
  awarded: 'awarded',
  partiallyAwarded: 'partiallyAwarded',
  awardFailed: 'awardFailed',
  componentNotFound: 'componentNotFound',
  invalidQuantity: 'invalidQuantity',
  multiUnitUnsupported: 'multiUnitUnsupported',
  invalidAwards: 'invalidAwards',

  // creditCurrency (issue 1301). FOUR outcomes carrying THREE values of `credited`: the amount
  // for `credited`, a provable `0` for `creditNotConfigured`, and `null` for both `creditFailed`
  // and `creditUnavailable` — which is the whole rule stated once, `0` MEANS FABRICATE CAN PROVE
  // IT AND `null` MEANS IT CANNOT, with `outcome` carrying the distinction between the two
  // unprovable answers. Nobody should mint a fourth value.
  credited: 'credited',
  creditFailed: 'creditFailed',
  creditUnavailable: 'creditUnavailable',
  creditNotConfigured: 'creditNotConfigured',
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
  // in this block, not three: `buildResult` computes `success` as membership of this list AND the
  // presence of a message key, so omitting the two bulk outcomes would make both of
  // `resolveBulkCheckDecision`'s answers silently report `success: false`.
  COMPANION_OUTCOMES.checkPassed,
  COMPANION_OUTCOMES.checkFailed,
  COMPANION_OUTCOMES.rolled,
  COMPANION_OUTCOMES.decided,
  // "There is nothing to prompt about" is a CORRECT answer, not a failure: asking a GM for a
  // situational bonus for a batch in which nothing rolls is a dialog with no consequence.
  COMPANION_OUTCOMES.nothingToDecide,
  // An award that placed SOME of what was asked is a success carrying a partial total, on the
  // rule this list already states twice: the ACT happened. `awardFailed` is deliberately absent
  // — an act that did not happen at all answers `false`, which is what separates it from
  // `notAffordable`, a QUESTION answered no. Omitting any of these three from this list would
  // make the member silently answer `success: false` for a write that landed, because
  // `buildResult` computes `success` as membership here AND the presence of a message key
  // (issue 1301).
  COMPANION_OUTCOMES.awarded,
  COMPANION_OUTCOMES.partiallyAwarded,
  COMPANION_OUTCOMES.credited,
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
 * The outcomes an award ENTRY can answer with and a CALL never can (issue 1301).
 *
 * Declared as DATA rather than as prose because the split is asserted, not remembered. The
 * shipped dead-vocabulary sweep requires every declared outcome to appear as a key in SOME
 * member's key table, so these three have to sit in {@link COMPONENT_AWARD_MESSAGE_KEYS} even
 * though no call ever answers with one; the member's declared CALL-level set is therefore that
 * table's keys MINUS this list, computed rather than restated.
 *
 * The list is the ENTRY-ONLY tokens, not everything an entry can answer: `awarded` and
 * `awardFailed` are answered at both levels (see {@link COMPANION_OUTCOMES}), so an entry's
 * full vocabulary is this list PLUS those two.
 */
export const COMPONENT_AWARD_ENTRY_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.componentNotFound,
  COMPANION_OUTCOMES.invalidQuantity,
  COMPANION_OUTCOMES.multiUnitUnsupported,
]);

/**
 * `awardComponents`' outcome -> localization key table (issue 1301).
 *
 * The namespace is `Component.Award.*` — a NEW top-level `Component` namespace, minted at
 * `lang/en.json`'s domain-noun tier beside `Knowledge`, `Currency`, `Check`, `Gathering`,
 * `Alchemy`, `Tool` and `System`, where a single-child namespace is entirely normal. (Written
 * without its dotted `FABRICATE.` prefix on purpose, following the shipped note on the grant's
 * table: a partial key literal in a comment is captured by the localization guards as a
 * namespace BASE, and a base declared only by a comment is a reference nothing renders.)
 * **Component** is the most central noun in `DOMAIN.md` and was the one member of that tier
 * with no namespace at all; a `Companion.*` namespace was rejected because it names the ASKER.
 *
 * The table is the UNION of the call-level and entry-level vocabularies, because every
 * placement carries its own `message` and because the dead-vocabulary sweep demands it.
 *
 * `InvalidAwards` is the one string that interpolates anything, and it interpolates the BOUND
 * rather than restating it, exactly as `GrantedByTooLong` does — so the string and
 * {@link AWARD_ENTRIES_MAX} cannot drift apart. Every ENTRY-level key interpolates NOTHING,
 * and that is load-bearing rather than incidental: a placement carries no `messageData` at
 * all, so a placeholder there would put literal braces in front of a GM. The three refusals
 * the FACADE answers with — `gmOnly`, `noActor`, `notReady` — plus `InvalidCallSite` and
 * `NotElected` are placeholder-free for the shipped reason recorded on the check-roll table.
 */
export const COMPONENT_AWARD_MESSAGE_KEYS = Object.freeze({
  [COMPANION_OUTCOMES.awarded]: 'FABRICATE.Component.Award.Awarded',
  [COMPANION_OUTCOMES.partiallyAwarded]: 'FABRICATE.Component.Award.PartiallyAwarded',
  [COMPANION_OUTCOMES.awardFailed]: 'FABRICATE.Component.Award.Failed',
  [COMPANION_OUTCOMES.componentNotFound]: 'FABRICATE.Component.Award.ComponentNotFound',
  [COMPANION_OUTCOMES.invalidQuantity]: 'FABRICATE.Component.Award.InvalidQuantity',
  [COMPANION_OUTCOMES.multiUnitUnsupported]: 'FABRICATE.Component.Award.MultiUnitUnsupported',
  [COMPANION_OUTCOMES.invalidAwards]: 'FABRICATE.Component.Award.InvalidAwards',
  [COMPANION_OUTCOMES.systemNotFound]: 'FABRICATE.Component.Award.SystemNotFound',
  [COMPANION_OUTCOMES.invalidCallSite]: 'FABRICATE.Component.Award.InvalidCallSite',
  [COMPANION_OUTCOMES.notElected]: 'FABRICATE.Component.Award.NotElected',
  [COMPANION_OUTCOMES.gmOnly]: 'FABRICATE.Component.Award.GMOnly',
  [COMPANION_OUTCOMES.noActor]: 'FABRICATE.Component.Award.NoActor',
  [COMPANION_OUTCOMES.notReady]: 'FABRICATE.Component.Award.NotReady',
});

/**
 * `creditCurrency`'s outcome -> localization key table (issue 1301).
 *
 * A `Currency.Credit.*` sibling of the shipped `Currency.Affordability.*`, and NOT a reuse of
 * it: a failed credit must not report itself in the words of a failed check, which is the rule
 * every member's own table exists to keep.
 *
 * `LadderInvalid`, `CreditFailed`, `CreditUnavailable` and `CreditNotConfigured` are the four
 * strings that interpolate `messageData.detail`, which is where the currency layer's FREE TEXT
 * rides so that `message` stays a localization key; a caller of any of them MUST supply
 * `detail`. `Credited` interpolates the actor, the amount and the unit, on the shipped
 * `Affordability.Affordable` shape.
 */
export const CURRENCY_CREDIT_MESSAGE_KEYS = Object.freeze({
  [COMPANION_OUTCOMES.credited]: 'FABRICATE.Currency.Credit.Credited',
  [COMPANION_OUTCOMES.creditFailed]: 'FABRICATE.Currency.Credit.CreditFailed',
  [COMPANION_OUTCOMES.creditUnavailable]: 'FABRICATE.Currency.Credit.CreditUnavailable',
  [COMPANION_OUTCOMES.creditNotConfigured]: 'FABRICATE.Currency.Credit.CreditNotConfigured',
  [COMPANION_OUTCOMES.unitNotFound]: 'FABRICATE.Currency.Credit.UnitNotFound',
  [COMPANION_OUTCOMES.invalidAmount]: 'FABRICATE.Currency.Credit.InvalidAmount',
  [COMPANION_OUTCOMES.ladderEmpty]: 'FABRICATE.Currency.Credit.LadderEmpty',
  [COMPANION_OUTCOMES.ladderInvalid]: 'FABRICATE.Currency.Credit.LadderInvalid',
  [COMPANION_OUTCOMES.invalidCallSite]: 'FABRICATE.Currency.Credit.InvalidCallSite',
  [COMPANION_OUTCOMES.notElected]: 'FABRICATE.Currency.Credit.NotElected',
  [COMPANION_OUTCOMES.gmOnly]: 'FABRICATE.Currency.Credit.GMOnly',
  [COMPANION_OUTCOMES.noActor]: 'FABRICATE.Currency.Credit.NoActor',
  [COMPANION_OUTCOMES.notReady]: 'FABRICATE.Currency.Credit.NotReady',
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

/**
 * The longest `awards` list `awardComponents` accepts, counted in ENTRIES (issue 1301).
 *
 * Bounded because each entry is a Foundry document write, so an unbounded list is an unbounded
 * write batch driven by a caller Fabricate does not control. It starts bounded on
 * {@link GRANTED_BY_MAX_LENGTH}'s reasoning: WIDENING what a published member accepts is free
 * under the compatibility promise, and narrowing it is a `schemaVersion` bump — so the cheap
 * direction is the one that stays available.
 *
 * The refusal string interpolates this bound as `max` rather than restating the number, so a
 * caller answering `invalidAwards` supplies `{ max: AWARD_ENTRIES_MAX }` as its `messageData`.
 */
export const AWARD_ENTRIES_MAX = 64;

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
 * Build one frozen placement record for {@link componentAwardResult}.
 *
 * `index` is the record's POSITION in the answer, taken from the map rather than from the
 * caller's entry, so it cannot disagree with where the record actually sits. `message` is
 * attached here rather than by the member: every entry carries a key from this member's own
 * table, so a caller records each placement without composing free text out of `outcome`,
 * which would invert the contract's "`message` is always a localization key" rule one level
 * down.
 *
 * @param {{componentId: *, requested: *, placed: number, stacked: boolean|null,
 *   outcome: string}} entry the member's INTERNAL record of one attempted placement
 * @param {number} index the entry's position in the caller's own `awards` list
 * @returns {Readonly<{index: number, componentId: *, requested: *, placed: number,
 *   stacked: boolean|null, outcome: string, message: string}>}
 */
function componentAwardPlacement(entry, index) {
  const outcome = entry?.outcome;
  return Object.freeze({
    index,
    // `componentId` and `requested` ECHO the caller's own entry, so a caller maps the answer
    // back onto its request without having kept its own array. An absent value is `null` and
    // never `undefined`: `undefined` is the one value a published field cannot carry, because
    // it does not survive being written to a log or a flag.
    componentId: entry?.componentId ?? null,
    requested: entry?.requested ?? null,
    placed: Number.isFinite(entry?.placed) ? entry.placed : 0,
    stacked: typeof entry?.stacked === 'boolean' ? entry.stacked : null,
    outcome,
    message:
      COMPONENT_AWARD_MESSAGE_KEYS[outcome] ??
      COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.awardFailed],
  });
}

/**
 * Build `awardComponents`' answer (issue 1301).
 *
 * Derived from the outcome and an INTERNAL placement record, on the same rule as
 * {@link checkRollResult}: nothing here is overridable by a caller bag, which matters most on
 * a member that WRITES, and doubly so because `buildResult` writes `success` BEFORE it spreads
 * `extra`.
 *
 * - `placements` — one record per attempted entry, in the caller's own order. A LIST, so its
 *   absence is `[]`; `null` would force every caller to guard a `.length` read. `[]` means
 *   NOTHING WAS ATTEMPTED and a fully populated list beside `awardFailed` means everything was
 *   attempted and nothing landed — the same distinction `groupOutcomeRecord`'s `attempted`
 *   field draws in `currencyAffordance.js`.
 * - `awarded` — SUMMED from `placements[].placed` here, and never passed in. A caller-supplied
 *   total could disagree with the placements it accompanies and a reader would have no way to
 *   know which was right.
 *
 *   It is `null` for every pre-attempt refusal and `0` for `awardFailed`. **Read that beside
 *   `credited`, which is `0` for the same refusal class, and the two are not inconsistent:**
 *   `awarded` is a SUM OVER `placements[]`, so an empty attempt record makes the sum vacuous
 *   rather than zero, while `credited` has no companion structure to be vacuous over and falls
 *   to the pure provability rule (`0` when Fabricate can prove nothing moved).
 *
 * The whole answer is DEEP-frozen — the result, the array and every entry — because
 * `assertContractResult` checks `Object.isFrozen(result)` only, so a one-level freeze here
 * would publish a mutable log record with nothing failing.
 *
 * @param {string} outcome one of {@link COMPANION_OUTCOMES}
 * @param {object|null} [messageData] interpolation data; carries `max` for `invalidAwards`
 * @param {{placements: Array<object>}|null} [record] the member's INTERNAL placement record
 * @returns {Readonly<{success: boolean, awarded: number|null, placements: Array<object>,
 *   outcome: string, message: string, messageData?: object}>}
 */
export function componentAwardResult(outcome, messageData = null, record = null) {
  const placements = Object.freeze(
    (Array.isArray(record?.placements) ? record.placements : []).map(componentAwardPlacement)
  );
  return buildResult(
    outcome,
    COMPONENT_AWARD_MESSAGE_KEYS,
    COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.awardFailed],
    messageData,
    {
      awarded:
        placements.length === 0
          ? null
          : placements.reduce((total, placement) => total + placement.placed, 0),
      placements,
    }
  );
}

/**
 * The outcomes for which Fabricate can PROVE nothing was credited: `creditNotConfigured`, and
 * every refusal taken before any mechanism ran.
 *
 * It is the same set as the member's published ZERO-MUTATION retry set, and that is a property
 * rather than a coincidence: an answer Fabricate may promise mutated nothing is exactly an
 * answer whose `credited` it can state as `0`. The three absent tokens are the three under
 * which a mechanism ran — `credited`, `creditFailed` and `creditUnavailable`.
 */
const PROVABLY_ZERO_CREDIT_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.creditNotConfigured,
  COMPANION_OUTCOMES.invalidAmount,
  COMPANION_OUTCOMES.ladderEmpty,
  COMPANION_OUTCOMES.ladderInvalid,
  COMPANION_OUTCOMES.unitNotFound,
  COMPANION_OUTCOMES.invalidCallSite,
  COMPANION_OUTCOMES.notElected,
  COMPANION_OUTCOMES.gmOnly,
  COMPANION_OUTCOMES.noActor,
  COMPANION_OUTCOMES.notReady,
]);

/**
 * Build `creditCurrency`'s answer (issue 1301).
 *
 * `credited` is DERIVED from the outcome and an INTERNAL credit record, never passed through
 * from the request — the {@link affordabilityResult} rule, on a member that moves money.
 * FOUR outcomes carry THREE values, and nobody should mint a fourth:
 *
 * - the AMOUNT for `credited`, which the member states only after it has OBSERVED the credit;
 * - `0` for every outcome in {@link PROVABLY_ZERO_CREDIT_OUTCOMES} — `creditNotConfigured` and
 *   every refusal taken before any mechanism ran;
 * - `null` for `creditFailed` and `creditUnavailable` alike, because in both a mechanism ran
 *   and Fabricate cannot prove what it did. Reporting `0` for `creditFailed` would state a
 *   third party's word as Fabricate's own proof, which is the collapse the shipped rule at
 *   {@link affordabilityResult} exists to prevent one member over.
 *
 * So `0` MEANS FABRICATE CAN PROVE IT and `null` MEANS IT CANNOT, with `outcome` carrying the
 * `creditFailed`/`creditUnavailable` distinction — one rule stated twice rather than two fields
 * that can disagree. An outcome this member does not declare falls to `null` for the same
 * reason: an unrecognised answer proves nothing.
 *
 * @param {string} outcome one of {@link COMPANION_OUTCOMES}
 * @param {object|null} [messageData] interpolation data; carries `detail` for the four outcomes
 *   whose underlying failure is free text
 * @param {{amount: number}|null} [credit] the member's INTERNAL record of what it observed
 * @returns {Readonly<{success: boolean, credited: number|null, outcome: string, message: string,
 *   messageData?: object}>}
 */
export function currencyCreditResult(outcome, messageData = null, credit = null) {
  let credited = null;
  if (outcome === COMPANION_OUTCOMES.credited) credited = credit?.amount ?? null;
  else if (PROVABLY_ZERO_CREDIT_OUTCOMES.includes(outcome)) credited = 0;
  return buildResult(
    outcome,
    CURRENCY_CREDIT_MESSAGE_KEYS,
    CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.creditUnavailable],
    messageData,
    { credited }
  );
}

/**
 * The CALL-SITE rule, shared by every member that declares one and existing exactly ONCE.
 *
 * A second shared rule beside the authorization preamble, deliberately separate because it
 * answers a different question: the preamble asks WHO is calling, this asks WHERE FROM. It
 * runs AFTER the readiness refusal, because it is request validation and that is where every
 * other member's request validation sits (`invalidGrantedBy`, `invalidAmount`,
 * `invalidQuantity`).
 *
 * It lives HERE, in the Foundry-free leaf that already owns {@link COMPANION_CALL_SITES},
 * rather than in any one member's module: four members now gate on it, and the canonical
 * requirement is that the rule exists once. It is pure — the election arrives as a seam — so
 * this module stays a leaf, and a member that lifted its own copy would be free to drift on
 * exactly the question a write may not be wrong about (issue 1301, D13).
 *
 * `invalidCallSite` covers BOTH a missing and an unrecognised declaration: "not declared" is
 * wrong for the second, and a caller cannot fix what it is not told.
 *
 * @param {object|null} request the member's own request
 * @param {{isElectedExecutor: () => boolean}} seams
 * @returns {string|null} the refusal outcome, or `null` when the call site is admitted
 */
export function gateCompanionCallSite(request, seams) {
  const callSite = request?.callSite;
  if (callSite !== COMPANION_CALL_SITES.gmAction && callSite !== COMPANION_CALL_SITES.broadcast) {
    return COMPANION_OUTCOMES.invalidCallSite;
  }
  // A broadcast handler fires on EVERY connected client. Without this, N clients each roll N
  // DIFFERENT totals and return them to N companion instances, which then apply N sets of
  // consequences Fabricate can neither see nor reconcile — and on a member that WRITES it is N
  // writes of N units each, applied to a player's sheet, with no natural key to absorb the
  // repeats. The election admits assistant GMs and prefers a full GM only when one is
  // connected, so a sole connected assistant IS elected.
  if (callSite === COMPANION_CALL_SITES.broadcast && seams.isElectedExecutor() !== true) {
    return COMPANION_OUTCOMES.notElected;
  }
  return null;
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
 *
 * `callSites` is published for the same stated reason `outcomes` is: a caller should be able
 * to read a SYMBOL rather than write a bare string. It matters more here than there, because
 * `callSite` is the one REQUIRED, no-default, refused-on-mismatch input the contract has —
 * `invalidCallSite` is the whole of a typo's punishment, and nothing else tells the author
 * they mistyped a literal they were instructed to write by hand.
 */
export const COMPANION_CONTRACT = Object.freeze({
  schemaVersion: COMPANION_CONTRACT_SCHEMA_VERSION,
  members: COMPANION_MEMBERS,
  outcomes: COMPANION_OUTCOMES,
  callSites: COMPANION_CALL_SITES,
});
