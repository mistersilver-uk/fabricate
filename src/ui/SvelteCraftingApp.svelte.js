import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import CraftingAppRoot from './svelte/apps/CraftingAppRoot.svelte';
import { createCraftingStore } from './svelte/stores/craftingStore.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { confirmDialog } from './foundryCompat.js';
import { registerSvelteCraftingApp } from './appFactory.js';

export class SvelteCraftingApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = CraftingAppRoot;

  // Store instance — created once per app open, destroyed on close
  _craftingStore = null;
  _services = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-crafting',
    classes: ['fabricate', 'crafting-app'],
    tag: 'div',
    window: {
      title: 'Crafting',
      icon: 'fa-solid fa-hammer',
      resizable: true
    },
    position: {
      width: 700,
      height: 800
    }
  };

  _buildServices() {
    const SETTING_MAP = {
      lastCraftingActor: SETTING_KEYS.LAST_CRAFTING_ACTOR,
      lastComponentSources: SETTING_KEYS.LAST_COMPONENT_SOURCES,
      favouriteRecipes: SETTING_KEYS.FAVOURITE_RECIPES,
      recentlyCrafted: SETTING_KEYS.RECENTLY_CRAFTED,
      showSimpleRecipesOnly: SETTING_KEYS.SHOW_SIMPLE_RECIPES_ONLY,
      autoCraft: SETTING_KEYS.AUTO_CRAFT
    };

    return {
      getSetting: (key) => getSetting(SETTING_MAP[key] ?? key),
      setSetting: async (key, value) => setSetting(SETTING_MAP[key] ?? key, value),
      getRecipeManager: () => game?.fabricate?.getRecipeManager?.() ?? null,
      getRecipeVisibilityService: () => game?.fabricate?.getRecipeVisibilityService?.() ?? null,
      getCraftingRunManager: () => game?.fabricate?.getCraftingRunManager?.() ?? null,
      getSalvageRunManager: () => game?.fabricate?.getSalvageRunManager?.() ?? null,
      getCraftingEngine: () => game?.fabricate?.getCraftingEngine?.() ?? null,
      getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
      getGameUser: () => game.user,
      getAvailableActors: () => game.actors.filter(a =>
        a.type !== 'group' && a.type !== 'npc' &&
        a.testUserPermission(game.user, 'OBSERVER')
      ),
      getOwnedActors: () => game.actors.filter(a =>
        a.type !== 'group' && a.type !== 'npc' && a.isOwner
      ),
      getWorldTime: () => Number(game.time?.worldTime || 0),
      notify: {
        info: (msg) => ui.notifications.info(msg),
        warn: (msg) => ui.notifications.warn(msg),
        error: (msg) => ui.notifications.error(msg)
      },
      confirmDialog: (options) => confirmDialog(options),
      createChatMessage: (data) => ChatMessage.create({
        user: game.user.id,
        ...data
      }),
      getChatSpeaker: (opts) => ChatMessage.getSpeaker(opts)
    };
  }

  _prepareSvelteProps(context) {
    if (!this._craftingStore) {
      const services = this._buildServices();
      this._craftingStore = createCraftingStore(services);
      this._services = services;
    }
    return {
      store: this._craftingStore,
      services: this._services
    };
  }

  async close(options) {
    if (this._craftingStore) {
      this._craftingStore.destroy();
      this._craftingStore = null;
      this._services = null;
    }
    return super.close(options);
  }

  static async show() {
    const app = new SvelteCraftingApp();
    app.render(true);
    return app;
  }
}

// Register with the factory so getCraftingAppClass() can return this class
// when the 'svelte' engine is selected. This file is imported as a side-effect
// by main.js, which triggers this registration at module load time.
registerSvelteCraftingApp(SvelteCraftingApp);
