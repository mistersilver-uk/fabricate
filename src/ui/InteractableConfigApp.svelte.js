import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import InteractableConfigRoot from './svelte/apps/InteractableConfigRoot.svelte';
import { registerInteractableConfigApp } from './appFactory.js';
import { InteractableManager } from '../canvas/InteractableManager.js';
import {
  planSetEnabled,
  planSetLocked,
  planClearVisualLink,
  summarizeInteractable
} from '../canvas/regions/interactableConfigActions.js';
import {
  applyInteractableBehaviorUpdate,
  emitInteractableBehaviorWrite,
  emitInteractableVisualUpdate,
  emitInteractableVisualDelete
} from '../canvas/interactableSocketBridge.js';
import {
  relinkVisual,
  recreateLinkedTile,
  recreateLinkedDrawing,
  applyMissingPolicy,
  resolveLinkedVisual
} from '../canvas/linkedVisuals/linkedInteractableVisual.js';
import { identifyRegionBehaviorRef } from '../canvas/regions/interactableRegionNodeAdapter.js';
import { readInteractableBehaviorSystem } from '../canvas/regions/interactableRegionFlags.js';
import { resolveMarkerHidden } from '../canvas/regions/interactableRegionActivation.js';
import { choiceDialog, localize } from './svelte/util/foundryBridge.js';

/**
 * The rich GM config panel for a region-first `fabricate.interactable` Region
 * Behaviour (Phase 2). It is the REGISTERED config sheet for the behaviour
 * subtype AND can be opened against a specific behaviour ref (e.g. from the
 * linked Tile's HUD / context menu).
 *
 * The panel itself stays a THIN view: every decision is computed by the pure
 * `interactableConfigActions` helpers, and every Foundry write routes through the
 * active-GM behaviour-update socket (`applyInteractableBehaviorUpdate` /
 * `emitInteractableBehaviorWrite`) — the panel never mutates a behaviour on the
 * client directly. Action buttons (Test as Player, Jump, Relink, Recreate,
 * Remove, Restock, Enable/Disable, Lock/Unlock, Delete) are wired to injected
 * services seams that own the live edges.
 *
 * Per-target instance keyed by `${sceneId}.${regionId}.${behaviorId}` so opening
 * the same behaviour twice re-focuses one window. Registered via the app factory
 * (NOT a static import chain) so Node test environments never pull the Svelte
 * compiler.
 */
export class InteractableConfigApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = InteractableConfigRoot;

  // One live instance per behaviour ref so re-opening the same behaviour
  // re-focuses rather than stacking windows.
  static _instances = new Map();

  _ref = null;
  _services = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-interactable-config',
    classes: ['fabricate', 'fabricate-interactable-config-app'],
    tag: 'div',
    window: {
      title: 'FABRICATE.Canvas.Interactable.Config.Title',
      icon: 'fas fa-sliders',
      resizable: true
    },
    position: {
      width: 480,
      height: 680
    }
  };

  /**
   * Construct the panel against a behaviour ref. Accepts either:
   *  - `{ sceneId, regionId, behaviorId }` (opened from the Tile HUD / a ref), or
   *  - `{ document }` (a RegionBehavior document — the registered-sheet path).
   *
   * @param {object} [options]
   */
  constructor(options = {}) {
    super(options);
    if (options.ref && options.ref.sceneId && options.ref.regionId && options.ref.behaviorId) {
      this._ref = {
        sceneId: String(options.ref.sceneId),
        regionId: String(options.ref.regionId),
        behaviorId: String(options.ref.behaviorId)
      };
    } else if (options.document) {
      this._ref = identifyRegionBehaviorRef(options.document);
    }
  }

  /**
   * Resolve the live behaviour document for this panel's ref.
   *
   * @returns {object|null}
   */
  _resolveBehavior() {
    const ref = this._ref;
    if (!ref) return null;
    const scene = globalThis.game?.scenes?.get?.(String(ref.sceneId));
    const region = scene?.regions?.get?.(String(ref.regionId));
    return region?.behaviors?.get?.(String(ref.behaviorId)) ?? null;
  }

  /**
   * Reconcile the linked Tile marker's `hidden` to match the behaviour's current
   * concealment ({@link resolveMarkerHidden}: disabled OR explicitly hidden ⇒
   * hidden from players; locked ⇒ stays visible). Routes through the active-GM
   * visual-update edge and only writes when `hidden` actually differs. No-throw;
   * a no-op when there is no linked Tile. Called right after a setEnabled/setHidden
   * write so the GM sees the visibility change immediately and players receive it.
   *
   * @returns {void|Promise<void>}
   */
  _reconcileMarkerHidden() {
    try {
      const behavior = this._resolveBehavior();
      const system = readInteractableBehaviorSystem(behavior);
      if (!system) return undefined;
      // Only a linked Tile is reconciled here (the marker-hidden semantics mirror
      // the active-GM marker sync, which is Tile-scoped).
      if (system.linkedVisual?.documentName !== 'Tile') return undefined;
      const scene = behavior?.parent?.parent ?? null;
      const resolved = resolveLinkedVisual(system, { scene });
      const tile = resolved?.documentName === 'Tile' ? resolved.doc : null;
      if (!tile) return undefined;
      const desiredHidden = resolveMarkerHidden(system);
      if ((tile?.hidden === true) === desiredHidden) return undefined; // already correct.
      const ref = identifyRegionBehaviorRef(behavior);
      const visualUuid = typeof tile?.uuid === 'string' ? tile.uuid : null;
      if (!ref || !visualUuid) return undefined;
      return emitInteractableVisualUpdate({
        sceneId: ref.sceneId,
        visualUuid,
        documentName: 'Tile',
        update: { hidden: desiredHidden }
      });
    } catch (_error) {
      // Defensive: a visibility reconcile must never break the config panel.
      return undefined;
    }
  }

  /**
   * Build the services bag the Svelte root reads + acts through. Every write is
   * routed through the active-GM behaviour-update edge; no client-side mutation.
   *
   * @returns {object}
   */
  _buildServices() {
    const now = () => Number(globalThis.game?.time?.worldTime || 0);

    // The GM-routed behaviour-update writer: local apply on the active GM, socket
    // emit otherwise. The panel is GM-only, so the GM is normally the active GM
    // and this is a local apply — but route through the same seam for correctness.
    // `writeBehavior` is passed system-CONTENTS (e.g. `{ state: { enabled } }`,
    // `{ presentation: {...} }`) and a RegionBehavior document needs its system
    // data wrapped under `system`, so wrap ONCE here. The relink/recreate seams
    // wrap separately (`applyBehaviorUpdate({ update: { system: patch } })`) and
    // must NOT route through here.
    const writeBehavior = (systemPatch) => {
      const ref = this._ref;
      const behavior = this._resolveBehavior();
      if (!ref || !behavior || !systemPatch) return undefined;
      return emitInteractableBehaviorWrite(behavior)({ system: systemPatch });
    };

    return {
      // --- Read seams -------------------------------------------------------
      summarize: () => {
        const behavior = this._resolveBehavior();
        const system = readInteractableBehaviorSystem(behavior);
        if (!system) return null;
        const view = summarizeInteractable(behavior, {
          resolveVisual: (s) => resolveLinkedVisual(s, { scene: behavior?.parent?.parent ?? null })
        });
        return { view, ref: this._ref ?? null, now: now() };
      },
      // Resolve the live tool/task label for display (the panel shows id + label).
      resolveSourceLabel: () => {
        const behavior = this._resolveBehavior();
        const system = readInteractableBehaviorSystem(behavior);
        if (!system) return null;
        const manager = globalThis.game?.fabricate?.getCraftingSystemManager?.();
        if (system.interactableType === 'tool') {
          const sys = manager?.getSystem?.(system.systemId);
          const tool = (sys?.tools ?? []).find((t) => String(t?.id) === String(system.toolId));
          if (!tool) return null;
          const label = String(tool?.label || '').trim();
          if (label) return label;
          const component = (sys?.components ?? []).find((c) => String(c?.id) === String(tool?.componentId));
          return component?.name ? String(component.name) : null;
        }
        const tasks = this._readLibraryTasks(system.systemId);
        const task = tasks.find((t) => String(t?.id) === String(system.taskId));
        return task?.name ? String(task.name) : null;
      },
      resolveEnvironmentLabel: () => {
        const behavior = this._resolveBehavior();
        const system = readInteractableBehaviorSystem(behavior);
        if (!system || system.interactableType !== 'gatheringTask' || !system.environmentId) return null;
        const environments = globalThis.game?.fabricate?.getGatheringEnvironmentStore?.()?.list?.() ?? [];
        const env = (Array.isArray(environments) ? environments : [])
          .find((e) => String(e?.id) === String(system.environmentId));
        return env?.name ? String(env.name) : null;
      },

      // --- Editable field writes (active-GM routed) -------------------------
      updateBehavior: (systemPatch) => writeBehavior(systemPatch),

      // --- Action seams (each owns its live edge) ---------------------------
      testAsPlayer: () => {
        if (!this._assertGM()) return undefined;
        const behavior = this._resolveBehavior();
        if (!behavior) return undefined;
        const actorId = this._controlledActorId();
        return InteractableManager.instance?._requestActivation?.(behavior, {
          actorId,
          userId: globalThis.game?.user?.id ?? null,
          activationSource: 'gmTest'
        });
      },
      jumpToRegion: () => this._panToRegion(),
      jumpToVisual: () => this._panToVisual(),
      // Generic "Relink selected" — relinks to a controlled Tile OR Drawing OR
      // Token (whichever the GM has selected on the canvas). `relinkVisual` derives
      // the documentName from the selected document's own type, so a single seam
      // covers all kinds.
      relinkSelected: async () => {
        if (!this._assertGM()) return null;
        const behavior = this._resolveBehavior();
        const selected = this._controlledVisual();
        if (!behavior || !selected) {
          this._warn('FABRICATE.Canvas.Interactable.Config.NoSelection');
          return null;
        }
        const patch = await relinkVisual(behavior, selected, {
          applyBehaviorUpdate: applyInteractableBehaviorUpdate,
          identify: identifyRegionBehaviorRef,
          applyVisualUpdate: emitInteractableVisualUpdate
        });
        if (patch) this._refresh();
        return patch;
      },
      createReplacementTile: async () => {
        if (!this._assertGM()) return null;
        const behavior = this._resolveBehavior();
        const scene = behavior?.parent?.parent ?? globalThis.canvas?.scene ?? null;
        if (!behavior || !scene) return null;
        const tile = await recreateLinkedTile(behavior, { scene }, {
          applyBehaviorUpdate: applyInteractableBehaviorUpdate,
          identify: identifyRegionBehaviorRef
        });
        if (tile) this._refresh();
        return tile;
      },
      // Create a Drawing marker (an alternative to a Tile) over the region centre,
      // then flip the behaviour back to a visible marker. Works both as a
      // missing-visual recovery and as a region-only upgrade. GM-routed.
      createDrawingMarker: async () => {
        if (!this._assertGM()) return null;
        const behavior = this._resolveBehavior();
        const scene = behavior?.parent?.parent ?? globalThis.canvas?.scene ?? null;
        if (!behavior || !scene) return null;
        const center = this._shapeCenter(behavior?.parent ?? null);
        const size = this._gridSize() * 2;
        const placement = center
          ? { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size }
          : {};
        const drawing = await recreateLinkedDrawing(behavior, { scene, ...placement }, {
          applyBehaviorUpdate: applyInteractableBehaviorUpdate,
          identify: identifyRegionBehaviorRef
        });
        if (!drawing) return null;
        // `recreateLinkedDrawing` writes uuid + documentName but leaves the prior
        // mode; flip it to 'marker' so the visual resolves + un-hides.
        await writeBehavior({ linkedVisual: { mode: 'marker' }, presentation: { hidden: false } });
        this._refresh();
        return drawing;
      },
      // Upgrade a region-only interactable (no marker, `linkedVisual.mode:'none'`)
      // to a linked Tile: create the marker over the region center and flip the
      // mode back to 'marker' so it resolves as a real linked visual. GM-routed.
      createMarker: async () => {
        if (!this._assertGM()) return null;
        const behavior = this._resolveBehavior();
        const scene = behavior?.parent?.parent ?? globalThis.canvas?.scene ?? null;
        if (!behavior || !scene) return null;
        const center = this._shapeCenter(behavior?.parent ?? null);
        const size = this._gridSize();
        const placement = center
          ? { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size }
          : {};
        const tile = await recreateLinkedTile(behavior, { scene, ...placement }, {
          applyBehaviorUpdate: applyInteractableBehaviorUpdate,
          identify: identifyRegionBehaviorRef
        });
        if (!tile) return null;
        // `recreateLinkedTile` writes uuid + documentName but leaves the prior
        // 'none' mode; flip it to 'marker' so the visual resolves + un-hides.
        await writeBehavior({ linkedVisual: { mode: 'marker' }, presentation: { hidden: false } });
        this._refresh();
        return tile;
      },
      removeVisualMarker: async () => {
        if (!this._assertGM()) return;
        const behavior = this._resolveBehavior();
        if (!behavior) return;
        // A linked Token is the GM's OWN document (e.g. a merchant NPC) — it is
        // never ours to destroy. So when the marker is a Token, do NOT offer the
        // "delete" option at all; the only safe removal is Unlink (leave the token
        // on the scene). Tile/Drawing markers were created by Fabricate and keep
        // the full 3-way choice.
        const linkedDocumentName = readInteractableBehaviorSystem(behavior)?.linkedVisual?.documentName ?? null;
        const isToken = linkedDocumentName === 'Token';
        const choices = [
          { action: 'unlink', label: this._t('FABRICATE.Canvas.Interactable.Config.RemoveVisualUnlink', 'Unlink only'), icon: 'fas fa-link-slash' }
        ];
        if (!isToken) {
          choices.push({ action: 'delete', label: this._t('FABRICATE.Canvas.Interactable.Config.RemoveVisualDelete', 'Unlink + delete marker'), icon: 'fas fa-trash' });
        }
        choices.push({ action: 'cancel', label: this._t('FABRICATE.Canvas.Interactable.Config.RemoveVisualCancel', 'Cancel'), icon: 'fas fa-xmark' });

        const choice = await choiceDialog({
          title: this._t('FABRICATE.Canvas.Interactable.Config.RemoveVisualTitle', 'Remove visual marker'),
          content: this._t('FABRICATE.Canvas.Interactable.Config.RemoveVisualPrompt', 'How would you like to remove the linked marker?'),
          choices,
          defaultAction: 'unlink'
        });
        if (choice === 'cancel') return; // Do NOT clear the link.

        // Never delete a Token marker (belt-and-suspenders: the choice isn't even
        // offered, but guard the edge regardless).
        if (choice === 'delete' && !isToken) {
          const resolved = resolveLinkedVisual(readInteractableBehaviorSystem(behavior), {
            scene: behavior?.parent?.parent ?? null
          });
          const ref = identifyRegionBehaviorRef(behavior);
          const visualUuid = typeof resolved?.doc?.uuid === 'string' ? resolved.doc.uuid : null;
          if (ref && visualUuid && resolved?.documentName !== 'Token') {
            await emitInteractableVisualDelete({
              sceneId: ref.sceneId,
              visualUuid,
              documentName: resolved?.documentName ?? 'Tile'
            });
          }
        }
        await writeBehavior(planClearVisualLink(readInteractableBehaviorSystem(behavior)).system);
        this._refresh();
      },
      setEnabled: (enabled) => {
        if (!this._assertGM()) return undefined;
        const behavior = this._resolveBehavior();
        const patch = planSetEnabled(readInteractableBehaviorSystem(behavior), enabled);
        if (!patch) return undefined;
        const result = writeBehavior(patch.system);
        // Enabling/disabling changes the marker's player visibility — reconcile the
        // linked tile's `hidden` immediately after the behaviour write so the GM
        // sees the effect at once and players get the document update.
        const after = () => { void this._reconcileMarkerHidden(); this._refresh(); };
        if (result && typeof result.then === 'function') return result.then(after);
        after();
        return result;
      },
      // Toggle "Hidden from players". Hidden genuinely conceals the marker (the
      // linked tile is hidden) AND suppresses the on-enter prompt — so after the
      // behaviour write, reconcile the linked tile's `hidden`. (Locking does NOT
      // route through here; a locked interactable stays visible.)
      setHidden: (hidden) => {
        if (!this._assertGM()) return undefined;
        const result = writeBehavior({ presentation: { hidden: hidden === true } });
        const after = () => { void this._reconcileMarkerHidden(); this._refresh(); };
        if (result && typeof result.then === 'function') return result.then(after);
        after();
        return result;
      },
      setLocked: (locked) => {
        if (!this._assertGM()) return undefined;
        const behavior = this._resolveBehavior();
        const patch = planSetLocked(readInteractableBehaviorSystem(behavior), locked);
        if (!patch) return undefined;
        const result = writeBehavior(patch.system);
        if (result && typeof result.then === 'function') return result.then(() => this._refresh());
        this._refresh();
        return result;
      },
      applyMissingVisualPolicy: () => {
        if (!this._assertGM()) return undefined;
        const behavior = this._resolveBehavior();
        if (!behavior) return undefined;
        return applyMissingPolicy(readInteractableBehaviorSystem(behavior), {
          scene: behavior?.parent?.parent ?? null,
          behavior,
          notify: (key) => this._warn(key),
          recreate: (b, params) => recreateLinkedTile(b, params, {
            applyBehaviorUpdate: applyInteractableBehaviorUpdate,
            identify: identifyRegionBehaviorRef
          })
        }).then(() => this._refresh());
      },
      deleteInteractable: async () => {
        if (!this._assertGM()) return;
        const behavior = this._resolveBehavior();
        const region = behavior?.parent ?? null;
        if (!region) return;
        // One 3-way choice: Cancel (no-op), Delete interactable (leave the linked
        // marker), or Delete interactable + the linked visual marker. A linked
        // Token is the GM's own document, so the "+ visual" option is suppressed
        // for a Token (deleting the interactable never deletes the GM's token).
        const linkedDocumentName = readInteractableBehaviorSystem(behavior)?.linkedVisual?.documentName ?? null;
        const isToken = linkedDocumentName === 'Token';
        const choices = [
          { action: 'delete', label: this._t('FABRICATE.Canvas.Interactable.Config.DeleteOnly', 'Delete interactable'), icon: 'fas fa-trash' }
        ];
        if (!isToken) {
          choices.push({ action: 'deleteWithVisual', label: this._t('FABRICATE.Canvas.Interactable.Config.DeleteWithVisual', 'Delete interactable + visual'), icon: 'fas fa-trash-can' });
        }
        choices.push({ action: 'cancel', label: this._t('FABRICATE.Canvas.Interactable.Config.DeleteCancel', 'Cancel'), icon: 'fas fa-xmark' });

        const choice = await choiceDialog({
          title: this._t('FABRICATE.Canvas.Interactable.Config.DeleteTitle', 'Delete interactable'),
          content: this._t('FABRICATE.Canvas.Interactable.Config.DeletePrompt', 'Delete this interactable region? This cannot be undone.'),
          choices,
          defaultAction: 'delete'
        });
        if (choice === 'cancel') return;

        // Never delete a Token marker (the option isn't offered; guard regardless).
        if (choice === 'deleteWithVisual' && !isToken) {
          const resolved = resolveLinkedVisual(readInteractableBehaviorSystem(behavior), {
            scene: region?.parent ?? null
          });
          const ref = identifyRegionBehaviorRef(behavior);
          const visualUuid = typeof resolved?.doc?.uuid === 'string' ? resolved.doc.uuid : null;
          if (ref && visualUuid && resolved?.documentName !== 'Token') {
            await emitInteractableVisualDelete({
              sceneId: ref.sceneId,
              visualUuid,
              documentName: resolved?.documentName ?? 'Tile'
            });
          }
        }
        try { await region.delete?.(); } catch (_error) { /* tolerate. */ }
        void this.close();
      }
    };
  }

  _readLibraryTasks(systemId) {
    if (!systemId) return [];
    // Read the same persisted gathering config the manager + browser read.
    const config = globalThis.game?.settings?.get?.('fabricate', 'gatheringConfig') ?? null;
    const tasks = config?.systems?.[systemId]?.tasks;
    return Array.isArray(tasks) ? tasks : [];
  }

  /**
   * Resolve the first controlled linked-visual document on the canvas, preferring
   * a Tile, then a Drawing, then a Token. Generic so "Relink selected" works for
   * any supported marker kind. Returns the document (not the placeable), or null.
   *
   * @returns {object|null}
   */
  _controlledVisual() {
    const layers = [
      globalThis.canvas?.tiles?.controlled,
      globalThis.canvas?.drawings?.controlled,
      globalThis.canvas?.tokens?.controlled
    ];
    for (const controlled of layers) {
      const placeable = (Array.isArray(controlled) ? controlled : [])[0] ?? null;
      const doc = placeable?.document ?? placeable ?? null;
      if (doc) return doc;
    }
    return null;
  }

  _controlledActorId() {
    const controlled = globalThis.canvas?.tokens?.controlled ?? [];
    const token = (Array.isArray(controlled) ? controlled : [])[0] ?? null;
    const doc = token?.document ?? token;
    return doc?.actor?.id ?? doc?.actorId ?? null;
  }

  _panToRegion() {
    const behavior = this._resolveBehavior();
    const region = behavior?.parent ?? null;
    const center = this._shapeCenter(region);
    if (center) void globalThis.canvas?.animatePan?.({ x: center.x, y: center.y });
  }

  _panToVisual() {
    const behavior = this._resolveBehavior();
    const resolved = resolveLinkedVisual(readInteractableBehaviorSystem(behavior), {
      scene: behavior?.parent?.parent ?? null
    });
    const doc = resolved?.doc ?? null;
    if (!doc) {
      this._warn('FABRICATE.Canvas.Interactable.Config.NoVisual');
      return;
    }
    const x = Number(doc?.x ?? 0) + Number(doc?.width ?? 0) / 2;
    const y = Number(doc?.y ?? 0) + Number(doc?.height ?? 0) / 2;
    void globalThis.canvas?.animatePan?.({ x, y });
  }

  /** The active scene's grid size (one square). Falls back to 100. */
  _gridSize() {
    const size = globalThis.canvas?.scene?.grid?.size
      ?? globalThis.canvas?.grid?.size
      ?? globalThis.canvas?.dimensions?.size;
    return Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 100;
  }

  _shapeCenter(region) {
    const shape = (region?.shapes ?? [])[0] ?? null;
    if (!shape) return null;
    const x = Number(shape.x ?? 0) + Number(shape.width ?? 0) / 2;
    const y = Number(shape.y ?? 0) + Number(shape.height ?? 0) / 2;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  _warn(key) {
    globalThis.ui?.notifications?.warn?.(this._t(key, key));
  }

  /**
   * Belt-and-suspenders GM gate on every mutating action seam. The registration +
   * Tile-HUD entry are already GM-gated, so this should never fire in practice; it
   * guarantees a non-GM can never mutate even if they reach the sheet. No-throw.
   *
   * @returns {boolean} true when the current user is a GM.
   */
  _assertGM() {
    return globalThis.game?.user?.isGM === true;
  }

  _t(key, fallback) {
    const out = localize(key);
    return out && out !== key ? out : fallback;
  }

  /** Re-render the panel so a state write reflects immediately. */
  _refresh() {
    try { void this.render(false); } catch (_error) { /* tolerate. */ }
  }

  _prepareSvelteProps() {
    if (!this._services) {
      this._services = this._buildServices();
    }
    // A render version bumps on each _refresh so the Svelte root re-reads the
    // services snapshot.
    return { services: this._services };
  }

  _refKey() {
    const ref = this._ref;
    return ref ? `${ref.sceneId}.${ref.regionId}.${ref.behaviorId}` : null;
  }

  async close(options) {
    const key = this._refKey();
    if (key && InteractableConfigApp._instances.get(key) === this) {
      InteractableConfigApp._instances.delete(key);
    }
    return super.close(options);
  }

  _onClose(options) {
    const key = this._refKey();
    if (key && InteractableConfigApp._instances.get(key) === this) {
      InteractableConfigApp._instances.delete(key);
    }
    super._onClose(options);
  }

  /**
   * Open (or re-focus) the config panel for a behaviour ref / document. One live
   * instance per ref.
   *
   * @param {object} target  `{ sceneId, regionId, behaviorId }` or `{ document }`.
   * @returns {Promise<InteractableConfigApp|null>}
   */
  static async show(target = {}) {
    let ref = null;
    if (target.ref && target.ref.sceneId && target.ref.regionId && target.ref.behaviorId) {
      ref = { sceneId: String(target.ref.sceneId), regionId: String(target.ref.regionId), behaviorId: String(target.ref.behaviorId) };
    } else if (target.sceneId && target.regionId && target.behaviorId) {
      ref = { sceneId: String(target.sceneId), regionId: String(target.regionId), behaviorId: String(target.behaviorId) };
    } else if (target.document) {
      ref = identifyRegionBehaviorRef(target.document);
    }
    if (!ref) return null;
    const key = `${ref.sceneId}.${ref.regionId}.${ref.behaviorId}`;
    const existing = InteractableConfigApp._instances.get(key);
    if (existing) {
      if (existing.rendered) existing.bringToFront();
      return existing;
    }
    const app = new InteractableConfigApp({ ref });
    InteractableConfigApp._instances.set(key, app);
    try {
      await app.render(true);
    } catch (err) {
      if (InteractableConfigApp._instances.get(key) === app) {
        InteractableConfigApp._instances.delete(key);
      }
      throw err;
    }
    return app;
  }
}

// Register with the factory so the Tile-HUD edge + the registered-sheet path can
// resolve this class without a static import chain that requires the Svelte
// compiler in Node.
registerInteractableConfigApp(InteractableConfigApp);
