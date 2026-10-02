/**
 * How the PR capture splits one selection across parallel runners, and how the shards' output
 * becomes one manifest again, as pure functions. Every member of a `distinctEvidenceGroup` lands in
 * one shard, so the renderer's own byte-identity check still sees the whole group.
 */

/** Past this, each runner's fixed setup (install, build, harvest) outweighs the frames it saves. */
export const MAX_CAPTURE_SHARDS = 12;

/** Below this many cases per runner a second runner costs more setup than it saves rendering. */
export const CASES_PER_SHARD = 30;

/**
 * @param {number} size How many cases the selection holds.
 * @returns {number} How many runners render it: none for an empty selection, else 1 to the cap.
 */
export function shardCountFor(size) {
  if (size <= 0) return 0;
  return Math.min(MAX_CAPTURE_SHARDS, Math.ceil(size / CASES_PER_SHARD));
}

/** The selection as units that must share a runner: one per ungrouped case, one per group. */
function renderUnits(cases) {
  const units = [];
  const byGroup = new Map();
  for (const [position, viewCase] of cases.entries()) {
    const group = viewCase.distinctEvidenceGroup;
    const existing = group ? byGroup.get(group) : null;
    if (existing) {
      existing.push(position);
      continue;
    }
    const unit = [position];
    units.push(unit);
    if (group) byGroup.set(group, unit);
  }
  return units;
}

/**
 * Split a selection into `count` balanced slices: each unit goes, in selection order, to the
 * least-loaded shard (the lowest index on a tie), and each slice keeps selection order.
 *
 * @param {Array<{id: string, distinctEvidenceGroup?: string}>} cases The selection, in order.
 * @param {number} count How many shards.
 * @returns {string[][]} One id list per shard; a shard is never empty.
 */
export function sliceSelection(cases, count) {
  const slices = Array.from({ length: Math.min(count, cases.length) }, () => []);
  if (slices.length === 0) return [];
  for (const unit of renderUnits(cases)) {
    const lightest = slices.reduce(
      (best, slice, index) => (slice.length < slices[best].length ? index : best),
      0
    );
    slices[lightest].push(...unit);
  }
  return slices
    .filter((slice) => slice.length > 0)
    .map((slice) =>
      slice.toSorted((left, right) => left - right).map((position) => cases[position].id)
    );
}

/**
 * The render matrix the capture workflow runs: none when the selection is not rendered, and the
 * chrome is verified by its own job either way.
 *
 * @param {Array<{id: string, distinctEvidenceGroup?: string}>} cases The selection, in order.
 * @param {boolean} render Whether the capture renders the selection (`rendersCapture`).
 * @returns {Array<{shard: number, ids: string}>} One entry per shard, numbered from 1.
 */
export function renderMatrix(cases, render) {
  const count = render ? shardCountFor(cases.length) : 0;
  return sliceSelection(cases, count).map((ids, index) => ({
    shard: index + 1,
    ids: ids.join(','),
  }));
}

/**
 * Merge the shards' manifests into the one a single unsharded run would have written: frames by
 * id, failures in selection order. Refuses a selection the shards did not account for exactly.
 *
 * @param {string[]} ids The whole selection, in order.
 * @param {Array<{foundryVersion: string, head: string, frames: object[], failures: object[]}>}
 * manifests One per shard.
 * @returns {{foundryVersion: string, head: string, frames: object[], failures: object[]}} The merge.
 */
export function mergeShardManifests(ids, manifests) {
  const [first] = manifests;
  if (!first) throw new Error('no shard manifest to merge');
  for (const field of ['foundryVersion', 'head']) {
    const values = [...new Set(manifests.map((manifest) => manifest[field]))];
    if (values.length > 1)
      throw new Error(`the shards disagree about ${field}: ${values.join(', ')}`);
  }

  const frames = manifests.flatMap((manifest) => manifest.frames ?? []);
  const failures = manifests.flatMap((manifest) => manifest.failures ?? []);
  const seen = [...frames, ...failures].map((entry) => entry.id);
  const duplicated = seen.filter((id, index) => seen.indexOf(id) !== index);
  const unaccounted = ids.filter((id) => !seen.includes(id));
  const unselected = seen.filter((id) => !ids.includes(id));
  if (duplicated.length + unaccounted.length + unselected.length > 0) {
    throw new Error(
      'the shards do not account for the selection exactly once: ' +
        `duplicated [${duplicated.join(', ')}], missing [${unaccounted.join(', ')}], ` +
        `unselected [${unselected.join(', ')}]`
    );
  }

  return {
    foundryVersion: first.foundryVersion,
    head: first.head,
    frames: frames.toSorted((left, right) => left.id.localeCompare(right.id)),
    failures: failures.toSorted((left, right) => ids.indexOf(left.id) - ids.indexOf(right.id)),
  };
}
