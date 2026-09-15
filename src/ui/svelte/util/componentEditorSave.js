// Saving ONE component-editor draft, extracted so the decision can be driven by a test (issue
// 1371). The override rule lives in `systems/componentEssenceOverride.js` and NEITHER writer
// restates it: from the manager window the admin store's `updateComponent` applies it, and with no
// store to borrow `overrideAwareComponentWrite` applies the same unit over `updateItem`. The save
// hands over the `baseline` map the editor was seeded from, because the rule cannot know which.

import { componentEssenceOverrideOn } from '../../../systems/componentEssenceOverride.js';
import { createWorldScopeActions } from '../stores/worldScopeActions.js';

import { buildComponentEditorUpdates } from './componentEditor.js';

// A `false` answer is a REFUSAL: the pair's switch would not move, so nothing was written and the
// caller must report the save as failed. A rejection from `updateItem` propagates, but not before
// the switch this call flipped is put BACK — the flip lands ahead of the values, so a throwing
// value write would otherwise leave the pair overriding with its dormant map.
export function overrideAwareComponentWrite({ getCraftingSystemManager, getComponentScopeStore }) {
  const worldScope = createWorldScopeActions({
    getStores: { component: () => getComponentScopeStore?.() ?? null },
  });
  const override = componentEssenceOverrideOn({
    getComponentScopeStore,
    getCraftingSystemManager,
    setEssenceInheritance: (componentId, systemId, inherit) =>
      worldScope.component.setSectionInherited(componentId, systemId, 'essences', inherit),
    // The other half of a rollback: the flip SEEDS the record's own `essences` block, so the
    // compensation has to remove the one it seeded.
    clearEssenceOverride: (componentId, systemId) =>
      worldScope.component.updateMembershipSection(componentId, systemId, 'essences', undefined),
  });
  return async (systemId, componentId, updates, { baseline } = {}) => {
    const { staged, flipped } = await override.updatesFor(systemId, componentId, updates, {
      baseline,
    });
    if (staged === null) return false;
    if (Object.keys(staged).length === 0) return true;
    try {
      await getCraftingSystemManager?.()?.updateItem?.(systemId, componentId, staged);
    } catch (error) {
      await override.rollback(systemId, flipped);
      throw error;
    }
    return true;
  };
}

// An EMPTY update set writes nothing and answers `true`: a draft that authored nothing is not a
// failure. `carriedEssences` and `baselineEssences` are facts about the SEED that no rendered row
// carries, so THE DRAFT'S OWN COPIES WIN — the `context` values are re-derived at save time and
// differ the moment a replicated world-scope edit lands with the window open. `??`, not `||`, so an
// authored `{}` ("this component carries no essences") is preferred over falling through as absent.
export async function saveComponentEditorDraft(
  draft,
  { systemId, componentId, writeComponent, carriedEssences, baseline }
) {
  const updates = buildComponentEditorUpdates({
    ...draft,
    carriedEssences: draft?.carriedEssences ?? carriedEssences,
  });
  if (Object.keys(updates).length === 0) return true;
  const seeded = draft?.baselineEssences ?? baseline;
  return (await writeComponent(systemId, componentId, updates, { baseline: seeded })) !== false;
}
