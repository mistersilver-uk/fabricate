/**
 * Coverage for the config-sheet registration + tile discoverability seams
 * (`interactableConfigSheet.js`): - assignInteractableConfigSheet: registers against a fake
 * DocumentSheetConfig, idempotent, defensive on a differing API shape.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assignInteractableConfigSheet,
  resolveInteractableConfigTarget,
  shouldOfferInteractableConfigEntry
} from '../../../src/canvas/regions/interactableConfigSheet.js';

class FakeRegionBehavior {}
// Stands in for the CORE `foundry.applications.sheets.RegionBehaviorConfig`, which is the document
// sheet now registered for `fabricate.interactable` so `behavior.sheet` resolves (our rich Svelte
// InteractableConfigApp is NOT a DocumentSheet and is reached via the Tile/Token HUD instead).
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

  it('is defensive when registerSheet itself throws (e.g., V14 class validation)', () => {
    const registrar = {
      registerSheet() { throw new Error('Sheet class must be an Application or DocumentSheetV2'); }
    };
    assert.equal(assignInteractableConfigSheet({ registrar, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet }), false);
  });

  describe('reports a refusal to the injected onError (issue 1103)', () => {
    const reporter = () => {
      const errors = [];
      const onError = (error) => {
        errors.push(error);
      };
      return { errors, onError };
    };

    it('hands the thrown error itself to onError and still returns false', () => {
      const thrown = new Error('FakeSheet must be either a foundry.appv1.api.Application or a foundry.applications.api.DocumentSheetV2');
      const registrar = { registerSheet() { throw thrown; } };
      const { errors, onError } = reporter();
      const did = assignInteractableConfigSheet({ registrar, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet, onError });
      assert.equal(did, false);
      assert.equal(errors.length, 1);
      assert.ok(errors[0] === thrown, 'the bound error, not a copy');
    });

    it('reports an API-shape refusal as an Error naming what is not a function', () => {
      const cases = [
        [{ registrar: {}, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet }, /registrar\.registerSheet/],
        [{ registrar: fakeRegistrar(), RegionBehavior: null, SheetClass: FakeSheet }, /RegionBehavior/],
        [{ registrar: fakeRegistrar(), RegionBehavior: FakeRegionBehavior, SheetClass: undefined }, /SheetClass/],
      ];
      for (const [args, named] of cases) {
        const { errors, onError } = reporter();
        assert.equal(assignInteractableConfigSheet({ ...args, onError }), false);
        assert.equal(errors.length, 1);
        assert.ok(errors[0] instanceof Error);
        assert.match(errors[0].message, named);
      }
    });

    it('stays silent for the already-registered marker and for a fresh registration', () => {
      const registrar = fakeRegistrar();
      const { errors, onError } = reporter();
      const args = { registrar, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet, onError };
      assert.equal(assignInteractableConfigSheet(args), true);
      assert.equal(assignInteractableConfigSheet(args), false);
      assert.deepEqual(errors, []);
    });

    it('leaves no marker on a failure, so each failed retry reports and a later success is silent', () => {
      let failing = true;
      const calls = [];
      const registrar = {
        registerSheet(...args) {
          if (failing) throw new Error('rejected');
          calls.push(args);
        },
      };
      const { errors, onError } = reporter();
      const args = { registrar, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet, onError };
      assert.equal(assignInteractableConfigSheet(args), false);
      assert.equal(assignInteractableConfigSheet(args), false);
      assert.equal(errors.length, 2, 'the ready backstop reports its own failed attempt');
      failing = false;
      assert.equal(assignInteractableConfigSheet(args), true);
      assert.equal(errors.length, 2);
      assert.equal(calls.length, 1);
    });

    it('does not let a throwing onError escape the no-throw contract', () => {
      const registrar = { registerSheet() { throw new Error('rejected'); } };
      const onError = () => { throw new Error('logger broke'); };
      assert.doesNotThrow(() => {
        assert.equal(assignInteractableConfigSheet({ registrar, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet, onError }), false);
        assert.equal(assignInteractableConfigSheet({ registrar: {}, RegionBehavior: FakeRegionBehavior, SheetClass: FakeSheet, onError }), false);
      });
    });
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
