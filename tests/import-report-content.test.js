/**
 * Q4 — buildImportReportContent (pure): grouped counts, localized labels, the
 * reported table, headline selection, and the zero-unresolved empty state.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { buildImportReportContent } = await import('../src/systems/importReportContent.js');

// Deterministic localize double: echoes the key + count so assertions can check
// that keys and counts are threaded through, and proves labels are localized
// (never raw enum tokens).
function localize(key, data) {
  if (data && 'count' in data) return `${key}#${data.count}`;
  return key;
}

function summaryWith(refs) {
  return { unresolvedReferences: refs };
}

test('report: empty state when there are no references', () => {
  const content = buildImportReportContent(summaryWith([]), localize);
  assert.equal(content.hasReported, false);
  assert.equal(content.reportedCount, 0);
  assert.equal(content.handledCount, 0);
  assert.equal(content.headline, 'FABRICATE.Admin.ImportReport.HeadlineAllResolved');
  assert.equal(content.emptyStateLabel, 'FABRICATE.Admin.ImportReport.EmptyState');
  assert.deepEqual(content.groups, []);
});

test('report: groups reported refs by kind with per-kind counts + localized labels', () => {
  const content = buildImportReportContent(
    summaryWith([
      { kind: 'sourceItem', ownerType: 'component', ownerName: 'Iron Ore', referenceValue: 'Compendium.x', disposition: 'reported' },
      { kind: 'scene', ownerType: 'environment', ownerName: 'Grove', referenceValue: 'Scene.a', disposition: 'reported' },
      { kind: 'scene', ownerType: 'realm', ownerName: 'Verdant', referenceValue: 'Scene.b', disposition: 'reported' },
      { kind: 'sourceItem', ownerType: 'component', ownerName: 'Herb', referenceValue: 'Compendium.y', disposition: 'remapped' },
      { kind: 'dropRowItem', ownerType: 'dropRow', ownerName: 'Forage', referenceValue: 'Compendium.z', disposition: 'retained' },
    ]),
    localize
  );

  assert.equal(content.hasReported, true);
  assert.equal(content.reportedCount, 3);
  assert.equal(content.handledCount, 2);
  assert.equal(content.headline, 'FABRICATE.Admin.ImportReport.HeadlineNeedsAttention#3');

  // Stable kind order: sourceItem before scene.
  assert.deepEqual(content.groups.map((g) => g.kind), ['sourceItem', 'scene']);
  const scene = content.groups.find((g) => g.kind === 'scene');
  assert.equal(scene.count, 2);
  assert.equal(scene.kindLabel, 'FABRICATE.Admin.ImportReport.Kind.scene');

  const row = scene.rows[0];
  assert.equal(row.ownerTypeLabel, 'FABRICATE.Admin.ImportReport.OwnerType.environment');
  assert.equal(row.dispositionLabel, 'FABRICATE.Admin.ImportReport.Disposition.reported');
  assert.equal(row.referenceValue, 'Scene.a');
});

test('report: handled line reflects remapped + retained count', () => {
  const content = buildImportReportContent(
    summaryWith([
      { kind: 'sourceItem', disposition: 'remapped', referenceValue: 'a' },
      { kind: 'dropRowItem', disposition: 'retained', referenceValue: 'b' },
    ]),
    localize
  );
  assert.equal(content.hasReported, false);
  assert.equal(content.handledCount, 2);
  assert.equal(content.handledLine, 'FABRICATE.Admin.ImportReport.HandledLine#2');
});

test('report: tolerates a missing localize function', () => {
  const content = buildImportReportContent(summaryWith([]), undefined);
  assert.equal(content.title, 'FABRICATE.Admin.ImportReport.Title');
});
