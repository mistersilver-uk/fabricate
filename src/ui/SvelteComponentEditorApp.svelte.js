import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import ComponentEditorRoot from './svelte/apps/ComponentEditorRoot.svelte';
import { buildComponentEditorState, buildComponentEditorUpdates } from './svelte/util/componentEditor.js';
import { localize } from './svelte/util/foundryBridge.js';

export class SvelteComponentEditorApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = ComponentEditorRoot;

  _systemId = null;
  _itemId = null;
  _itemName = '';
  _parentApp = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-component-editor',
    classes: ['fabricate', 'component-editor-app'],
    tag: 'div',
    window: {
      title: 'Edit Component',
      icon: 'fa-solid fa-box-open',
      resizable: true
    },
    position: {
      width: 640,
      height: 620
    }
  };

  constructor(systemId, itemId, options = {}) {
    super(options);
    this._systemId = systemId;
    this._itemId = itemId;
    this._parentApp = options.parentApp || null;

    const system = game?.fabricate?.getCraftingSystemManager?.()?.getSystem?.(systemId);
    const item = (system?.components || []).find(component => component.id === itemId);
    this._itemName = item?.name || '';

    if (this.options?.window) {
      this.options.window.title = localize('FABRICATE.Admin.Items.Editor.WindowTitle', {
        name: this._itemName || localize('FABRICATE.Admin.Items.EditItem')
      });
    }
  }

  _getSystem() {
    return game?.fabricate?.getCraftingSystemManager?.()?.getSystem?.(this._systemId) ?? null;
  }

  _getItem(system = this._getSystem()) {
    return (system?.components || []).find(component => component.id === this._itemId) || null;
  }

  async _saveEditorState(draft) {
    try {
      const manager = game?.fabricate?.getCraftingSystemManager?.();
      const system = manager?.getSystem?.(this._systemId);
      const item = this._getItem(system);

      if (!manager || !system || !item) {
        ui.notifications.warn(localize('FABRICATE.Admin.Items.Editor.ComponentNotFound'));
        await this.close();
        return;
      }

      const updates = buildComponentEditorUpdates(draft);
      if (Object.keys(updates).length > 0) {
        await manager.updateItem(this._systemId, this._itemId, updates);
      }

      if (this._parentApp?._adminStore?.refresh) {
        await this._parentApp._adminStore.refresh();
      } else if (typeof this._parentApp?.render === 'function') {
        await this._parentApp.render();
      }

      await this.close();
    } catch (err) {
      console.error('Fabricate | Failed to save component editor updates:', err);
      ui.notifications.error(localize('FABRICATE.Admin.Items.Editor.SaveFailed'));
    }
  }

  _prepareSvelteProps(context) {
    const system = this._getSystem();
    const item = this._getItem(system);

    return {
      editorState: buildComponentEditorState(system, item),
      onSave: async (draft) => this._saveEditorState(draft),
      onClose: async () => this.close()
    };
  }

  static show(itemId, systemId, parentApp = null) {
    if (!game.user?.isGM) {
      ui.notifications.error(localize('FABRICATE.Admin.Items.Editor.NotGm'));
      return null;
    }

    const manager = game?.fabricate?.getCraftingSystemManager?.();
    const system = manager?.getSystem?.(systemId);
    const item = (system?.components || []).find(component => component.id === itemId);

    if (!system || !item) {
      ui.notifications.warn(localize('FABRICATE.Admin.Items.Editor.ComponentNotFound'));
      return null;
    }

    const app = new SvelteComponentEditorApp(systemId, itemId, { parentApp });
    app.render(true);
    return app;
  }
}
