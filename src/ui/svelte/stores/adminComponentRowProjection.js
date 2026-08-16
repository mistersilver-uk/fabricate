/**
 * adminComponentRowProjection — the GM component-browser card projection, as a pure
 * module (issue 1090).
 *
 * `buildItemCards` projects one card per managed component. Two tiers (issue 1081):
 *
 *  - **The card itself is CHEAP and synchronous.** Everything the component browser model
 *    filters, sorts, counts and paginates on — `category`, `essences`, the whole
 *    `salvageSummary`, the tags, the stored description — is a plain read of the stored
 *    component.
 *  - **`card.hydrate()` is the expensive tier and is per-card.** It resolves the linked
 *    source document (`fromUuid`), falls back to that document's ENRICHED description when
 *    the stored one is empty, and answers the "Missing" badge. Nothing calls it for a
 *    component that is not on screen, so a 5,000-component library performs page-sized
 *    async fan-out rather than 5,000 document resolutions per refresh.
 *
 * `itemCardSignature` — the issue 148 memo key — is computed INSIDE `hydrate()`, and that
 * placement is the point. It used to run before the cache lookup, so every component paid a
 * deep `_stableStringify` of its whole record on every refresh purely to discover that
 * nothing had changed: the memo removed the `fromUuid`/`enrichHTML` cost and kept an
 * `O(corpus x record)` one. Moving the call inside the page scope displaces that cost
 * instead of inheriting it. The signature itself is UNCHANGED — a hand-narrowed key would
 * serve a stale card, which is the defect the whole-record serialization exists to prevent.
 *
 * `hydrate()` fills the card IN PLACE and then tells its caller through `onHydrated`. The
 * in-place fill is a PRIVATE staging step and nothing more: only the browser knows which
 * cards are on screen, so the resolution has to land somewhere the asker can reach without
 * routing a new object back through it. It is NOT how the answer reaches the screen.
 * `republishHydratedItemCards` is — it swaps each filled card for a fresh object of the same
 * shape, because a filled-in-place card is invisible to every `===` comparison Svelte makes
 * on the way to a row, an inspector or an editor. Publishing the same object back is not
 * "keeping the three surfaces from diverging"; it is keeping all three wrong together.
 *
 * The memo cache is INJECTED (`options.cache`) rather than owned here, so the store keeps
 * its per-store instance and its existing system-id invalidation chokepoint, and a direct
 * caller can pass `undefined` for an uncached run.
 *
 * Deliberately a LEAF under `stores/`: no `.svelte` imports from `src/ui/svelte/stores/`,
 * so this module cannot reach a mounted-component test's dependency closure.
 */
import {
  plainTextDescription as _plainTextDescription,
  descriptionTextCandidate as _descriptionTextCandidate,
} from '../../../utils/plainTextDescription.js';

function _buildSalvageSummary(item, salvageEnabled) {
  if (!salvageEnabled || item?.salvage?.enabled !== true) return null;

  const salvage = item.salvage || {};
  const outcomeRouting =
    salvage.outcomeRouting && typeof salvage.outcomeRouting === 'object'
      ? Object.keys(salvage.outcomeRouting).length
      : 0;

  return {
    quantityRequired: Number(salvage.ingredientQuantity) || 1,
    toolCount: Array.isArray(salvage.toolIds) ? salvage.toolIds.length : 0,
    resultGroupCount: Array.isArray(salvage.resultGroups) ? salvage.resultGroups.length : 0,
    hasTimeRequirement: !!salvage.timeRequirement,
    hasCurrencyRequirement: !!salvage.currencyRequirement,
    outcomeCount: outcomeRouting,
  };
}

/**
 * Build the item cards list for the items tab.
 * Mirrors _prepareContext item logic from RecipeManagerApp.
 */
function _sourceUuidForItemCard(item) {
  return item?.originItemUuid || item?.registeredItemUuid || '';
}

function _sourceOriginForUuid(uuid, sourceMissing = false) {
  if (sourceMissing) {
    return {
      sourceOrigin: 'missing',
      sourceOriginLabel: 'Missing',
    };
  }
  if (!uuid) {
    return {
      sourceOrigin: 'unknown',
      sourceOriginLabel: 'Unknown',
    };
  }
  if (uuid.startsWith('Compendium.')) {
    return {
      sourceOrigin: 'compendium',
      sourceOriginLabel: 'Compendium',
    };
  }
  if (uuid.startsWith('Item.')) {
    return {
      sourceOrigin: 'world',
      sourceOriginLabel: 'Items Directory',
    };
  }
  return {
    sourceOrigin: 'unknown',
    sourceOriginLabel: 'Unknown',
  };
}

/**
 * Resolve a component's linked source document ONCE, returning both the document and
 * the `missing` verdict derived from the same lookup.
 *
 * The `missing` contract is preserved EXACTLY as `_sourceMissingForUuid` defined it,
 * and the two clauses are load-bearing in opposite directions:
 *  - no uuid, or no `fromUuid` (every non-Foundry test env): `missing: false`. Deriving
 *    it as `Boolean(uuid) && !doc` instead would report EVERY component's source as
 *    unresolved the moment `fromUuid` is absent.
 *  - a throw: `missing: true`.
 *
 * Returning the doc as well is what lets the component card follow the LINKED ITEM for
 * description (issue 676) without resolving the same uuid twice per component — which,
 * for a compendium-linked library, is real async I/O per row.
 *
 * @param {string} uuid
 * @returns {Promise<{doc: object|null, missing: boolean}>}
 */
async function _resolveSourceDocumentState(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== 'function') return { doc: null, missing: false };
  try {
    const doc = await globalThis.fromUuid(uuid);
    return { doc: doc || null, missing: !doc };
  } catch (_) {
    return { doc: null, missing: true };
  }
}

/**
 * The linked document's description, in a SYSTEM-AGNOSTIC way.
 *
 * dnd5e keeps it at `system.description.value` as HTML; others use a bare
 * `description`. Both are handed to `_plainTextDescription`, which recurses objects
 * (`_descriptionTextCandidate`) and strips markup — so the `{value, chat}` shape and a
 * plain string both resolve. `doc.system` is NEVER passed whole: the recursion would
 * happily flatten every unrelated field on the sheet into the "description".
 *
 * @param {object|null} doc
 * @returns {string}
 */
async function _documentDescriptionCandidate(doc, enrichToHtml) {
  if (!doc) return '';
  const raw = _descriptionTextCandidate(doc.system?.description ?? doc.description ?? '');
  if (!raw) return '';
  // The live fallback RESOLVES too (issue 800). It has to: the population this
  // fallback exists for — a compendium-linked component whose stored description is
  // empty (issue 676) — is precisely the population whose live description carries
  // the raw directives the reporter saw. A non-enriching fallback would leave the
  // reported bug visible for exactly those components until a GM ran Repair.
  // `relativeTo` is passed here as well as at ingestion, or the same description can
  // resolve at registration and go broken on this path.
  const enriched =
    typeof enrichToHtml === 'function' ? await enrichToHtml(raw, { relativeTo: doc }) : raw;
  return _plainTextDescription(enriched);
}

// Deterministic structural serialization with recursively sorted object keys.
// JSON.stringify alone follows insertion order, so two structurally-identical
// items built by different code paths could serialize differently; sorting keys
// makes the signature depend on structure/values only.
function _stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(_stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  const entries = keys.map((k) => `${JSON.stringify(k)}:${_stableStringify(value[k])}`);
  return `{${entries.join(',')}}`;
}

// Per-item memo signature. The card is `{ ...item, ...overrides }`, so it ships
// EVERY stored `item` field — the signature therefore serializes the WHOLE item
// (not a hand-enumerated subset, which would miss e.g. `category`/`difficulty`
// and serve a stale card). It is combined with the EXTERNAL inputs the card also
// reads: the `showTags`/`showEssences`/`showSalvage` flags (a `features.salvage`
// toggle is a system-level change that is neither an item field nor a system-id
// change, so it MUST live in the signature to invalidate) and the resolved
// essence name/icon per essence id (an essence-catalog edit is system-level).
export function itemCardSignature(item, showTags, showEssences, showSalvage, essenceDefinitionById) {
  const essenceResolution = Object.keys(item?.essences || {})
    .sort((a, b) => a.localeCompare(b))
    .map((id) => [
      id,
      essenceDefinitionById.get(id)?.name || id,
      essenceDefinitionById.get(id)?.icon,
    ]);
  return _stableStringify({
    item,
    showTags,
    showEssences,
    showSalvage,
    essenceResolution,
  });
}

/**
 * Resolve the linked-source half of ONE card: the description fallback, the "Missing"
 * verdict, and the source-origin badge.
 *
 * Precedence: STORED FIRST, enriched live document as the fallback (issue 800,
 * flipping the live-first order issue 676 introduced).
 *
 * Issue 676 preferred the live document because the stored description was
 * routinely empty for a compendium-linked component, so the identity strip's
 * promise that "name, image & description follow the linked item" rendered a bare
 * "—". Since descriptions are now RESOLVED and stored at ingestion and by the GM
 * repair, the stored value is the authoritative one and reading the live document
 * on every render is pure cost.
 *
 * The trade is honest and is read FRESHNESS: a pack-content change (a game system
 * or module shipping new prose) now reaches the component when a GM runs Repair
 * Item Data, where previously it landed on the next render. Item-sync covers
 * in-world edits only.
 *
 * Statement form, deliberately: `(await enrichedLive) || stored` would re-introduce
 * the per-component `enrichHTML` call this flip exists to avoid.
 *
 * @param {string} uuid the component's linked source uuid.
 * @param {string} storedDescription the already plain-texted stored description.
 * @param {Function|undefined} enrichToHtml
 * @returns {Promise<object>} the resolved card fields.
 */
async function _resolveItemCardSource(uuid, storedDescription, enrichToHtml) {
  const { doc: sourceDoc, missing: sourceMissing } = await _resolveSourceDocumentState(uuid);
  let description = storedDescription;
  if (!description) {
    description = await _documentDescriptionCandidate(sourceDoc, enrichToHtml);
  }
  return {
    description,
    hasDescription: description.length > 0,
    sourceMissing,
    ..._sourceOriginForUuid(uuid, sourceMissing),
  };
}

/**
 * Project ONE component into a browser card, with its expensive half behind `hydrate()`.
 *
 * `hydrate` is defined NON-ENUMERABLE, so the card's key set — which
 * `tests/stores/admin-projection-modules.test.js` pins — is exactly what it was, and object
 * spread, `JSON.stringify` and the bulk-edit models cannot pick it up as a field.
 *
 * The in-flight promise is memoized in this closure, so the browser calling `hydrate()` from
 * a render effect on every re-render performs the work once and every caller awaits the same
 * resolution.
 *
 * @param {object} item the stored component.
 * @param {string} systemId
 * @param {object} options
 * @returns {object} the projected card.
 */
function _createItemCard(item, systemId, options) {
  const { showTags, showEssences, showSalvage, essenceDefinitionById, enrichToHtml, cache } =
    options;
  const registeredItemUuidDisplay = _sourceUuidForItemCard(item);
  const storedDescription = _plainTextDescription(item.description);

  const card = {
    ...item,
    img: item.img || 'icons/svg/item-bag.svg',
    // The UNHYDRATED reading: the stored description, and a source origin derived from the
    // uuid's shape alone. Both are the answer for the overwhelming majority of components —
    // descriptions are resolved and stored at ingestion, and a link is only "Missing" when
    // the document has been deleted out from under it — so an un-hydrated card renders
    // correctly rather than blankly, and `hydrate()` corrects the two cases it cannot know.
    description: storedDescription,
    hasDescription: storedDescription.length > 0,
    tags: showTags ? item.tags || [] : [],
    essences: showEssences
      ? Object.entries(item.essences || {}).map(([id, quantity]) => ({
          id,
          name: essenceDefinitionById.get(id)?.name || id,
          icon: essenceDefinitionById.get(id)?.icon || 'fas fa-mortar-pestle',
          quantity,
        }))
      : [],
    registeredItemUuidDisplay,
    hasRegisteredItemUuid: Boolean(registeredItemUuidDisplay),
    sourceMissing: false,
    ..._sourceOriginForUuid(registeredItemUuidDisplay, false),
    salvageSummary: _buildSalvageSummary(item, showSalvage),
    showTags,
    showEssences,
  };

  let pending = null;
  const resolve = async () => {
    const cacheKey = `${systemId}:${item.id}`;
    // INSIDE the page scope — see this module's header. The deep serialization is paid by
    // the cards a GM is looking at, not by every component in the library on every refresh.
    const signature = itemCardSignature(
      item,
      showTags,
      showEssences,
      showSalvage,
      essenceDefinitionById
    );
    const cached = cache?.get(cacheKey);
    // Hit: reuse the prior resolution, skipping `fromUuid` + `enrichHTML`.
    let resolved = cached && cached.signature === signature ? cached.resolved : null;
    if (!resolved) {
      resolved = await _resolveItemCardSource(
        registeredItemUuidDisplay,
        storedDescription,
        enrichToHtml
      );
      cache?.set(cacheKey, { signature, resolved });
    }
    Object.assign(card, resolved);
    options.onHydrated?.(card);
    return card;
  };

  // A REJECTION is not memoized (issue 1081). `_resolveSourceDocumentState` catches its own
  // throws, but the live-description fallback's `enrichToHtml` does not, and the browser
  // calls `hydrate()` from a render effect — so caching a rejected promise would re-throw it
  // on every subsequent render and leave that one card unable to hydrate for the life of the
  // projection. Clearing the slot restores the pre-1081 property that a failed resolution is
  // transient: the next render tries again. The rejection is still re-thrown, because
  // `hydrateItemCards` is awaited by callers that need to see a failure.
  //
  // It is also LOGGED here, once per rejection, and that placement is the point. All three
  // view-side callers swallow the rejection deliberately (a card that cannot resolve keeps
  // its un-hydrated reading, which renders correctly rather than blankly), so before this
  // line a persistently failing enricher was completely silent: the GM read a stale
  // description and the console said nothing. Pre-1081 the same throw aborted the refresh
  // loudly and tripped the smoke's console-error gate. `console.warn` rather than `error`
  // because the surface degrades rather than breaks, and because the retry above means one
  // failing card can re-report on a later render.
  Object.defineProperty(card, 'hydrate', {
    enumerable: false,
    configurable: true,
    writable: true,
    value: () =>
      (pending ??= resolve().catch((error) => {
        pending = null;
        console.warn(
          `Fabricate | could not resolve the source document for component "${item.id}"; ` +
            'the card keeps its stored description and its unverified link state',
          error
        );
        throw error;
      })),
  });
  return card;
}

// The per-store item-card memo (a Map keyed `${systemId}:${itemId}` →
// `{signature, resolved}`) lets an unchanged component skip its per-item `fromUuid`
// (`_resolveSourceDocumentState`) and conditional `enrichHTML` when it comes back on
// screen, so paging back and forth does not re-resolve what has already been resolved.
//
// FRESHNESS TRADE (disclosed, NOT "unchanged"): on a cache hit the memo reuses the
// last-resolved source-document state, so `sourceMissing`/`sourceOrigin` (the "Missing"
// badge) reflects an EXTERNAL source-document delete/restore only on system re-select
// (the whole cache clears on a system-id change) or on Repair Item Data / item-sync of
// that component (its stored fields change → signature miss) — NOT on an unrelated
// same-system refresh. This matches the existing best-effort, opportunistic behavior:
// there is no world-item-delete refresh hook (foundryBridge ignores non-actor items), so
// today such a change is already reflected only on the next unrelated refresh. No
// USER-edited field goes stale — a user edit mutates the stored item → signature miss.
export async function buildItemCards(
  systemManager,
  selectedSystem,
  itemSearchTerm,
  { showTags, showEssences, essenceDefinitionById, enrichToHtml, cache, onHydrated } = {}
) {
  if (!selectedSystem) return [];
  const showSalvage = selectedSystem.features?.salvage === true;
  const items = systemManager.getItems(selectedSystem.id, itemSearchTerm);
  const options = {
    showTags,
    showEssences,
    showSalvage,
    essenceDefinitionById,
    enrichToHtml,
    cache,
    onHydrated,
  };
  return items.map((item) => _createItemCard(item, selectedSystem.id, options));
}

/**
 * Hydrate a bounded set of cards — the current page, or the selected component.
 *
 * The whole point is that the caller decides WHICH, so this takes cards rather than a
 * cohort and a filter. A card that has already hydrated resolves immediately from its own
 * memo, so calling this from a render effect on every re-render is free.
 *
 * @param {object[]} cards
 * @returns {Promise<object[]>} the same card objects, filled in place.
 */
export function hydrateItemCards(cards) {
  return Promise.all(
    (Array.isArray(cards) ? cards : []).map((card) =>
      typeof card?.hydrate === 'function' ? card.hydrate() : card
    )
  );
}

/**
 * Build the array to publish after one or more cards have filled themselves in place, with
 * every card that just hydrated REPLACED by a fresh object carrying the same own properties
 * (issue 1081).
 *
 * A new array alone is not enough, and that was the defect. The store publishes through a
 * `writable`, which does not proxy, so Svelte compares by `===` at every hop between the
 * published array and a rendered string: a `$derived` recomputing to the same object does
 * not invalidate its dependents, and a keyed `{#each}` reconciling an unchanged item does
 * not update the row. `selectedComponent`, `componentForEdit`, the browser model's
 * filter/sort/paginate chain and the row props are all such hops, so re-wrapping the SAME
 * card objects in a new array left every consumer on the pre-hydration reading permanently —
 * "No description has been added." for a compendium-linked component whose prose lives on
 * its source document, and an accent "Linked" pill for a source document that has been
 * deleted.
 *
 * `Object.create(getPrototypeOf, getOwnPropertyDescriptors)` rather than a spread, because
 * the spread would drop the NON-ENUMERABLE `hydrate` seam and any accessor the card carries.
 * The copy shares the `hydrate` closure with the original, so it is already settled: asking
 * the copy to hydrate returns the memoized promise and re-fills the original, which nothing
 * reads any more. That is why only cards REPORTED as hydrated are replaced — swapping an
 * un-hydrated card for a copy would strand its eventual fill on an object no longer
 * published.
 *
 * Replacement is safe for the rendered surfaces: `{#each}` keys on `item.id`, which does not
 * move, so nothing remounts and scroll, focus, the bulk selection and an open editor all
 * survive. The cost is one extra filter/sort/paginate pass per coalesced republish.
 *
 * @param {object[]} cards the currently published card array.
 * @param {Set<object>} hydratedCards the card objects that reported `onHydrated`, by
 *   IDENTITY rather than by id — a later refresh can publish a different card under the
 *   same id, and that one has its own fill still to come.
 * @returns {object[]} a new array, with the hydrated entries swapped for fresh objects.
 */
export function republishHydratedItemCards(cards, hydratedCards) {
  const published = Array.isArray(cards) ? cards : [];
  const hydrated = hydratedCards instanceof Set ? hydratedCards : new Set();
  return published.map((card) =>
    hydrated.has(card)
      ? Object.create(Object.getPrototypeOf(card), Object.getOwnPropertyDescriptors(card))
      : card
  );
}
