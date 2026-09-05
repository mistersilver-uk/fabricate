import { get } from 'svelte/store';

import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import ComponentEditorRoot from './svelte/apps/ComponentEditorRoot.svelte';
import { buildComponentEditorState } from './svelte/util/componentEditor.js';
import {
  overrideAwareComponentWrite,
  saveComponentEditorDraft,
} from './svelte/util/componentEditorSave.js';
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

  /**
   * The component write this app should use (issue 1371 r19-store2).
   *
   * PREFER THE PARENT'S STORE VERB. `adminStore.updateComponent` already applies the
   * system-scope essence OVERRIDE rule — the switch flips before the values land — and it also
   * republishes the manager's projections, so routing through it keeps the two entry points on one
   * code path AND leaves the window that opened this editor correct.
   *
   * It writes to the store's OWN selected system, so it is used only while that is the system this
   * editor was opened on. It always is in practice (`SvelteCraftingSystemManagerApp` opens this
   * app with `get(selectedSystemId)`), but a store that had moved on would otherwise land the
   * write on the wrong system, which is worse than not using it.
   *
   * OTHERWISE the rule is applied here, over the same shared unit, so an editor opened from an
   * item sheet cannot write a map the read union shadows.
   *
   * @returns {(systemId: string, componentId: string, updates: object) => Promise<unknown>}
   * @private
   */
  _componentWrite() {
    const store = this._parentApp?._adminStore ?? null;
    const selected = store?.selectedSystemId;
    const onThisSystem =
      selected && typeof selected.subscribe === 'function'
        ? get(selected) === this._systemId
        : false;
    if (onThisSystem && typeof store?.updateComponent === 'function') {
      return (_systemId, componentId, updates) => store.updateComponent(componentId, updates);
    }
    return overrideAwareComponentWrite({
      getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
      getComponentScopeStore: () => game?.fabricate?.getComponentScopeStore?.() ?? null,
    });
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

      // A REFUSAL is reported and the window stays open, exactly as a throw is: the GM's edit has
      // not landed either way, and closing over it would hide that.
      const saved = await saveComponentEditorDraft(draft, {
        systemId: this._systemId,
        componentId: this._itemId,
        writeComponent: this._componentWrite(),
      });
      if (!saved) {
        ui.notifications.error(localize('FABRICATE.Admin.Items.Editor.SaveFailed'));
        return;
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
