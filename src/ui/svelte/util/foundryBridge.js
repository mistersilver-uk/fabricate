/**
 * Thin wrappers around FoundryVTT globals.
 * All functions access globals via globalThis at call time so they work in
 * both the Foundry runtime and Node test environments.
 */

// Namespaced so `styles/fabricate.css` can style the dialog without bleeding into another module's
// DialogV2, and wide enough that a multi-button confirm row is not crushed by DialogV2's default.
const FABRICATE_DIALOG_CLASSES = Object.freeze(['fabricate', 'fabricate-dialog']);
const FABRICATE_DIALOG_DEFAULT_WIDTH = 420;

function normalizeDialogOptions(options = {}) {
  const deepClone = globalThis.foundry?.utils?.deepClone ?? ((o) => JSON.parse(JSON.stringify(o)));
  const normalized = deepClone(options);

  // Idempotent, so the namespaced CSS applies however often this runs.
  const existingClasses = Array.isArray(normalized.classes) ? normalized.classes : [];
  normalized.classes = [...new Set([...existingClasses, ...FABRICATE_DIALOG_CLASSES])];

  // An explicit caller width always wins.
  normalized.position = {
    ...(normalized.position || {}),
    width: normalized.position?.width ?? FABRICATE_DIALOG_DEFAULT_WIDTH,
  };

  if (normalized.title && !normalized.window?.title) {
    normalized.window = {
      ...(normalized.window || {}),
      title: normalized.title,
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
        },
      };
    });
  }

  if (!Array.isArray(normalized.buttons) || normalized.buttons.length === 0) {
    normalized.buttons = [{ action: 'close', label: 'Close', default: true }];
  }

  return normalized;
}

// `isGM`, not `activeGM`: it answers "may this client see and drive a GM surface", a single-client
// question with no duplicate-execution risk, so an assistant GM answers true. NOT authorization.
export function isGameMaster() {
  return globalThis.game?.user?.isGM === true;
}

// DELIBERATELY `i18n.format(key, data)` for the `data` branch: on V13.351 `localize` takes no
// `data` argument at all, and on V14.365 `format` survives as a prototype alias of `localize`. So
// this is correct on both supported builds, and "modernising" it silently breaks V13.351.
// Returns the key itself when no `game.i18n` is reachable, i.e. outside a running world.
export function localize(key, data) {
  const i18n = globalThis.game?.i18n;
  if (!i18n) return key;
  if (data !== undefined) return i18n.format(key, data);
  return i18n.localize(key);
}

// A comma-and-"and" join is a LANGUAGE rule, not an authored string: separator, conjunction and
// Oxford comma all vary by locale. These options are the "x, y and z" reading of a conjunction.
const LIST_FORMAT_OPTIONS = Object.freeze({ style: 'long', type: 'conjunction' });

// `getListFormatter` is bound to the language the world is actually running in, which is what makes
// this correct for a sentence assembled at render time — `items.join(', ')` and an authored
// separator key are both wrong outside English. Degrades to the platform locale with no i18n.
export function formatList(items) {
  const values = Array.isArray(items) ? items.map((item) => String(item ?? '')) : [];
  const i18n = globalThis.game?.i18n;
  if (typeof i18n?.getListFormatter !== 'function') {
    return new Intl.ListFormat(undefined, LIST_FORMAT_OPTIONS).format(values);
  }
  return i18n.getListFormatter(LIST_FORMAT_OPTIONS).format(values);
}

// The shape `DialogV2.confirm` and `ApplicationV2` actually READ, shared with
// `src/ui/foundryCompat.js` so the manager's confirm seam and the player's cannot drift (issue
// 1154). Two mappings, both load-bearing: `title` becomes `window.title`, because a top-level
// `title` is read by NOTHING and every manager confirm used to render an empty title bar; and a
// FUNCTION `yes`/`no` becomes `{ callback }`, because `DialogV2.confirm` merges each over a default
// button with `mergeObject`, which iterates `Object.keys` — `[]` for a function — so a bare
// `yes: () => 'x'` silently keeps the default label AND the default `() => true` callback.
// Deliberately NOT routed through `normalizeDialogOptions`: that injects a `close` button when
// `buttons` is absent, and `DialogV2.confirm` unshifts its own pair, giving a THREE-button confirm.
// Returns a fresh bag; the caller's object is never mutated.
export function normalizeConfirmOptions(options) {
  const normalized = { ...(options || {}) };
  if (normalized.title && !normalized.window?.title) {
    normalized.window = { ...(normalized.window || {}), title: normalized.title };
  }
  if (typeof normalized.yes === 'function') normalized.yes = { callback: normalized.yes };
  if (typeof normalized.no === 'function') normalized.no = { callback: normalized.no };
  return normalized;
}

export async function confirmDialog(options) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.confirm) return false;
  return DialogV2.confirm(normalizeConfirmOptions(options));
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
      callback: () => settle(choice.action),
    }));
    const dialog = renderDialog({
      window: { title },
      content,
      buttons,
      close: () => settle('cancel'),
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

// `canvasReady` fires after Foundry draws a scene, which is the signal that `game.scenes.current`
// now points somewhere else. Returns an unsubscribe; no-ops with no `Hooks` global.
export function subscribeSceneChange(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const id = hooks.on('canvasReady', () => handler());
  return () => {
    hooks.off?.('canvasReady', id);
  };
}

// `updateWorldTime` is a SYNCED hook firing on every connected client, so this is a READ-only
// refresh subscription and the handler must not publish side effects — no GM gate is applied here.
export function subscribeWorldTime(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const id = hooks.on('updateWorldTime', () => handler());
  return () => {
    hooks.off?.('updateWorldTime', id);
  };
}

// Owned-item changes, for inventory-derived views. `isRelevantActor` is load-bearing: the item
// hooks fire on every connected client, and world/sidebar items have no actor parent at all.
// Item mutations arrive in BURSTS — crafting deletes N ingredients and creates the product — so the
// handler is trailing-debounced into one call, and the unsubscribe cancels a pending one.
export function subscribeInventoryChange(handler, { isRelevantActor, debounceMs = 50 } = {}) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const relevant = typeof isRelevantActor === 'function' ? isRelevantActor : () => true;
  let timer = null;
  const schedule = () => {
    // The first fire arms the timer; subsequent fires inside the window are absorbed.
    if (timer !== null) return;
    timer = setTimeout(
      () => {
        timer = null;
        handler();
      },
      Math.max(0, debounceMs)
    );
  };
  const onItemChange = (item) => {
    // Embedded items only: a world item in the sidebar resolves to null here and is ignored.
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

// A LITERAL mirroring `CRAFTING_DATA_CHANGED_HOOK` rather than an import, and the reason is
// mechanical: ~75 mounted harnesses declare THIS module and the pre-validator walks its whole static
// import closure, so one new import here breaks every one of them until each declares the transitive
// module. `tests/util/foundry-bridge-subscriptions.test.js` pins the two equal.
export const CRAFTING_DATA_CHANGED_HOOK = 'fabricate.craftingDataChanged';

// Exposed so a test can assert the narrowing CAME FROM domain routing rather than inferring it: a
// payload reaching the fallback is delivered to every subscriber whatever its domain set. Counted
// per SUBSCRIBER delivery, not per payload, so a fail-safe case expects a rise of the subscriber
// count.
let broadFallbackCount = 0;

export function readCraftingDataFallbackCount() {
  return broadFallbackCount;
}

export function resetCraftingDataFallbackCount() {
  broadFallbackCount = 0;
}

// A LITERAL mirroring `INVALIDATION_DOMAIN_NAMES`, for the reason the hook name above is one, and
// pinned against the real constant by the same guard.
const KNOWN_INVALIDATION_DOMAINS = new Set([
  'labelling',
  'narrative',
  'materials-and-yield',
  'resolution-config',
  'component-definitions',
  'access-and-knowledge',
  'held-inventory',
]);

// The domains a payload names, or `null` to route BROADLY. Four shapes route broadly under ONE rule
// — "I cannot attribute this": an unrecognised change, malformed `scopes`, scopes unioning to
// nothing, and a change every one of whose domains is a name this build does not know. That last is
// the easy one to omit and the only class that would otherwise route NARROW: an unknown name yields
// a non-empty set intersecting no subscriber, so nothing refreshes and the counter does not move —
// a stale read model wearing the appearance of correct narrowing. Over-broad invalidation is a
// performance bug; a stale read model is a correctness one.
function payloadDomains(payload) {
  const scopes = payload?.scopes;
  if (!Array.isArray(scopes)) return null;
  const domains = new Set();
  for (const scope of scopes) {
    if (!Array.isArray(scope?.domains)) return null;
    for (const domain of scope.domains) {
      if (KNOWN_INVALIDATION_DOMAINS.has(domain)) domains.add(domain);
    }
  }
  return domains.size > 0 ? domains : null;
}

// The UNPUBLISHED `fabricate.craftingDataChanged` hook, which both managers emit beside their
// published change hooks and `main.js`'s `updateSetting` bridge re-emits on every other client, so
// one subscription covers same-client and cross-client edits alike. It deliberately no longer binds
// `craftingSystemsChanged`/`recipesChanged` (issue 1078): those bindings were ZERO-ARGUMENT, so the
// payload was discarded and no narrowing was possible. Both still fire for third-party subscribers,
// and every publisher of one also publishes the scoped signal.
// `wantedDomains` is normally `STORE_DOMAINS[store]` from `src/systems/invalidationDomains.js`;
// omitting it means every domain, the behaviour before issue 1078, and stays the safe default.
export function subscribeCraftingDataChange(handler, { domains = null } = {}) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const wanted = Array.isArray(domains) ? new Set(domains) : null;
  const id = hooks.on(CRAFTING_DATA_CHANGED_HOOK, (payload) => {
    const named = payloadDomains(payload);
    if (named === null) {
      broadFallbackCount += 1;
      handler(payload);
      return;
    }
    if (wanted === null || [...named].some((domain) => wanted.has(domain))) handler(payload);
  });
  return () => hooks.off?.(CRAFTING_DATA_CHANGED_HOOK, id);
}

// Node depletion is applied by the ACTIVE GM, because a player may not write the world setting the
// pools live in, so the acting player's own post-attempt reload races ahead of the GM's write and
// nothing else re-runs it. Without this subscription a player's node counts stay stale until they
// reopen the app, and the local `NODE_DEPLETED` gate keeps offering a pool the GM already zeroed.
export function subscribeGatheringDataChange(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const id = hooks.on('fabricate.gatheringEnvironmentsChanged', () => handler());
  return () => hooks.off?.('fabricate.gatheringEnvironmentsChanged', id);
}

// `handler(actorUuid)` on token movement. `updateToken` commits once per move, unlike the
// continuous `refreshToken`, so no debounce is needed.
// V13 ANIMATES token movement, and the document position and region membership only reach their
// destination once that completes — reading earlier reports the region the token just LEFT. Waits a
// frame for the animation to register, then awaits it under a timeout.
function awaitTokenMovementSettled(tokenDoc) {
  const obj = tokenDoc?.object;
  const CanvasAnimation = globalThis.CanvasAnimation;
  if (!obj || typeof CanvasAnimation?.getAnimation !== 'function') return Promise.resolve();
  const nextFrame = () =>
    new Promise((resolve) => {
      if (typeof globalThis.requestAnimationFrame === 'function')
        globalThis.requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 16);
    });
  const settle = (async () => {
    await nextFrame();
    const anim = CanvasAnimation.getAnimation(obj.animationName);
    if (anim?.promise) {
      try {
        await anim.promise;
      } catch {
        /* ignore */
      }
    }
  })();
  const timeout = new Promise((resolve) => setTimeout(resolve, 1000));
  return Promise.race([settle, timeout]);
}

export function subscribeTravelMarkerMove(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  // The BASE world-actor uuid matches a party's `travelActorUuid` for linked and unlinked marker
  // tokens alike; the token's bound actor uuid is the fallback for a token referencing no world one.
  const actorUuidOf = (tokenDoc) =>
    (tokenDoc?.actorId ? `Actor.${tokenDoc.actorId}` : null) ?? tokenDoc?.actor?.uuid ?? null;
  // ANY token update, because V13 may not deliver movement as top-level x/y; the consumer filters
  // to real travel markers, so a non-positional update costs one quiet refetch. The notification is
  // deferred until the move settles, so the resolved region is the DESTINATION.
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

// A local mirror of `runFlagInvalidation.js`'s `RUN_CONTAINER_FLAG_PATHS`, deliberately not an
// import: a mounted manifest missing a transitive import does not fail, it HANGS and reports
// `# cancelled`. `tests/util/foundry-bridge-subscriptions.test.js` pins the mirror (issue 1654).
const RUN_FLAG_BASE_PATHS = Object.freeze([
  'flags.fabricate.fabricate.craftingRuns',
  'flags.fabricate.fabricate.salvageRuns',
  'flags.fabricate.gatheringRuns',
]);

// Mirrored from `FLAG_UPDATE_OPERATOR_PREFIXES`; see the note above.
const RUN_FLAG_OPERATOR_PREFIXES = Object.freeze(['-=', '==']);

// Each base path plus one per update-operator prefix on its LAST segment, the only segment an
// operator may sit on. Exported for the drift guard, not as a runtime surface.
export const RUN_FLAG_DIFF_PATHS = Object.freeze(
  RUN_FLAG_BASE_PATHS.flatMap((path) => {
    const lastDot = path.lastIndexOf('.');
    const parent = path.slice(0, lastDot + 1);
    const key = path.slice(lastDot + 1);
    return [path, ...RUN_FLAG_OPERATOR_PREFIXES.map((operator) => `${parent}${operator}${key}`)];
  })
);

// Run-flag writes by ANY client, including the primary-GM world-time resume (issues 733, 739).
// `updateActor` fires on every HP tick, so BOTH filters — the relevant actor and the run-container
// flag path — are load-bearing.
export function subscribeActorRunFlagChange(handler, { isRelevantActor } = {}) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const relevant = typeof isRelevantActor === 'function' ? isRelevantActor : () => true;
  const hasProperty = globalThis.foundry?.utils?.hasProperty;
  // With no `foundry.utils.hasProperty` this refreshes NOTHING rather than probing the diff itself,
  // which is what the shared matcher's fallback would do; the subscriptions test pins that choice.
  const touchesRunFlag = (changes) =>
    typeof hasProperty === 'function' &&
    RUN_FLAG_DIFF_PATHS.some((path) => hasProperty(changes, path));
  const onUpdate = (actor, changes) => {
    const actorId = actor?.id ?? null;
    if (actorId && relevant(actorId) && touchesRunFlag(changes)) handler();
  };
  const id = hooks.on('updateActor', onUpdate);
  return () => {
    hooks.off?.('updateActor', id);
  };
}

/**
 * Subscribe to the current viewer's Journal dismissal refresh signal.
 * Local dismissals name an actor UUID; replicated create/updateSetting signals
 * carry no payload, so those must refresh without an actor or user-id filter.
 * The Journal listing reads the current user's dismissal setting itself.
 *
 * @param {Function} handler Read-only refresh callback, invoked without arguments.
 * @param {object} [options]
 * @param {(actorUuid: string) => boolean} [options.isRelevantActor] Local actor
 *   predicate read at fire time; omitted means all actors.
 * @returns {Function} Cleanup callback; safe when Foundry Hooks is absent.
 */
export function subscribeJournalDismissalsChange(handler, { isRelevantActor } = {}) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const hook = 'fabricate.journalDismissalsChanged';
  const id = hooks.on(hook, (payload) => {
    if (payload?.actorUuid && isRelevantActor && !isRelevantActor(payload.actorUuid)) return;
    handler();
  });
  return () => hooks.off?.(hook, id);
}

/**
 * Subscribe to the Journal run authority's refusal LIFTING.
 *
 * Availability is read when the Journal listing is built, so a refusal captured by one build
 * outlives the claim it names until something rebuilds. The authority announces the lift; a
 * surface that captured the refusal re-derives on it. There is no poll and no per-read probe.
 *
 * @param {Function} handler Read-only refresh callback, invoked without arguments.
 * @returns {Function} Cleanup callback; safe when Foundry Hooks is absent.
 */
export function subscribeJournalAuthorityRestored(handler) {
  const hooks = globalThis.Hooks;
  if (!hooks?.on || typeof handler !== 'function') return () => {};
  const hook = 'fabricate.journalRunAuthorityRestored';
  const id = hooks.on(hook, () => handler());
  return () => hooks.off?.(hook, id);
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

// `.implementation` is the system-registered subclass. From 13.340 core's base `enrichHTML`
// self-dispatches to it, so the `?? base` fallback is equivalent THERE and degraded below it —
// harmlessly, because that subclass carries only secrets and visibility behaviour while system and
// module enrichers live on `CONFIG.TextEditor.enrichers`, which the base runs too. Read that
// conditionally, not as unconditional equivalence.
// Always through `globalThis.foundry?.…`: a bare `foundry.` throws a ReferenceError in Node.
function textEditorImplementation() {
  return (
    globalThis.foundry?.applications?.ux?.TextEditor?.implementation ??
    globalThis.foundry?.applications?.ux?.TextEditor ??
    null
  );
}

// Resolve a raw description through Foundry's own enricher and return the enriched HTML: a
// label-less `@UUID[…]` comes back as an anchor carrying the referenced document's real NAME, which
// is the whole point of resolving at write time. Named `enrichToHtml` rather than `enrichText`
// because the caller normalizes with `plainTextDescription`, whose broken-anchor and privacy passes
// need the MARKUP rather than `textContent`.
// Every option below is load-bearing. `secrets: false` is EXPLICIT because PF2e does
// `options.secrets ??= game.user.isGM` and we enrich AS GM but store the result for PLAYERS.
// `rolls: false` because a command-less `[[1d6]]` is evaluated EAGERLY and would freeze as a
// literal in the stored description forever. `embeds: false` because `@Embed[uuid]` inlines a whole
// journal page into a one-line description.
// `processVisibility` is DELIBERATELY ABSENT and re-adding it is pinned as a failing test: `false`
// is wrong in DIRECTION, because PF2e strips `[data-visibility="gm"]` only when the user is NOT a
// GM — so it never closes the leak it appears to, and it re-opens the unconditional
// `[data-visibility="none"]` removal the default performs for free. The flag filters for the user
// DOING the enriching while the result is stored for a broader audience; the leak is closed by an
// audience-independent attribute scrub in `plainTextDescription` instead.
// Falls back to the raw text and never throws, so a headless path loses no text.
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

// Deliberately GENEROUS: every candidate goes to the authoritative `foundry.utils.parseUuid`, so
// over-matching costs one cheap parse while under-matching would silently revert priming to one
// round-trip per description with every call-count test still passing. Bounded quantifiers only
// (Sonar S5852), so an unterminated run of `@Word[` stays linear.
const COMPENDIUM_UUID_CANDIDATE =
  /@[A-Za-z]{1,32}\[([^\]]{0,2048})\]|(?<![\w.])(Compendium\.[\w.-]{1,512})/g;

// Foundry documents no cap on `_id__in`, so this is chunked defensively.
const PRIME_CHUNK_SIZE = 250;

// Ids already resident in a pack's document cache are skipped: priming them again is a wasted trip.
function groupUncachedCompendiumIds(rawTexts) {
  const parseUuid = globalThis.foundry?.utils?.parseUuid;
  const byPack = new Map();
  if (typeof parseUuid !== 'function') return byPack;

  for (const raw of rawTexts ?? []) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    for (const match of raw.matchAll(COMPENDIUM_UUID_CANDIDATE)) {
      const candidate = String(match[1] ?? match[2] ?? '')
        .split('#')[0]
        .trim();
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

// Core's enricher primes compendiums per `enrichHTML` call, so 400 descriptions cost up to 400
// round-trips. One sweep collapses that to one query per PACK, and the fetched documents are
// retained for the session, which is what makes the later per-description calls cache hits.
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
  const impl = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
  if (impl?.getDragEventData) {
    return impl.getDragEventData(event);
  }

  // `text/plain` on the dataTransfer is the universal Foundry format.
  try {
    const raw = event?.dataTransfer?.getData?.('text/plain');
    if (raw) return JSON.parse(raw);
  } catch (_) {
    // Not valid JSON: fall through to the null answer below.
  }

  return null;
}

async function itemSourceDescription(item) {
  // Most consumers need only the lightweight wrappers, so the description pipeline loads lazily.
  const { descriptionTextCandidate, plainTextDescription } =
    await import('../../../utils/plainTextDescription.js');
  const candidates = [
    item?.system?.description?.value,
    item?.system?.description,
    item?.description?.value,
    item?.description,
  ];
  for (const candidate of candidates) {
    const raw = descriptionTextCandidate(candidate);
    if (!raw) continue;
    const enriched = await enrichToHtml(raw, { relativeTo: item });
    const description = plainTextDescription(enriched);
    if (description) return description;
  }
  return '';
}

// Non-Item documents, missing documents and resolver failures are all rejected BEFORE a caller
// mutates draft state.
export async function resolveItemSourceSnapshot(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== 'function') return null;
  try {
    const item = await globalThis.fromUuid(uuid);
    if (item?.documentName !== 'Item') return null;
    return {
      uuid: item.uuid || uuid,
      name: item.name || '',
      img: item.img || '',
      type: item.type || '',
      description: await itemSourceDescription(item),
    };
  } catch {
    return null;
  }
}
