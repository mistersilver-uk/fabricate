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

// No pair for `resolveBulkCheckDecision`: it takes no `actorId` and never reaches the preamble.
const ROLL_ACTOR_CHECK_GATE_KEYS = Object.freeze({
  gmOnlyKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CHECK_ROLL_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

/**
 * The request's own data `evaluation`, read without invoking an accessor; `null` (which the leaf
 * refuses after its call-site and roll-decision gates) for an accessor, an inherited key below
 * `Object.prototype` or a throwing reflection. A key only on `Object.prototype` is pollution.
 */
function readRequestEvaluation(request) {
  try {
    for (let record = request; record !== null && record !== Object.prototype; ) {
      const descriptor = Object.getOwnPropertyDescriptor(record, 'evaluation');
      if (descriptor) {
        return record === request && Object.hasOwn(descriptor, 'value') ? descriptor.value : null;
      }
      record = Object.getPrototypeOf(record);
    }
    return;
  } catch {
    return null;
  }
}

// Each member refuses in its own words, so award and credit keep separate pairs (issue 1301).
const AWARD_COMPONENTS_GATE_KEYS = Object.freeze({
  gmOnlyKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: COMPONENT_AWARD_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

const CREDIT_CURRENCY_GATE_KEYS = Object.freeze({
  gmOnlyKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
  noActorKey: CURRENCY_CREDIT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
});

// The two pooled members have no pair (issue 1342): they branch on `gate.outcome` and build their
// own result, never reading the set-valued preamble's `message`.

// Member order is deliberate: adjacent near-identical delegators here, or in the harness mirror,
// form one duplicated run over the Sonar bar.
export const companionFacade = {
  /**
   * The one authorization rule for every GM-gated, actor-targeted member (issue 1289), in
   * `companion-api/spec.md` § Behavioural Member Rules' GM, actor, readiness order. The GM
   * Knowledge surface's shell holds a second copy across the facade/UI boundary.
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

  /** The set-valued `_requireGmActor` for the pooled members (issue 1342), addressed by UUID. */
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
   * Clear one actor's learned recipes and scoped discovery for one system, or all when `systemId`
   * is null (issue 773). GM-gated, since it writes player-owned actor state and, for `total`-scope
   * books, a world setting. Never throws.
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
   * Teach one recipe with no owned book (issue 1289). Unbounded, so it is a free function rather
   * than on `RecipeVisibilityService`, which is handed out ungated to any player's console.
   * Preconditions 1-3 only.
   */
  async grantRecipeKnowledge({ actorId = null, recipeId = null, grantedBy = null } = {}) {
    const gate = this._requireGmActor(actorId, {
      gmOnlyKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.gmOnly],
      noActorKey: KNOWLEDGE_GRANT_MESSAGE_KEYS[COMPANION_OUTCOMES.noActor],
    });
    // The preamble decides first, then readiness, which is read rather than thrown by
    // `_requireReady()` because these members never throw.
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
   * Against the world coin ladder (issue 1289), so no `requirements.currency` toggle; writes
   * nothing. GM-gated also because a `macro`-strategy world runs GM macro code on caller arguments.
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

  /** No `isElectedExecutor`: the check writes nothing; the writers add it (issue 1301). */
  _worldCurrencySeams() {
    return {
      getCurrencyConfig: () => this.currencyConfigStore?.get?.() ?? null,
      actorPropertyCoinSpender: this.actorPropertyCoinSpender,
      actorInventoryCoinSpender: this.actorInventoryCoinSpender,
    };
  },

  /**
   * Against the world coin ladder (issue 1301), through the spender's `refund`, where
   * `caller: 'award'` tells a credit from a cancel. Not idempotent.
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
   * `findComponentItems` is the published matcher, so what the read counts and the consume takes
   * cannot disagree (issue 1342). Three leaf seams stay defaulted, like `createOrStack` for award.
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

  /** Issue 1342; `companion-api/spec.md` § The Read Is Not A Reservation. */
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
   * No `resolveActor` or `isGm`: both gates live in the facade. The prompts are seams because both
   * auto-confirm where there is no `DialogV2`.
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

  /** Roll one formula for one actor, graded or ungraded. */
  async rollActorCheck(request = {}) {
    const {
      actorId = null,
      callSite = null,
      formula = null,
      dc = null,
      compare = null,
      label = null,
      interactive = false,
      rollDecision = null,
    } = request;
    const gate = this._requireGmActor(actorId, ROLL_ACTOR_CHECK_GATE_KEYS);
    if (gate.outcome || this.ready !== true) {
      return checkRollResult(gate.outcome ?? COMPANION_OUTCOMES.notReady);
    }
    return await rollStandaloneActorCheck(
      {
        actor: gate.actor,
        callSite,
        formula,
        dc,
        compare,
        label,
        interactive,
        rollDecision,
        evaluation: readRequestEvaluation(request),
      },
      this._companionCheckSeams()
    );
  },

  /**
   * One roll decision for the caller's N rolls (issue 1293); rolls nothing. GM-gated inline, since
   * `_requireGmActor` is for actor-targeted members.
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
   * `createOrStack` is left to the leaf's shared default (issue 1301), so the create primitive has
   * one spelling and no facade change can route the award past it.
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
   * `companion-api/spec.md` § The Award Members (issue 1301). Preconditions 1-3; the leaf owns the
   * call-site gate, the election and `awards` validation. Not idempotent.
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

  /** The component trio matches the award's: award, salvage and take share one matcher. */
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

  /** Take costs from a set of characters (issue 1342); § The Pooled Holdings Members. */
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
