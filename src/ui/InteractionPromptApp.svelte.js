import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import InteractionPromptRoot from './svelte/apps/InteractionPromptRoot.svelte';
import { registerInteractionPromptApp } from './appFactory.js';
import { planPromptDismiss, buildPromptBehaviorRef } from './interactionPromptSingleton.js';

/**
 * The non-blocking, SINGLETON player prompt for a Fabricate interactable region
 * (region-first model). When the controlling player's token enters an eligible
 * `fabricate.interactable` region, the manager calls
 * {@link InteractionPromptApp.show} to raise a small, NOT-modal ApplicationV2
 * anchored bottom-center carrying the interactable's name, an optional prompt
 * line, and an "Interact" button. On token exit the manager calls
 * {@link InteractionPromptApp.dismiss}.
 *
 * SINGLETON contract: only ONE prompt exists at a time. `show()` REPLACES the
 * live prompt (a fresh region-enter supersedes a stale one); the most recently
 * shown `behaviorRef` is tracked so `dismiss(behaviorRef)` only closes when the
 * ref matches the live prompt (a stale exit for a region the player already left
 * must not tear down a newer prompt). A bare `dismiss()` always closes.
 *
 * Registered via the app factory (NOT a static import chain) so Node test
 * environments never pull the Svelte compiler. The pure show/dismiss singleton
 * decision is extracted into {@link planPromptDismiss} for unit testing without
 * a live ApplicationV2.
 */
export class InteractionPromptApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = InteractionPromptRoot;

  // The single live prompt instance + the behaviour ref it is showing.
  static _instance = null;
  static _behaviorRef = null;

  _name = '';
  _promptText = null;
  _onInteract = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-interaction-prompt',
    classes: ['fabricate', 'fabricate-interaction-prompt-app'],
    tag: 'div',
    window: {
      frame: false,
      positioned: true
    },
    position: {
      width: 'auto',
      height: 'auto'
    }
  };

  _prepareSvelteProps() {
    return {
      name: this._name,
      promptText: this._promptText,
      onInteract: () => {
        const fn = this._onInteract;
        // Fire the interaction, then dismiss this prompt (one-shot).
        try { fn?.(); } finally { void this.close(); }
      },
      onClose: () => { void this.close(); }
    };
  }

  async close(options) {
    if (InteractionPromptApp._instance === this) {
      InteractionPromptApp._instance = null;
      InteractionPromptApp._behaviorRef = null;
    }
    return super.close(options);
  }

  _onClose(options) {
    if (InteractionPromptApp._instance === this) {
      InteractionPromptApp._instance = null;
      InteractionPromptApp._behaviorRef = null;
    }
    super._onClose(options);
  }

  /**
   * Show (or REPLACE) the singleton prompt for one interactable region.
   *
   * @param {object} params
   * @param {string} params.behaviorRef  A stable key for the region behaviour
   *   (e.g. `${sceneId}.${regionId}.${behaviorId}`); used so a matching
   *   `dismiss` tears this prompt down and a stale dismiss does not.
   * @param {string} [params.name]       Interactable display name.
   * @param {string|null} [params.promptText]  Optional prompt line.
   * @param {() => void} [params.onInteract]   Invoked when the player clicks Interact.
   * @returns {Promise<InteractionPromptApp>}
   */
  static async show({ behaviorRef, name = '', promptText = null, onInteract = null } = {}) {
    // Replace any live prompt (a fresh enter supersedes a stale one).
    const existing = InteractionPromptApp._instance;
    if (existing) {
      try { await existing.close(); } catch (_error) { /* tolerate a dead prompt. */ }
    }
    const app = new InteractionPromptApp();
    app._name = name ?? '';
    app._promptText = promptText ?? null;
    app._onInteract = typeof onInteract === 'function' ? onInteract : null;
    InteractionPromptApp._instance = app;
    InteractionPromptApp._behaviorRef = behaviorRef ?? null;
    await app.render(true);
    return app;
  }

  /**
   * Dismiss the live prompt. With a `behaviorRef`, only closes when it MATCHES the
   * live prompt's ref (a stale exit must not tear down a newer prompt). With no
   * ref, always closes the live prompt.
   *
   * @param {string} [behaviorRef]
   * @returns {Promise<void>}
   */
  static async dismiss(behaviorRef) {
    if (!planPromptDismiss(InteractionPromptApp._behaviorRef, behaviorRef)) return;
    const app = InteractionPromptApp._instance;
    if (!app) return;
    try { await app.close(); } catch (_error) { /* tolerate. */ }
  }
}

export { planPromptDismiss, buildPromptBehaviorRef };

// Register with the factory so the manager can resolve this class without a
// static import chain that requires the Svelte compiler in Node.
registerInteractionPromptApp(InteractionPromptApp);
