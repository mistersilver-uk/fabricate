/**
 * Pure staging model for the GM component browser's bulk edit (issue 772). Two shapes travel
 * together: the SELECTION (a `Set` the browser owns, defined in `bulkSelectionModel.js` and
 * re-exported at the foot of this file under its original `…ComponentSelection` names) and the
 * DRAFT, which is what this file defines. Every helper returns a NEW draft. Essences and difficulty
 * carry an explicit `…Staged` flag because `{}` and `0` are meaningful values — a staged all-zero
 * essence map means "clear essences", so emptiness is never "no change" downstream.
 */

/** The shipped component-editor clamp (`<Stepper min={0} max={35}>`), mirrored here. */
const DIFFICULTY_MIN = 0;
const DIFFICULTY_MAX = 35;

/** Coerce an essence quantity to a non-negative integer. */
function clampQuantity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

/** Coerce a staged progressive DC into the shipped editor's 0..35 integer range. */
function clampDifficulty(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DIFFICULTY_MIN;
  return Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, Math.trunc(numeric)));
}

/** A de-duplicated list of non-empty tag names, order-preserving. */
function tagList(value) {
  const names = (Array.isArray(value) ? value : []).map((tag) => String(tag ?? '')).filter(Boolean);
  return [...new Set(names)];
}

/** A well-formed `{ essenceId: quantity }` map from arbitrary input. */
function essenceMap(value) {
  const output = {};
  if (!value || typeof value !== 'object') return output;
  for (const [rawId, rawQuantity] of Object.entries(value)) {
    const id = String(rawId || '').trim();
    if (id) output[id] = clampQuantity(rawQuantity);
  }
  return output;
}

/**
 * Read arbitrary input as a well-formed draft, so every export below is total and none of them has
 * to re-guard its input.
 */
function readDraft(draft) {
  const source = draft && typeof draft === 'object' ? draft : {};
  const tagAdd = tagList(source.tagAdd);
  return {
    category: typeof source.category === 'string' ? source.category : '',
    tagAdd,
    tagRemove: tagList(source.tagRemove).filter((tag) => !tagAdd.includes(tag)),
    essencesStaged: source.essencesStaged === true,
    essences: essenceMap(source.essences),
    difficultyStaged: source.difficultyStaged === true,
    difficulty: clampDifficulty(source.difficulty),
  };
}

/** A fresh, wholly unstaged draft. */
export function createComponentBulkDraft() {
  return {
    category: '',
    tagAdd: [],
    tagRemove: [],
    essencesStaged: false,
    essences: {},
    difficultyStaged: false,
    difficulty: 0,
  };
}

/** Advance one tag through the three-state machine: `none -> add -> remove -> none`. */
export function cycleBulkTag(draft, tag) {
  const next = readDraft(draft);
  const name = String(tag ?? '');
  if (!name) return next;

  if (next.tagAdd.includes(name)) {
    return {
      ...next,
      tagAdd: next.tagAdd.filter((entry) => entry !== name),
      tagRemove: [...next.tagRemove, name],
    };
  }
  if (next.tagRemove.includes(name)) {
    return { ...next, tagRemove: next.tagRemove.filter((entry) => entry !== name) };
  }
  return { ...next, tagAdd: [...next.tagAdd, name] };
}

/** Stage a single-valued, overwriting category. */
export function setBulkCategory(draft, category) {
  return { ...readDraft(draft), category: String(category ?? '') };
}

/**
 * Stage an absolute quantity for one essence, clamped at 0 and truncated, and STAGE the essence
 * axis — matching the prototype's `bumpBulkEss`, which arms `essOn` on every touch.
 */
export function setBulkEssence(draft, essenceId, quantity) {
  const next = readDraft(draft);
  const id = String(essenceId ?? '').trim();
  if (!id) return next;
  return {
    ...next,
    essences: { ...next.essences, [id]: clampQuantity(quantity) },
    essencesStaged: true,
  };
}

/** Nudge one essence by a delta, clamped at 0 and truncated, and STAGE the essence axis. */
export function adjustBulkEssence(draft, essenceId, delta) {
  const next = readDraft(draft);
  const id = String(essenceId ?? '').trim();
  if (!id) return next;
  const step = Number(delta);
  const current = next.essences[id] || 0;
  return setBulkEssence(next, id, current + (Number.isFinite(step) ? Math.trunc(step) : 0));
}

/** Arm or disarm the essence axis without touching the staged values. */
export function toggleBulkEssencesStaged(draft) {
  const next = readDraft(draft);
  return { ...next, essencesStaged: !next.essencesStaged };
}

/** Arm or disarm the progressive-DC axis. */
export function toggleBulkDifficultyStaged(draft) {
  const next = readDraft(draft);
  return { ...next, difficultyStaged: !next.difficultyStaged };
}

/** Stage a progressive DC, clamped to 0..35, and STAGE the axis. */
export function setBulkDifficulty(draft, value) {
  return { ...readDraft(draft), difficulty: clampDifficulty(value), difficultyStaged: true };
}

/**
 * Whether anything at all is staged — the prototype's `anyChange`, and the enablement condition for
 * `Apply to {N} component(s)`.
 */
export function bulkDraftHasChanges(draft) {
  const next = readDraft(draft);
  return Boolean(
    next.category.trim() ||
    next.tagAdd.length > 0 ||
    next.tagRemove.length > 0 ||
    next.essencesStaged ||
    next.difficultyStaged
  );
}

/** Project the draft onto the `edit` object the set-apply write primitive takes. */
export function toBulkComponentEdit(draft) {
  const next = readDraft(draft);
  const edit = {};
  if (next.category.trim()) edit.category = next.category;
  if (next.tagAdd.length > 0) edit.addTags = [...next.tagAdd];
  if (next.tagRemove.length > 0) edit.removeTags = [...next.tagRemove];
  if (next.essencesStaged) edit.essences = { ...next.essences };
  if (next.difficultyStaged) edit.difficulty = next.difficulty;
  return edit;
}

/**
 * How many of the selected components would have an AUTHORED essence value CHANGED or REMOVED if
 * the staged map were applied — the count the conditional overwrite warning names, per
 * `openspec/specs/ui-integration/spec.md` Component Studio requirement 10.
 */
export function countComponentsChangingEssences(selectedCards, stagedEssences) {
  const staged = essenceMap(stagedEssences);
  const rows = Array.isArray(selectedCards) ? selectedCards : [];
  return rows.filter((row) => {
    const authored = Array.isArray(row?.essences) ? row.essences : [];
    return authored.some((essence) => {
      const id = String(essence?.id || '').trim();
      const quantity = clampQuantity(essence?.quantity);
      return Boolean(id) && quantity > 0 && (staged[id] || 0) !== quantity;
    });
  }).length;
}

/**
 * The axes a draft stages, in the order the reference's foot names them (issue 1371 r16-list,
 * `proto:5523`-`5528`): `category`, `tags`, `essences`, `difficulty`.
 */
export function stagedBulkAxes(draft) {
  const next = readDraft(draft);
  const axes = [];
  if (next.category.trim()) axes.push('category');
  if (next.tagAdd.length > 0 || next.tagRemove.length > 0) axes.push('tags');
  if (next.essencesStaged) axes.push('essences');
  if (next.difficultyStaged) axes.push('difficulty');
  return axes;
}

/**
 * How many of the selected components' effective category is `category` — the `n/N` an inset row
 * states beside the value it would write (`proto:5571`, `carried`).
 */
export function countSelectedWithCategory(selectedCards, category) {
  const wanted = String(category ?? '');
  return (Array.isArray(selectedCards) ? selectedCards : []).filter(
    (card) => String(card?.category ?? '') === wanted
  ).length;
}

/**
 * How many of the selected components already carry `tag`, compared case-insensitively because the
 * `itemTags` vocabulary and the write primitive both store tags lowercase.
 */
export function countSelectedWithTag(selectedCards, tag) {
  const wanted = String(tag ?? '').toLowerCase();
  return (Array.isArray(selectedCards) ? selectedCards : []).filter((card) =>
    (Array.isArray(card?.tags) ? card.tags : []).some(
      (entry) => String(entry ?? '').toLowerCase() === wanted
    )
  ).length;
}

/** How many of the selected components carry a POSITIVE quantity of `essenceId`. */
export function countSelectedWithEssence(selectedCards, essenceId) {
  const wanted = String(essenceId ?? '').trim();
  return (Array.isArray(selectedCards) ? selectedCards : []).filter((card) =>
    (Array.isArray(card?.essences) ? card.essences : []).some(
      (entry) => String(entry?.id ?? '').trim() === wanted && clampQuantity(entry?.quantity) > 0
    )
  ).length;
}

/** The reference's inset window: five rows, so the groups below never move on a keystroke. */
const INSET_PAGE_SIZE = 5;

/** One staging inset's visible page: the rows whose `name` survives the search, windowed. */
export function pageBulkInsetRows(
  items,
  { query = '', pageIndex = 0, pageSize = INSET_PAGE_SIZE } = {}
) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase();
  const matched = (Array.isArray(items) ? items : []).filter(
    (item) =>
      !needle ||
      String(item?.name ?? '')
        .toLowerCase()
        .includes(needle)
  );
  const size = Math.max(1, Math.trunc(Number(pageSize)) || INSET_PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(matched.length / size));
  const index = Math.min(Math.max(0, Math.trunc(Number(pageIndex)) || 0), pageCount - 1);
  const start = index * size;
  const rows = matched.slice(start, start + size);
  return {
    rows,
    pageIndex: index,
    pageCount,
    total: matched.length,
    rangeStart: rows.length > 0 ? start + 1 : 0,
    rangeEnd: rows.length > 0 ? start + rows.length : 0,
  };
}

/**
 * The selection helpers this module used to define, re-exported under the names every call site
 * already imports.
 */
export {
  describeBulkSelection as describeComponentSelection,
  toggleBulkSelection as toggleComponentSelection,
  setBulkSelection as setComponentSelection,
  pruneBulkSelection as pruneComponentSelection,
} from '../../utils/bulkSelectionModel.js';
