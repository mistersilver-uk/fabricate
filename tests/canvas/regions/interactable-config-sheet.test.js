/**
 * Coverage for the config-sheet registration + tile discoverability seams
 * (`interactableConfigSheet.js`):
 *  - assignInteractableConfigSheet: registers against a fake DocumentSheetConfig,
 *    idempotent, defensive on a differing API shape.
 *  - resolveInteractableConfigTarget: resolves a linked Tile's reverse flags to
 *    the owning behaviour `{ sceneId, regionId, behaviorId }`.
 *  - shouldOfferInteractableConfigEntry: GM-only + Fabricate-visual gate.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assignInteractableConfigSheet,
  resolveInteractableConfigTarget,
  shouldOfferInteractableConfigEntry
} from '../../../src/canvas/regions/interactableConfigSheet.js';

class FakeRegionBehavior {}
// Stands in for the CORE `foundry.applications.sheets.RegionBehaviorConfig`, which
// is the document sheet now registered for `fabricate.interactable` so
// `behavior.sheet` resolves (our rich Svelte InteractableConfigApp is NOT a
// DocumentSheet and is reached via the Tile/Token HUD instead).
class FakeRegionBehaviorConfig {}
const FakeSheet = FakeRegionBehaviorConfig;

function fakeRegistrar() {
  const calls = [];
  return {
    calls,
    registerSheet(documentClass, scope, sheetClass, options) {
      calls.push({ documentClass, scope, sheetClass, options });
    }
  };
}

describe('assignInteractableConfigSheet', () => {
  it('registers the core RegionBehaviorConfig sheet for the fabricate.interactable subtype', () => {
    const registrar = fakeRegistrar();
    const did = assignInteractableConfigSheet({ registrar, RegionBehavior: FakeRegionBehavior, SheetClass: FakeRegionBehaviorConfig });
    assert.equal(did, true);
    assert.equal(registrar.calls.length, 1);
    const call = registrar.calls[0];
    assert.equal(call.documentClass, FakeRegionBehavior);
    assert.equal(call.scope, 'fabricate');
    assert.equal(call.sheetClass, FakeRegionBehaviorConfig);
    assert.deepEqual(call.options.types, ['fabricate.interactable']);
    assert.equal(call.options.makeDefault, true);
  });

  it('is idempotent — a second call does not re-register', () => {
    const registrar = fakeRegistrar();
    assignInteractableConfigSheet({ registrar, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet });
    const second = assignInteractableConfigSheet({ registrar, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet });
    assert.equal(second, false, 'second call is a no-op');
    assert.equal(registrar.calls.length, 1, 'only registered once');
  });

  it('is defensive when the registrar API shape differs (no throw, returns false)', () => {
    assert.equal(assignInteractableConfigSheet({ registrar: {}, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet }), false);
    assert.equal(assignInteractableConfigSheet({ registrar: null, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet }), false);
    assert.equal(assignInteractableConfigSheet({ registrar: fakeRegistrar(), RegionBehavior: null, SheetClass: FakeSheet }), false);
    assert.equal(assignInteractableConfigSheet({ registrar: fakeRegistrar(), RegionBehavior: FakeRegionBehavior, SheetClass: null }), false);
  });

  it('does not throw when registerSheet itself throws (double-register race)', () => {
    const registrar = {
      registerSheet() { throw new Error('already registered'); }
    };
    assert.equal(assignInteractableConfigSheet({ registrar, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet }), false);
  });
});

describe('resolveInteractableConfigTarget', () => {
  const tile = {
    flags: { fabricate: { isInteractableVisual: true, linkedRegionUuid: 'Scene.s1.Region.r1', linkedBehaviorId: 'b1' } }
  };

  it('resolves the owning behaviour ref from a linked tile', () => {
    const target = resolveInteractableConfigTarget(tile, {
      resolveRegion: (regionUuid) => {
        assert.equal(regionUuid, 'Scene.s1.Region.r1');
        return { sceneId: 's1', regionId: 'r1' };
      }
    });
    assert.deepEqual(target, { sceneId: 's1', regionId: 'r1', behaviorId: 'b1' });
  });

  it('returns null when the document is not a Fabricate interactable visual', () => {
    assert.equal(resolveInteractableConfigTarget({ flags: {} }, { resolveRegion: () => ({ sceneId: 's', regionId: 'r' }) }), null);
  });

  it('returns null when the region can no longer be resolved', () => {
    assert.equal(resolveInteractableConfigTarget(tile, { resolveRegion: () => null }), null);
  });

  it('returns null when no resolveRegion seam is provided', () => {
    assert.equal(resolveInteractableConfigTarget(tile, {}), null);
  });
});

describe('shouldOfferInteractableConfigEntry', () => {
  const tile = {
    flags: { fabricate: { isInteractableVisual: true, linkedRegionUuid: 'Scene.s1.Region.r1', linkedBehaviorId: 'b1' } }
  };

  it('offers the entry for a GM on a Fabricate interactable visual', () => {
    assert.equal(shouldOfferInteractableConfigEntry(tile, { isGM: true }), true);
  });

  it('hides the entry for a non-GM', () => {
    assert.equal(shouldOfferInteractableConfigEntry(tile, { isGM: false }), false);
  });

  it('hides the entry on a non-Fabricate tile', () => {
    assert.equal(shouldOfferInteractableConfigEntry({ flags: {} }, { isGM: true }), false);
  });
});
