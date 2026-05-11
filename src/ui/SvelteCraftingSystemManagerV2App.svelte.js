import CraftingSystemManagerV2Root from './svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte';
import { registerCraftingSystemManagerV2App } from './appFactory.js';
import { SvelteRecipeManagerApp } from './SvelteRecipeManagerApp.svelte.js';
import { localize } from './svelte/util/foundryBridge.js';
import { confirmDialog } from './foundryCompat.js';

export class SvelteCraftingSystemManagerV2App extends SvelteRecipeManagerApp {
  static SVELTE_COMPONENT = CraftingSystemManagerV2Root;
  static _pendingReadyOpen = false;

  _confirmDiscardDirtyEssenceDraft = null;

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
      width: 1280,
      height: 940
    }
  };

  _prepareSvelteProps(context) {
    const props = super._prepareSvelteProps(context);
    return {
      ...props,
      services: {
        ...props.services,
        confirmDiscardEssenceDraft: () => confirmDialog({
          title: localize('FABRICATE.Admin.ManagerV2.Essence.DiscardDirtyTitle'),
          content: `<p>${localize('FABRICATE.Admin.ManagerV2.Essence.DiscardDirtyContent')}</p>`,
          yes: {
            label: localize('FABRICATE.Admin.ManagerV2.Essence.DiscardDirtyConfirm'),
            callback: () => true
          },
          no: {
            label: localize('FABRICATE.Admin.ManagerV2.Essence.DiscardDirtyCancel'),
            callback: () => false
          }
        }),
        registerEssenceDirtyGuard: (guard) => {
          this._confirmDiscardDirtyEssenceDraft = typeof guard === 'function' ? guard : null;
        },
        openCurrentAdmin: () => {
          const app = new SvelteRecipeManagerApp();
          app.render(true);
          return app;
        }
      }
    };
  }

  async close(options) {
    const canCloseEssence = await this._confirmDiscardDirtyEssenceDraft?.();
    if (canCloseEssence === false) return this;
    this._confirmDiscardDirtyEssenceDraft = null;
    return super.close(options);
  }

  static show() {
    if (!game.user.isGM) {
      ui.notifications.error(localize('FABRICATE.Admin.ManagerV2.GMOnly'));
      return null;
    }

    if (!this._isFabricateReady()) {
      ui.notifications.warn(localize('FABRICATE.Admin.ManagerV2.StartupPending'));
      if (!SvelteCraftingSystemManagerV2App._pendingReadyOpen) {
        SvelteCraftingSystemManagerV2App._pendingReadyOpen = true;
        const openWhenReady = () => {
          SvelteCraftingSystemManagerV2App._pendingReadyOpen = false;
          if (!game.user.isGM) return;
          const app = new SvelteCraftingSystemManagerV2App();
          app.render(true);
        };
        const hooks = globalThis.Hooks;
        if (typeof hooks?.once === 'function') {
          hooks.once('fabricate.ready', openWhenReady);
        } else {
          SvelteCraftingSystemManagerV2App._pendingReadyOpen = false;
        }
      }
      return null;
    }

    const app = new SvelteCraftingSystemManagerV2App();
    app.render(true);
    return app;
  }

  static _isFabricateReady() {
    const fabricate = game?.fabricate;
    return fabricate?.ready === true
      && fabricate?.getRecipeManager?.()?.initialized === true
      && fabricate?.getCraftingSystemManager?.()?.initialized === true;
  }
}

registerCraftingSystemManagerV2App(SvelteCraftingSystemManagerV2App);
