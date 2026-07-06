/**
 * Thin wrappers around FoundryVTT globals.
 * All functions access globals via globalThis at call time so they work in
 * both the Foundry runtime and Node test environments.
 */

// A Fabricate-namespaced class so `styles/fabricate.css` can style the dialog
// (button layout/padding) without bleeding into other modules' DialogV2s, and a
// default width so multi-button confirm rows (e.g. "Unlink + delete marker") fit
// cleanly instead of being crushed by DialogV2's narrow default.
const FABRICATE_DIALOG_CLASSES = Object.freeze(['fabricate', 'fabricate-dialog']);
const FABRICATE_DIALOG_DEFAULT_WIDTH = 420;

function normalizeDialogOptions(options = {}) {
  const deepClone = globalThis.foundry?.utils?.deepClone ?? ((o) => JSON.parse(JSON.stringify(o)));
  const normalized = deepClone(options);

  // Ensure the Fabricate dialog classes are present (idempotent) so the namespaced
  // CSS applies and the buttons size to their content + wrap cleanly.
  const existingClasses = Array.isArray(normalized.classes) ? normalized.classes : [];
  normalized.classes = [...new Set([...existingClasses, ...FABRICATE_DIALOG_CLASSES])];

  // Give the dialog a sensible minimum width so the button row isn't cramped.
  // Respect an explicit caller width.
  normalized.position = {
    ...(normalized.position || {}),
    width: normalized.position?.width ?? FABRICATE_DIALOG_DEFAULT_WIDTH
  };

  if (normalized.title && !normalized.window?.title) {
    normalized.window = {
      ...(normalized.window || {}),
      title: normalized.title
    };
  }

  if (normalized.buttons && !Array.isArray(normalized.buttons)) {
    const legacyButtons = normalized.buttons;
    const buttonEntries = Object.entries(legacyButtons);
    const jq = globalThis.jQuery ?? globalThis.$;

    normalized.buttons = buttonEntries.map(([action, config], index) => {
      const callback = config?.callback;
      return {
        action,
        label: config?.label ?? action,
        icon: config?.icon,
        default: normalized.default === action || (!normalized.default && index === 0),
        callback: (...args) => {
          if (typeof callback !== 'function') return;
          const dialog = args[2];
          const element = dialog?.element ?? null;
          const html = typeof jq === 'function' && element ? jq(element) : element;
          return callback(html);
        }
      };
    });
  }

  if (!Array.isArray(normalized.buttons) || normalized.buttons.length === 0) {
    normalized.buttons = [{ action: 'close', label: 'Close', default: true }];
  }

  return normalized;
}

export function localize(key, data) {
  const i18n = globalThis.game?.i18n;
  if (!i18n) return key;
  if (data !== undefined) return i18n.format(key, data);
  return i18n.localize(key);
}

/**
 * Confirm/cancel dialog through Foundry V13 `DialogV2.confirm`.
 *
 * Defaults `rejectClose: false` so a benign DISMISSAL (Escape / X / click-away)
 * resolves to a non-`true` value rather than REJECTING — matching the
 * "dismissed dialog → treat as cancel" convention used by every other DialogV2
 * caller in the repo (`rollPrompt.js`, `repairComponentSources.js`,
 * `environmentDialog.js`). Without this a dismiss would throw, which callers
 * that wrap their confirm in a broader try/catch (e.g. the craft-confirm gate in
 * `craftingStore.craft()`) would mis-surface as an error. Callers may still
 * override `rejectClose` explicitly.
 *
 * @param {object} options DialogV2.confirm options.
 * @returns {Promise<*>} The confirm result (falsy/`false` on dismiss/cancel).
 */
export async function confirmDialog(options) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.confirm) return false;
  return DialogV2.confirm({ rejectClose: false, ...options });
}

export function renderDialog(options) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return null;
  const dialog = new DialogV2(normalizeDialogOptions(options));
  dialog.render(true);
  return dialog;
}

/**
 * Render a multi-choice dialog and resolve to the chosen action string.
 * Each choice is `{ action, label, icon, default }`; the dialog closing
 * (or DialogV2 being unavailable) resolves to `'cancel'`.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.content - HTML content
 * @param {Array<{action: string, label?: string, icon?: string, default?: boolean}>} options.choices
 * @param {string} [options.defaultAction] - action whose button is the default
 * @returns {Promise<string>} the chosen action, or 'cancel'
 */
export function choiceDialog({ title, content, choices = [], defaultAction } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const buttons = choices.map((choice, index) => ({
      action: choice.action,
      label: choice.label ?? choice.action,
      icon: choice.icon,
      default: defaultAction ? choice.action === defaultAction : index === 0,
      callback: () => settle(choice.action)
    }));
    const dialog = renderDialog({
      window: { title },
      content,
      buttons,
      close: () => settle('cancel')
    });
    if (!dialog) settle('cancel');
  });
}

export async function viewScene(uuid) {
  const id = String(uuid || '').trim();
  if (!id || typeof globalThis.fromUuid !== 'function') return false;
  const doc = await globalThis.fromUuid(id);
  if (doc && typeof doc.view === 'function') {
    await doc.view();
    return true;
  }
  return false;
}

/**
 * Subscribe to scene navigation/activation so callers can refresh when the
 * player's viewed scene changes. Foundry fires `canvasReady` after it draws a
 * scene on the canvas, which is the signal that `game.scenes.current` now points
 * at a different scene. Returns an unsubscribe function; no-ops gracefully when
 * the Foundry `Hooks` global is absent (e.g. unit tests).
 *
 * @param {Function} handler Invoked (no args) on each scene change.
 * @returns {Function} Unsubscribe callback.
 */
export function subscribeSceneChange(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const id = hooks.on('canvasReady', () => handler());
  return () => { hooks.off?.('canvasReady', id); };
}

/**
 * Subscribe to world-time changes so callers can refresh time-gated views
 * (Journal countdowns and run readiness, the player Crafting list's calendar-aware
 * durations) when `game.time.worldTime` advances. Foundry's `updateWorldTime` is a
 * synced hook firing on every connected client. This is a READ-only refresh
 * subscription — the handler must not publish side effects (no GM-gating is applied
 * here). Returns an unsubscribe function; no-ops gracefully when the Foundry `Hooks`
 * global is absent (e.g. unit tests).
 *
 * @param {Function} handler Invoked (no args) on each world-time change.
 * @returns {Function} Unsubscribe callback.
 */
export function subscribeWorldTime(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const id = hooks.on('updateWorldTime', () => handler());
  return () => { hooks.off?.('updateWorldTime', id); };
}

/**
 * Subscribe to owned-item changes on the relevant actors so callers can refresh
 * inventory-derived views (owned counts, recipe craftability, the Inventory tab)
 * when a component is added, removed, or its quantity is edited. Registers Foundry's
 * `createItem` / `updateItem` / `deleteItem` hooks — which fire on every connected
 * client — and only invokes `handler` when the changed item is an EMBEDDED item on an
 * actor the caller cares about (`isRelevantActor(actorId)`), skipping world/sidebar
 * items (no actor parent) and unrelated actors.
 *
 * Item mutations arrive in BURSTS — crafting a recipe deletes N ingredients and
 * creates the product (N+1 hook fires) — so the handler is debounced: every fire
 * within `debounceMs` collapses into a single trailing `handler()` call. Returns an
 * unsubscribe function that also cancels any pending debounced call; no-ops
 * gracefully when the Foundry `Hooks` global is absent (e.g. unit tests).
 *
 * @param {Function} handler Invoked (no args) once a burst of relevant item changes settles.
 * @param {object} [options]
 * @param {(actorId: string|null) => boolean} [options.isRelevantActor] Predicate,
 *   read at FIRE time so it tracks the current selection. Defaults to always-true.
 * @param {number} [options.debounceMs=50] Burst-coalescing window in milliseconds.
 * @returns {Function} Unsubscribe callback.
 */
export function subscribeInventoryChange(handler, { isRelevantActor, debounceMs = 50 } = {}) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const relevant = typeof isRelevantActor === 'function' ? isRelevantActor : () => true;
  let timer = null;
  const schedule = () => {
    // Trailing debounce: the first fire arms the timer; subsequent fires within the
    // window are absorbed, so a burst yields exactly one handler() call.
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      handler();
    }, Math.max(0, debounceMs));
  };
  const onItemChange = (item) => {
    // Embedded/owned items only: an owned item's `actor` (or `parent`) is the owning
    // Actor. World items in the sidebar resolve to null here and are ignored.
    const actorId = item?.actor?.id ?? item?.parent?.id ?? null;
    if (actorId && relevant(actorId)) schedule();
  };
  const createId = hooks.on('createItem', onItemChange);
  const updateId = hooks.on('updateItem', onItemChange);
  const deleteId = hooks.on('deleteItem', onItemChange);
  return () => {
    hooks.off?.('createItem', createId);
    hooks.off?.('updateItem', updateId);
    hooks.off?.('deleteItem', deleteId);
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/**
 * Subscribe to Fabricate crafting-data changes (a GM editing/saving a crafting system
 * or recipe) so callers can reload definition-derived views. Registers the local
 * Fabricate hooks `fabricate.craftingSystemsChanged` and `fabricate.recipesChanged`.
 * Those fire directly on the writing client; on OTHER clients they are re-emitted by
 * main.js's `updateSetting` bridge after the replicated world setting reloads the
 * in-memory managers — so this single subscription covers both same-client and
 * cross-client edits. Returns an unsubscribe function; no-ops gracefully when the
 * Foundry `Hooks` global is absent (e.g. unit tests).
 *
 * @param {Function} handler Invoked (no args) on a systems OR recipes change.
 * @returns {Function} Unsubscribe callback.
 */
export function subscribeCraftingDataChange(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const systemsId = hooks.on('fabricate.craftingSystemsChanged', () => handler());
  const recipesId = hooks.on('fabricate.recipesChanged', () => handler());
  return () => {
    hooks.off?.('fabricate.craftingSystemsChanged', systemsId);
    hooks.off?.('fabricate.recipesChanged', recipesId);
  };
}

/**
 * Subscribe to token movement (and token creation/removal) so callers can refresh
 * the live travel current-region view when a party's travel-marker token moves.
 * Fires `handler(actorUuid)` — the base Actor uuid of the moved token. `updateToken`
 * only commits once per move (not the continuous `refreshToken`), so no debounce is
 * needed. No-ops gracefully when the Foundry `Hooks` global is absent (unit tests).
 *
 * @param {(actorUuid: string|null) => void} handler
 * @returns {Function} Unsubscribe callback.
 */
/**
 * Resolve once a token's MOVE has fully settled. V13 animates token movement, and
 * the document position / region membership only reach their destination once the
 * animation completes — reading earlier reports the region the token just left.
 * Waits one frame for the animation to register, then awaits it (bounded by a
 * timeout). Resolves immediately when there is no canvas/animation (tests/headless).
 *
 * @param {object} tokenDoc
 * @returns {Promise<void>}
 */
function awaitTokenMovementSettled(tokenDoc) {
  const obj = tokenDoc?.object;
  const CanvasAnimation = globalThis.CanvasAnimation;
  if (!obj || typeof CanvasAnimation?.getAnimation !== 'function') return Promise.resolve();
  const nextFrame = () => new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
  const settle = (async () => {
    await nextFrame();
    const anim = CanvasAnimation.getAnimation(obj.animationName);
    if (anim?.promise) { try { await anim.promise; } catch { /* ignore */ } }
  })();
  const timeout = new Promise((resolve) => setTimeout(resolve, 1000));
  return Promise.race([settle, timeout]);
}

export function subscribeTravelMarkerMove(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  // Prefer the BASE world-actor uuid (`Actor.<id>`) so it matches a party's
  // `travelActorUuid` for both linked and unlinked marker tokens; fall back to the
  // token's bound actor uuid only when the token references no world actor.
  const actorUuidOf = (tokenDoc) =>
    (tokenDoc?.actorId ? `Actor.${tokenDoc.actorId}` : null) ?? tokenDoc?.actor?.uuid ?? null;
  // Fire on ANY token update — the consumer filters to actual travel markers, so a
  // marker's occasional non-positional update merely triggers a cheap quiet refetch.
  // (V13 may not always deliver movement as top-level x/y, so we do not pre-filter.)
  // Defer the notification until the move animation settles so the resolved current
  // region reflects the DESTINATION, not the region the marker just departed.
  const notify = (tokenDoc) => {
    const actorUuid = actorUuidOf(tokenDoc);
    awaitTokenMovementSettled(tokenDoc).then(() => handler(actorUuid));
  };
  const updateId = hooks.on('updateToken', notify);
  const createId = hooks.on('createToken', notify);
  const deleteId = hooks.on('deleteToken', notify);
  return () => {
    hooks.off?.('updateToken', updateId);
    hooks.off?.('createToken', createId);
    hooks.off?.('deleteToken', deleteId);
  };
}

export function notifyInfo(msg) {
  globalThis.ui?.notifications?.info(msg);
}

export function notifyWarn(msg) {
  globalThis.ui?.notifications?.warn(msg);
}

export function notifyError(msg) {
  globalThis.ui?.notifications?.error(msg);
}

export function getDragEventData(event) {
  // Strategy 1: Foundry v13+ API
  const impl = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
  if (impl?.getDragEventData) {
    return impl.getDragEventData(event);
  }

  // Strategy 2: Parse text/plain from dataTransfer (universal Foundry format)
  try {
    const raw = event?.dataTransfer?.getData?.('text/plain');
    if (raw) return JSON.parse(raw);
  } catch (_) {
    // Not valid JSON -- fall through
  }

  return null;
}
