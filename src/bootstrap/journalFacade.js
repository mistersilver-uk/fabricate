/**
 * The journal half of the `game.fabricate` facade: the run-command edge, the world-time reads and
 * the listing projector. Method shorthand, for the reason `./gatheringFacade.js` states.
 */

import {
  TOOL_IMAGE_SENTINEL,
  linkedComponentFor,
  resolveToolDisplayImage,
  resolveToolDisplayName,
} from '../models/toolDisplay.js';
import { affordsCurrencySpends, buildCurrencyAffordProbe } from '../systems/currencyAffordance.js';
import { daysPerYearFromCalendar } from '../systems/foundryCalendar.js';
import { authorityUnavailableRefusal } from '../systems/journalRunCommands.js';
import { resolvedComponentsFor, resolvedToolsFor } from '../systems/scopedEntityReads.js';
import { RunJournalBuilder } from '../ui/presenters/RunJournalBuilder.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';
import { findMatchingComponent, resolveItemEssences } from '../utils/essenceResolver.js';

import {
  getBarSelectableActors,
  localizeGathering,
  getGatheringEngine,
} from './gatheringRuntime.js';

export const journalFacade = {
  /**
   * Submit a current-lifecycle operation through active-GM authority. Actor UUIDs address this
   * boundary, whose GM handler rechecks the attested sender's ownership; the player crafting
   * facades keep actor ids. A timeout is an unknown response, not failure and not permission to
   * replay. A start uses an empty runId and revision zero; alchemy uses runType `crafting`.
   * `options` must be forwarded: it carries `interactive`, without which a checked craft waits
   * forever (issue 1759).
   */
  executeJournalRunCommand(command, options) {
    this._requireReady();
    return (
      this.journalRunCommands?.executeJournalRunCommand(command, options) ??
      Promise.resolve(authorityUnavailableRefusal())
    );
  },

  /** Hide a terminal entry for this user, keeping actor history; the write can reject. */
  dismissJournalRun(options) {
    this._requireReady();
    return (
      this.journalRunCommands?.dismissJournalRun(options) ??
      Promise.resolve(authorityUnavailableRefusal())
    );
  },

  /** This user's hidden native run keys for one actor; a different viewer gets an empty set. */
  getDismissedJournalRunKeys(options) {
    return this.journalRunCommands?.getDismissedJournalRunKeys(options) ?? new Set();
  },

  /**
   * Ensure the private run-authority ledger exists, as the active GM. Idempotent: an existing
   * ledger is returned rather than refused, boot recovery and the command path already provision
   * automatically, and it never clears a retained execution claim.
   */
  setupJournalRunAuthority() {
    return (
      this.journalRunCommands?.setupJournalRunAuthority() ??
      Promise.resolve(authorityUnavailableRefusal())
    );
  },

  /**
   * Record a disposition for an exact retained claim, as the active GM, after confirming no
   * other GM realm is executing and checking actual receipts; planned amounts prove nothing.
   * `claimId` is the `journalRunClaimId` flag on the ledger's `FabRunAuthority1` page, never a
   * page or run id. It releases authority only: no replay, compensation or rollback, the request
   * stays non-replayable and an uncertain run effect stays recovery-required.
   */
  reconcileJournalRunAuthority(options) {
    return (
      this.journalRunCommands?.reconcileJournalRunAuthority(options) ??
      Promise.resolve(authorityUnavailableRefusal())
    );
  },

  /** Calendar components plus `daysPerYear` where derivable, for the pure `worldTimeLabel`. */
  getWorldTimeComponents(worldTime = this.getWorldTime()) {
    const calendar = game.time?.calendar ?? null;
    if (typeof calendar?.timeToComponents !== 'function') return null;
    try {
      const components = calendar.timeToComponents(Number(worldTime) || 0);
      if (!components || typeof components !== 'object') return null;
      const daysPerYear = daysPerYearFromCalendar(calendar);
      if (daysPerYear !== null) components.daysPerYear = daysPerYear;
      return components;
    } catch {
      return null;
    }
  },

  _getRunJournalBuilder() {
    if (!this._runJournalBuilder) {
      this._runJournalBuilder = new RunJournalBuilder({
        craftingRunManager: this.craftingRunManager,
        salvageRunManager: this.salvageRunManager,
        gatheringRunSource: this.gatheringRunManager,
        recipeManager: this.recipeManager,
        resolutionModeService: this.resolutionModeService,
        recipeVisibility: this.recipeVisibilityService,
        getSystem: (systemId) => this.craftingSystemManager?.getSystem(systemId) ?? null,
        getTool: (systemId, toolId) => this._resolveJournalTool(systemId, toolId),
        getGatheringTask: (environmentId, taskId) =>
          this._resolveJournalGatheringTask(environmentId, taskId),
        // Consulted only for a GM viewer; a player sees the generic blind label (issue 901).
        getGatheringBlindSecret: (runId) => this.gatheringBlindRunStore?.get(runId) ?? null,
        // History names a blind task only once the reveal policy disclosed it, never because the
        // viewer owns the actor (D-027); the engine makes the chat card's identical decision.
        isGatheringIdentityHidden: (args) =>
          getGatheringEngine()?.isHistoricalBlindIdentityHidden?.(args) === true,
        getResultItem: (itemUuid) => this._resolveJournalResultItem(itemUuid),
        getComponent: (systemId, componentId) =>
          this._resolveJournalComponent(systemId, componentId),
        getViewer: () => game.user,
        localize: (key, data) => localizeGathering(key, data),
        nowWorldTime: () => this.getWorldTime(),
        // Unread here, but the snapshot must match every other pass's (issue 1228).
        resolveComponentForItem: findMatchingComponent,
        getComponentSourceActors: ({ actor, run }) => {
          const uuids = Array.isArray(run?.componentSourceActorUuids)
            ? run.componentSourceActorUuids
            : [];
          const sources = uuids
            .map((uuid) => globalThis.fromUuidSync?.(uuid) ?? null)
            .filter(Boolean);
          if (sources.length > 0) return sources;
          return actor ? [actor] : [];
        },
        resolveItemEssences: ({ item, recipe }) => {
          const system = this.craftingSystemManager?.getSystem(recipe?.craftingSystemId);
          return resolveItemEssences(
            item,
            resolvedComponentsFor(system),
            recipe?.craftingSystemId,
            findMatchingComponent
          );
        },
        affordCurrency: ({ actor, recipe, match }) =>
          buildCurrencyAffordProbe(
            actor,
            recipe,
            this.craftingEngine?._currencySeams?.() ?? {}
          )(match),
        // The aggregate: two currency ingredients affordable alone but not together (issue 1648).
        affordCurrencySpends: ({ actor, recipe, currencySpends }) =>
          affordsCurrencySpends(
            actor,
            recipe,
            currencySpends,
            this.craftingEngine?._currencySeams?.() ?? {}
          ),
        getDismissedRunKeys: ({ actorUuid, viewerId }) =>
          this.getDismissedJournalRunKeys({ actorUuid, viewerId }),
        getJournalActionAvailability: () => this.getJournalRunAuthorityAvailability(),
      });
    }
    return this._runJournalBuilder;
  },

  /**
   * `data-models` requirement 13's precedence. The snapshot rung is load-bearing: an item-sourced
   * Tool has a null `componentId`, so without it the raw id prints (issue 1119).
   */
  _resolveJournalTool(systemId, toolId) {
    const system = this.craftingSystemManager?.getSystem(systemId);
    if (!system || !toolId) return null;
    const tool = resolvedToolsFor(system).find((entry) => entry?.id === toolId);
    if (!tool) return null;
    const component = linkedComponentFor(tool, resolvedComponentsFor(system));
    const img = resolveToolDisplayImage(tool, component);
    return {
      id: tool.id,
      name: resolveToolDisplayName(tool, component, tool.id),
      // The Journal draws its own default artwork.
      img: img === TOOL_IMAGE_SENTINEL ? null : img,
    };
  },

  /** Only the composed environment carries the authored name and image; null keeps the raw id. */
  _resolveJournalGatheringTask(environmentId, taskId) {
    if (!environmentId || !taskId) return null;
    const environment = getGatheringEngine()?._findEnvironment?.(environmentId);
    const tasks = Array.isArray(environment?.tasks) ? environment.tasks : [];
    const task = tasks.find((entry) => entry?.id === taskId);
    return task ? { name: task.name, img: task.img } : null;
  },

  /** Labels history written before awards captured name and img. Best-effort and synchronous. */
  _resolveJournalResultItem(itemUuid) {
    if (!itemUuid || typeof fromUuidSync !== 'function') return null;
    let doc = null;
    try {
      doc = fromUuidSync(itemUuid);
    } catch {
      // An unresolvable uuid keeps the raw-id fallback.
    }
    return doc ? { name: doc.name ?? null, img: doc.img ?? null } : null;
  },

  /** A salvage run's title, and the fallback for a result that captured neither field. */
  _resolveJournalComponent(systemId, componentId) {
    if (!systemId || !componentId) return null;
    const system = this.craftingSystemManager?.getSystem(systemId);
    const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
    return component ? { name: component.name ?? null, img: component.img ?? null } : null;
  },

  /** The remembered id among the bar-selectable actors, else the first of them. */
  _resolveJournalActor(rememberedActorId) {
    const selectable = getBarSelectableActors({ viewer: game.user });
    if (selectable.length === 0) return null;
    if (rememberedActorId) {
      const wanted = String(rememberedActorId);
      const match = selectable.find((actor) => actor?.id === wanted || actor?.uuid === wanted);
      if (match) return match;
    }
    return selectable[0];
  },

  /** The unified Journal listing, through the same remembered-actor seam as the gathering listing. */
  listJournalForActor(options = {}) {
    this._requireReady();
    const { rememberedActorId } = this._withRememberedActorDefault(options);
    const actor = this._resolveJournalActor(rememberedActorId);
    return this._getRunJournalBuilder().buildListing({ actor, viewer: game.user });
  },
};
