/**
 * Issue 557 — focused unit coverage for `itemIsComponentByDurableIdentity`, the
 * narrow durable-identity predicate that gates destructive/consumptive tool
 * selection. It accepts the durable-flag tiers and the item's OWN uuid/compendium
 * source, but EXCLUDES the transitive `_stats.duplicateSource` reference and the
 * name fallback that the wider `resolveComponentForItem` / presence matchers honour.
 *
 * A namespace import keeps this file's RED-on-main verification per-test: on pristine
 * `main` the export is absent (undefined) so each call throws and these tests fail,
 * without breaking an existing suite's module link.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as sourceUuid from '../src/utils/sourceUuid.js';
import { component, roleItem } from './helpers/componentIdentityFixtures.js';

const SYSTEM_ID = 's1';
// cX is the target; cY a sibling with an unrelated source, proving exclusivity.
const COMPONENTS = [
  component('cX', { sourceUuid: 'Item.x-src', name: 'Widget' }),
  component('cY', { sourceUuid: 'Item.y-src', name: 'Gadget' }),
];
const [CX, CY] = COMPONENTS;

function isCX(item) {
  return sourceUuid.itemIsComponentByDurableIdentity(item, CX, COMPONENTS, SYSTEM_ID);
}

test('roles-map flag naming cX matches cX (durable tier 1)', () => {
  assert.equal(isCX(roleItem({ roles: { [SYSTEM_ID]: { componentId: 'cX' } } })), true);
});

test('legacy scalar componentId naming cX matches cX (durable tier 2)', () => {
  assert.equal(isCX(roleItem({ componentId: 'cX' })), true);
});

test("item's own uuid equal to the component source matches (identity tier 3)", () => {
  assert.equal(isCX(roleItem({ uuid: 'Item.x-src' })), true);
});

test("item's own compendiumSource equal to the component source matches", () => {
  assert.equal(isCX(roleItem({ uuid: 'Item.copy', compendiumSource: 'Item.x-src' })), true);
});

test('a transitive duplicateSource is EXCLUDED (spared)', () => {
  const decoy = roleItem({ uuid: 'Item.copy2', duplicateSource: 'Item.x-src', name: 'Widget' });
  assert.equal(isCX(decoy), false);
  // Contrast: the wide resolver DOES accept the duplicate source, so this proves the
  // predicate is genuinely narrower and not vacuously false.
  assert.equal(sourceUuid.itemResolvesToComponent(decoy, CX, COMPONENTS, SYSTEM_ID), true);
});

test('a shared component NAME alone is EXCLUDED (spared)', () => {
  assert.equal(isCX(roleItem({ uuid: 'Item.unrelated', name: 'Widget' })), false);
});

test('sibling-exclusivity: an item claiming cX does not match sibling cY', () => {
  const item = roleItem({ roles: { [SYSTEM_ID]: { componentId: 'cX' } } });
  assert.equal(sourceUuid.itemIsComponentByDurableIdentity(item, CY, COMPONENTS, SYSTEM_ID), false);
});

test('null/empty inputs never match', () => {
  assert.equal(isCX(null), false);
  assert.equal(sourceUuid.itemIsComponentByDurableIdentity(roleItem({}), null, COMPONENTS, SYSTEM_ID), false);
  assert.equal(isCX(roleItem({})), false);
});
