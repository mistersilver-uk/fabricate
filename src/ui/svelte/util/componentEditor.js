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

export function buildEditableEssenceOptions(essenceDefinitions = [], currentEssences = {}) {
  const definitions = Array.isArray(essenceDefinitions) ? essenceDefinitions : [];
  const quantities = currentEssences && typeof currentEssences === 'object' ? currentEssences : {};

  return definitions
    .map(def => ({
      id: def.id,
      name: def.name || def.id,
      icon: String(def.icon || '').trim() || DEFAULT_ESSENCE_ICON,
      quantity: clampComponentEssenceQuantity(quantities[def.id])
    }))
    .sort(compareComponentEditorEssenceOptions);
}

export function clampComponentEssenceQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.max(0, Math.floor(quantity));
}

export function adjustComponentEssenceQuantity(current, delta) {
  const base = clampComponentEssenceQuantity(current);
  const amount = Number(delta);
  if (!Number.isFinite(amount)) return base;
  return Math.max(0, base + Math.trunc(amount));
}

export function getComponentEditorHintKey({ showTags = false, showEssences = false } = {}) {
  if (showTags && showEssences) return 'FABRICATE.Admin.Items.Editor.HintTagsAndEssences';
  if (showTags) return 'FABRICATE.Admin.Items.Editor.HintTagsOnly';
  if (showEssences) return 'FABRICATE.Admin.Items.Editor.HintEssencesOnly';
  return 'FABRICATE.Admin.Items.Editor.NoEditableFields';
}

export function buildComponentEditorState(system, item) {
  const advancedEnabled = system?.advancedOptionsEnabled !== false;
  const showTags = !!system;
  const showEssences = advancedEnabled && system?.features?.essences === true;

  const tagSource = Array.isArray(system?.itemTags) ? system.itemTags : (Array.isArray(system?.tags) ? system.tags : []);
  const selectedTags = new Set(item?.tags || []);
  const essenceDefinitions = Array.isArray(system?.essenceDefinitions) ? system.essenceDefinitions : [];
  const currentEssences = item?.essences && typeof item.essences === 'object' ? item.essences : {};

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
    essenceOptions: showEssences
      ? buildEditableEssenceOptions(essenceDefinitions, currentEssences)
      : []
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
    const essences = {};
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
