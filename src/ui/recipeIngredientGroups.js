function normalizeDraftTags(tagsText) {
  return String(tagsText || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

export function draftIngredientOptionHasRequirement(option, { showItemTags = false } = {}) {
  if (!option || typeof option !== 'object') return false;

  if (showItemTags && option.matchType === 'tags') {
    return normalizeDraftTags(option.tagsText).length > 0;
  }

  return !!(option.componentId || option.systemItemId);
}

export function draftIngredientGroupHasRequirement(group, { showItemTags = false } = {}) {
  return (group?.options || []).some(option =>
    draftIngredientOptionHasRequirement(option, { showItemTags })
  );
}

export function draftIngredientSetHasRequirement(set, { showItemTags = false } = {}) {
  const hasEssences = Object.keys(set?.essences || {}).length > 0;
  const hasGroups = (set?.ingredientGroups || []).some(group =>
    draftIngredientGroupHasRequirement(group, { showItemTags })
  );
  return hasEssences || hasGroups;
}

export function serializeDraftIngredientOption(option, { showItemTags = false } = {}) {
  if (!option || typeof option !== 'object') return null;

  const quantity = Number(option.quantity || 1);

  if (showItemTags && option.matchType === 'tags') {
    const tags = normalizeDraftTags(option.tagsText);
    if (tags.length === 0) return null;

    return {
      quantity,
      extractEffects: false,
      effectFilter: null,
      match: {
        type: 'tags',
        tags,
        tagMatch: option.tagMatch === 'all' ? 'all' : 'any'
      },
      tag: tags[0] || null,
      tier: null
    };
  }

  const componentId = option.componentId || option.systemItemId || null;
  if (!componentId) return null;

  return {
    componentId,
    systemItemId: componentId,
    quantity,
    extractEffects: false,
    effectFilter: null,
    match: {
      type: 'component',
      componentId,
      systemItemId: componentId
    },
    tag: null,
    tier: null
  };
}

export function serializeDraftIngredientGroups(groups = [], { showItemTags = false, randomID = null } = {}) {
  const nextId = typeof randomID === 'function'
    ? randomID
    : () => Math.random().toString(36).slice(2, 14);

  return (groups || [])
    .map((group, groupIdx) => {
      const options = (group?.options || [])
        .map(option => serializeDraftIngredientOption(option, { showItemTags }))
        .filter(Boolean);

      if (options.length === 0) return null;

      return {
        id: group?.id || nextId(),
        name: group?.name || `Group ${groupIdx + 1}`,
        options
      };
    })
    .filter(Boolean);
}
