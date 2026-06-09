import { registerInteractionPromptApp } from './appFactory.js';
import { planPromptDismiss, buildPromptBehaviorRef } from './interactionPromptSingleton.js';

/**
 * The non-blocking, SINGLETON player prompt for a Fabricate interactable region
 * (region-first model). When the controlling player's token enters an eligible
 * `fabricate.interactable` region, the manager calls
 * {@link InteractionPromptApp.show} to raise a small, NOT-modal toast anchored
 * bottom-center carrying the interactable's name, an optional prompt line, and
 * an "Interact" button. On token exit the manager calls
 * {@link InteractionPromptApp.dismiss}.
 *
 * ROBUSTNESS contract: this is a PLAIN fixed-position DOM toast appended to
 * `document.body` — NOT an ApplicationV2. ApplicationV2 applies its own inline
 * positioning (overriding our stylesheet) and on the Vite dev server the module
 * stylesheet may not even be loaded, so a frameless ApplicationV2 prompt landed
 * mispositioned/unstyled and could overlay the sidebar. All CRITICAL layout
 * (fixed, bottom-center, non-blocking) lives in INLINE styles on the toast so it
 * works with zero external CSS; the `fabricate-interaction-prompt` class remains
 * for purely cosmetic theming via `styles/fabricate.css`.
 *
 * SINGLETON contract: only ONE prompt exists at a time. `show()` REPLACES the
 * live prompt (a fresh region-enter supersedes a stale one); the most recently
 * shown `behaviorRef` is tracked so `dismiss(behaviorRef)` only closes when the
 * ref matches the live prompt (a stale exit for a region the player already left
 * must not tear down a newer prompt). A bare `dismiss()` always closes.
 *
 * Registered via the app factory (NOT a static import chain) so Node test
 * environments never pull a render dependency. The pure show/dismiss singleton
 * decision is extracted into {@link planPromptDismiss} for unit testing.
 */

/**
 * Localize a key through the Foundry i18n bridge, falling back to plain English
 * when the bridge or the key is unavailable (Node test env, missing lang).
 *
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function localizeLabel(key, fallback) {
  try {
    const translated = globalThis.game?.i18n?.localize?.(key);
    return translated && translated !== key ? translated : fallback;
  } catch (_error) {
    return fallback;
  }
}

export class InteractionPromptApp {
  // The single live toast element + the behaviour ref it is showing.
  static _instance = null;
  static _behaviorRef = null;

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
   * @returns {HTMLElement|null} The toast element, or null when no DOM is available.
   */
  static show({ behaviorRef, name = '', promptText = null, onInteract = null } = {}) {
    // Replace any live prompt (a fresh enter supersedes a stale one).
    InteractionPromptApp._removeInstance();

    const doc = globalThis.document;
    if (!doc?.createElement || !doc.body?.appendChild) return null;

    const fn = typeof onInteract === 'function' ? onInteract : null;

    const toast = doc.createElement('div');
    toast.className = 'fabricate fabricate-interaction-prompt';
    toast.setAttribute('role', 'dialog');
    toast.setAttribute('aria-live', 'polite');
    // CRITICAL layout/positioning lives INLINE so the toast works with zero
    // external CSS: fixed, bottom-center, above most UI, non-blocking.
    toast.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:96px',
      'transform:translateX(-50%)',
      'z-index:70',
      'max-width:min(90vw,420px)',
      'pointer-events:auto'
    ].join(';');

    // Close affordance.
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'fabricate-interaction-prompt__close';
    closeBtn.setAttribute('aria-label', localizeLabel('FABRICATE.Canvas.Interactable.Prompt.Close', 'Dismiss'));
    closeBtn.innerHTML = '<i class="fas fa-xmark"></i>';
    closeBtn.addEventListener('click', () => InteractionPromptApp._removeInstance());

    // Body: name + optional prompt line.
    const body = doc.createElement('div');
    body.className = 'fabricate-interaction-prompt__body';
    if (name) {
      const nameEl = doc.createElement('p');
      nameEl.className = 'fabricate-interaction-prompt__name';
      nameEl.textContent = name;
      body.appendChild(nameEl);
    }
    if (promptText) {
      const textEl = doc.createElement('p');
      textEl.className = 'fabricate-interaction-prompt__text';
      textEl.textContent = promptText;
      body.appendChild(textEl);
    }

    // Interact action (one-shot: fire, then dismiss).
    const actionBtn = doc.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'fabricate-interaction-prompt__action';
    const actionLabel = localizeLabel('FABRICATE.Canvas.Interactable.Prompt.Interact', 'Interact');
    actionBtn.innerHTML = `<i class="fas fa-hand-pointer"></i><span></span>`;
    const actionSpan = actionBtn.querySelector('span');
    if (actionSpan) actionSpan.textContent = actionLabel;
    actionBtn.addEventListener('click', () => {
      try { fn?.(); } finally { InteractionPromptApp._removeInstance(); }
    });

    toast.appendChild(closeBtn);
    toast.appendChild(body);
    toast.appendChild(actionBtn);

    try {
      doc.body.appendChild(toast);
    } catch (_error) {
      return null;
    }

    InteractionPromptApp._instance = toast;
    InteractionPromptApp._behaviorRef = behaviorRef ?? null;
    return toast;
  }

  /**
   * Dismiss the live prompt. With a `behaviorRef`, only closes when it MATCHES the
   * live prompt's ref (a stale exit must not tear down a newer prompt). With no
   * ref, always closes the live prompt.
   *
   * @param {string} [behaviorRef]
   * @returns {void}
   */
  static dismiss(behaviorRef) {
    if (!planPromptDismiss(InteractionPromptApp._behaviorRef, behaviorRef)) return;
    InteractionPromptApp._removeInstance();
  }

  /**
   * Tear down the live toast element (defensive/no-throw) and clear singleton
   * state. Safe to call when nothing is showing or when no DOM is available.
   */
  static _removeInstance() {
    const el = InteractionPromptApp._instance;
    InteractionPromptApp._instance = null;
    InteractionPromptApp._behaviorRef = null;
    if (!el) return;
    try {
      el.remove?.();
      if (el.parentNode?.removeChild && el.parentNode.contains?.(el)) {
        el.parentNode.removeChild(el);
      }
    } catch (_error) { /* tolerate a detached/dead node. */ }
  }
}

export { planPromptDismiss, buildPromptBehaviorRef };

// Register with the factory so the manager can resolve this class without a
// static import chain.
registerInteractionPromptApp(InteractionPromptApp);
