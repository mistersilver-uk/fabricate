/**
 * The area-scope gate's primitive list against the design-system manifest (issue 1607), as a
 * PARTIAL ratchet: the full cross-check is blocked on the shared primitives that have no entry in
 * `tests/components/searchable-popover-area-scope.test.js` yet.
 *
 * A `manager-only` primitive paints only under `.fabricate-manager`, so an area-scope entry for
 * one proves a scope it does not have. A `shared` primitive must either have an entry or sit in
 * `UNCOVERED_SHARED`, which can only shrink: a listed row that gained an entry, or stopped being
 * shared, fails until it is removed. The issue stays open until the list is empty.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import designSystemPrimitives from '../../scripts/lib/designSystemPrimitives.json' with { type: 'json' };
import { parseModule, walkNodes } from '../helpers/moduleAst.js';
import { repoRoot } from '../helpers/sourceScan.js';

const AREA_SCOPE_SUITE = 'tests/components/searchable-popover-area-scope.test.js';

/** The shared primitives with no area-scope entry today; delete a row when it gains one. */
const UNCOVERED_SHARED = Object.freeze([
  'src/ui/svelte/components/ListRow.svelte',
  'src/ui/svelte/components/ListState.svelte',
  'src/ui/svelte/components/EssencePool.svelte',
  'src/ui/svelte/components/StageCard.svelte',
  'src/ui/svelte/components/YieldScale.svelte',
  'src/ui/svelte/components/OutcomeLadder.svelte',
  'src/ui/svelte/components/ArmedDangerButton.svelte',
  'src/ui/svelte/components/Avatar.svelte',
  'src/ui/svelte/components/Callout.svelte',
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
  'src/ui/svelte/apps/crafting/detail/CheckEvidenceRows.svelte',
  'src/ui/svelte/apps/crafting/detail/ProgressiveStageRow.svelte',
  'src/ui/svelte/apps/crafting/detail/ProgressiveStageBand.svelte',
  'src/ui/svelte/components/EmptyState.svelte',
  'src/ui/svelte/components/Modal.svelte',
  'src/ui/svelte/components/SegmentedControl.svelte',
  'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/components/TintSwatches.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/Notice.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/StatBox.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/components/ThresholdBandStrip.svelte',
  'src/ui/svelte/components/RunProgress.svelte',
  'src/ui/svelte/components/StageBars.svelte',
  'src/ui/svelte/components/RowDisclosure.svelte',
  'src/ui/svelte/components/DiceTiles.svelte',
  'src/ui/svelte/components/Well.svelte',
  'src/ui/svelte/components/SlotTile.svelte',
  'src/ui/svelte/components/ChoiceOptionList.svelte',
  'src/ui/svelte/components/Meter.svelte',
  'src/ui/svelte/components/BandedBar.svelte',
  'src/ui/svelte/components/SetPicker.svelte',
  'src/ui/svelte/components/RequirementChooser.svelte',
  'src/ui/svelte/components/InfoStrip.svelte',
  'src/ui/svelte/components/ArtPicker.svelte',
  'src/ui/svelte/components/Rail.svelte',
]);

/** Below this the list is truncated rather than short; the suite lists 27 primitives. */
const ENTRY_FLOOR = 25;

/**
 * @param {string} source the area-scope suite's text
 * @returns {Set<string>} every `.svelte` path its `PRIMITIVES` entries name under `components`
 */
function areaScopePaths(source) {
  const { ast } = parseModule(source);
  const paths = new Set();
  for (const declarator of walkNodes(ast)) {
    if (declarator.type !== 'VariableDeclarator' || declarator.id.name !== 'PRIMITIVES') continue;
    for (const property of walkNodes(declarator.init)) {
      if (property.type !== 'Property' || property.key.name !== 'components') continue;
      for (const literal of walkNodes(property.value)) {
        if (literal.type === 'Literal') paths.add(literal.value);
      }
    }
  }
  return paths;
}

/**
 * @param {{path: string, scope: string}[]} rows the manifest rows
 * @param {Set<string>} covered paths with an area-scope entry
 * @param {readonly string[]} uncovered the shrink-only list
 * @returns {string[]} what is wrong, empty when the ratchet holds
 */
function ratchetFailures(rows, covered, uncovered) {
  const failures = [];
  const byPath = new Map(rows.map((row) => [row.path, row]));
  for (const row of rows) {
    if (row.scope === 'manager-only' && covered.has(row.path)) {
      failures.push(`${row.path} is manager-only and has an area-scope entry`);
    }
    if (row.scope === 'shared' && !covered.has(row.path) && !uncovered.includes(row.path)) {
      failures.push(`${row.path} is shared with no area-scope entry and is not listed`);
    }
  }
  for (const path of uncovered) {
    const row = byPath.get(path);
    if (row?.scope !== 'shared') failures.push(`${path} is listed but is not a shared row`);
    else if (covered.has(path)) failures.push(`${path} now has an entry; drop it from the list`);
  }
  return failures;
}

// ratchet-exempt(source-pin): parsed to an AST for the PRIMITIVES component paths, never matched as text
const covered = areaScopePaths(readFileSync(join(repoRoot, AREA_SCOPE_SUITE), 'utf8'));
const rows = designSystemPrimitives.designSystemPrimitives;

test('the area-scope suite lists its primitives', () => {
  assert.ok(covered.size >= ENTRY_FLOOR, `only ${covered.size} component paths were read`);
});

test('no manager-only row has an area-scope entry, and every shared row has one or is listed', () => {
  assert.deepEqual(ratchetFailures(rows, covered, UNCOVERED_SHARED), []);
});

test('the ratchet fails each way it can be broken', () => {
  const rowsOf = (...pairs) => pairs.map(([path, scope]) => ({ path, scope }));
  const fixture = rowsOf(['a', 'shared'], ['b', 'shared'], ['m', 'manager-only']);
  assert.deepEqual(ratchetFailures(fixture, new Set(['a']), ['b']), []);
  assert.equal(
    ratchetFailures(fixture, new Set(['a', 'm']), ['b']).length,
    1,
    'manager-only entry'
  );
  assert.equal(ratchetFailures(fixture, new Set(['a']), []).length, 1, 'unlisted shared gap');
  assert.equal(
    ratchetFailures(fixture, new Set(['a', 'b']), ['b']).length,
    1,
    'stale: now covered'
  );
  assert.equal(
    ratchetFailures(fixture, new Set(['a']), ['b', 'm']).length,
    1,
    'listed manager-only'
  );
  assert.equal(ratchetFailures(fixture, new Set(['a']), ['b', 'gone']).length, 1, 'listed, no row');
});
