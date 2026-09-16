import { registerInteractionPromptApp } from './appFactory.js';
import { planPromptDismiss, buildPromptBehaviorRef } from './interactionPromptSingleton.js';
import {
  DEFAULT_INTERACTION_PROMPT_POSITION,
  resolveInteractionPromptPositionStyle,
} from './interactionPromptPosition.js';

// The non-blocking SINGLETON player prompt for a Fabricate interactable region.
// ROBUSTNESS: a PLAIN fixed-position DOM toast on `document.body`, NOT an ApplicationV2, which
// applies its own inline positioning over the stylesheet and — on the Vite dev server, where the
// module stylesheet may not be loaded at all — landed mispositioned and could overlay the sidebar.
// Every CRITICAL layout property is INLINE, so the toast works with zero external CSS; the class is
// cosmetic theming only.
// SINGLETON: `show()` REPLACES the live prompt, and the `behaviorRef` it is showing is tracked so a
// `dismiss(behaviorRef)` closes only on a MATCH — a stale exit for a region the player already left
// must not tear down a newer prompt, while a bare `dismiss()` always closes.
// Registered through the app factory rather than a static import chain, so a Node test environment
// never pulls a render dependency; the pure decision lives in `planPromptDismiss`.

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

  static show({ behaviorRef, name = '', promptText = null, onInteract = null } = {}) {
    InteractionPromptApp._removeInstance();

    const doc = globalThis.document;
    if (!doc?.createElement || !doc.body?.appendChild) return null;

    const fn = typeof onInteract === 'function' ? onInteract : null;

    const toast = doc.createElement('div');
    toast.className = 'fabricate fabricate-interaction-prompt';
    toast.setAttribute('role', 'dialog');
    toast.setAttribute('aria-live', 'polite');
    // The anchor is a per-client setting so a player can move the toast away from a conflicting
    // widget; an unreadable setting falls back to the default.
    toast.style.cssText = [
      'position:fixed',
      ...resolveInteractionPromptPositionStyle(InteractionPromptApp._readConfiguredPosition()),
      'z-index:70',
      'max-width:min(90vw,420px)',
      'pointer-events:auto'
    ].join(';');

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'fabricate-interaction-prompt__close';
    closeBtn.setAttribute('aria-label', localizeLabel('FABRICATE.Canvas.Interactable.Prompt.Close', 'Dismiss'));
    closeBtn.innerHTML = '<i class="fas fa-xmark"></i>';
    closeBtn.addEventListener('click', () => InteractionPromptApp._removeInstance());

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

    // One-shot: fire, then dismiss.
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

  static dismiss(behaviorRef) {
    if (!planPromptDismiss(InteractionPromptApp._behaviorRef, behaviorRef)) return;
    InteractionPromptApp._removeInstance();
  }

  // Read INLINE, with a literal namespace and key, to preserve this module's zero-import
  // robustness contract; the style resolver defaults any unknown value, so a corrupt setting is safe.
  static _readConfiguredPosition() {
    try {
      const value = globalThis.game?.settings?.get?.('fabricate', 'interactionPromptPosition');
      return typeof value === 'string' && value ? value : DEFAULT_INTERACTION_PROMPT_POSITION;
    } catch (_error) {
      return DEFAULT_INTERACTION_PROMPT_POSITION;
    }
  }

  // No-throw, and safe when nothing is showing or no DOM is available.
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

// Registered so the manager resolves this class without a static import chain.
registerInteractionPromptApp(InteractionPromptApp);
