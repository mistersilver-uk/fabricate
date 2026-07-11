/**
 * Issue 561 — focused unit coverage for `itemIsToolByDurableIdentity`, the narrow
 * durable-identity predicate that gates destructive/consumptive TOOL selection (superseding
 * the component-scoped #557 gate). It accepts the durable-flag tier (`roles[sys].toolId`) and
 * the item's OWN uuid/compendium source, but EXCLUDES the transitive `_stats.duplicateSource`
 * reference and the name fallback that the wider `resolveToolForItem` presence matcher honours.
 *
 * Migrated from the `itemIsComponentByDurableIdentity` coverage (which was removed as dead code
 * once its only caller retargeted onto tool identity): the legacy-scalar tier-2 case is DROPPED
 * (tools have `legacyScalarKey: null` — no legacy scalar flag), and the vacuity-contrast case is
 * carried over to `itemResolvesToTool` so a predicate that returns false for everything cannot pass.
 *
 * A namespace import keeps the RED-on-main verification per-test: on pristine `main` the export
 * is absent (undefined) so each call throws and these tests fail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as sourceUuid from '../src/utils/sourceUuid.js';
import { tool, roleItem } from './helpers/componentIdentityFixtures.js';

const SYSTEM_ID = 's1';
// tX is the target; tY a sibling with an unrelated source, proving exclusivity.
const TOOLS = [
  tool('tX', { sourceUuid: 'Item.x-src', name: 'Widget' }),
  tool('tY', { sourceUuid: 'Item.y-src', name: 'Gadget' }),
];
const [TX, TY] = TOOLS;

function isTX(item) {
  return sourceUuid.itemIsToolByDurableIdentity(item, TX, TOOLS, SYSTEM_ID);
}

test('roles-map flag naming tX matches tX (durable tier 1)', () => {
  assert.equal(isTX(roleItem({ roles: { [SYSTEM_ID]: { toolId: 'tX' } } })), true);
});

test("item's own uuid equal to the tool source matches (identity tier 3)", () => {
  assert.equal(isTX(roleItem({ uuid: 'Item.x-src' })), true);
});

test("item's own compendiumSource equal to the tool source matches", () => {
  assert.equal(isTX(roleItem({ uuid: 'Item.copy', compendiumSource: 'Item.x-src' })), true);
});

test('a transitive duplicateSource is EXCLUDED (spared)', () => {
  const decoy = roleItem({ uuid: 'Item.copy2', duplicateSource: 'Item.x-src', name: 'Widget' });
  assert.equal(isTX(decoy), false);
  // Vacuity contrast: the WIDE resolver DOES accept the duplicate source, so this proves the
  // predicate is genuinely narrower and not vacuously false.
  assert.equal(sourceUuid.itemResolvesToTool(decoy, TX, TOOLS, SYSTEM_ID), true);
});

test('a shared tool NAME alone is EXCLUDED (spared)', () => {
  assert.equal(isTX(roleItem({ uuid: 'Item.unrelated', name: 'Widget' })), false);
});

test('sibling-exclusivity: an item claiming tX does not match sibling tY', () => {
  const item = roleItem({ roles: { [SYSTEM_ID]: { toolId: 'tX' } } });
  assert.equal(sourceUuid.itemIsToolByDurableIdentity(item, TY, TOOLS, SYSTEM_ID), false);
});

test('a legacy scalar componentId flag is NEVER a tool identity (tools have no legacy scalar)', () => {
  // A tool's durable identity is roles[sys].toolId only; a stray legacy `componentId` scalar
  // must not be read as a spurious tool id (legacyScalarKey: null, D-F2).
  assert.equal(isTX(roleItem({ componentId: 'tX' })), false);
});

test('null/empty inputs never match', () => {
  assert.equal(isTX(null), false);
  assert.equal(sourceUuid.itemIsToolByDurableIdentity(roleItem({}), null, TOOLS, SYSTEM_ID), false);
  assert.equal(isTX(roleItem({})), false);
});
