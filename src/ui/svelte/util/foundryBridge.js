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

export async function confirmDialog(options) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.confirm) return false;
  return DialogV2.confirm(options);
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

/**
 * Subscribe to run-flag writes on the relevant actor so callers can quietly re-fetch
 * run-derived views (the Journal listing, the nav active-run count badge) when a run
 * is created, advanced, or archived by ANY client — including the primary-GM
 * world-time resume (issues 733 + 739). Registers Foundry's `updateActor` hook (which
 * fires on every connected client) and only invokes `handler` when the changed actor
 * is one the caller cares about (`isRelevantActor(actorId)`) AND the diff touches a
 * Fabricate run-container flag path. `updateActor` fires on every HP tick, so both
 * filters are load-bearing. Returns an unsubscribe function; no-ops gracefully when
 * the Foundry `Hooks` global is absent (e.g. unit tests).
 *
 * @param {Function} handler Invoked (no args) on a relevant run-flag change.
 * @param {object} [options]
 * @param {(actorId: string|null) => boolean} [options.isRelevantActor] Predicate,
 *   read at FIRE time so it tracks the current selection. Defaults to always-true.
 * @returns {Function} Unsubscribe callback.
 */
export function subscribeActorRunFlagChange(handler, { isRelevantActor } = {}) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const relevant = typeof isRelevantActor === 'function' ? isRelevantActor : () => true;
  const hasProperty = globalThis.foundry?.utils?.hasProperty;
  const touchesRunFlag = (changes) =>
    typeof hasProperty === 'function' &&
    (hasProperty(changes, 'flags.fabricate.fabricate.craftingRuns') ||
      hasProperty(changes, 'flags.fabricate.fabricate.salvageRuns') ||
      hasProperty(changes, 'flags.fabricate.gatheringRuns'));
  const onUpdate = (actor, changes) => {
    const actorId = actor?.id ?? null;
    if (actorId && relevant(actorId) && touchesRunFlag(changes)) handler();
  };
  const id = hooks.on('updateActor', onUpdate);
  return () => {
    hooks.off?.('updateActor', id);
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

/**
 * The V13 `TextEditor` implementation. `foundry.applications.ux.TextEditor` is the
 * base class and `.implementation` is the system-registered subclass (dnd5e/PF2e
 * install their own). Core's base `enrichHTML` self-dispatches to
 * `TextEditor.implementation`, so the `?? base` fallback is EQUIVALENT, not
 * degraded, and no `compatibility.minimum` raise is needed for it.
 *
 * Always reached through `globalThis.foundry?.…` — a bare `foundry.` throws a
 * ReferenceError in Node instead of yielding `undefined`, which would defeat this
 * module's stated "works in both Foundry and Node" contract.
 *
 * @returns {object|null}
 */
function textEditorImplementation() {
  return (
    globalThis.foundry?.applications?.ux?.TextEditor?.implementation ??
    globalThis.foundry?.applications?.ux?.TextEditor ??
    null
  );
}

/**
 * RESOLVE a raw description through Foundry's own enricher and return the enriched
 * HTML. A label-less `@UUID[…]` comes back as an anchor whose text is the
 * referenced document's real NAME — which is the whole point of resolving at write
 * time instead of flattening directives to whatever label the author happened to
 * type.
 *
 * The caller is expected to normalize the returned HTML to plain text with
 * `plainTextDescription` (`src/utils/plainTextDescription.js`), whose broken-anchor
 * and privacy passes need the MARKUP, not `textContent`. That is why this is named
 * `enrichToHtml` rather than `enrichText`.
 *
 * Option bag — every value here is load-bearing:
 * - `documents: true` — the point; turns a reference into a named anchor.
 * - `custom: true` — runs `CONFIG.TextEditor.enrichers`, i.e. the system's and
 *   modules' own enrichers (`@Check`, `@Damage`, `&Reference`, …).
 * - `secrets: false`, EXPLICITLY — PF2e's `TextEditorPF2e.enrichHTML` does
 *   `options.secrets ??= game.user.isGM`, and we enrich AS GM but store the result
 *   for PLAYERS, so an omitted key would bake a GM-only secret block into
 *   player-visible text. The explicit `false` defeats the `??=`.
 * - `rolls: false` — a command-LESS `[[1d6]]` is EAGERLY evaluated by the enricher
 *   and would freeze as a literal `"4"` in the stored description forever. The
 *   deferred `[[/roll 1d6]]` form cannot be had without the eager one, so rolls are
 *   flattened deterministically downstream instead.
 * - `embeds: false` — `@Embed[uuid]` inlines an entire journal page into what is
 *   meant to be a one-line description; its authored label is recovered by the
 *   label mop-up in `plainTextDescription`.
 * - `links: false` — raw hyperlink auto-linking adds nothing to plain text.
 * - `relativeTo` — resolves relative UUIDs against the source document.
 *
 * `processVisibility` is **deliberately ABSENT**, and re-adding it is pinned as a
 * failing test. Passing `false` is wrong in DIRECTION: PF2e's `UserVisibilityPF2e`
 * removes `[data-visibility="gm"]` content only when the current user is NOT a GM,
 * and we enrich as a GM — so `false` never closes the GM leak it looks like it
 * closes, while additionally re-opening the unconditional `[data-visibility="none"]`
 * removal the default performs for free. The frame of reference is the mismatch: the
 * flag filters for the user DOING the enriching, whereas the result is stored for a
 * different, broader audience. The leak is closed by an audience-independent
 * attribute scrub in `plainTextDescription` instead.
 *
 * Falls back to the raw text (never throws) when no enricher is reachable, so the
 * headless/test path degrades to today's behaviour rather than losing the text.
 *
 * @param {string} raw - the source description text
 * @param {{ relativeTo?: object|null }} [options]
 * @returns {Promise<string>} enriched HTML
 */
export async function enrichToHtml(raw, { relativeTo = null } = {}) {
  const text = typeof raw === 'string' ? raw : '';
  if (!text) return '';
  const impl = textEditorImplementation();
  if (typeof impl?.enrichHTML !== 'function') return text;
  try {
    const enriched = await impl.enrichHTML(text, {
      secrets: false,
      documents: true,
      links: false,
      rolls: false,
      embeds: false,
      custom: true,
      relativeTo,
    });
    return typeof enriched === 'string' ? enriched : text;
  } catch (_error) {
    return text;
  }
}

// Compendium-shaped UUID candidates inside directive text. Deliberately GENEROUS —
// every candidate is handed to `foundry.utils.parseUuid`, which is the authoritative
// parser, so over-matching costs one cheap parse while under-matching would silently
// revert priming to one round-trip per description while every call-count test still
// passed. Bounded quantifiers only (Sonar S5852): an unterminated run of `@Word[`
// must stay linear, which the adversarial-length test pins.
const COMPENDIUM_UUID_CANDIDATE =
  /@[A-Za-z]{1,32}\[([^\]]{0,2048})\]|(?<![\w.])(Compendium\.[\w.-]{1,512})/g;

// Foundry documents no cap on `_id__in`; chunked defensively so a world with
// hundreds of references from one pack cannot build a pathological query.
const PRIME_CHUNK_SIZE = 250;

/**
 * Group the compendium documents referenced by `rawTexts` by pack.
 * Ids already resident in a pack's document cache are skipped — priming them
 * again would be a wasted round-trip.
 *
 * @param {Iterable<string>} rawTexts
 * @returns {Map<object, string[]>} pack → ids to fetch
 */
function groupUncachedCompendiumIds(rawTexts) {
  const parseUuid = globalThis.foundry?.utils?.parseUuid;
  const byPack = new Map();
  if (typeof parseUuid !== 'function') return byPack;

  for (const raw of rawTexts ?? []) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    for (const match of raw.matchAll(COMPENDIUM_UUID_CANDIDATE)) {
      const candidate = String(match[1] ?? match[2] ?? '').split('#')[0].trim();
      if (!candidate.startsWith('Compendium.')) continue;
      let parsed = null;
      try {
        parsed = parseUuid(candidate);
      } catch (_error) {
        parsed = null;
      }
      const pack = parsed?.collection;
      const id = parsed?.primaryId ?? parsed?.documentId;
      if (!pack || !id || typeof pack.getDocuments !== 'function') continue;
      if (pack.get?.(id)) continue;
      const ids = byPack.get(pack);
      if (ids) {
        if (!ids.includes(id)) ids.push(id);
      } else {
        byPack.set(pack, [id]);
      }
    }
  }

  return byPack;
}

/**
 * Warm the compendium document cache for every reference in `rawTexts`, ONCE, up
 * front.
 *
 * Core's enricher primes compendiums per `enrichHTML` call, so resolving 400
 * descriptions one at a time costs up to 400 round-trips. Priming from a single
 * sweep collapses that to one query per PACK. The fetched documents are retained
 * for the session (Foundry evicts nothing here), which is what makes the
 * subsequent per-description `enrichHTML` calls cache hits.
 *
 * No-ops safely when Foundry's UUID parser is absent (headless tests).
 *
 * @param {Iterable<string>} rawTexts
 * @returns {Promise<void>}
 */
export async function primeEnricherCache(rawTexts) {
  const byPack = groupUncachedCompendiumIds(rawTexts);
  const fetches = [];
  for (const [pack, ids] of byPack) {
    for (let offset = 0; offset < ids.length; offset += PRIME_CHUNK_SIZE) {
      const chunk = ids.slice(offset, offset + PRIME_CHUNK_SIZE);
      fetches.push(Promise.resolve(pack.getDocuments({ _id__in: chunk })).catch(() => []));
    }
  }
  await Promise.all(fetches);
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
