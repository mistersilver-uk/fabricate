/**
 * The bulk salvage and destroy half of the `game.fabricate` facade. `salvageComponents` and
 * `destroyComponents` are the only supported entry points, because the per-target ownership gate
 * is here. Method shorthand, for the reason `./gatheringFacade.js` states.
 */

import { applyBulkChatVisibility } from '../systems/bulkChatVisibility.js';
import { BulkDestroyService } from '../systems/BulkDestroyService.js';
import { BulkSalvageService } from '../systems/BulkSalvageService.js';
import { resolvedComponentsFor } from '../systems/scopedEntityReads.js';
import { promptBulkCheckRoll } from '../ui/svelte/apps/crafting/rollPrompt.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';

export const bulkFacade = {
  /**
   * Lazily build and cache the `BulkSalvageService` behind `salvageComponents` (issue 859), every
   * collaborator injected so it reaches no Foundry global. CACHING IS SOUND BECAUSE EVERY
   * COLLABORATOR IS READ OFF `this` AT CALL TIME: `this.craftingEngine` is `null` until
   * `initialize()`, so a captured field value could hold `null` forever.
   */
  _getBulkSalvageService() {
    if (this._bulkSalvageService) return this._bulkSalvageService;
    this._bulkSalvageService = new BulkSalvageService({
      salvage: (actorUuid, systemId, componentId, options) =>
        this.craftingEngine.salvage(actorUuid, systemId, componentId, options),
      getCraftingSystem: (systemId) => this.craftingSystemManager.getSystem(systemId),
      promptRollDecision: promptBulkCheckRoll,
      postChatMessage: (message) => this._postBulkSalvageChatMessage(message),
      // The BATCHED complication relay (issue 1286), read off `this` at call time. One message per
      // addressed (system, actor) PAIR rather than per ROW, both halves being GM-side authorization
      // inputs and the rate limit being sized against the pair count.
      deliverComplications: (message) => this.complicationDeliveryWriter?.deliver(message),
      // The executing user's stored progressive stage order, through the SAME edge
      // `ResolutionModeService` and `CraftingEngine` are given (issue 1286). Only the pre-run
      // forecast consumes it; left unwired it quietly reads the AUTHORED order instead.
      getPlayerResultOrder: (entry) => this._readPlayerResultOrder(entry),
      // Key-only, matching every card module's `localize` contract; the aggregate card substitutes
      // its own counts.
      localize: (key) => game.i18n?.localize?.(key) ?? key,
    });
    return this._bulkSalvageService;
  },

  /** Lazily build and cache the `BulkDestroyService` behind `destroyComponents` (issue 859). */
  _getBulkDestroyService() {
    if (this._bulkDestroyService) return this._bulkDestroyService;
    this._bulkDestroyService = new BulkDestroyService({
      getCraftingSystem: (systemId) => this.craftingSystemManager.getSystem(systemId),
      // Destroy MUST resolve documents through the identical matcher salvage uses, case-SENSITIVE
      // name fallback included, or it would delete what the player was shown as a different
      // component. Read off `this.craftingEngine` at CALL time, this service being cached.
      findComponentItems: (actor, component, system) =>
        this.craftingEngine.findComponentItems(actor, component, system),
      // Must RETURN the deleted documents: `unitsDeleted` comes from what came back, never from what
      // was asked for, a `preDeleteItem` hook being able to veto individual ids silently.
      deleteItems: (actor, itemIds) => actor.deleteEmbeddedDocuments('Item', itemIds),
    });
    return this._bulkDestroyService;
  },

  /**
   * Post the ONE aggregated bulk-salvage chat card. THE ORDER OF THE THREE STEPS IS LOAD-BEARING:
   * SPEAKER first, `applyMode`'s `ic` branch reading `chatData.speaker.actor` unguarded; VISIBILITY
   * before `create`, the legacy `rollMode` option being honoured only for a message carrying rolls;
   * and `create` LAST, with `author`, the V14 schema having no `user` field. THE SPEAKER IS BUILT,
   * NEVER INFERRED — `getSpeaker()` with no actor falls through to the CONTROLLED TOKENS. NEVER read
   * `core.messageMode`: `assertSetting` throws on V13 and `??` does not catch a throw.
   */
  async _postBulkSalvageChatMessage({ content, rollMode, actorUuid, actorNames = [] }) {
    // `globalThis.` rather than the bare global: optional chaining does not rescue an UNDECLARED
    // identifier, so a bare `fromUuidSync?.()` throws under a harness that has not installed it,
    // and this poster must never cost a completed run its report.
    const actor = actorUuid ? (globalThis.fromUuidSync?.(actorUuid) ?? null) : null;
    const alias = actorNames.filter(Boolean).join(', ') || game.user?.name || '';
    const speaker = actor
      ? ChatMessage.getSpeaker({ actor })
      : { scene: game.scenes?.current?.id ?? null, actor: null, token: null, alias };

    const chatData = { author: game.user?.id, speaker, content };
    applyBulkChatVisibility(chatData, rollMode || game.settings?.get?.('core', 'rollMode'));
    return await ChatMessage.create(chatData);
  },

  /**
   * Gate a bulk target list, resolving ONE actor per row from `target.actorId ?? actorId` and NOTHING
   * ELSE. No persisted-selection tail, unlike `_resolveCraftingSources`: a bulk run may span actors,
   * so that fallback would silently RETARGET an unresolved row. Order is preserved.
   */
  _gateBulkTargets(targets, actorId) {
    return (targets || []).filter(Boolean).map((target) => ({
      target,
      actor: this._resolveCraftingActor(target.actorId ?? actorId),
    }));
  },

  /**
   * Weave a service's result rows back into the caller's ORIGINAL target order, substituting a
   * refusal row where the gate resolved no actor, or "the third one failed" is unreadable.
   */
  _mergeBulkRows(gated, ranItems, buildRefusedRow) {
    const rows = [];
    let next = 0;
    for (const entry of gated) {
      if (entry.actor && next < ranItems.length) {
        rows.push(ranItems[next]);
        next += 1;
      } else {
        rows.push(buildRefusedRow(entry.target));
      }
    }
    return rows;
  },

  /**
   * The identity fields every refusal row carries, resolved from the crafting system so it still
   * READS as the thing the player selected rather than as a blank line.
   */
  _buildNotPermittedRow(target) {
    const system = this.craftingSystemManager?.getSystem?.(target?.systemId) ?? null;
    const component = findById(
      getDefinitionIndex(resolvedComponentsFor(system)),
      target?.componentId
    );
    return {
      actorId: target?.actorId ?? null,
      actorName: '',
      systemId: target?.systemId ?? null,
      componentId: target?.componentId ?? null,
      name: component?.name || '',
      img: component?.img || '',
      // The facade's own outcome, never folded into `skipped`: "you may not act on this actor" and
      // "this row was not runnable" are different answers and the panel chips them differently.
      outcome: 'notPermitted',
      skipReason: null,
    };
  },

  /**
   * Salvage MANY owned components in one gesture (issue 859). IT TAKES AN `actorId` PER TARGET,
   * NEVER AN `actorUuid`, AT ANY NESTING LEVEL: neither the engine nor `BulkSalvageService` performs
   * an ownership check, so the per-target `_resolveCraftingActor` is the ONLY gate, and it resolves
   * through `game.actors`, excluding compendium-backed and unlinked token actors. An unresolvable
   * actor becomes a `notPermitted` ROW rather than a throw. `interactive` defaults TRUE here, unlike
   * `salvageComponent`. STATED LIMIT: `onProgress`'s `total` counts the rows the SERVICE was given.
   */
  async salvageComponents({
    actorId = null,
    targets = [],
    interactive = true,
    onProgress = null,
  } = {}) {
    this._requireReady();
    const gated = this._gateBulkTargets(targets, actorId);
    const runnable = gated.filter((entry) => entry.actor);

    const result = await this._getBulkSalvageService().run({
      targets: runnable.map(({ target, actor }) => ({
        actorUuid: actor.uuid,
        actorId: actor.id,
        actorName: actor.name,
        systemId: target.systemId,
        componentId: target.componentId,
      })),
      interactive,
      onProgress,
    });
    // A dismissed prompt returns before the first engine call, so nothing ran and there is no
    // per-row story to tell — pass the zero-mutation shape through rather than reporting refusals.
    if (result.cancelled) return result;

    const items = this._mergeBulkRows(gated, result.items, (target) => ({
      ...this._buildNotPermittedRow(target),
      rollValue: null,
      tierStep: null,
      message: '',
      results: [],
      consumed: [],
      tools: [],
    }));
    return {
      cancelled: false,
      items,
      counts: {
        ...result.counts,
        total: items.length,
        notPermitted: items.length - result.items.length,
      },
      posted: result.posted,
    };
  },

  /**
   * Permanently destroy MANY owned components in one gesture (issue 859), under `salvageComponents`'
   * gate, merge and `onProgress` limit. DELETES WHOLE STACKS, deliberately NOT gated on
   * `features.salvage` or `salvage.enabled`: a player can already delete their own Items, so this is
   * ergonomics and not capability. No chat card. The caller owns the confirmation.
   */
  async destroyComponents({ actorId = null, targets = [], onProgress = null } = {}) {
    this._requireReady();
    const gated = this._gateBulkTargets(targets, actorId);
    const runnable = gated.filter((entry) => entry.actor);

    const result = await this._getBulkDestroyService().run({
      targets: runnable.map(({ target, actor }) => ({
        // The RESOLVED document, not an id: the service's matcher and delete both need the actor
        // itself, and re-resolving there would be a second gate to keep honest.
        actor,
        actorId: actor.id,
        actorName: actor.name,
        systemId: target.systemId,
        componentId: target.componentId,
      })),
      onProgress,
    });

    const items = this._mergeBulkRows(gated, result.items, (target) => ({
      ...this._buildNotPermittedRow(target),
      requested: 0,
      unitsDeleted: 0,
      documentsDeleted: 0,
      staleIds: 0,
      items: [],
      vetoed: [],
    }));
    return { items, unitsDeleted: result.unitsDeleted, documentsDeleted: result.documentsDeleted };
  },
};
