/**
 * The bulk half of the `game.fabricate` facade. `salvageComponents` and `destroyComponents` are the
 * only supported entry points, the per-target ownership gate being here. Method shorthand.
 */

import { applyBulkChatVisibility } from '../systems/bulkChatVisibility.js';
import { BulkDestroyService } from '../systems/BulkDestroyService.js';
import { BulkSalvageService } from '../systems/BulkSalvageService.js';
import { resolvedComponentsFor } from '../systems/scopedEntityReads.js';
import { promptBulkCheckRoll } from '../ui/svelte/apps/crafting/rollPrompt.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';

export const bulkFacade = {
  /**
   * Cached (issue 859), which is sound only because every collaborator is read off `this` at call
   * time: `this.craftingEngine` is `null` until `initialize()`, so a captured value stays null.
   */
  _getBulkSalvageService() {
    if (this._bulkSalvageService) return this._bulkSalvageService;
    this._bulkSalvageService = new BulkSalvageService({
      salvage: (actorUuid, systemId, componentId, options) =>
        this.craftingEngine.salvage(actorUuid, systemId, componentId, options),
      getCraftingSystem: (systemId) => this.craftingSystemManager.getSystem(systemId),
      promptRollDecision: promptBulkCheckRoll,
      postChatMessage: (message) => this._postBulkSalvageChatMessage(message),
      // One message per (system, actor) pair, not per row (issue 1286): both are GM-side
      // authorization inputs, and the rate limit is sized to the pair count.
      deliverComplications: (message) => this.complicationDeliveryWriter?.deliver(message),
      // The pre-run forecast reads it; unwired, it quietly falls back to the authored order.
      getPlayerResultOrder: (entry) => this._readPlayerResultOrder(entry),
      // Key-only, like every card module's `localize`; the card substitutes its own counts.
      localize: (key) => game.i18n?.localize?.(key) ?? key,
    });
    return this._bulkSalvageService;
  },

  _getBulkDestroyService() {
    if (this._bulkDestroyService) return this._bulkDestroyService;
    this._bulkDestroyService = new BulkDestroyService({
      getCraftingSystem: (systemId) => this.craftingSystemManager.getSystem(systemId),
      // Salvage's matcher, case-sensitive name fallback included, or destroy deletes something
      // other than what the player was shown.
      findComponentItems: (actor, component, system) =>
        this.craftingEngine.findComponentItems(actor, component, system),
      // Must return the deleted documents: a `preDeleteItem` hook can silently veto single ids.
      deleteItems: (actor, itemIds) => actor.deleteEmbeddedDocuments('Item', itemIds),
    });
    return this._bulkDestroyService;
  },

  /**
   * The one aggregated card. Order is load-bearing: speaker first, since `applyMode`'s `ic` branch
   * reads `chatData.speaker.actor` unguarded; visibility before `create`, since the legacy
   * `rollMode` option is honoured only with rolls; `create` last, with `author`, as the V14 schema
   * has no `user`. The speaker is built, since `getSpeaker()` without an actor falls through to the
   * controlled tokens. Never read `core.messageMode`: `assertSetting` throws on V13.
   */
  async _postBulkSalvageChatMessage({ content, rollMode, actorUuid, actorNames = [] }) {
    // `globalThis.`: optional chaining does not rescue an undeclared identifier.
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
   * One actor per row from `target.actorId ?? actorId` only. No persisted-selection fallback, which
   * would silently retarget an unresolved row of a multi-actor run. Order is preserved.
   */
  _gateBulkTargets(targets, actorId) {
    return (targets || []).filter(Boolean).map((target) => ({
      target,
      actor: this._resolveCraftingActor(target.actorId ?? actorId),
    }));
  },

  /** Back into the caller's target order, a refusal row where the gate resolved no actor. */
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

  /** Resolved from the system, so a refusal row still reads as what the player selected. */
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
      // Never folded into `skipped`: the panel chips the two answers differently.
      outcome: 'notPermitted',
      skipReason: null,
    };
  },

  /**
   * Takes an `actorId` per target, never a uuid (issue 859): neither the engine nor the service
   * checks ownership, so `_resolveCraftingActor` via `game.actors` is the only gate, excluding
   * compendium and unlinked token actors. An unresolvable actor is a `notPermitted` row. Unlike
   * `salvageComponent`, `interactive` defaults true. `onProgress`'s `total` counts runnable rows.
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
    // A dismissed prompt ran nothing, so its zero-mutation shape passes through as is.
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
   * Deletes whole stacks under `salvageComponents`' gate and merge (issue 859). Not gated on
   * `features.salvage` or `salvage.enabled`: a player can already delete their own Items. No chat
   * card; the caller owns the confirmation.
   */
  async destroyComponents({ actorId = null, targets = [], onProgress = null } = {}) {
    this._requireReady();
    const gated = this._gateBulkTargets(targets, actorId);
    const runnable = gated.filter((entry) => entry.actor);

    const result = await this._getBulkDestroyService().run({
      targets: runnable.map(({ target, actor }) => ({
        // The resolved document, so the service never re-resolves behind a second gate.
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
