const DEFAULT_ESSENCE_ICON = 'fas fa-mortar-pestle';

export function getDefaultEssenceIcon() {
  return DEFAULT_ESSENCE_ICON;
}

function compareComponentEditorEssenceOptions(left, right) {
  const nameCompare = String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
    sensitivity: 'base'
  });
  if (nameCompare !== 0) return nameCompare;
  return String(left?.id || '').localeCompare(String(right?.id || ''), undefined, {
    sensitivity: 'base'
  });
}

// Component essences persist as an object map ({ essenceId: quantity }), but the
// admin store's item cards project them into an array of { id, quantity } entries
// for the browser display. The editor is fed both shapes (the raw component from
// the standalone editor, the item card from the manager), so coerce either into a
// plain id -> quantity map before looking up per-definition quantities. Missing this
// zeroed every field when an item card was edited and wiped the essences on save.
function toEssenceQuantityMap(currentEssences) {
  if (Array.isArray(currentEssences)) {
    const map = {};
    for (const entry of currentEssences) {
      if (entry && entry.id != null) map[entry.id] = entry.quantity;
    }
    return map;
  }
  return currentEssences && typeof currentEssences === 'object' ? currentEssences : {};
}

// This row shape is a WHITELIST rebuild, exactly like the normalizer it mirrors: a field
// the definition carries but this map does not name is silently absent downstream. That is
// why `enabled` is here (issue 1036) — without it every option row reads as enabled, and
// `selectableEssenceOptions` (src/utils/essenceValidation.js) can withhold NOTHING no
// matter how correct the persisted field, the normalizer and the store projection are.
// The rows stay UNFILTERED: `buildComponentEditorUpdates` rebuilds `updates.essences`
// SOLELY from these rows, so dropping a disabled essence here would destroy its authored
// quantity on the very next component save. Filtering belongs to the offer, never the data.
export function buildEditableEssenceOptions(essenceDefinitions = [], currentEssences = {}) {
  const definitions = Array.isArray(essenceDefinitions) ? essenceDefinitions : [];
  const quantities = toEssenceQuantityMap(currentEssences);

  return definitions
    .map(def => ({
      id: def.id,
      name: def.name || def.id,
      icon: String(def.icon || '').trim() || DEFAULT_ESSENCE_ICON,
      // Default-true, matching the persisted convention: a definition predating the field
      // is enabled, and only an explicit `false` disables.
      enabled: def.enabled !== false,
      // The essence's colour as the bare `--fab-tag-*` key it is stored under (issue 1371
      // r18-colour, M29). The card took a colour prop for years that this whitelist never
      // named, so every tile painted the accent; '' rather than null, because the card
      // interpolates the key into a custom property and an empty key is "no tint".
      colorToken: typeof def.colorToken === 'string' ? def.colorToken : '',
      quantity: clampComponentEssenceQuantity(quantities[def.id])
    }))
    .sort(compareComponentEditorEssenceOptions);
}

/**
 * The essence quantities a component's map carries that this system's roster does NOT define
 * (issue 1371 r20-store3, reviewer round 6 finding 2).
 *
 * A world map is NOT narrowed to the ids a given system holds (`data-models`, `### Component
 * scope`), so a resolved map can carry an essence this system never joined. `buildEditableEssenceOptions`
 * maps over the system's own `essenceDefinitions`, which means such an id has no row, no tile and
 * no way back into `updates.essences` — so the very next component save DROPPED it, silently, from
 * a save the GM made to change a category.
 *
 * These entries are therefore CARRIED FORWARD verbatim rather than rendered: the system has no
 * name, icon or colour for the essence and no control that could edit it, so offering a nameless
 * stepper would be worse than saying nothing. The quantity is passed through UNCLAMPED for the
 * same reason — nothing here authored it, and re-flooring a value this editor cannot show is an
 * edit the GM did not make. Non-positive and non-finite entries are dropped, because that is what
 * `normalizeComponentEssenceMap` does with them at the write boundary anyway.
 *
 * @param {unknown} currentEssences the map (or the item card's array) the editor was seeded from.
 * @param {object[]} essenceOptions the rows the editor CAN offer.
 * @returns {Record<string, number>} the entries no row represents.
 */
export function carriedComponentEssences(currentEssences, essenceOptions = []) {
  const offered = new Set(
    (Array.isArray(essenceOptions) ? essenceOptions : []).map(option => option?.id)
  );
  const carried = {};
  for (const [id, raw] of Object.entries(toEssenceQuantityMap(currentEssences))) {
    if (!id || offered.has(id)) continue;
    const quantity = Number(raw);
    if (Number.isFinite(quantity) && quantity > 0) carried[id] = quantity;
  }
  return carried;
}

export function clampComponentEssenceQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.max(0, Math.floor(quantity));
}

export function getComponentEditorHintKey({ showTags = false, showEssences = false } = {}) {
  if (showTags && showEssences) return 'FABRICATE.Admin.Items.Editor.HintTagsAndEssences';
  if (showTags) return 'FABRICATE.Admin.Items.Editor.HintTagsOnly';
  if (showEssences) return 'FABRICATE.Admin.Items.Editor.HintEssencesOnly';
  return 'FABRICATE.Admin.Items.Editor.NoEditableFields';
}

export function buildComponentEditorState(system, item) {
  const showTags = !!system;
  const showEssences = system?.features?.essences === true;

  const tagSource = Array.isArray(system?.itemTags) ? system.itemTags : (Array.isArray(system?.tags) ? system.tags : []);
  const selectedTags = new Set(item?.tags || []);
  const essenceDefinitions = Array.isArray(system?.essenceDefinitions) ? system.essenceDefinitions : [];
  const currentEssences = item?.essences && typeof item.essences === 'object' ? item.essences : {};

  const essenceOptions = showEssences
    ? buildEditableEssenceOptions(essenceDefinitions, currentEssences)
    : [];
  // The two facts a SAVE needs and the rendered rows cannot carry (issue 1371 r20-store3).
  // `carriedEssences` is what this system's roster does not define and the write must not drop;
  // `baselineEssences` is exactly the map an UNTOUCHED save of these rows produces, which is what
  // the override rule compares against to answer "did the GM author anything" without assuming
  // which of the two maps this editor was seeded from.
  const carriedEssences = showEssences
    ? carriedComponentEssences(currentEssences, essenceOptions)
    : {};

  return {
    itemId: item?.id || '',
    itemName: item?.name || '',
    showTags,
    showEssences,
    hasEditableFields: showTags || showEssences,
    hintKey: getComponentEditorHintKey({ showTags, showEssences }),
    tagOptions: showTags
      ? tagSource.map(tag => ({
        tag,
        checked: selectedTags.has(tag)
      }))
      : [],
    essenceOptions,
    carriedEssences,
    baselineEssences: buildComponentEditorUpdates({
      showEssences,
      essenceOptions,
      carriedEssences
    }).essences
  };
}

export function buildComponentEditorUpdates(draft = {}) {
  const updates = {};

  if (draft.showTags) {
    updates.tags = Array.isArray(draft.tagOptions)
      ? draft.tagOptions.filter(opt => opt?.checked).map(opt => opt.tag)
      : [];
  }

  if (draft.showEssences) {
    // THE CARRIED ENTRIES FIRST, then the rows on top (issue 1371 r20-store3). A rendered row
    // never shares an id with a carried one — `carriedComponentEssences` excludes every offered id
    // — so the order is documentation rather than precedence.
    const essences = { ...draft.carriedEssences };
    for (const option of Array.isArray(draft.essenceOptions) ? draft.essenceOptions : []) {
      const quantity = clampComponentEssenceQuantity(option?.quantity);
      if (quantity > 0 && option?.id) {
        essences[option.id] = quantity;
      }
    }
    updates.essences = essences;
  }

  return updates;
}
