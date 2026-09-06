import { get } from 'svelte/store';

import { resolvedComponentEssencesFor } from '../systems/resolvedComponentEssences.js';

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

  /**
   * The component this editor edits, with its essence map SEEDED FROM WHAT THE SYSTEM RESOLVES
   * (issue 1371 r20-store3, reviewer round 6 finding 1).
   *
   * `system.components` is the PERSISTED in-system row, which for a pair whose `essences` section
   * inherits is the dormant map nothing reads. Seeding the steppers from it drew numbers no
   * surface agrees with, and — because the editor sends its essence axis on every save — a save
   * that touched only a tag then differed from the world map, read as a real authored override,
   * flipped the switch and pinned the dormant numbers. The read union is the same accessor the
   * rules list, the essence usage counts and the override rule itself use.
   *
   * The overlay is per FIELD, not per record: absence means "no world half for this row", so the
   * persisted row stands exactly as it did.
   *
   * @param {object|null} [system]
   * @returns {object|null}
   */
  _getItem(system = this._getSystem()) {
    const item = (system?.components || []).find(component => component.id === this._itemId) || null;
    if (!item) return null;
    const resolved = resolvedComponentEssencesFor(
      game?.fabricate?.getCraftingSystemManager?.() ?? null,
      this._systemId,
      this._itemId
    );
    return resolved === undefined ? item : { ...item, essences: resolved };
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
   * OTHERWISE the rule is applied here, over the same shared unit, so a caller with no manager
   * store to borrow cannot write a map the read union shadows. (Earlier revisions said "an editor
   * opened from an item sheet"; there is no such path — this class's only constructor call is a
   * manager service nothing consumes. It is wired because it is a live writer the moment anything
   * opens it, which is the reading `componentEditorSave.js` and `componentEssenceOverride.js`
   * carry.)
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
      return (_systemId, componentId, updates, options) =>
        store.updateComponent(componentId, updates, options);
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
      //
      // ── THE SEED'S TWO FACTS COME FROM THE RENDER, NOT FROM THE RECORD AS IT IS NOW ─────────
      // (issue 1371 r21-store4, the Foundry integrator's round-7 finding 2.) `carriedEssences` is
      // what this system's roster does not define and the write must not drop; `baselineEssences`
      // is the map an UNTOUCHED save of THESE ROWS produces, which is what the override rule
      // compares the staged map against. Both are facts about the rows the GM is looking at, so
      // `ComponentEditorRoot` emits them with the draft and they are preferred over anything
      // re-derived here.
      //
      // An earlier revision of this comment claimed re-deriving them at save time meant "a
      // concurrent world edit widens neither". It does the opposite: this window registers no
      // hooks, so a replicated `componentScope` write that lands while it is open moves the
      // baseline out from under the rendered rows, and an untouched save then DIFFERS from it —
      // which the rule correctly reads as an authored override, flips the switch, and pins the
      // pair to the stale map. The values below stay as the fallback for a draft from an older
      // root that emits neither.
      const seed = buildComponentEditorState(system, item);
      const saved = await saveComponentEditorDraft(draft, {
        systemId: this._systemId,
        componentId: this._itemId,
        carriedEssences: seed.carriedEssences,
        baseline: seed.baselineEssences,
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
