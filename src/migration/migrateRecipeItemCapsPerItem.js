/**
 * `1.11.0` — move the recipe-item use and learn caps from one system-wide config onto each recipe
 * item definition's new `caps` block, then strip the relocated fields (issue 511). Every definition
 * inherits the same starting caps, preserving prior behaviour. Pure and idempotent.
 * `mode` and `learn.dragDropEnabled` STAY system-wide, gating whether the knowledge machinery runs
 * at all. `destroyWhenSpent` (learn) is distinct from `destroyWhenExhausted` (item).
 */
export function migrateRecipeItemCapsPerItem(data = {}) {
  const systems = _clone(data.systems);

  if (!Array.isArray(systems)) {
    return { systems: data.systems };
  }

  for (const system of systems) {
    if (!_isPlainObject(system)) continue;
    const definitions = system.recipeItemDefinitions;
    const knowledge = system.recipeVisibility?.knowledge;
    const seededCaps = _capsFromKnowledge(knowledge);

    if (Array.isArray(definitions)) {
      for (const def of definitions) {
        if (!_isPlainObject(def) || _isPlainObject(def.caps)) continue;
        def.caps = _clone(seededCaps);
      }
    }

    _stripRelocatedCapFields(knowledge);
  }

  return { systems };
}

/**
 * Build a `caps` block from a system's old knowledge config, deliberately excluding
 * `dragDropEnabled`. A missing config yields uncapped caps — a fresh recipe item's default.
 */
function _capsFromKnowledge(knowledge) {
  const item = _isPlainObject(knowledge?.item) ? knowledge.item : {};
  const learn = _isPlainObject(knowledge?.learn) ? knowledge.learn : {};
  return {
    item: {
      limitUses: item.limitUses === true,
      maxUses: item.maxUses,
      destroyWhenExhausted: item.destroyWhenExhausted === true,
    },
    learn: {
      consumeOnLearn: learn.consumeOnLearn !== false,
      limitRecipes: learn.limitRecipes === true,
      maxRecipes: learn.maxRecipes,
      destroyWhenSpent: learn.destroyWhenSpent === true,
    },
  };
}

/** Remove the now-per-item cap fields, keeping `mode` and `learn.dragDropEnabled`. */
function _stripRelocatedCapFields(knowledge) {
  if (!_isPlainObject(knowledge)) return;
  if ('item' in knowledge) delete knowledge.item;
  const learn = knowledge.learn;
  if (_isPlainObject(learn)) {
    for (const field of ['consumeOnLearn', 'limitRecipes', 'maxRecipes', 'destroyWhenSpent']) {
      if (field in learn) delete learn[field];
    }
  }
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
