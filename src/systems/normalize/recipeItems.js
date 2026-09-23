/**
 * The recipe-item definition and cap normalizers (issue 1713): free pure functions the
 * `CraftingSystemManager` delegates to, so a book's source refs and its use/learn caps are derived
 * once. Internal to that aggregate — a private continuation of the `_normalizeSystem` chokepoint,
 * reached only through the manager, so nothing else imports it.
 */
import { plainTextDescription } from '../../utils/plainTextDescription.js';

export function normalizeRecipeItemDefinitions(value) {
  if (!Array.isArray(value)) return [];

  const usedIds = new Set();
  const normalized = [];
  for (const entry of value) {
    const def = normalizeRecipeItemDefinition(entry, usedIds);
    if (!def) continue;
    usedIds.add(def.id);
    normalized.push(def);
  }
  return normalized;
}

// Per-recipe-item use/learn caps (issue 511): each definition owns its own caps rather than
// sharing one system-wide config. The legacy boolean `destroyWhenExhausted` is reconciled with
// the enum `whenSpent`, keeping BOTH persisted — the enum wins when authored.
function reconcileWhenSpent(item = {}) {
  const authored = item.whenSpent === 'destroyed' || item.whenSpent === 'inert';
  if (authored) {
    return { whenSpent: item.whenSpent, destroyWhenExhausted: item.whenSpent === 'destroyed' };
  }
  if (Object.prototype.hasOwnProperty.call(item, 'destroyWhenExhausted')) {
    const destroyWhenExhausted = item.destroyWhenExhausted === true;
    return { whenSpent: destroyWhenExhausted ? 'destroyed' : 'inert', destroyWhenExhausted };
  }
  return { whenSpent: 'destroyed', destroyWhenExhausted: true };
}

export function normalizeRecipeItemCaps(caps = {}) {
  const item = caps?.item || {};
  const learn = caps?.learn || {};

  const { whenSpent, destroyWhenExhausted } = reconcileWhenSpent(item);

  // `limitLearning` (new) mirrors legacy `limitRecipes`; the new field wins when
  // authored, otherwise the legacy boolean seeds it. Both are always persisted.
  const limitLearning = Object.prototype.hasOwnProperty.call(learn, 'limitLearning')
    ? learn.limitLearning === true
    : learn.limitRecipes === true;

  // `learnsAllowed` mirrors legacy `maxRecipes` and wins when authored. With the limit ON but no
  // positive count, it defaults to 1: a limit of "0/undefined" would wrongly read as uncapped
  // downstream and hide the learn-all CTA (issue 544).
  const rawLearns = Object.prototype.hasOwnProperty.call(learn, 'learnsAllowed')
    ? learn.learnsAllowed
    : learn.maxRecipes;
  const learnsAllowed = limitLearning
    ? Number.isFinite(Number(rawLearns)) && Number(rawLearns) > 0
      ? Number(rawLearns)
      : 1
    : undefined;

  // `learnScope` ('perInstance' | 'total') is the canonical cap scope: `perInstance` limits
  // learning from a SINGLE copy, `total` across EVERY copy of the source recipe item. An
  // authored value wins, else it derives from the legacy `learningMode`, which is kept as a
  // synced legacy mirror.
  const learnScope = ['perInstance', 'total'].includes(learn.learnScope)
    ? learn.learnScope
    : learn.learningMode === 'party'
      ? 'total'
      : 'perInstance';
  const learningMode =
    learnScope === 'total' ? 'party' : Number(learnsAllowed) > 1 ? 'ntimes' : 'once';

  // `prerequisiteIds` (issue 544) — the recipe ids a reader must ALREADY have learned (AND
  // semantics) before learning from this book. Replaces the legacy single `prerequisite`
  // string, which is folded in here so an un-migrated draft still reads correctly.
  const rawPrerequisiteIds = Array.isArray(learn.prerequisiteIds)
    ? learn.prerequisiteIds
    : typeof learn.prerequisite === 'string' && learn.prerequisite.trim()
      ? [learn.prerequisite]
      : [];
  const prerequisiteIds = [
    ...new Set(rawPrerequisiteIds.map((value) => String(value ?? '').trim()).filter(Boolean)),
  ];

  // `characterPrerequisiteIds` (issue 544) — the system-owned character prerequisites a reader
  // must ALL pass to learn from this book. Distinct from `prerequisite`: this gates on the
  // actor's roll data, that on prior knowledge.
  const characterPrerequisiteIds = Array.isArray(learn.characterPrerequisiteIds)
    ? [
        ...new Set(
          learn.characterPrerequisiteIds.map((value) => String(value ?? '').trim()).filter(Boolean)
        ),
      ]
    : [];

  return {
    item: {
      limitUses: item.limitUses === true,
      maxUses: Number.isFinite(Number(item.maxUses)) ? Number(item.maxUses) : undefined,
      destroyWhenExhausted,
      whenSpent,
    },
    learn: {
      consumeOnLearn: learn.consumeOnLearn !== false,
      // `destroyWhenSpent` (learn) is deliberately named distinctly from
      // `destroyWhenExhausted` (item/craft-charges) — do not normalize to one name.
      limitRecipes: limitLearning,
      limitLearning,
      maxRecipes: learnsAllowed,
      learnsAllowed,
      learnScope,
      learningMode,
      prerequisiteIds,
      characterPrerequisiteIds,
      destroyWhenSpent: learn.destroyWhenSpent === true,
    },
  };
}

export function normalizeRecipeItemDefinition(entry, usedIds = new Set()) {
  if (!entry || typeof entry !== 'object') return null;

  let id = String(entry.id || '').trim();
  if (!id) id = foundry.utils.randomID();
  while (usedIds.has(id)) {
    id = foundry.utils.randomID();
  }

  // New-name-first, legacy-name-tolerant (issue 560): accept the renamed
  // `registeredItemUuid`/`originItemUuid`/`aliasItemUuids` and the pre-#560
  // `sourceUuid`/`sourceItemUuid`/`fallbackItemIds`, emitting the new names, so a
  // not-yet-1.16.0-migrated entry is never stripped on save.
  const originItemUuid =
    String(
      entry.originItemUuid ||
        entry.registeredItemUuid ||
        entry.sourceItemUuid ||
        entry.sourceUuid ||
        ''
    ).trim() || null;
  // Union source refs, mirroring `_normalizeComponent`, so a compendium-imported book resolves
  // for owned copies dragged from EITHER the compendium item or the imported world item (issue
  // 555). `originItemUuid` is never recomputed and `registeredItemUuid` defaults to it, so
  // existing definitions match unchanged.
  const registeredItemUuid =
    String(
      entry.registeredItemUuid ||
        entry.originItemUuid ||
        entry.sourceUuid ||
        entry.sourceItemUuid ||
        ''
    ).trim() || null;
  const primaryRefs = new Set([registeredItemUuid, originItemUuid].filter(Boolean));
  const rawAliasItemUuids = Array.isArray(entry.aliasItemUuids)
    ? entry.aliasItemUuids
    : Array.isArray(entry.fallbackItemIds)
      ? entry.fallbackItemIds
      : null;
  const aliasItemUuids = Array.isArray(rawAliasItemUuids)
    ? [
        ...new Set(
          rawAliasItemUuids
            .filter((id) => typeof id === 'string')
            .map((id) => id.trim())
            .filter((id) => id && !primaryRefs.has(id))
        ),
      ]
    : [];
  return {
    id,
    name: String(entry.name || '').trim() || labelFromUuid(originItemUuid) || 'Recipe Item',
    description: plainTextDescription(entry.description),
    img: String(entry.img || '').trim() || 'icons/svg/item-bag.svg',
    originItemUuid,
    registeredItemUuid,
    aliasItemUuids,
    // Per-recipe-item enable toggle (issue 511, PR-B). Defaults on; a disabled
    // definition still round-trips but the library UI can hide/skip it.
    enabled: entry.enabled !== false,
    // Book membership (issue 511): the recipe ids this book/scroll contains — the
    // canonical, many-to-many link (a recipe may belong to several books). Distinct
    // from the visibility-teaser `recipeIds` fragment elsewhere. Deduped id list.
    recipeIds: [
      ...new Set(
        (Array.isArray(entry.recipeIds) ? entry.recipeIds : [])
          .map((rid) => String(rid || '').trim())
          .filter(Boolean)
      ),
    ],
    caps: normalizeRecipeItemCaps(entry.caps),
  };
}

export function labelFromUuid(uuid) {
  if (!uuid) return '';
  const parts = String(uuid).split('.');
  return parts.at(-1) || '';
}
