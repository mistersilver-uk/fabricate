import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import GatheringAppRoot from './svelte/apps/GatheringAppRoot.svelte';
import { createGatheringStore } from './svelte/stores/gatheringStore.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { isGatheringActorSelectableByUser } from '../config/preferencesCleanup.js';
import { localize } from './svelte/util/foundryBridge.js';
import { registerSvelteGatheringApp } from './appFactory.js';

function normalizeFoundryCollection(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  if (typeof collection.filter === 'function') return collection.filter(() => true);
  return [];
}

/**
 * Dedicated player-facing Gathering ApplicationV2 shell.
 *
 * The app is registered separately from the crafting app so the Items Directory
 * Gathering action can open a focused player flow backed by gathering runtime
 * APIs and the `lastGatheringActor` client preference.
 */
export class SvelteGatheringApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = GatheringAppRoot;

  _gatheringStore = null;
  _services = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-gathering',
    classes: ['fabricate', 'gathering-app'],
    tag: 'div',
    window: {
      title: 'Gathering',
      icon: 'fa-solid fa-leaf',
      resizable: true
    },
    position: {
      width: 760,
      height: 760
    }
  };

  /**
   * Build the Foundry/runtime service adapter consumed by the gathering store.
   *
   * Actor choices are filtered only by permission/selectability, not by actor
   * type, and gathering attempts are delegated through the public runtime facade
   * so current-user viewer enforcement stays centralized.
   *
   * @returns {object} Services for the gathering store.
   */
  _buildServices() {
    const SETTING_MAP = {
      lastGatheringActor: SETTING_KEYS.LAST_GATHERING_ACTOR
    };

    return {
      getSetting: key => getSetting(SETTING_MAP[key] ?? key),
      setSetting: async (key, value) => setSetting(SETTING_MAP[key] ?? key, value),
      getGameUser: () => game?.user ?? null,
      getAvailableActors: () => normalizeFoundryCollection(game?.actors).filter(actor =>
        isGatheringActorSelectableByUser(actor, game?.user)
      ),
      listGatheringForActor: options => game?.fabricate?.listGatheringForActor?.(options),
      startGatheringAttempt: options => game?.fabricate?.startGatheringAttempt?.(options),
      notify: {
        info: msg => ui.notifications.info(msg),
        warn: msg => ui.notifications.warn(msg),
        error: msg => ui.notifications.error(msg)
      },
      localize: (key, data) => localize(key, data)
    };
  }

  _prepareSvelteProps(context) {
    if (!this._gatheringStore) {
      const services = this._buildServices();
      this._gatheringStore = createGatheringStore(services);
      this._services = services;
    }

    return {
      store: this._gatheringStore,
      services: this._services
    };
  }

  async close(options) {
    if (this._gatheringStore) {
      this._gatheringStore.destroy();
      this._gatheringStore = null;
      this._services = null;
    }
    return super.close(options);
  }

  /**
   * Open a new Gathering app window.
   *
   * @returns {Promise<SvelteGatheringApp>} Rendered Gathering app instance.
   */
  static async show() {
    const app = new SvelteGatheringApp();
    app.render(true);
    return app;
  }
}

registerSvelteGatheringApp(SvelteGatheringApp);
