import CraftingSystemManagerV2Root from './svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte';
import { registerCraftingSystemManagerV2App } from './appFactory.js';
import { SvelteRecipeManagerApp } from './SvelteRecipeManagerApp.svelte.js';
import { localize } from './svelte/util/foundryBridge.js';

export class SvelteCraftingSystemManagerV2App extends SvelteRecipeManagerApp {
  static SVELTE_COMPONENT = CraftingSystemManagerV2Root;

  static DEFAULT_OPTIONS = {
    ...SvelteRecipeManagerApp.DEFAULT_OPTIONS,
    id: 'fabricate-crafting-system-manager-v2',
    classes: ['fabricate', 'crafting-system-manager-v2'],
    window: {
      ...SvelteRecipeManagerApp.DEFAULT_OPTIONS.window,
      title: 'FABRICATE.Admin.ManagerV2.WindowTitle',
      icon: 'fa-solid fa-layer-group'
    },
    position: {
      width: 1180,
      height: 760
    }
  };

  _prepareSvelteProps(context) {
    const props = super._prepareSvelteProps(context);
    return {
      ...props,
      services: {
        ...props.services,
        openCurrentAdmin: () => {
          const app = new SvelteRecipeManagerApp();
          app.render(true);
          return app;
        }
      }
    };
  }

  static show() {
    if (!game.user.isGM) {
      ui.notifications.error(localize('FABRICATE.Admin.ManagerV2.GMOnly'));
      return null;
    }
    const app = new SvelteCraftingSystemManagerV2App();
    app.render(true);
    return app;
  }
}

registerCraftingSystemManagerV2App(SvelteCraftingSystemManagerV2App);
