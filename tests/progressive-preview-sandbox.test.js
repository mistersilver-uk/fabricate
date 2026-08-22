/**
 * The progressive check's PREVIEW SANDBOX (issue 1097).
 *
 * `progressive.preview.difficulties` is the ordered list a GM types into the Checks
 * Studio's odds histogram to see what a progressive check would award. It is scratch state
 * for one experiment, not authored configuration, and every rule below is what makes that
 * distinction real rather than a claim in a comment:
 *
 *  1. NO ENGINE PATH READS IT — proved by deleting the key from a live award and getting a
 *     byte-identical result, with a negative control showing the same harness DOES see a
 *     change when a key the engine really reads is deleted.
 *  2. READINESS NEVER VALIDATES IT — a nonsensical order raises no issue and badges no
 *     section, proved against a control whose issue set is non-empty for another reason.
 *  3. EXPORT STRIPS IT, from all three activity checks, by DELETING the key.
 *  4. EVERY ALLOWLIST REBUILD EMITS IT — the persistence normalizer here, the manager
 *     root's draft clone in `tests/components/manager-mounted.test.js`, and the store's
 *     projection and saver below. Issue 1095 shipped a defect of exactly this class: a key
 *     that persisted correctly and was never read at roll time, because a THIRD rebuild did
 *     not emit it.
 *  5. ABSENCE IS NOT EMPTINESS, and the ORDER IS THE DATUM.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

let generatedId = 0;
globalThis.foundry = {
  utils: { randomID: () => `sandbox-${(generatedId += 1)}`, getProperty: () => undefined },
};
globalThis.game = { user: { isGM: true }, system: { id: 'dnd5e' }, actors: [] };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { buildExportPayload } = await import('../src/systems/CraftingSystemExporter.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { evaluateCheckReadiness } = await import(
  '../src/ui/svelte/apps/manager/checks/checksReadiness.js'
);
const { createAdminStore } = await import('../src/ui/svelte/stores/adminStore.js');
const { createServices, makeSystem } = await import('./helpers/adminStoreServices.js');
const {
  formatPreviewDifficulties,
  normalizePreviewSandbox,
  parsePreviewDifficulties,
} = await import('../src/systems/progressiveCheckSandbox.js');

const manager = () => new CraftingSystemManager({ getRecipes: () => [] });

// ── The derivation ────────────────────────────────────────────────────────────────────

describe('the sandbox derivation', () => {
  it('parses an order in the order it was typed, and does NOT sort it', () => {
    // Deliberately descending, and deliberately not already sorted either way: an
    // implementation that sorted would return the same array for both of these, and the
    // order is the whole datum — it decides which result is paid for first.
    assert.deepEqual(parsePreviewDifficulties('14, 6, 9'), [14, 6, 9]);
    assert.deepEqual(parsePreviewDifficulties('6, 14, 9'), [6, 14, 9]);
  });

  it('accepts commas, spaces or both as the separator', () => {
    for (const typed of ['6,9,14', '6 9 14', '6, 9, 14', ' 6 ,9,  14 ']) {
      assert.deepEqual(parsePreviewDifficulties(typed), [6, 9, 14], typed);
    }
  });

  it('KEEPS a negative and a zero: neither is a validation target', () => {
    // `resolveProgressiveAward` skips a cost below 1, so both are meaningful experiments
    // about how the award loop behaves — refusing to store them would hide that behaviour
    // on the one screen built to show it.
    assert.deepEqual(parsePreviewDifficulties('-4, 0, 6'), [-4, 0, 6]);
  });

  it('does NOT store a token that cannot be a number, because JSON would rewrite it', () => {
    // `JSON.stringify(NaN)` is `null` and `Number(null)` is `0` — a perfectly finite cost.
    // Storing a NaN would silently turn the GM's experiment into a different one after a
    // reload, which is worse than not storing the token at all.
    assert.deepEqual(parsePreviewDifficulties('6, banana, 9'), [6, 9]);
    assert.deepEqual(parsePreviewDifficulties('nonsense'), []);
  });

  it('renders a stored order back into field text', () => {
    assert.equal(formatPreviewDifficulties([6, 9, 14, 40]), '6, 9, 14, 40');
    assert.equal(formatPreviewDifficulties([]), '');
    assert.equal(formatPreviewDifficulties(null), '');
  });

  it('distinguishes an ABSENT sandbox from an authored EMPTY one', () => {
    assert.equal(normalizePreviewSandbox(undefined), null, 'never run');
    assert.equal(normalizePreviewSandbox(null), null);
    assert.equal(normalizePreviewSandbox({}), null, 'a block with no list is not a list');
    assert.equal(normalizePreviewSandbox({ difficulties: 'nope' }), null);
    assert.deepEqual(
      normalizePreviewSandbox({ difficulties: [] }),
      { difficulties: [] },
      'an authored empty order is a real state and survives'
    );
  });
});

// ── Rebuild 1: the persistence normalizer, shared by all three activity checks ─────────

describe('the persistence normalizer emits it', () => {
  const SANDBOX = { difficulties: [6, 9, 14, 40] };

  it('carries the order through the crafting, salvage AND gathering progressive blocks', () => {
    // All three delegate to `_normalizeProgressiveCraftingCheck`, so this is one emit with
    // three callers rather than three chances to forget — which is exactly why it is
    // asserted for all three.
    const mgr = manager();
    const system = mgr._normalizeSystem({
      id: 'sys-sandbox',
      craftingCheck: { progressive: { rollFormula: '1d20', preview: SANDBOX } },
      salvageCraftingCheck: { progressive: { rollFormula: '1d20', preview: SANDBOX } },
      gatheringCraftingCheck: { progressive: { rollFormula: '1d20', preview: SANDBOX } },
    });
    for (const key of ['craftingCheck', 'salvageCraftingCheck', 'gatheringCraftingCheck']) {
      assert.deepEqual(
        system[key].progressive.preview,
        SANDBOX,
        `${key}.progressive.preview survived the allowlist rebuild`
      );
    }
  });

  it('is IDEMPOTENT: normalizing an already-normalized system keeps it', () => {
    // The one that would catch a rebuild emitting from a raw-only field: a system is
    // re-normalized on every load and on every save.
    const mgr = manager();
    const once = mgr._normalizeSystem({
      id: 'sys-sandbox',
      craftingCheck: { progressive: { preview: SANDBOX } },
    });
    const twice = mgr._normalizeSystem(once);
    assert.deepEqual(twice.craftingCheck.progressive.preview, SANDBOX);
  });

  it('leaves the KEY ABSENT when no experiment has been run', () => {
    const progressive = manager()._normalizeProgressiveCraftingCheck({ rollFormula: '1d20' });
    assert.ok(
      !('preview' in progressive),
      'absence is a state: an emitted empty list would claim an experiment was authored'
    );
  });

  it('preserves an authored EMPTY order rather than collapsing it to absent', () => {
    const progressive = manager()._normalizeProgressiveCraftingCheck({
      preview: { difficulties: [] },
    });
    assert.deepEqual(progressive.preview, { difficulties: [] });
  });

  it('preserves the ORDER and drops nothing that is a number', () => {
    const progressive = manager()._normalizeProgressiveCraftingCheck({
      preview: { difficulties: [14, -2, 0, 6] },
    });
    assert.deepEqual(progressive.preview.difficulties, [14, -2, 0, 6]);
  });
});

// ── Rebuild 2: the store's projection and its saver ───────────────────────────────────

/**
 * A store over ONE system, with a real `updateSystem` that normalizes through the manager.
 *
 * Built on the shared `adminStoreServices` fixture rather than a fresh factory — Sonar
 * counts `tests/**` for duplication — with only the system-manager seam replaced, because
 * that fixture's manager has no `updateSystem` and the write path is half of what is under
 * test here.
 *
 * @param {object} craftingCheck The system's crafting check block.
 * @returns {Promise<{store: object, system: object, writes: Array<object>}>} The fixture.
 */
async function storeOverCheck(craftingCheck) {
  const mgr = manager();
  const system = mgr._normalizeSystem({ id: 'sys1', resolutionMode: 'progressive', craftingCheck });
  const writes = [];
  const services = createServices(system, [], [], {
    getCraftingSystemManager: () => ({
      getSystems: () => [system],
      getSystem: (id) => (id === system.id ? system : null),
      getItems: () => [],
      updateSystem: async (id, updates) => {
        writes.push(updates);
        Object.assign(system, mgr._normalizeSystem({ ...system, ...updates }));
        return system;
      },
    }),
  });
  const store = createAdminStore(services);
  await store.selectSystem('sys1');
  return { store, system, writes };
}

describe('the store projects it and writes it back', () => {
  it('PROJECTS it onto selectedSystem, or the panel could not see it', async () => {
    // `_buildSelectedSystemViewData` is a hand-built allowlist: a field omitted there is
    // invisible to the UI however correctly the normalizer behaves.
    const { store } = await storeOverCheck({
      progressive: { rollFormula: '1d20', preview: { difficulties: [6, 9, 14, 40] } },
    });
    assert.deepEqual(
      get(store.viewState).selectedSystem.craftingCheck.progressive.preview,
      { difficulties: [6, 9, 14, 40] }
    );
  });

  it('projects ABSENCE as absence', async () => {
    const { store } = await storeOverCheck({ progressive: { rollFormula: '1d20' } });
    assert.ok(
      !('preview' in get(store.viewState).selectedSystem.craftingCheck.progressive),
      'a projected empty list would make every never-experimented check look authored'
    );
  });

  it('SAVES it, and spreads the rest of the check block while doing so', async () => {
    // `updateSystem` shallow-merges the TOP level only, so a saver that did not spread
    // `existing` would drop every sibling of `progressive` and let the normalizer
    // re-default them — silent data loss dressed as a sandbox edit.
    const { store, system, writes } = await storeOverCheck({
      progressive: { rollFormula: '1d20' },
      simple: { rollFormula: '1d20 + 2', dc: 17 },
      consumption: { consumeIngredientsOnFail: false },
    });
    await store.saveCraftingCheckProgressive({
      awardMode: 'equal',
      rollFormula: '1d20',
      checkBreakage: { triggers: [] },
      preview: { difficulties: [6, 9] },
    });
    assert.deepEqual(writes.at(-1).craftingCheck.progressive.preview, { difficulties: [6, 9] });
    assert.equal(system.craftingCheck.simple.dc, 17, 'the sibling slot survived');
    assert.equal(
      system.craftingCheck.consumption.consumeIngredientsOnFail,
      false,
      'and so did the sibling policy the normalizer would otherwise re-default to true'
    );
    assert.deepEqual(system.craftingCheck.progressive.preview, { difficulties: [6, 9] });
  });
});

// ── Rule 1: the engine never reads it ─────────────────────────────────────────────────

describe('the engine never reads it', () => {
  /**
   * A progressive crafting award through the ENGINE's own resolver.
   *
   * @param {object} progressive The system's `craftingCheck.progressive` block.
   * @returns {object} The resolved result groups.
   */
  function award(progressive) {
    const system = {
      id: 'sys-engine',
      resolutionMode: 'progressive',
      craftingCheck: { enabled: true, progressive },
      components: [
        { id: 'c-a', difficulty: 4 },
        { id: 'c-b', difficulty: 4 },
        { id: 'c-c', difficulty: 4 },
      ],
    };
    const service = new ResolutionModeService({
      getSystem: (id) => (id === system.id ? system : null),
    });
    const recipe = { id: 'r1', craftingSystemId: 'sys-engine', allowPlayerResultReorder: false };
    const step = {
      id: 'step-1',
      resultGroups: [
        {
          id: 'rg-1',
          results: [
            { id: 'res-a', componentId: 'c-a' },
            { id: 'res-b', componentId: 'c-b' },
            { id: 'res-c', componentId: 'c-c' },
          ],
        },
      ],
    };
    // 8 against three costs of 4 is chosen to DISCRIMINATE the award mode: `exceed` needs
    // a strict `>` and stops after one, `equal` pays for exactly two. A value the two modes
    // agree on would make the negative control below vacuous.
    return service.resolveResultGroups({ recipe, step, checkResult: { value: 8 } });
  }

  const AUTHORED = {
    awardMode: 'exceed',
    rollFormula: '1d20',
    // A sandbox order that describes a COMPLETELY different world from the components
    // above: three costs of 4 against four costs starting at 100. If any engine path read
    // it, the award below could not stay the same.
    preview: { difficulties: [100, 200, 300, 400] },
  };

  it('produces the SAME award with the key present and with it deleted', () => {
    const withSandbox = award({ ...AUTHORED });
    const withoutSandbox = award({ awardMode: AUTHORED.awardMode, rollFormula: '1d20' });
    assert.deepEqual(
      withoutSandbox,
      withSandbox,
      'deleting the sandbox changes no engine behaviour, which is what makes it scratch'
    );
    assert.deepEqual(
      withSandbox.meta.awardedResultIds,
      ['res-a'],
      'and the award is a real one: 8 strictly exceeds the first cost of 4 and no more'
    );
  });

  it('NEGATIVE CONTROL: the same harness DOES see a key the engine really reads', () => {
    // Without this, "deleting the sandbox changed nothing" would be indistinguishable from
    // a harness that cannot see any change at all. `awardMode` is read one line away from
    // where `preview` would have to be read, and deleting it moves the award.
    const withMode = award({ ...AUTHORED });
    const withoutMode = award({ rollFormula: '1d20', preview: AUTHORED.preview });
    assert.notDeepEqual(
      withoutMode.meta.awardedResultIds,
      withMode.meta.awardedResultIds,
      'dropping awardMode falls back to `equal`, which pays for a second result at exactly 8'
    );
  });
});

// ── Rule 2: readiness never validates it ──────────────────────────────────────────────

describe('readiness never validates it', () => {
  const NONSENSE = { difficulties: [-40, 0, 9999] };

  it('raises no issue for a nonsensical order, and none for an empty one either', () => {
    const clean = { rollFormula: '1d20 + 4', checkBreakage: { triggers: [] } };
    const baseline = evaluateCheckReadiness(clean, { mode: 'progressive' });
    assert.deepEqual(baseline.issues, [], 'the control check is genuinely clean to begin with');

    for (const preview of [NONSENSE, { difficulties: [] }]) {
      const readiness = evaluateCheckReadiness({ ...clean, preview }, { mode: 'progressive' });
      assert.deepEqual(
        readiness.issues,
        [],
        'a sandbox order is an experiment; a GM must be free to type a nonsensical one'
      );
      assert.deepEqual(readiness.checks, baseline.checks, 'and it adds no readiness CHECK row');
    }
  });

  it('NEGATIVE CONTROL: the same evaluator DOES raise an issue on this check shape', () => {
    const readiness = evaluateCheckReadiness(
      { rollFormula: '', checkBreakage: { triggers: [] }, preview: NONSENSE },
      { mode: 'progressive' }
    );
    assert.ok(
      readiness.issues.some((issue) => issue.id === 'noRollFormula'),
      'so "no issue" above is a fact about the sandbox, not about a silent evaluator'
    );
  });
});

// ── Rule 3: export strips it ──────────────────────────────────────────────────────────

describe('export strips it', () => {
  /**
   * @returns {object} A normalized system carrying a sandbox on all three checks.
   */
  function systemWithSandbox() {
    return manager()._normalizeSystem({
      id: 'sys-export',
      name: 'Exported',
      craftingCheck: { progressive: { rollFormula: '1d20', preview: { difficulties: [6, 9] } } },
      salvageCraftingCheck: { progressive: { preview: { difficulties: [1] } } },
      gatheringCraftingCheck: { progressive: { preview: { difficulties: [2] } } },
    });
  }

  it('DELETES the key from every activity check, rather than emptying it', () => {
    const source = systemWithSandbox();
    const payload = buildExportPayload(source, [], '1.0.0');
    for (const key of ['craftingCheck', 'salvageCraftingCheck', 'gatheringCraftingCheck']) {
      assert.ok(
        !('preview' in payload.system[key].progressive),
        `${key} carries no sandbox into a distributed system`
      );
    }
    // Emptying rather than deleting would be a different lie: an import could not tell an
    // exported experiment from one that was never run.
    assert.deepEqual(
      source.craftingCheck.progressive.preview,
      { difficulties: [6, 9] },
      'and the GM keeps their own experiment — the export works on a clone'
    );
  });

  it('leaves the rest of the progressive block alone', () => {
    const payload = buildExportPayload(systemWithSandbox(), [], '1.0.0');
    assert.equal(payload.system.craftingCheck.progressive.rollFormula, '1d20');
    assert.equal(payload.system.craftingCheck.progressive.awardMode, 'equal');
  });
});
