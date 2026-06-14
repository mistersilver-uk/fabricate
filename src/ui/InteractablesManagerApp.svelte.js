import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import InteractablesManagerRoot from './svelte/apps/interactables/InteractablesManagerRoot.svelte';
import { registerInteractablesManagerApp, getInteractableConfigAppClass } from './appFactory.js';
import { getSetting, SETTING_KEYS } from '../config/settings.js';
import { scanSceneInteractables } from '../canvas/regions/interactableSceneScan.js';
import { decidePromoteRegion } from '../canvas/regions/interactablePromote.js';
import {
  buildInteractableBehaviorSystem,
  readInteractableBehaviorSystem,
} from '../canvas/regions/interactableRegionFlags.js';
import {
  resolveLinkedVisual,
  recreateLinkedTile,
  recreateLinkedDrawing,
} from '../canvas/linkedVisuals/linkedInteractableVisual.js';
import { identifyRegionBehaviorRef } from '../canvas/regions/interactableRegionNodeAdapter.js';
import {
  applyInteractableBehaviorUpdate,
} from '../canvas/interactableSocketBridge.js';
import { resolveDropEnvironment } from '../canvas/environmentResolution.js';
import { promptDropEnvironment } from '../canvas/environmentDialog.js';
import { confirmDialog, localize } from './svelte/util/foundryBridge.js';
import {
  listSystemOptions,
  listSystemTools,
  listSystemComponents,
  listSystemTasks,
  listToolSourceOptions,
  listTaskSourceOptions,
} from './interactableSourceLibrary.js';

/**
 * The GM-only "Manage Interactables" scene panel (issue 335): a scene-level
 * ApplicationV2 + Svelte app that LISTS every `fabricate.interactable` on the
 * current scene and lets a GM manage them (open rich config, jump to region,
 * delete) AND PROMOTE an existing region of any shape into a working interactable
 * bound to a chosen Tool or Gathering Task source.
 *
 * It is the supported authoring path for ARBITRARY-shaped interactables (the
 * Interactable browser drag stays the 1-grid-square fast path). GM-only; launched
 * from the Fabricate scene-control group.
 *
 * The shell stays THIN: every decision is a pure helper — `scanSceneInteractables`
 * (rows) and `decidePromoteRegion` (promotion) — injected via the services bag so
 * they are unit-testable without Foundry. Promotion reuses the SAME
 * `buildInteractableBehaviorSystem()` builder every placement path uses (no second
 * builder), the marker recreate-tile/drawing seams, and the gathering-task
 * environment-resolution precedence.
 *
 * SINGLETON, mirroring {@link InteractableBrowserApp}: `static _instance`,
 * `static async show()` (re-focus or create+render), `close()` clears it.
 */
export class InteractablesManagerApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = InteractablesManagerRoot;

  // Single shared instance so the scene-control button re-focuses one window.
  static _instance = null;
  static _renderPromise = null;

  _services = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-interactables-manager',
    classes: ['fabricate', 'fabricate-interactables-manager'],
    tag: 'div',
    window: {
      title: 'FABRICATE.Canvas.Manage.Title',
      icon: 'fas fa-list-check',
      resizable: true
    },
    position: {
      width: 560,
      height: 680
    }
  };

  /** The currently-viewed scene (the canvas scene, falling back to the active one). */
  _scene() {
    return globalThis.canvas?.scene ?? globalThis.game?.scenes?.active ?? null;
  }

  /** The active scene's grid size (one square). Falls back to 100. */
  _gridSize() {
    const size =
      globalThis.canvas?.scene?.grid?.size ??
      globalThis.canvas?.grid?.size ??
      globalThis.canvas?.dimensions?.size;
    return Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 100;
  }

  /** Resolve a live behaviour document from a `{ sceneId, regionId, behaviorId }` ref. */
  _resolveBehavior(ref) {
    if (!ref) return null;
    const scene = globalThis.game?.scenes?.get?.(String(ref.sceneId));
    const region = scene?.regions?.get?.(String(ref.regionId));
    return region?.behaviors?.get?.(String(ref.behaviorId)) ?? null;
  }

  /** The centre of a region's first shape, or null. */
  _shapeCenter(region) {
    const shape = (region?.shapes ?? [])[0] ?? null;
    if (!shape) return null;
    const x = Number(shape.x ?? 0) + Number(shape.width ?? 0) / 2;
    const y = Number(shape.y ?? 0) + Number(shape.height ?? 0) / 2;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  /**
   * The dependency bag the shared {@link interactableSourceLibrary} reads through:
   * the live crafting-system manager (Tools + managed components) and the persisted
   * gathering config (Tasks). Reusing this bag means the promote picker enumerates
   * sources through the EXACT SAME path the Interactable browser does — no third
   * enumeration that can drift (issue 335 promote-picker "No sources" fix).
   */
  _sourceDeps() {
    return {
      getCraftingSystemManager: () => globalThis.game?.fabricate?.getCraftingSystemManager?.() ?? null,
      getGatheringConfig: () => getSetting(SETTING_KEYS.GATHERING_CONFIG),
    };
  }

  /** Library gathering tasks for a system (same source the browser + manager read). */
  _readLibraryTasks(systemId) {
    return listSystemTasks(this._sourceDeps(), systemId);
  }

  /** Resolve a source's human label (tool / task name) for a behaviour system. */
  _resolveSourceLabel(system) {
    if (!system) return null;
    const deps = this._sourceDeps();
    if (system.interactableType === 'tool') {
      const tool = listSystemTools(deps, system.systemId).find(
        (t) => String(t?.id) === String(system.toolId)
      );
      if (!tool) return null;
      const label = String(tool?.label || '').trim();
      if (label) return label;
      const component = listSystemComponents(deps, system.systemId).find(
        (c) => String(c?.id) === String(tool?.componentId)
      );
      return component?.name ? String(component.name) : null;
    }
    const task = listSystemTasks(deps, system.systemId).find(
      (t) => String(t?.id) === String(system.taskId)
    );
    return task?.name ? String(task.name) : null;
  }

  /**
   * Environments of one crafting system as `{ id, name }` rows (the same source
   * `InteractableManager._systemEnvironments` reads), for gathering-task promotion.
   */
  _systemEnvironments(systemId) {
    const environments =
      globalThis.game?.fabricate?.getGatheringEnvironmentStore?.()?.list?.() ?? [];
    return (Array.isArray(environments) ? environments : [])
      .filter((env) => String(env?.craftingSystemId ?? '') === String(systemId))
      .map((env) => ({ id: String(env.id), name: String(env.name ?? env.id) }));
  }

  _environmentExists(systemId, environmentId) {
    return this._systemEnvironments(systemId).some((env) => String(env.id) === String(environmentId));
  }

  /** Enumerate the scene's regions as `{ id, name, hasInteractable }` picker rows. */
  _listRegions() {
    const scene = this._scene();
    const regions = scene?.regions;
    const list = Array.isArray(regions?.contents)
      ? regions.contents
      : typeof regions?.values === 'function'
        ? [...regions.values()]
        : Array.isArray(regions)
          ? regions
          : [];
    return list.map((region) => {
      const id = region?.id ?? region?._id ?? '';
      const behaviors = region?.behaviors;
      const bs = Array.isArray(behaviors?.contents)
        ? behaviors.contents
        : typeof behaviors?.values === 'function'
          ? [...behaviors.values()]
          : Array.isArray(behaviors)
            ? behaviors
            : [];
      const hasInteractable = bs.some((b) => b?.type === 'fabricate.interactable');
      return {
        id: String(id),
        name: String(region?.name || id || ''),
        hasInteractable
      };
    });
  }

  /**
   * Build the services bag the Svelte root reads + acts through. Reads reuse the
   * live Fabricate API; writes route through the active-GM behaviour-update edge or
   * the document create/delete edges.
   *
   * @returns {object}
   */
  _buildServices() {
    return {
      // --- List ------------------------------------------------------------
      // The scene-scan rows: name / type / source label / state / marker status.
      listRows: () => {
        const scene = this._scene();
        if (!scene) return [];
        return scanSceneInteractables(scene, {
          resolveSourceLabel: ({ system }) => this._resolveSourceLabel(system),
          resolveVisualResolved: ({ system }) =>
            resolveLinkedVisual(system, { scene }) !== null
        });
      },
      sceneName: () => this._scene()?.name ?? '',

      // --- Crafting library reads (promote source picker) ------------------
      // Tool + Gathering-Task sources are enumerated through the SAME shared
      // interactableSourceLibrary the Interactable browser reads — one source of
      // truth so the picker can never diverge from what the browser places.
      listSystems: () => listSystemOptions(this._sourceDeps()),
      listToolsForSystem: (systemId) => listToolSourceOptions(this._sourceDeps(), systemId),
      listTasksForSystem: (systemId) => listTaskSourceOptions(this._sourceDeps(), systemId),

      // --- Region picker (promote) -----------------------------------------
      listRegions: () => this._listRegions(),

      // --- Per-row actions -------------------------------------------------
      // Open the rich config panel for a listed interactable — the list is the
      // missing entry point (today the config is only reachable from a marker HUD).
      openConfig: (ref) => {
        if (!ref) return undefined;
        return getInteractableConfigAppClass().show({ ref });
      },
      // Pan the canvas to the interactable's region centre (reuses the same
      // shape-centre pan the config panel uses).
      jumpToRegion: (ref) => {
        const behavior = this._resolveBehavior(ref);
        const region = behavior?.parent ?? null;
        const center = this._shapeCenter(region);
        if (center) void globalThis.canvas?.animatePan?.({ x: center.x, y: center.y });
      },
      // Delete the interactable region (and its behaviour). Routed through the
      // shared confirm dialog (DialogV2.confirm) via the foundryBridge helper —
      // never the native browser confirm.
      deleteInteractable: async (ref) => {
        if (!this._assertGM()) return false;
        const behavior = this._resolveBehavior(ref);
        const region = behavior?.parent ?? null;
        if (!region) return false;
        const confirmed = await confirmDialog({
          window: { title: this._t('FABRICATE.Canvas.Manage.DeleteTitle', 'Delete interactable') },
          content: `<p>${this._t('FABRICATE.Canvas.Manage.DeletePrompt', 'Delete this interactable region? This cannot be undone. (The linked marker, if any, is left on the scene.)')}</p>`,
          yes: { label: this._t('FABRICATE.Canvas.Manage.DeleteConfirm', 'Delete') },
          no: { label: this._t('FABRICATE.Canvas.Manage.DeleteCancel', 'Cancel') }
        });
        if (confirmed !== true) return false;
        try {
          await region.delete?.();
        } catch (_error) {
          // Tolerate; refresh regardless.
        }
        this._refresh();
        return true;
      },

      // --- Promote region to interactable ----------------------------------
      // Resolve the gathering-task environment via the SAME drop-time precedence
      // (region auto-detect → task default → GM dialog) used by a canvas drop.
      // Returns the resolved environment id, or null when the GM cancels.
      promote: async ({ regionId, source, name, visualMode = 'marker', markerKind = 'Tile' } = {}) => {
        if (!this._assertGM()) return false;
        const scene = this._scene();
        const region = scene?.regions?.get?.(String(regionId));
        if (!region) {
          this._warn('FABRICATE.Canvas.Manage.PromoteNoRegion');
          return false;
        }

        let environmentId;
        if (source?.interactableType === 'gatheringTask') {
          environmentId = await this._resolvePromoteEnvironment({ region, source });
          // A cancelled environment dialog aborts the promotion.
          if (environmentId === false) return false;
        }

        const center = this._shapeCenter(region);
        const decision = decidePromoteRegion({
          source,
          name,
          environmentId: environmentId || undefined,
          visualMode,
          markerKind,
          center,
          buildBehaviorSystem: (spawn) => buildInteractableBehaviorSystem(spawn)
        });
        if (!decision.ok) {
          this._warn('FABRICATE.Canvas.Manage.PromoteInvalid');
          return false;
        }

        // Attach the behaviour to the EXISTING region (any shape) — promote never
        // re-shapes geometry.
        let behavior = null;
        try {
          const [created] = await region.createEmbeddedDocuments('RegionBehavior', [
            { type: 'fabricate.interactable', system: decision.behaviorSystem }
          ]);
          behavior = created ?? null;
        } catch (_error) {
          behavior = null;
        }
        if (!behavior) {
          this._warn('FABRICATE.Canvas.Manage.PromoteFailed');
          return false;
        }

        // Optional marker: create it over the region centre via the existing
        // recreate-tile / drawing seams (which also write the linkedVisual ref back).
        if (decision.marker) {
          await this._createPromoteMarker({ scene, behavior, marker: decision.marker });
        }

        this._refresh();
        return true;
      }
    };
  }

  /**
   * Resolve the environment for a gathering-task promotion via the shared drop-time
   * precedence, prompting the GM only when needed. Returns the resolved id, an
   * empty string when none, or `false` when the GM cancels the dialog.
   *
   * @param {object} params
   * @param {object} params.region  The live region the GM is promoting.
   * @param {object} params.source  `{ interactableType, systemId, referenceId }`.
   * @returns {Promise<string|false>}
   */
  async _resolvePromoteEnvironment({ region, source }) {
    const systemId = source.systemId;
    const environments = this._systemEnvironments(systemId);
    const tasks = this._readLibraryTasks(systemId);
    const task = tasks.find((t) => String(t?.id) === String(source.referenceId)) ?? null;

    // Auto-detect from a flagged region the GM is promoting: read this region's
    // own `flags.fabricate.environmentId` (the same flag drop-time hit-testing uses).
    const regionEnvId = region?.flags?.fabricate?.environmentId
      ? String(region.flags.fabricate.environmentId)
      : '';
    const resolution = resolveDropEnvironment({
      regionEnvironmentIds: regionEnvId ? [regionEnvId] : [],
      defaultEnvironmentId: task?.defaultEnvironmentId ?? null,
      forceDialog: false,
      environmentExists: (id) => this._environmentExists(systemId, id)
    });

    if (!resolution.needsDialog) return resolution.environmentId ?? '';

    const picked = await promptDropEnvironment({
      environments,
      defaultEnvironmentId: task?.defaultEnvironmentId ?? '',
      localize: (key, fallback) => globalThis.game?.i18n?.localize?.(key) ?? fallback
    });
    if (!picked) return false; // cancel ⇒ abort.
    return picked;
  }

  /**
   * Create the promotion's marker (Tile or Drawing) over the region centre via the
   * existing recreate seams (they write the `linkedVisual.{uuid,documentName}` ref
   * back onto the behaviour). No-throw.
   *
   * @param {object} params
   * @param {object} params.scene
   * @param {object} params.behavior  The freshly-created interactable behaviour.
   * @param {object} params.marker    `{ kind, center }` from {@link decidePromoteRegion}.
   * @returns {Promise<void>}
   */
  async _createPromoteMarker({ scene, behavior, marker }) {
    const grid = this._gridSize();
    const center = marker.center;
    const placement = center
      ? { x: center.x - grid / 2, y: center.y - grid / 2, width: grid, height: grid }
      : {};
    const deps = {
      applyBehaviorUpdate: applyInteractableBehaviorUpdate,
      identify: identifyRegionBehaviorRef
    };
    try {
      if (marker.kind === 'Drawing') {
        await recreateLinkedDrawing(behavior, { scene, ...placement }, deps);
      } else {
        await recreateLinkedTile(behavior, { scene, ...placement }, deps);
      }
    } catch (_error) {
      // Defensive: a working region interactable is acceptable without its marker.
    }
  }

  _assertGM() {
    return globalThis.game?.user?.isGM === true;
  }

  _warn(key) {
    globalThis.ui?.notifications?.warn?.(this._t(key, key));
  }

  _t(key, fallback) {
    const out = localize(key);
    return out && out !== key ? out : fallback;
  }

  /** Re-render the panel so a write reflects immediately. */
  _refresh() {
    try {
      void this.render(false);
    } catch (_error) {
      // tolerate.
    }
  }

  _prepareSvelteProps() {
    if (!this._services) {
      this._services = this._buildServices();
    }
    return { services: this._services };
  }

  async close(options) {
    if (InteractablesManagerApp._instance === this) {
      InteractablesManagerApp._instance = null;
      InteractablesManagerApp._renderPromise = null;
    }
    return super.close(options);
  }

  _onClose(options) {
    if (InteractablesManagerApp._instance === this) {
      InteractablesManagerApp._instance = null;
      InteractablesManagerApp._renderPromise = null;
    }
    super._onClose(options);
  }

  /**
   * Open (or re-focus) the shared Manage Interactables window. Mirrors the
   * browser app's V13 re-entrancy guard (the scene-control button fires the launch
   * handler 2-3x per activation): coalesce concurrent show() calls to one window.
   *
   * @returns {Promise<InteractablesManagerApp>}
   */
  static async show() {
    const existing = InteractablesManagerApp._instance;
    if (existing) {
      if (existing.rendered) existing.bringToFront();
      else if (InteractablesManagerApp._renderPromise) await InteractablesManagerApp._renderPromise;
      return existing;
    }
    const app = new InteractablesManagerApp();
    InteractablesManagerApp._instance = app;
    const renderPromise = Promise.resolve(app.render(true));
    InteractablesManagerApp._renderPromise = renderPromise;
    try {
      await renderPromise;
    } catch (err) {
      if (InteractablesManagerApp._instance === app) {
        InteractablesManagerApp._instance = null;
      }
      if (InteractablesManagerApp._renderPromise === renderPromise) {
        InteractablesManagerApp._renderPromise = null;
      }
      throw err;
    } finally {
      if (InteractablesManagerApp._renderPromise === renderPromise) {
        InteractablesManagerApp._renderPromise = null;
      }
    }
    return app;
  }
}

// Register with the factory so the scene-control hook can launch this class
// without a static import chain that requires the Svelte compiler in Node.
registerInteractablesManagerApp(InteractablesManagerApp);
