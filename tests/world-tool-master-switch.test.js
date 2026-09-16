/**
 * The WORLD MASTER SWITCH on a Tool (issue 1373, epic 1357).
 *
 * Fabricate modelled `enabled` per `(tool, system)` only, so there was no way to switch a Tool off
 * world-wide and no way for a world screen to say it had. The maintainer's ruling is:
 *
 *     resolved = world.enabled && system.enabled          -- WORLD OFF WINS
 *
 * The per-system flag is unchanged and still means what it meant; it simply cannot re-enable a
 * world-disabled Tool.
 *
 * ## What this suite is organised around
 *
 * Every case here is a way the switch could ship looking correct and be wrong:
 *
 *  1. COMPATIBILITY. No world has ever authored this flag, so every persisted world default is
 *     missing the key. If absence did not resolve as enabled, this change would switch off every
 *     Tool in every existing world. It is proved on REAL absent-key data through the real store
 *     over a real settings seam - a literal handed straight to a resolver would prove nothing
 *     about what survives persistence.
 *  2. THE UNION. `unionScopedDefinitions` re-spreads the in-system record LAST while
 *     `## CraftingSystem` requirement 36 holds, and a normalized in-system tool carries `enabled`
 *     unconditionally - so the resolver's AND is overwritten on the read path unless the veto is
 *     re-applied over the merged rows. A suite that only tested `resolveTool` would be green while
 *     the runtime ignored the switch entirely.
 *  3. IT IS A VETO, NEVER A GRANT. The world flag must not turn a GM-disabled Tool back on.
 *  4. IT IS TOOL-ONLY. The component has no `enabled` field at all and the essence's world
 *     defaults carry no master switch, so neither normalizer may start minting one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import {
  normalizeComponentWorldDefaults,
  resolveComponent,
} from '../src/systems/componentScope.js';
import { normalizeEssenceWorldDefaults, resolveEssence } from '../src/systems/essenceScope.js';
import { applyWorldEnabledVeto, isWorldEnabled } from '../src/systems/scopedDefinitions.js';
import {
  isToolEnabledInWorld,
  normalizeToolMemberships,
  normalizeToolWorldDefaults,
  resolveTool,
  resolveToolScope,
  TOOL_BLOCKED,
  toolAttemptBlockReason,
} from '../src/systems/toolScope.js';
import { createToolScopeStore } from '../src/systems/worldScopeStores.js';
import { createWorldScopeEntityActions } from '../src/ui/svelte/stores/worldScopeActions.js';

const TOOL_ID = 'mining-pick';
const SYSTEM_ID = 'mythwright-forge';

/** A `Map`-backed settings seam, so a case can read the RAW stored value back. */
function settingsSeam(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getSetting: (key) => values.get(key),
    setSetting: async (key, value) => {
      values.set(key, value);
      return value;
    },
  };
}

/**
 * A tool scope store over a seam seeded with a payload that has NO `enabled` key anywhere.
 *
 * THE SEED IS THE PERSISTED MAP SHAPE, not the normalized array shape, because that is what a
 * migrated world actually holds and it is the shape a `load()` has to survive.
 *
 * @param {object} [payload]
 * @returns {{store: object, seam: object}}
 */
function toolStore(payload = {}) {
  const seam = settingsSeam({
    [SETTING_KEYS.TOOL_SCOPE]: {
      entities: { [TOOL_ID]: { id: TOOL_ID, name: 'Mining Pick' } },
      defaults: { [TOOL_ID]: { id: TOOL_ID, breakage: { mode: 'breakageChance', breakageChance: 8 } } },
      membership: {
        [`${TOOL_ID}|${SYSTEM_ID}`]: { entityId: TOOL_ID, systemId: SYSTEM_ID, inherit: {} },
      },
      ...payload,
    },
  });
  return {
    seam,
    store: createToolScopeStore({ getSetting: seam.getSetting, setSetting: seam.setSetting }),
  };
}

describe('the world master switch on a Tool (issue 1373)', () => {
  describe('an ABSENT world flag resolves as enabled, on real absent-key data', () => {
    it('survives a real store load with the key still absent, and resolves ON', async () => {
      const { store, seam } = toolStore();
      await store.load();
      const corpus = store.corpus();
      const [worldDefault] = corpus.defaults;

      // THE ABSENCE IS THE ASSERTION. A world SETTING preserves key absence - unlike `setFlag`,
      // whose merge resurrects a removed key - and the normalizer is absence-preserving, so a
      // record that never authored the switch must come back without it rather than with a
      // minted `true`. A minted default is indistinguishable from a GM's deliberate choice.
      assert.ok(
        !Object.prototype.hasOwnProperty.call(worldDefault, 'enabled'),
        'a world default that never authored the switch carries no `enabled` key after load'
      );
      assert.ok(
        !Object.prototype.hasOwnProperty.call(
          seam.values.get(SETTING_KEYS.TOOL_SCOPE).defaults[TOOL_ID],
          'enabled'
        ),
        'and the RAW persisted value still has none'
      );

      const [membership] = corpus.membership;
      const resolved = resolveTool(worldDefault, membership);
      assert.equal(resolved.enabled, true, 'absent reads as ENABLED, so no existing world moves');
      assert.equal(resolved.worldEnabled, true);
      assert.equal(resolved.systemEnabled, true);
      assert.equal(isWorldEnabled(worldDefault), true);
      assert.equal(isToolEnabledInWorld(worldDefault), true);
    });

    it('reaches the READ UNION unchanged, so an unmigrated world reads exactly as before', async () => {
      const { store } = toolStore();
      await store.load();
      const union = resolveToolScope(store.corpus(), SYSTEM_ID, [
        { id: TOOL_ID, name: 'Mining Pick', enabled: true },
      ]);
      assert.equal(union[0].enabled, true);
    });

    it('treats a NON-BOOLEAN authored value as absent rather than as an off', () => {
      // Junk is not a world-wide kill switch. The normalizer drops it, and the reader tests
      // `!== false` rather than `=== true`, so both halves agree.
      const [worldDefault] = normalizeToolWorldDefaults([{ id: TOOL_ID, enabled: 'no' }]);
      assert.ok(!Object.prototype.hasOwnProperty.call(worldDefault, 'enabled'));
      assert.equal(isWorldEnabled(worldDefault), true);
    });
  });

  describe('WORLD OFF WINS', () => {
    it('ANDs the two flags in the resolver, and answers each half separately', () => {
      const [worldDefault] = normalizeToolWorldDefaults([{ id: TOOL_ID, enabled: false }]);
      const [membership] = normalizeToolMemberships([
        { entityId: TOOL_ID, systemId: SYSTEM_ID, inherit: {}, enabled: true },
      ]);
      const resolved = resolveTool(worldDefault, membership);
      assert.equal(resolved.enabled, false, 'the AND is what a consumer reads');
      assert.equal(resolved.worldEnabled, false);
      assert.equal(
        resolved.systemEnabled,
        true,
        'the per-system flag still says what the system chose, so an authoring toggle can draw it'
      );
    });

    it('blocks the attempt exactly as an absent or system-disabled Tool does', () => {
      const [worldDefault] = normalizeToolWorldDefaults([{ id: TOOL_ID, enabled: false }]);
      const [membership] = normalizeToolMemberships([
        { entityId: TOOL_ID, systemId: SYSTEM_ID, inherit: {}, enabled: true },
      ]);
      assert.equal(toolAttemptBlockReason(resolveTool(worldDefault, membership)), TOOL_BLOCKED);
    });

    it('survives the read union, where the IN-SYSTEM record otherwise decides `enabled`', () => {
      // THE SEVERE CASE. `unionScopedDefinitions` re-spreads the in-system record last while
      // requirement 36 holds, so a system tool saying `enabled: true` overwrites the resolver's
      // answer. Without the veto over the merged rows the switch would be invisible to every
      // runtime consumer while every resolver test stayed green.
      const corpus = {
        entities: [{ id: TOOL_ID, name: 'Mining Pick' }],
        defaults: [{ id: TOOL_ID, enabled: false }],
        membership: [{ entityId: TOOL_ID, systemId: SYSTEM_ID, inherit: {}, enabled: true }],
      };
      const union = resolveToolScope(corpus, SYSTEM_ID, [
        { id: TOOL_ID, name: 'Mining Pick', enabled: true, label: 'kept' },
      ]);
      assert.equal(union[0].enabled, false, 'world off wins over the in-system record');
      assert.equal(union[0].label, 'kept', 'and nothing else about the merged row moves');
    });
  });

  describe('the veto is a VETO', () => {
    it('never turns a system-disabled Tool back on', () => {
      const corpus = {
        entities: [{ id: TOOL_ID }],
        defaults: [{ id: TOOL_ID, enabled: true }],
        membership: [{ entityId: TOOL_ID, systemId: SYSTEM_ID, inherit: {}, enabled: false }],
      };
      const union = resolveToolScope(corpus, SYSTEM_ID, [
        { id: TOOL_ID, name: 'Mining Pick', enabled: false },
      ]);
      assert.equal(union[0].enabled, false);
    });

    it('answers the SAME ARRAY when no world record is disabled', () => {
      // Object identity matters here for the same reason `scopedEntityReads.js` documents for
      // its unknown-half passthrough: a reallocated array invalidates a memo and counts a build
      // for a result identical to the one it started from.
      const rows = [{ id: TOOL_ID, enabled: true }];
      assert.equal(applyWorldEnabledVeto(rows, [{ id: TOOL_ID }]), rows);
      assert.equal(applyWorldEnabledVeto(rows, []), rows);
    });
  });

  describe('it is a TOOL concept, declared per scope', () => {
    it('leaves the component and essence world defaults without the key', () => {
      const [component] = normalizeComponentWorldDefaults([{ id: TOOL_ID, enabled: false }]);
      assert.ok(
        !('enabled' in component),
        'a component has no enabled flag at any scope, and adversarial input must not mint one'
      );
      assert.ok(!('enabled' in resolveComponent(component, null)));

      const [essence] = normalizeEssenceWorldDefaults([{ id: TOOL_ID, enabled: false }]);
      assert.ok(
        !('enabled' in essence),
        'the essence world defaults declare no master switch, so a persisted field its GM ' +
          'cannot see or clear must not appear'
      );
      // And an essence's resolution is untouched: its per-system flag is still the whole answer.
      const resolved = resolveEssence(essence, {
        entityId: TOOL_ID,
        systemId: SYSTEM_ID,
        inherit: {},
        enabled: true,
      });
      assert.equal(resolved.enabled, true);
      assert.ok(!('worldEnabled' in resolved));
    });

    it('exposes `setWorldEnabled` on the TOOL write family alone', () => {
      const families = ['component', 'essence', 'tool'].map((entityType) =>
        createWorldScopeEntityActions({ entityType, getStore: () => null })
      );
      assert.deepEqual(
        families.map((actions) => 'setWorldEnabled' in actions),
        [false, false, true],
        'the KEY SET is the contract: an action that existed and refused would let a caller ' +
          'conclude the write had landed'
      );
    });
  });

  describe('the write path', () => {
    /**
     * The tool write family over a real store, so a case asserts what actually persists.
     *
     * @returns {Promise<{actions: object, store: object}>}
     */
    async function writeFamily() {
      const { store } = toolStore();
      await store.load();
      return {
        store,
        actions: createWorldScopeEntityActions({ entityType: 'tool', getStore: () => store }),
      };
    }

    it('writes the off, and the resolver reads it', async () => {
      const { actions, store } = await writeFamily();
      assert.equal(await actions.setWorldEnabled(TOOL_ID, false), true);
      const corpus = store.corpus();
      assert.equal(corpus.defaults[0].enabled, false);
      assert.equal(resolveTool(corpus.defaults[0], corpus.membership[0]).enabled, false);
      // AND THE SECTION IT SHARES A RECORD WITH SURVIVES. The write merges over the existing
      // world default rather than replacing it, so flipping the switch must not erase breakage.
      assert.deepEqual(corpus.defaults[0].breakage, { mode: 'breakageChance', breakageChance: 8 });
    });

    it('writes the on again, restoring what each system had already chosen', async () => {
      const { actions, store } = await writeFamily();
      await actions.setWorldEnabled(TOOL_ID, false);
      assert.equal(await actions.setWorldEnabled(TOOL_ID, true), true);
      const corpus = store.corpus();
      assert.equal(corpus.defaults[0].enabled, true);
      assert.equal(
        resolveTool(corpus.defaults[0], corpus.membership[0]).enabled,
        true,
        're-enabling never touched a membership record, so each system keeps its own answer'
      );
    });

    it('refuses a non-boolean and an unknown entity, writing nothing', async () => {
      const { actions, store } = await writeFamily();
      assert.equal(await actions.setWorldEnabled(TOOL_ID, 'off'), false);
      assert.equal(await actions.setWorldEnabled('not-a-tool', false), false);
      assert.equal(await actions.setWorldEnabled('', false), false);
      assert.ok(!('enabled' in store.corpus().defaults[0]));
    });
  });
});
