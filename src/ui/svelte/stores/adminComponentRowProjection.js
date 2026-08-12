/**
 * adminComponentRowProjection — the GM component-browser card projection, as a pure
 * module (issue 1090).
 *
 * `buildItemCards` projects one card per managed component, resolving each component's
 * linked source document once and falling back to that document's description when the
 * stored one is empty. It carries the issue 148 memo with it, deliberately unchanged:
 * `itemCardSignature` still deep-stringifies the WHOLE component on every refresh, even
 * on a cache hit. That cost is issue 1081's to address against this surface — do not
 * "fix" it here, or the no-behaviour-change bar for the extraction stops meaning
 * anything.
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

// The per-store item-card memo (a Map keyed `${systemId}:${itemId}` → `{signature, card}`)
// lets an unchanged component skip its per-item `fromUuid` (`_resolveSourceDocumentState`)
// and conditional `enrichHTML` on refresh, so a single-component edit no longer pays
// O(all-components) resolution cost.
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
  { showTags, showEssences, essenceDefinitionById, enrichToHtml, cache }
) {
  if (!selectedSystem) return [];
  const showSalvage = selectedSystem.features?.salvage === true;
  const items = systemManager.getItems(selectedSystem.id, itemSearchTerm);
  return Promise.all(
    items.map(async (item) => {
      const cacheKey = `${selectedSystem.id}:${item.id}`;
      const signature = itemCardSignature(
        item,
        showTags,
        showEssences,
        showSalvage,
        essenceDefinitionById
      );
      const cached = cache?.get(cacheKey);
      // Hit: reuse the prior card verbatim, skipping `fromUuid` + `enrichHTML`.
      if (cached && cached.signature === signature) return cached.card;
      const registeredItemUuidDisplay = _sourceUuidForItemCard(item);
      // Precedence: STORED FIRST, enriched live document as the fallback (issue 800,
      // flipping the live-first order issue 676 introduced).
      //
      // Issue 676 preferred the live document because the stored description was
      // routinely empty for a compendium-linked component, so the identity strip's
      // promise that "name, image & description follow the linked item" rendered a bare
      // "—". Since descriptions are now RESOLVED and stored at ingestion and by the GM
      // repair, the stored value is the authoritative one and reading the live document
      // on every render is pure cost.
      //
      // The trade is honest and is read FRESHNESS: a pack-content change (a game system
      // or module shipping new prose) now reaches the component when a GM runs Repair
      // Item Data, where previously it landed on the next render. Item-sync covers
      // in-world edits only.
      //
      // Statement form, deliberately: `(await enrichedLive) || stored` would re-introduce
      // the per-component `enrichHTML` call this flip exists to avoid.
      const { doc: sourceDoc, missing: sourceMissing } =
        await _resolveSourceDocumentState(registeredItemUuidDisplay);
      let description = _plainTextDescription(item.description);
      if (!description) {
        description = await _documentDescriptionCandidate(sourceDoc, enrichToHtml);
      }
      const sourceOrigin = _sourceOriginForUuid(registeredItemUuidDisplay, sourceMissing);
      const card = {
        ...item,
        img: item.img || 'icons/svg/item-bag.svg',
        description,
        hasDescription: description.length > 0,
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
        sourceMissing,
        ...sourceOrigin,
        salvageSummary: _buildSalvageSummary(item, showSalvage),
        showTags,
        showEssences,
      };
      cache?.set(cacheKey, { signature, card });
      return card;
    })
  );
}
