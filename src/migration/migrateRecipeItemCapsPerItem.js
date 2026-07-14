/**
 * 1.11.0 — Move the recipe-item use/learn caps from one system-wide config
 * (`recipeVisibility.knowledge.item` / `.learn`) onto each recipe item definition
 * (issue 511, PR-B redesign). Every recipe item in a system used to share a single
 * cap; the GM now authors caps per book/scroll, so this one-time migration seeds
 * each definition's new `caps` block from the old system-wide values (all
 * definitions of a system inherit the same starting caps, preserving prior
 * behaviour) and then strips the now-relocated fields from the system config.
 *
 * What moves onto `recipeItemDefinition.caps`:
 *  - `item.limitUses` / `item.maxUses` / `item.destroyWhenExhausted` (craft charges)
 *  - `learn.consumeOnLearn` / `learn.limitRecipes` / `learn.maxRecipes` /
 *    `learn.destroyWhenSpent`
 *
 * What STAYS on `recipeVisibility.knowledge` (system-wide visibility strategy):
 *  - `mode` and `learn.dragDropEnabled` — these gate whether the knowledge/learning
 *    machinery runs at all, not one book's economy, so they are deliberately NOT
 *    copied per item.
 *
 * `destroyWhenSpent` (learn) is kept distinct from `destroyWhenExhausted` (item) —
 * do not normalize the two names.
 *
 * Idempotent: a definition that already carries `caps` is left untouched, and the
 * old system-wide cap fields are deleted, so a re-run finds nothing to seed and the
 * missing source fields make stripping a no-op.
 *
 * Pure: returns `{ systems }` and performs no I/O.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @returns {{ systems: Array<object> }}
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
 * Build a `caps` block from a system's old system-wide knowledge config. `learn`
 * deliberately excludes `dragDropEnabled` (stays system-wide). A missing config
 * yields uncapped caps — the same default a fresh recipe item gets.
 * @param {object|undefined} knowledge
 * @returns {{ item: object, learn: object }}
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

/**
 * Remove the now-per-item cap fields from a system's knowledge config, keeping the
 * system-wide `mode` and `learn.dragDropEnabled`.
 * @param {object|undefined} knowledge
 */
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
