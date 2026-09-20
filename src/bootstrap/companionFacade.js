/**
 * The companion-contract half of the `game.fabricate` facade, with the refusal-string pairs each
 * gate reports in its own words. Method shorthand, for the reason `./gatheringFacade.js` states.
 */

import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';
import { runFormulaPassFail, runFormulaProgressive } from '../systems/checkRoll.js';
import {
  resolveBulkCheckDecision as resolveStandaloneBulkCheckDecision,
  rollActorCheck as rollStandaloneActorCheck,
} from '../systems/companionCheckRoll.js';
import { awardComponents as awardComponentsToActor } from '../systems/companionComponentAward.js';
import {
  CURRENCY_CREDIT_MESSAGE_KEYS,
  COMPONENT_AWARD_MESSAGE_KEYS,
  CHECK_ROLL_MESSAGE_KEYS,
  AFFORDABILITY_MESSAGE_KEYS,
  COMPANION_OUTCOMES,
  KNOWLEDGE_GRANT_MESSAGE_KEYS,
  affordabilityResult,
  bulkCheckDecisionResult,
  checkRollResult,
  componentAwardResult,
  currencyCreditResult,
  gatePooledActorUuids,
  knowledgeGrantResult,
  pooledHoldingsConsumeResult,
  pooledHoldingsReadResult,
} from '../systems/companionContract.js';
import { grantRecipeKnowledge as grantRecipeKnowledgeToActor } from '../systems/companionKnowledgeGrant.js';
import { consumePooledHoldings as consumePooledHoldingsFromActors } from '../systems/companionPooledConsumption.js';
import { readPooledHoldings as readPooledHoldingsAcrossActors } from '../systems/companionPooledHoldings.js';
import {
  checkWorldCurrencyAffordability,
  creditWorldCurrency,
} from '../systems/currencyAffordance.js';
import { resolvedComponentsFor } from '../systems/scopedEntityReads.js';
import {
  buildInteractiveRollOptions,
  promptBulkCheckRoll,
  promptCheckRoll,
} from '../ui/svelte/apps/crafting/rollPrompt.js';
import { localize as bridgeLocalize } from '../ui/svelte/util/foundryBridge.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';

/**
 * `rollActorCheck`'s OWN refusal strings for the shared authorization preamble. There is deliberately
 * NO pair for `resolveBulkCheckDecision`: it takes no `actorId` and never reaches the preamble.
 */
const ROLL_ACTOR_CHECK_GATE_KEYS = Object.freeze({
  gmOnlyKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

/**
 * `awardComponents`' and `creditCurrency`'s OWN refusal strings (issue 1301). TWO PAIRS AND NOT ONE:
 * a refused award reports itself in the award's words and a refused credit in the credit's.
 */
const AWARD_COMPONENTS_GATE_KEYS = Object.freeze({
  gmOnlyKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

const CREDIT_CURRENCY_GATE_KEYS = Object.freeze({
  gmOnlyKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

/**
 * The two pooled members carry NO hoisted refusal-string trio (issue 1342): the SET-valued preamble's
 * `message` is not read verbatim, so both branch on `gate.outcome` and build their own result.
 */

export const companionFacade = {
  /**
   * The ONE authorization rule every GM-gated, actor-targeted facade member applies (issue 1289);
   * `companion-api/spec.md` § Behavioural Member Rules owns the normative GM -> actor -> readiness
   * order. THE MESSAGE KEYS ARE PARAMETERS. A SECOND COPY lives on the GM Knowledge surface's shell,
   * unifying them crossing the facade/UI boundary; named here so a THIRD copy meets it.
   */
  _requireGmActor(actorId, { gmOnlyKey, noActorKey }) {
    if (game.user?.isGM !== true) {
      return { actor: null, outcome: COMPANION_OUTCOMES.gmOnly, message: gmOnlyKey };
    }
    const actor = this._resolveCraftingActor(actorId);
    if (!actor) {
      return { actor: null, outcome: COMPANION_OUTCOMES.noActor, message: noActorKey };
    }
    return { actor, outcome: null, message: null };
  },

  /**
   * The SET-VALUED extension of `_requireGmActor`, for the two pooled members (issue 1342).
   * `companion-api/spec.md` § Behavioural Member Rules owns every rule, the DUPLICATED GM text and
   * the UUID address included. It takes NO refusal strings — each pooled delegator answers through
   * its own result builder.
   */
  _requireGmActors(actorUuids) {
    if (game.user?.isGM !== true) {
      return { actors: null, outcome: COMPANION_OUTCOMES.gmOnly, messageData: null };
    }
    return gatePooledActorUuids(actorUuids, {
      resolveActor: (uuid) => {
        const addressed = globalThis.fromUuidSync?.(uuid) ?? null;
        if (addressed?.documentName !== 'Actor') return null;
        return addressed.inCompendium === true ? null : addressed;
      },
    });
  },

  /**
   * GM-only crafting-knowledge reset (issue 773), clearing one actor's learned recipes and scoped
   * discovery for one system, or every system when `systemId` is null. EXPLICITLY GM-GATED, it
   * mutating player-owned actor state and, for `total`-scope books, a world setting. NEVER THROWS.
   */
  async resetActorKnowledge({ actorId = null, systemId = null, freeLearnBudget = true } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: 'FABRICATE.Knowledge.Reset.GMOnly',
      noActorKey: 'FABRICATE.Knowledge.Reset.NoActor',
    });
    if (gate.outcome) return { success: false, message: gate.message };
    const actor = gate.actor;
    const service = this.recipeVisibilityService;
    const result = systemId
      ? await service.forgetSystemLearnedRecipes(actor, systemId, { freeLearnBudget })
      : await service.forgetAllLearnedRecipes(actor, { freeLearnBudget });
    return {
      success: result.success === true,
      message: 'FABRICATE.Knowledge.Reset.Success',
      messageData: { actor: actor.name, count: result.count || 0, systemId },
    };
  },

  /**
   * `COMPANION.grantRecipeKnowledge` — teach one actor one recipe with NO owned book (issue 1289).
   * Unbounded by design, WHICH IS WHY it lives in the free function `grantRecipeKnowledgeToActor`:
   * `RecipeVisibilityService` is handed out LIVE AND UNGATED, so the write would be reachable from
   * any player's console. It owns preconditions 1-3 only.
   */
  async grantRecipeKnowledge({ actorId = null, recipeId = null, grantedBy = null } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
      noActorKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
    });
    // ONE guard, holding the normative order: the preamble's refusal decides first and readiness
    // only where it passed, because `_requireReady()` throws and this member may not.
    if (gate.outcome || this.ready !== true) {
      return knowledgeGrantResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await grantRecipeKnowledgeToActor(
      { actor: gate.actor, recipeId, grantedBy },
      {
        resolveRecipe: (id) => this.recipeManager?.getRecipe?.(id) ?? null,
        resolveSystem: (recipe) =>
          this.craftingSystemManager?.getSystem?.(recipe?.craftingSystemId) ?? null,
        isObservable: (system) =>
          this.recipeVisibilityService?.isLearnedKnowledgeObservable?.(system) === true,
        readFlag: (actor, key, fallback) => getFabricateFlag(actor, key, fallback),
        writeFlag: (actor, key, value) => setFabricateFlag(actor, key, value),
      }
    );
  },

  /**
   * `COMPANION.checkAffordability` — can this actor afford `amount` of `unitId` against the WORLD
   * coin ladder (issue 1289)? World scope, so no `requirements.currency` toggle; ladder-aware; it
   * writes nothing. GM-gated for the grant's reason plus its own: on a `macro`-strategy world it
   * triggers GM-authored macro code with caller-chosen arguments.
   */
  async checkAffordability({ actorId = null, unitId = null, amount = null } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
      noActorKey: AFFORDABILITY_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
    });
    if (gate.outcome || this.ready !== true) {
      return affordabilityResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await checkWorldCurrencyAffordability(
      gate.actor,
      { unitId, amount },
      this._worldCurrencySeams()
    );
  },

  /**
   * The ONE seam bag both WORLD-scoped currency members inject (issue 1301). `isElectedExecutor` is
   * deliberately NOT here — the check gates on no call site, writing nothing — and `creditCurrency`
   * spreads this bag and adds it.
   */
  _worldCurrencySeams() {
    return {
      getCurrencyConfig: () => this.currencyConfigStore?.get?.() ?? null,
      actorPropertyCoinSpender: this.actorPropertyCoinSpender,
      actorInventoryCoinSpender: this.actorInventoryCoinSpender,
    };
  },

  /**
   * `COMPANION.creditCurrency` — credit `amount` of `unitId` to an actor against the WORLD coin
   * ladder (issue 1301), sharing request resolution with `checkAffordability`. SITED BESIDE IT so
   * the two delegators are not adjacent here or in the harness mirror — MEASURED: adjacent
   * near-identical delegators concatenate into ONE duplicated run over the debt bar. It routes
   * through the spender's `refund`, so `caller: 'award'` tells a credit from a cancel. NOT IDEMPOTENT.
   */
  async creditCurrency({ actorId = null, unitId = null, amount = null, callSite = null } = {}) {
    const gate = this._requireGmActor(actorId, CREDIT_CURRENCY_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return currencyCreditResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await creditWorldCurrency(
      gate.actor,
      { unitId, amount, callSite },
      {
        ...this._worldCurrencySeams(),
        isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id,
      }
    );
  },

  /**
   * The seam bag `readPooledHoldings` injects (issue 1342). It SPREADS `_worldCurrencySeams`, the
   * read's currency axis being the same WORLD ladder; `findComponentItems` is the PUBLISHED matcher,
   * so what this COUNTS and what the consume TAKES cannot disagree. THREE SEAMS THE LEAF DECLARES
   * ARE DELIBERATELY ABSENT, for the reason `createOrStack` is absent from the award bag.
   */
  _pooledHoldingsSeams() {
    return {
      ...this._worldCurrencySeams(),
      listSystems: () => this.craftingSystemManager?.getSystems?.() ?? [],
      craftingSystemManager: this.craftingSystemManager,
      findComponentItems: (actor, component, system) =>
        this.craftingEngine?.findComponentItems?.(actor, component, system) ?? [],
    };
  },

  /**
   * `COMPANION.readPooledHoldings` — what a SET of characters holds between them (issue 1342);
   * `companion-api/spec.md` § The Read Is Not A Reservation owns the rules. Sited HERE for the
   * duplicated-run reason on `creditCurrency`, and the first member addressed by actor UUID.
   */
  async readPooledHoldings({ actorUuids = null, costs = null } = {}) {
    const gate = this._requireGmActors(actorUuids);
    if (gate.outcome || this.ready !== true) {
      return pooledHoldingsReadResult(
        gate.outcome ?? COMPANION_OUTCOMES.notReady,
        gate.messageData
      );
    }
    return await readPooledHoldingsAcrossActors(
      gate.actors,
      { costs },
      this._pooledHoldingsSeams()
    );
  },

  /**
   * The ONE seam bag both Standalone Check Roll members inject. `resolveActor` and `isGm` are
   * deliberately ABSENT, both gates living in the facade; `prompt` and `promptBulk` exist because
   * both prompt functions AUTO-CONFIRM where there is no `DialogV2`.
   */
  // eslint-disable-next-line unicorn/prefer-short-arrow-method -- a slice member is installed on the prototype and must stay method shorthand; an arrow loses `this`.
  _companionCheckSeams() {
    return {
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id,
      hasDiceEngine: () => typeof globalThis.Roll === 'function',
      localize: (key, fallback) => {
        const resolved = bridgeLocalize(key);
        return typeof resolved === 'string' && resolved !== '' && resolved !== key
          ? resolved
          : fallback;
      },
      prompt: promptCheckRoll,
      promptBulk: promptBulkCheckRoll,
      runPassFail: runFormulaPassFail,
      runProgressive: runFormulaProgressive,
      buildRollOptions: buildInteractiveRollOptions,
    };
  },

  /**
   * `COMPANION.rollActorCheck` — roll ONE formula for ONE actor, graded against a `dc` or ungraded
   * (issue 1293). It owns preconditions 1-3 only; the leaf owns the call-site gate.
   */
  async rollActorCheck({
    actorId = null,
    callSite = null,
    formula = null,
    dc = null,
    compare = null,
    label = null,
    interactive = false,
    rollDecision = null,
  } = {}) {
    const gate = this._requireGmActor(actorId, ROLL_ACTOR_CHECK_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return checkRollResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await rollStandaloneActorCheck(
      { actor: gate.actor, callSite, formula, dc, compare, label, interactive, rollDecision },
      this._companionCheckSeams()
    );
  },

  /**
   * `COMPANION.resolveBulkCheckDecision` — answer ONE roll decision the caller will apply to N rolls
   * it makes (issue 1293). It rolls nothing, and is GM-gated INLINE rather than through
   * `_requireGmActor`, which § Behavioural Member Rules scopes to ACTOR-TARGETED members.
   */
  async resolveBulkCheckDecision({ callSite = null, formulas = null } = {}) {
    const gmOnly = game.user?.isGM === true ? null : COMPANION_OUTCOMES.gmOnly;
    if (gmOnly || this.ready !== true) {
      return bulkCheckDecisionResult(gmOnly ?? COMPANION_OUTCOMES.notReady);
    }
    return await resolveStandaloneBulkCheckDecision(
      { callSite, formulas },
      this._companionCheckSeams()
    );
  },

  /**
   * The seam bag `awardComponents` injects (issue 1301). FIVE seams, the sixth — `createOrStack` —
   * deliberately ABSENT: the leaf defaults it to the shared import, so passing it here would give
   * the create primitive two spellings and let a facade change route the award past the seam.
   */
  _componentAwardSeams() {
    return {
      resolveSystem: (systemId) => this.craftingSystemManager?.getSystem?.(systemId) ?? null,
      resolveComponent: (system, componentId) =>
        findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId) ?? null,
      findComponentItems: (actor, component, system) =>
        this.craftingEngine?.findComponentItems?.(actor, component, system) ?? [],
      resolveSourceItem: (uuid) => fromUuid(uuid),
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id,
    };
  },

  /**
   * `COMPANION.awardComponents` — place components onto an actor's sheet (issue 1301);
   * `companion-api/spec.md` § The Award Members owns the rules. Preconditions 1-3 only; the leaf
   * owns the call-site gate, the election and the `awards` validation. NOT IDEMPOTENT.
   */
  async awardComponents({ actorId = null, systemId = null, awards = null, callSite = null } = {}) {
    const gate = this._requireGmActor(actorId, AWARD_COMPONENTS_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return componentAwardResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await awardComponentsToActor(
      gate.actor,
      { systemId, awards, callSite },
      this._componentAwardSeams()
    );
  },

  /**
   * The seam bag `consumePooledHoldings` injects (issue 1342): `_worldCurrencySeams` plus the
   * election, as `creditCurrency` does, this member WRITING. THE COMPONENT TRIO IS BOUND IDENTICALLY
   * TO THE AWARD'S, award, salvage and take having to resolve through one matcher.
   */
  _pooledConsumptionSeams() {
    return {
      ...this._worldCurrencySeams(),
      isElectedExecutor: () => game.users?.activeGM?.id === game.user?.id,
      resolveSystem: (systemId) => this.craftingSystemManager?.getSystem?.(systemId) ?? null,
      resolveComponent: (system, componentId) =>
        findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId) ?? null,
      findComponentItems: (actor, component, system) =>
        this.craftingEngine?.findComponentItems?.(actor, component, system) ?? [],
    };
  },

  /**
   * `COMPANION.consumePooledHoldings` — take costs from what a SET of characters holds between them
   * (issue 1342); § The Pooled Holdings Members owns the rules. The first published member that
   * REMOVES value, sited HERE for the duplicated-run reason recorded on `creditCurrency`.
   */
  async consumePooledHoldings({ actorUuids = null, callSite = null, costs = null } = {}) {
    const gate = this._requireGmActors(actorUuids);
    if (gate.outcome || this.ready !== true) {
      return pooledHoldingsConsumeResult(
        gate.outcome ?? COMPANION_OUTCOMES.notReady,
        gate.messageData
      );
    }
    return await consumePooledHoldingsFromActors(
      gate.actors,
      { callSite, costs },
      this._pooledConsumptionSeams()
    );
  },
};
