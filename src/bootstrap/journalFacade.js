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
   * Submit a current-lifecycle operation through active-GM authority after initialization. Actor
   * UUIDs address this authenticated command boundary, whose GM handler rechecks the attested
   * sender's ownership; they do not replace actor IDs in the player crafting facades. A timeout is
   * an unknown response, not proof of failure and not permission to replay. `command` start uses an
   * empty runId and revision zero, and alchemy uses runType `crafting`.
   * `options` MUST BE FORWARDED: it carries `interactive`, and this signature once took `command`
   * alone while its caller passed both, so `game.fabricate.craft()` on a checked recipe opened a
   * dialog nobody could answer and waited forever — the source pin covered the CALL, not this
   * signature (issue 1759).
   */
  executeJournalRunCommand(command, options) {
    this._requireReady();
    return (
      this.journalRunCommands?.executeJournalRunCommand(command, options) ??
      Promise.resolve(authorityUnavailableRefusal())
    );
  },

  /**
   * Hide a terminal entry for the current user in this world, preserving actor history. The awaited
   * user-scoped write follows the user across devices and can reject.
   */
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
   * Record manual disposition of an exact retained execution claim as the active GM. Inspect actual
   * receipts and the uncertain applying boundary first, after confirming no other GM realm is still
   * executing; planned amounts are not proof of awards or spending. `claimId` is the claim's random
   * token (the `journalRunClaimId` flag on the ledger's `FabRunAuthority1` page), never the page id
   * or a run id. THIS RELEASES AUTHORITY ONLY: the old request stays non-replayable, an uncertain
   * run effect remains recovery-required, and it performs no replay, compensation or rollback.
   */
  reconcileJournalRunAuthority(options) {
    return (
      this.journalRunCommands?.reconcileJournalRunAuthority(options) ??
      Promise.resolve(authorityUnavailableRefusal())
    );
  },

  /**
   * Calendar components for an absolute world time, plus `daysPerYear` where derivable, so the pure
   * `worldTimeLabel` util can compose a campaign day without touching `game.*`.
   */
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

  /** Lazily construct the singleton `RunJournalBuilder`, so it is not rebuilt per listing call. */
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
        // GM-only secret preview of an in-flight blind run's drawn task (issue 901). The builder
        // consults it only for a GM viewer; a player's journal shows the generic blind label.
        getGatheringBlindSecret: (runId) => this.gatheringBlindRunStore?.get(runId) ?? null,
        // D-027: history names a blind task only once the reveal policy has disclosed it, never
        // because the viewer owns the actor. The engine owns the chat card's identical decision.
        isGatheringIdentityHidden: (args) =>
          getGatheringEngine()?.isHistoricalBlindIdentityHidden?.(args) === true,
        getResultItem: (itemUuid) => this._resolveJournalResultItem(itemUuid),
        getComponent: (systemId, componentId) =>
          this._resolveJournalComponent(systemId, componentId),
        getViewer: () => game.user,
        localize: (key, data) => localizeGathering(key, data),
        nowWorldTime: () => this.getWorldTime(),
        // The per-pass inventory snapshot's component resolver (issue 1228): the Journal reads no
        // tallies itself, but its snapshot must be the same complete value every other pass builds.
        resolveComponentForItem: findMatchingComponent,
        getComponentSourceActors: ({ actor, run }) => {
          const uuids = Array.isArray(run?.componentSourceActorUuids)
            ? run.componentSourceActorUuids
            : [];
          const sources = uuids
            .map((uuid) => globalThis.fromUuidSync?.(uuid) ?? null)
            .filter(Boolean);
          return sources.length > 0 ? sources : actor ? [actor] : [];
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
        // The AGGREGATE answer the per-option probe above cannot give: two currency ingredients
        // each affordable alone but not together (issue 1648, F2).
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
   * Resolve a system library tool to `{ id, name, img }` through `data-models` requirement 13's
   * precedence. THE SNAPSHOT RUNG IS LOAD-BEARING: an item-sourced Tool has a null `componentId` by
   * construction and without it printed its raw id (issue 1119).
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
      // The Journal renders its own default artwork, so the generic sentinel stays null.
      img: img === TOOL_IMAGE_SENTINEL ? null : img,
    };
  },

  /**
   * Resolve a gathering run's task to `{ name, img }` via the COMPOSED environment, which alone
   * carries the authored name and image; null leaves the raw-id fallback.
   */
  _resolveJournalGatheringTask(environmentId, taskId) {
    if (!environmentId || !taskId) return null;
    const environment = getGatheringEngine()?._findEnvironment?.(environmentId);
    const tasks = Array.isArray(environment?.tasks) ? environment.tasks : [];
    const task = tasks.find((entry) => entry?.id === taskId);
    return task ? { name: task.name, img: task.img } : null;
  },

  /**
   * Resolve a run's awarded item to `{ name, img }` by recorded uuid, labelling history written
   * before name and img were captured at award time. Best-effort and synchronous.
   */
  _resolveJournalResultItem(itemUuid) {
    if (!itemUuid || typeof fromUuidSync !== 'function') return null;
    let doc = null;
    try {
      doc = fromUuidSync(itemUuid);
    } catch {
      // An unresolvable uuid leaves the raw-id fallback in place.
    }
    return doc ? { name: doc.name ?? null, img: doc.img ?? null } : null;
  },

  /**
   * Resolve a system component to `{ name, img }` for the Journal: a salvage run's title and the
   * fallback for a result that captured neither; null leaves the raw-id fallback.
   */
  _resolveJournalComponent(systemId, componentId) {
    if (!systemId || !componentId) return null;
    const system = this.craftingSystemManager?.getSystem(systemId);
    const component = findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
    return component ? { name: component.name ?? null, img: component.img ?? null } : null;
  },

  /**
   * Resolve the Journal's selected actor against the bar-selectable list, remembered id first, then
   * the first selectable — the gathering listing's remembered-actor seam.
   */
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
