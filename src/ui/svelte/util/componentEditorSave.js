/**
 * Saving ONE component-editor draft, extracted from `SvelteComponentEditorApp` so the decision it
 * makes can be driven by a test (issue 1371 r19-store2).
 *
 * ## WHY THIS IS A MODULE AND NOT A METHOD
 *
 * `SvelteComponentEditorApp.svelte.js` builds a Foundry `ApplicationV2` subclass at import time and
 * statically imports a `.svelte` component, so it is not importable in a plain unit test — a fact
 * `tests/import-folder-drop-wiring.test.js` already records for its sibling app. Every behaviour
 * that file used to own was therefore reachable only through a hand-written MIRROR of it, which
 * keeps passing however the real branch is written. The save is now the one decision worth
 * pinning, because it is where a system-scope essence write either overrides or is silently
 * shadowed, so it lives here and the app method is a thin delegator over it.
 *
 * ## THE TWO WRITERS, AND WHY THEY CANNOT DISAGREE
 *
 * When the editor was opened from the manager window, the parent holds the admin store and its
 * `updateComponent` verb already applies the override rule; that verb is what the app hands in.
 * When it was opened from an item sheet there is no store, so
 * {@link overrideAwareComponentWrite} applies the SAME rule — the shared
 * `systems/componentEssenceOverride.js` unit — over `CraftingSystemManager.updateItem` directly.
 * Neither path restates the rule.
 */

import { componentEssenceOverrideOn } from '../../../systems/componentEssenceOverride.js';
import { createWorldScopeActions } from '../stores/worldScopeActions.js';

import { buildComponentEditorUpdates } from './componentEditor.js';

/**
 * A component write that treats a staged essence map as an OVERRIDE, for a caller with no admin
 * store to route through.
 *
 * The flag write is minted from the SAME world-scope family the store composes
 * (`createWorldScopeActions`'s `component.setSectionInherited`), so the two entry points write the
 * membership record through one code path rather than two. The family is minted ONCE per writer
 * rather than per call: creation only captures the store accessor, so it stays boring.
 *
 * A `false` answer is a REFUSAL — the pair's switch would not move, so the values were not written
 * and the caller must report the save as failed. A rejection from `updateItem` is left to
 * propagate, because the app already has one place that reports it.
 *
 * @param {{getCraftingSystemManager: () => object|null,
 *   getComponentScopeStore: () => object|null}} accessors
 * @returns {(systemId: string, componentId: string, updates: object) => Promise<boolean>}
 */
export function overrideAwareComponentWrite({ getCraftingSystemManager, getComponentScopeStore }) {
  const worldScope = createWorldScopeActions({
    getStores: { component: () => getComponentScopeStore?.() ?? null },
  });
  const override = componentEssenceOverrideOn({
    getComponentScopeStore,
    getCraftingSystemManager,
    setEssencesOverridden: (componentId, systemId) =>
      worldScope.component.setSectionInherited(componentId, systemId, 'essences', false),
  });
  return async (systemId, componentId, updates) => {
    const staged = await override.updatesFor(systemId, componentId, updates);
    if (staged === null) return false;
    if (Object.keys(staged).length === 0) return true;
    await getCraftingSystemManager?.()?.updateItem?.(systemId, componentId, staged);
    return true;
  };
}

/**
 * Turn one editor draft into a write, and answer whether it landed.
 *
 * An EMPTY update set writes nothing and answers `true`: a draft that authored nothing is not a
 * failure, and this is the behaviour the app shipped (`if (Object.keys(updates).length > 0)`).
 *
 * @param {object} draft the editor's draft, in `buildComponentEditorUpdates`' contract.
 * @param {{systemId: string, componentId: string,
 *   writeComponent: (systemId: string, componentId: string, updates: object) => Promise<unknown>}}
 *   context
 * @returns {Promise<boolean>} whether the save may be treated as done.
 */
export async function saveComponentEditorDraft(draft, { systemId, componentId, writeComponent }) {
  const updates = buildComponentEditorUpdates(draft);
  if (Object.keys(updates).length === 0) return true;
  return (await writeComponent(systemId, componentId, updates)) !== false;
}
