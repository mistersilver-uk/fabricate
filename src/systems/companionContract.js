/**
 * The vocabulary of `game.fabricate.api.companion`, Fabricate's versioned contract for
 * behavioural consumption by a companion module (issue 1289). The compatibility promise is owned
 * by `openspec/specs/companion-api/spec.md` and `docs/api/index.md` ("Companion Contract").
 * A Foundry-free leaf: version, member table, outcome tokens, message keys and the normalizers a
 * member needs. Members live with their behaviour; `buildApiClasses` in
 * `src/bootstrap/publicApi.js` assigns the descriptor.
 * While the schema version is unchanged a member keeps its name, arguments and answer shape; it
 * may gain an optional argument or result field, and a new member needs no bump. Removing,
 * renaming or narrowing one is a `schemaVersion` bump. Nothing outside the declared set is
 * contract. A `stable` member never throws and its `message` is always a localization key (free
 * text rides in `messageData.detail`); a `handle` member promises only the accessor's name and
 * its `null`-before-readiness answer.
 */

import { CHECK_EVALUATION_CAPABILITIES } from './companionCheckEvaluation.js';

/**
 * The contract version; a companion refuses one it does not understand. Readable from
 * Fabricate's own `init` onward but not from another package's `init` (script execution order,
 * see `.agents/docs/foundry-and-architecture.md`), so a companion reads it in `setup` or `ready`
 * and treats an absent `game.fabricate` as not yet loaded.
 */
export const COMPANION_CONTRACT_SCHEMA_VERSION = 1;

/** Member promise tiers; the field is `promise`, since bare "tier" is the Outcome Tier term. */
export const COMPANION_PROMISES = Object.freeze({
  stable: 'stable',
  handle: 'handle',
});

/**
 * Where a member is read from: the `contract` descriptor, the `game.fabricate` `facade`, or the
 * object `getCraftingEngine()` answers (`craftingEngine`).
 */
export const COMPANION_MEMBER_HOSTS = Object.freeze({
  contract: 'contract',
  facade: 'facade',
  craftingEngine: 'craftingEngine',
});

/** `accessor` narrows `method` to the four `handle` getters that answer `null` before init. */
export const COMPANION_MEMBER_KINDS = Object.freeze({
  value: 'value',
  method: 'method',
  accessor: 'accessor',
});

/** One frozen member row; the table below is fourteen TUPLES through this one factory. */
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
 * The declared member set, one promise tier each; "award" is reserved for the Component Award.
 * `getCraftingEngine().findComponentItems` takes documents, not ids, a system object as its
 * third argument, and throws on a null actor or component; `awardComponents` is the supported
 * placement route. The pooled pair address actors by UUID: `game.actors.get()` cannot tell an
 * unlinked token actor from its prototype (issue 1342).
 * New rows are appended, never interleaved (issue 1293): four sites, this one included, name
 * `getCraftingEngine().findComponentItems` "the eighth member".
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
    ['readPooledHoldings', HOST_FACADE, 'readPooledHoldings', STABLE, METHOD],
    ['consumePooledHoldings', HOST_FACADE, 'consumePooledHoldings', STABLE, METHOD],
  ].map(companionMember)
);

/**
 * The outcome vocabulary, open by declaration and closed by enumeration: a member may emit a new
 * outcome without a bump, renaming or removing one is a bump, and callers branch on `success`
 * first and treat an unknown `outcome` as a generic refusal. Each token maps to itself.
 * `gmOnly` and `notReady` are answered by all eight `stable` members that are methods, and
 * `noActor` by the seven of those that target an actor (not `resolveBulkCheckDecision`).
 */
export const COMPANION_OUTCOMES = Object.freeze({
  // Shared, in the gate order GM -> actor -> readiness.
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

  // rollActorCheck (issue 1293). The `check` prefix says the check failed, not the call.
  checkPassed: 'checkPassed',
  checkFailed: 'checkFailed',
  rolled: 'rolled',
  rollFailed: 'rollFailed',
  engineUnavailable: 'engineUnavailable',
  noFormula: 'noFormula',
  invalidRollDecision: 'invalidRollDecision',
  evaluationInvalid: 'evaluationInvalid',
  evaluationUnsupported: 'evaluationUnsupported',

  // Shared by the call-site members. `cancelled` is the shipped word for a dismissed roll prompt.
  cancelled: 'cancelled',
  invalidCallSite: 'invalidCallSite',
  notElected: 'notElected',

  // resolveBulkCheckDecision
  decided: 'decided',
  nothingToDecide: 'nothingToDecide',

  // awardComponents (issue 1301). `awarded` and `awardFailed` answer at both levels; the rest are
  // entry-level only (`COMPONENT_AWARD_ENTRY_OUTCOMES`).
  awarded: 'awarded',
  partiallyAwarded: 'partiallyAwarded',
  awardFailed: 'awardFailed',
  componentNotFound: 'componentNotFound',
  invalidQuantity: 'invalidQuantity',
  multiUnitUnsupported: 'multiUnitUnsupported',
  invalidAwards: 'invalidAwards',

  // creditCurrency (issue 1301). `credited` is the amount, a provable `0` (`creditNotConfigured`)
  // or `null` (`creditFailed`, `creditUnavailable`): `0` means provable, `null` means not.
  credited: 'credited',
  creditFailed: 'creditFailed',
  creditUnavailable: 'creditUnavailable',
  creditNotConfigured: 'creditNotConfigured',

  // readPooledHoldings (issue 1342). `read` and `readFailed` answer at both levels; the rest are
  // reading-level only. Both pooled members fail closed on a set that does not fully resolve:
  // `noActor` when none resolves, `invalidActorUuids` for a bad or partly resolved list.
  // `costTypeUnsupported` is a declared axis not served; `invalidCostType` names no axis.
  read: 'read',
  readFailed: 'readFailed',
  balanceNotConfigured: 'balanceNotConfigured',
  toolNotFound: 'toolNotFound',
  invalidCostType: 'invalidCostType',
  costTypeUnsupported: 'costTypeUnsupported',
  invalidCosts: 'invalidCosts',
  invalidActorUuids: 'invalidActorUuids',

  // consumePooledHoldings (issue 1342). `consumed`, `consumeFailed` and `insufficient` answer at
  // both levels; `notAttempted` is row-only. `insufficient` is a refused act, unlike the successful
  // `notAffordable`. The take is all-or-nothing, so there is no `partiallyConsumed`.
  consumed: 'consumed',
  consumeFailed: 'consumeFailed',
  insufficient: 'insufficient',
  notAttempted: 'notAttempted',
});

/**
 * Where a caller calls from; required with no default, since nothing distinguishes a GM click
 * from a synced tick firing on every client. `gmAction` is gated on `isGM` alone; `broadcast`
 * also requires the elected executor (`notElected`), or N clients apply N different results.
 * A missing or unknown value is an `invalidCallSite` refusal, never a throw.
 */
export const COMPANION_CALL_SITES = Object.freeze({
  gmAction: 'gmAction',
  broadcast: 'broadcast',
});

/**
 * Outcomes that answer `success: true`: the question was answered or the act happened, so
 * `alreadyKnown` and `notAffordable` are successes. `buildResult` also requires a message key,
 * so an outcome omitted here silently answers `false`.
 */
const SUCCESSFUL_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.granted,
  COMPANION_OUTCOMES.alreadyKnown,
  COMPANION_OUTCOMES.affordable,
  COMPANION_OUTCOMES.notAffordable,
  // Every rolled outcome, plus both bulk-decision answers.
  COMPANION_OUTCOMES.checkPassed,
  COMPANION_OUTCOMES.checkFailed,
  COMPANION_OUTCOMES.rolled,
  COMPANION_OUTCOMES.decided,
  COMPANION_OUTCOMES.nothingToDecide,
  // A partial award is an act that happened; `awardFailed` is absent.
  COMPANION_OUTCOMES.awarded,
  COMPANION_OUTCOMES.partiallyAwarded,
  COMPANION_OUTCOMES.credited,
  // `insufficient` and `consumeFailed` are absent: refused or failed acts (issue 1342).
  COMPANION_OUTCOMES.read,
  COMPANION_OUTCOMES.consumed,
]);

/**
 * `grantRecipeKnowledge`'s outcome -> key table. Comments name key namespaces without the dotted
 * prefix: the localization guards capture a partial key literal as a namespace base.
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

/** `checkAffordability`'s table; `LadderInvalid` and `CheckUnavailable` need `detail`. */
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
 * `rollActorCheck`'s table (issue 1293); namespaces name what they are about, never who asks.
 * `RollFailed` is the generic refusal and needs `detail`. The facade refusals, `InvalidCallSite`
 * and `NotElected` interpolate nothing: they are answered before a label exists.
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
  [COMPANION_OUTCOMES.evaluationInvalid]: 'FABRICATE.Check.Roll.EvaluationInvalid',
  [COMPANION_OUTCOMES.evaluationUnsupported]: 'FABRICATE.Check.Roll.EvaluationUnsupported',
  [COMPANION_OUTCOMES.invalidCallSite]: 'FABRICATE.Check.Roll.InvalidCallSite',
  [COMPANION_OUTCOMES.notElected]: 'FABRICATE.Check.Roll.NotElected',
  [COMPANION_OUTCOMES.gmOnly]: 'FABRICATE.Check.Roll.GMOnly',
  [COMPANION_OUTCOMES.noActor]: 'FABRICATE.Check.Roll.NoActor',
  [COMPANION_OUTCOMES.notReady]: 'FABRICATE.Check.Roll.NotReady',
});

/**
 * The label a Standalone Check Roll uses when none is supplied. The chat flavor appends ` check`
 * unguarded, so it is an activity noun; a translation must not itself end in "check".
 */
export const CHECK_ROLL_DEFAULT_LABEL = Object.freeze({
  key: 'FABRICATE.Check.Roll.DefaultLabel',
  fallback: 'Fabricate',
});

/** `resolveBulkCheckDecision`'s table (issue 1293); no `noActor`, as it reads no actor. */
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
 * The bulk decision's generic refusal, a string with no outcome: `rollFailed` would misdescribe a
 * member that never rolls and `cancelled` would report a malfunction as a decline.
 */
const BULK_CHECK_DECISION_FALLBACK_KEY = 'FABRICATE.Check.BulkDecision.Failed';

/**
 * Entry-only award outcomes, as data (issue 1301): the dead-vocabulary sweep needs them in the
 * key table, so the call-level set is that table's keys minus this list.
 */
export const COMPONENT_AWARD_ENTRY_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.componentNotFound,
  COMPANION_OUTCOMES.invalidQuantity,
  COMPANION_OUTCOMES.multiUnitUnsupported,
]);

/**
 * `awardComponents`' table (issue 1301): the union of call- and entry-level vocabularies.
 * `InvalidAwards` interpolates `max`; entry-level keys interpolate nothing, since a placement
 * carries no `messageData`.
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
 * `creditCurrency`'s table (issue 1301), apart from `Currency.Affordability` so a failed credit
 * never speaks as a failed check. `LadderInvalid` and the three `Credit*` refusals need `detail`.
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
 * The cost axes a pooled request may name, as symbols (issue 1342). Which a member serves is its
 * own behaviour: the consume refuses a tool as `costTypeUnsupported`, as wear is out of scope.
 */
export const POOLED_COST_TYPES = Object.freeze({
  component: 'component',
  currency: 'currency',
  tool: 'tool',
});

/**
 * Real axes no pooled member serves (`costTypeUnsupported`, "not yet"), kept apart from a string
 * naming no axis (`invalidCostType`) and out of `POOLED_COST_TYPES`, which a caller may pass.
 */
export const POOLED_UNSERVED_COST_TYPES = Object.freeze(['essence', 'tag']);

/**
 * The shipped Required Tool Display State vocabulary. It is display-only, so a reading's
 * `sufficient` is `state === 'present'` alone: the start-attempt gate refuses a damaged tool.
 */
export const POOLED_TOOL_STATES = Object.freeze({
  present: 'present',
  damaged: 'damaged',
  missing: 'missing',
});

/** The tool states as a list, hoisted so the reading builder validates without re-deriving. */
const POOLED_TOOL_STATE_TOKENS = Object.freeze(Object.values(POOLED_TOOL_STATES));

/**
 * Reading-only outcomes, as data (issue 1342). `balanceNotConfigured` is reading-level on
 * purpose: it answers `available: null` for a currency cost and blocks nothing else.
 */
export const POOLED_HOLDINGS_READ_ENTRY_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.componentNotFound,
  COMPANION_OUTCOMES.unitNotFound,
  COMPANION_OUTCOMES.toolNotFound,
  COMPANION_OUTCOMES.balanceNotConfigured,
  COMPANION_OUTCOMES.invalidCostType,
  COMPANION_OUTCOMES.costTypeUnsupported,
  COMPANION_OUTCOMES.invalidQuantity,
]);

/**
 * `readPooledHoldings`' table (issue 1342). `InvalidCosts` and `InvalidActorUuids` interpolate
 * their bound as `max`; reading-level keys interpolate nothing.
 */
export const POOLED_HOLDINGS_READ_MESSAGE_KEYS = Object.freeze({
  [COMPANION_OUTCOMES.read]: 'FABRICATE.Holdings.Read.Read',
  [COMPANION_OUTCOMES.readFailed]: 'FABRICATE.Holdings.Read.Failed',
  [COMPANION_OUTCOMES.componentNotFound]: 'FABRICATE.Holdings.Read.ComponentNotFound',
  [COMPANION_OUTCOMES.unitNotFound]: 'FABRICATE.Holdings.Read.UnitNotFound',
  [COMPANION_OUTCOMES.toolNotFound]: 'FABRICATE.Holdings.Read.ToolNotFound',
  [COMPANION_OUTCOMES.balanceNotConfigured]: 'FABRICATE.Holdings.Read.BalanceNotConfigured',
  [COMPANION_OUTCOMES.invalidCostType]: 'FABRICATE.Holdings.Read.InvalidCostType',
  [COMPANION_OUTCOMES.costTypeUnsupported]: 'FABRICATE.Holdings.Read.CostTypeUnsupported',
  [COMPANION_OUTCOMES.invalidQuantity]: 'FABRICATE.Holdings.Read.InvalidQuantity',
  [COMPANION_OUTCOMES.invalidCosts]: 'FABRICATE.Holdings.Read.InvalidCosts',
  [COMPANION_OUTCOMES.invalidActorUuids]: 'FABRICATE.Holdings.Read.InvalidActorUuids',
  [COMPANION_OUTCOMES.gmOnly]: 'FABRICATE.Holdings.Read.GMOnly',
  [COMPANION_OUTCOMES.noActor]: 'FABRICATE.Holdings.Read.NoActor',
  [COMPANION_OUTCOMES.notReady]: 'FABRICATE.Holdings.Read.NotReady',
});

/**
 * Row-only consume outcomes (issue 1342). `notAttempted` marks every other row when one shortfall
 * refuses the call; `systemNotFound` is per row because each cost carries its own `systemId`.
 */
export const POOLED_HOLDINGS_CONSUME_ENTRY_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.notAttempted,
  COMPANION_OUTCOMES.componentNotFound,
  COMPANION_OUTCOMES.unitNotFound,
  COMPANION_OUTCOMES.systemNotFound,
  COMPANION_OUTCOMES.invalidCostType,
  COMPANION_OUTCOMES.costTypeUnsupported,
  COMPANION_OUTCOMES.invalidQuantity,
]);

/**
 * `consumePooledHoldings`' table (issue 1342). `CreditNotConfigured` interpolates nothing: it is
 * answered up front, when a `macro` world has no `increment` macro to give the coin back.
 */
export const POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS = Object.freeze({
  [COMPANION_OUTCOMES.consumed]: 'FABRICATE.Holdings.Consume.Consumed',
  [COMPANION_OUTCOMES.consumeFailed]: 'FABRICATE.Holdings.Consume.Failed',
  [COMPANION_OUTCOMES.insufficient]: 'FABRICATE.Holdings.Consume.Insufficient',
  [COMPANION_OUTCOMES.notAttempted]: 'FABRICATE.Holdings.Consume.NotAttempted',
  [COMPANION_OUTCOMES.componentNotFound]: 'FABRICATE.Holdings.Consume.ComponentNotFound',
  [COMPANION_OUTCOMES.unitNotFound]: 'FABRICATE.Holdings.Consume.UnitNotFound',
  [COMPANION_OUTCOMES.systemNotFound]: 'FABRICATE.Holdings.Consume.SystemNotFound',
  [COMPANION_OUTCOMES.invalidCostType]: 'FABRICATE.Holdings.Consume.InvalidCostType',
  [COMPANION_OUTCOMES.costTypeUnsupported]: 'FABRICATE.Holdings.Consume.CostTypeUnsupported',
  [COMPANION_OUTCOMES.invalidQuantity]: 'FABRICATE.Holdings.Consume.InvalidQuantity',
  [COMPANION_OUTCOMES.invalidCosts]: 'FABRICATE.Holdings.Consume.InvalidCosts',
  [COMPANION_OUTCOMES.invalidActorUuids]: 'FABRICATE.Holdings.Consume.InvalidActorUuids',
  [COMPANION_OUTCOMES.creditNotConfigured]: 'FABRICATE.Holdings.Consume.CreditNotConfigured',
  [COMPANION_OUTCOMES.invalidCallSite]: 'FABRICATE.Holdings.Consume.InvalidCallSite',
  [COMPANION_OUTCOMES.notElected]: 'FABRICATE.Holdings.Consume.NotElected',
  [COMPANION_OUTCOMES.gmOnly]: 'FABRICATE.Holdings.Consume.GMOnly',
  [COMPANION_OUTCOMES.noActor]: 'FABRICATE.Holdings.Consume.NoActor',
  [COMPANION_OUTCOMES.notReady]: 'FABRICATE.Holdings.Consume.NotReady',
});

/**
 * The GM Knowledge surface's two granted source rungs, declared beside the grant that writes
 * `granted` and `grantedBy`. The labelled rung interpolates `{grantedBy}`, never `{source}`,
 * which already means the book. Neither asserts who granted: the flag is public, so a third-party
 * module can write `granted: true` without the GM gate.
 */
export const GRANTED_SOURCE_MESSAGE_KEYS = Object.freeze({
  labelled: 'FABRICATE.Admin.Manager.Knowledge.LearnedByGrant',
  unlabelled: 'FABRICATE.Admin.Manager.Knowledge.LearnedByGrantUnlabelled',
});

/** The longest trimmed `grantedBy`; persisted on a player actor, and interpolated as `max`. */
export const GRANTED_BY_MAX_LENGTH = 64;

/**
 * The longest `awards` list (issue 1301): each entry is a document write. Widening is free under
 * the promise and narrowing is a bump, so it starts bounded; interpolated as `max`.
 */
export const AWARD_ENTRIES_MAX = 64;

/**
 * The longest pooled `actorUuids` list (issue 1342), lower than `AWARD_ENTRIES_MAX` because the
 * work is the product of this and `POOLED_COSTS_MAX`; interpolated as `max`.
 */
export const POOLED_ACTORS_MAX = 32;

/** The longest pooled `costs` list, the other half of that product; interpolated as `max`. */
export const POOLED_COSTS_MAX = 32;

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

/** Build the grant's answer; an undeclared outcome is a generic refusal, never a throw. */
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
 * Build `checkAffordability`'s answer. `affordable` is derived: `true`, `false` for
 * `notAffordable`, and `null` for every refusal, so "short" never reads as "unanswerable".
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

/** The outcomes that rolled a die and carry roll data; a refusal answers `total: null`. */
const ROLLED_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.checkPassed,
  COMPANION_OUTCOMES.checkFailed,
  COMPANION_OUTCOMES.rolled,
]);

/**
 * Build `rollActorCheck`'s answer from the outcome and the runner-owned record, never a caller bag.
 * `passed` is `null` when ungraded and `total` is `null` for a refusal, while rolled `0` stays `0`.
 * Refusals use empty dice data and omit executed evaluation fields, which come only from the runner.
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
      ...(rolled && {
        product: roll?.product ?? null,
        direction: roll?.direction ?? null,
        comparison: roll?.comparison ?? null,
        target: roll?.target ?? null,
        margin: roll?.margin ?? null,
        successes: roll?.successes ?? null,
        cancelled: roll?.cancelled ?? null,
      }),
    }
  );
}

/** The outcomes for which a batch was assessed, and so the two that carry coverage. */
const ASSESSED_BULK_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.decided,
  COMPANION_OUTCOMES.nothingToDecide,
]);

/**
 * Build `resolveBulkCheckDecision`'s answer (issue 1293), derived as `checkRollResult` is.
 * `decision` is set only for `decided` and has no `confirmed` key, which the evaluator reads as
 * a cancellation. `covered` holds indices into the caller's `formulas`, since formulas repeat.
 * `allowAdvantage` is `null` for a refusal and `false` for `nothingToDecide`, where no usable
 * formula could honour Advantage.
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

/** One frozen placement; `message` is this member's key, so no caller composes free text. */
function componentAwardPlacement(entry, index) {
  const outcome = entry?.outcome;
  return Object.freeze({
    index,
    // Echoes the caller's entry; absent is `null`, since `undefined` does not survive a log.
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
 * Build `awardComponents`' answer (issue 1301), derived as `checkRollResult` is. `placements: []`
 * means nothing was attempted. `awarded` is summed from `placements`: `null` before an attempt
 * and `0` for `awardFailed`. Deep-frozen, as `assertContractResult` checks only the top level.
 */
export function componentAwardResult(outcome, messageData = null, record = null) {
  const placements = Object.freeze(
    (Array.isArray(record?.placements) ? record.placements : []).map((entry, index) =>
      // An explicit arrow: `.map` passes a third argument a later parameter would receive.
      componentAwardPlacement(entry, index)
    )
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
 * Outcomes where Fabricate can prove nothing was credited, the member's zero-mutation retry set;
 * `credited`, `creditFailed` and `creditUnavailable` ran a mechanism.
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
 * Build `creditCurrency`'s answer (issue 1301). `credited` is the observed amount for `credited`,
 * `0` for a provably-zero outcome, and `null` for `creditFailed`, `creditUnavailable` or an
 * undeclared outcome: `0` means Fabricate can prove it, `null` means it cannot.
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

/** The cost identity both pooled builders echo; absent is `null`, never `undefined`. */
function pooledCostEcho(entry) {
  return {
    type: typeof entry?.type === 'string' ? entry.type : null,
    systemId: entry?.systemId ?? null,
    componentId: entry?.componentId ?? null,
    unitId: entry?.unitId ?? null,
    requested: Number.isFinite(entry?.requested) ? entry.requested : null,
  };
}

/** Freeze an internal per-entry list, through an explicit arrow for `.map`'s third argument. */
function frozenPooledEntries(list, build) {
  return Object.freeze(
    (Array.isArray(list) ? list : []).map((entry, index) => build(entry, index))
  );
}

/** The resolved actor set, echoed so a caller sees exactly which set the answer covers. */
function frozenActorUuids(list) {
  return Object.freeze(
    (Array.isArray(list) ? list : []).filter((uuid) => typeof uuid === 'string' && uuid !== '')
  );
}

/**
 * One frozen cost reading (issue 1342). `available` is the pooled count, or `null` when it cannot
 * be proven (a `macro` world with no `balance` macro). `sufficient` is derived from it, except a
 * tool's: `state === 'present'` only. `ambiguous` flags a name matching in several systems.
 */
function pooledHoldingsReading(entry, index) {
  const outcome = entry?.outcome;
  const echo = pooledCostEcho(entry);
  const state = POOLED_TOOL_STATE_TOKENS.includes(entry?.state) ? entry.state : null;
  const available = Number.isFinite(entry?.available) ? entry.available : null;
  let sufficient = null;
  if (state !== null) sufficient = state === POOLED_TOOL_STATES.present;
  else if (available !== null && echo.requested !== null) sufficient = available >= echo.requested;
  return Object.freeze({
    index,
    ...echo,
    name: typeof entry?.name === 'string' ? entry.name : null,
    available,
    sufficient,
    state,
    ambiguous: entry?.ambiguous === true,
    outcome,
    message:
      POOLED_HOLDINGS_READ_MESSAGE_KEYS[outcome] ??
      POOLED_HOLDINGS_READ_MESSAGE_KEYS[COMPANION_OUTCOMES.readFailed],
  });
}

/**
 * Build `readPooledHoldings`' answer (issue 1342), derived and deep-frozen as
 * `componentAwardResult` is. Exact at read time but not a reservation: a caller that must not
 * overdraw calls the consume and reads its refusal.
 */
export function pooledHoldingsReadResult(outcome, messageData = null, record = null) {
  return buildResult(
    outcome,
    POOLED_HOLDINGS_READ_MESSAGE_KEYS,
    POOLED_HOLDINGS_READ_MESSAGE_KEYS[COMPANION_OUTCOMES.readFailed],
    messageData,
    {
      actorUuids: frozenActorUuids(record?.actorUuids),
      readings: frozenPooledEntries(record?.readings, pooledHoldingsReading),
    }
  );
}

/**
 * The row outcomes under which a write was issued (`attempted: true`); a shortfall row is refused
 * before any write.
 */
const ATTEMPTED_CONSUME_OUTCOMES = Object.freeze([
  COMPANION_OUTCOMES.consumed,
  COMPANION_OUTCOMES.consumeFailed,
]);

/**
 * One frozen take line: which document on which actor paid, and how much. `documentUuid` is
 * `null` for a currency settled as an actor property. A currency `quantity` is in the world's
 * terminal base unit, not the caller's denomination, so `unitId` names its unit and `share`
 * decomposes it into whole coins; a component take answers `null` and `[]` (issue 1342).
 */
function pooledConsumptionTake(take) {
  return Object.freeze({
    actorUuid: typeof take?.actorUuid === 'string' ? take.actorUuid : null,
    documentUuid: typeof take?.documentUuid === 'string' ? take.documentUuid : null,
    quantity: Number.isFinite(take?.quantity) ? take.quantity : 0,
    unitId: typeof take?.unitId === 'string' ? take.unitId : null,
    share: Object.freeze(
      (Array.isArray(take?.share) ? take.share : []).map((entry) => pooledConsumptionShare(entry))
    ),
  });
}

/** One frozen denomination line of a take's `share`, normalised for a companion's chat card. */
function pooledConsumptionShare(entry) {
  return Object.freeze({
    unitId: typeof entry?.unitId === 'string' ? entry.unitId : null,
    unitLabel: typeof entry?.unitLabel === 'string' ? entry.unitLabel : '',
    amount: Number.isFinite(entry?.amount) ? entry.amount : 0,
  });
}

/** One frozen ledger row: `consumed` is summed from `takes` and `attempted` is derived. */
function pooledConsumptionRow(entry, index) {
  const outcome = entry?.outcome;
  const takes = Object.freeze(
    (Array.isArray(entry?.takes) ? entry.takes : []).map((take) => pooledConsumptionTake(take))
  );
  return Object.freeze({
    index,
    ...pooledCostEcho(entry),
    attempted: ATTEMPTED_CONSUME_OUTCOMES.includes(outcome),
    consumed: takes.reduce((total, take) => total + take.quantity, 0),
    takes,
    outcome,
    message:
      POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS[outcome] ??
      POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS[COMPANION_OUTCOMES.consumeFailed],
  });
}

/**
 * Build `consumePooledHoldings`' answer (issue 1342), derived as `componentAwardResult` is.
 * `ledger: []` means nothing was attempted; beside `consumeFailed` a full ledger means the take
 * rolled back. `consumed` is summed from the rows, `null` before an attempt. Not idempotent: the
 * caller owns not double-consuming.
 */
export function pooledHoldingsConsumeResult(outcome, messageData = null, record = null) {
  const ledger = frozenPooledEntries(record?.ledger, pooledConsumptionRow);
  return buildResult(
    outcome,
    POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS,
    POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS[COMPANION_OUTCOMES.consumeFailed],
    messageData,
    {
      actorUuids: frozenActorUuids(record?.actorUuids),
      consumed: ledger.length === 0 ? null : ledger.reduce((total, row) => total + row.consumed, 0),
      ledger,
    }
  );
}

/**
 * The call-site rule, existing once for every member that declares one (issue 1301, D13): pure,
 * with election as a seam, run after the readiness refusal. `invalidCallSite` covers a missing
 * and an unrecognised value alike.
 */
export function gateCompanionCallSite(request, seams) {
  const callSite = request?.callSite;
  if (callSite !== COMPANION_CALL_SITES.gmAction && callSite !== COMPANION_CALL_SITES.broadcast) {
    return COMPANION_OUTCOMES.invalidCallSite;
  }
  // Without election, N clients apply N different results. The election admits assistant GMs and
  // prefers a full GM only when one is connected.
  if (callSite === COMPANION_CALL_SITES.broadcast && seams.isElectedExecutor() !== true) {
    return COMPANION_OUTCOMES.notElected;
  }
  return null;
}

/**
 * Resolve one address, logging a throw and answering `null` so a `stable` member never throws.
 * `fromUuidSync` raises on a pack-sourced embedded address: `strict` defaults to `true` on
 * V13.351 and V14.365.
 */
function resolveOnePooledActor(uuid, seams) {
  try {
    return seams.resolveActor(uuid) ?? null;
  } catch (error) {
    console.error(`Fabricate | Could not resolve the pooled holdings address "${uuid}"`, error);
    return null;
  }
}

/**
 * The actor-set rule both pooled members apply, once (issue 1342); the facade owns the GM gate.
 * Both halves fail closed: `noActor` when no address resolves, `invalidActorUuids` when the list
 * is absent, empty, over `POOLED_ACTORS_MAX`, non-string, partly resolved, or names one document
 * twice. Duplicates are tested by object identity, never `id`: a linked token's actor and its
 * world actor resolve to one document (double-counting a stack), while an unlinked token's
 * synthetic actor shares its base actor's `id` yet is a distinct pool (`ActorDelta#applyDelta`).
 */
export function gatePooledActorUuids(actorUuids, seams) {
  const wanted = Array.isArray(actorUuids) ? actorUuids : [];
  const addressable =
    wanted.length > 0 &&
    wanted.length <= POOLED_ACTORS_MAX &&
    wanted.every((uuid) => typeof uuid === 'string' && uuid.trim() !== '');
  const actors = addressable
    ? wanted.map((uuid) => resolveOnePooledActor(uuid, seams)).filter(Boolean)
    : [];
  const distinct = new Set(actors).size === actors.length;
  if (addressable && distinct && actors.length === wanted.length) {
    return { actors, outcome: null, messageData: null };
  }
  if (addressable && actors.length === 0) {
    return { actors: null, outcome: COMPANION_OUTCOMES.noActor, messageData: null };
  }
  return {
    actors: null,
    outcome: COMPANION_OUTCOMES.invalidActorUuids,
    messageData: { max: POOLED_ACTORS_MAX },
  };
}

/**
 * Normalize `grantedBy`, refusing rather than coercing; `source*` already means the book. Absent
 * or blank is `null`; a non-string or over-long label is refused, as truncation names another
 * module.
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
 * The frozen descriptor published as `game.fabricate.api.companion`, readable before any
 * collaborator exists; `callSites` gives the required `callSite` a symbol and `features` names
 * executable evaluation modes.
 */
export const COMPANION_CONTRACT = Object.freeze({
  schemaVersion: COMPANION_CONTRACT_SCHEMA_VERSION,
  members: COMPANION_MEMBERS,
  outcomes: COMPANION_OUTCOMES,
  callSites: COMPANION_CALL_SITES,
  features: Object.freeze({ checkEvaluation: CHECK_EVALUATION_CAPABILITIES }),
});
