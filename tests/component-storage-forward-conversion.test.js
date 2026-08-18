/**
 * The FORWARD component Storage Layout Conversion, its eligibility gate, its verification,
 * its compensation, and the step whose failure completes forward (issue 1212).
 *
 * Acceptance items 1, 3, 13, 14, 16, 17, 19, 20, 21, 22 and 23.
 *
 * Every case states the mutation it reddens, because this programme has produced eight
 * vacuous guards and a corpus-destroying implementation that passed 13/13.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  SETTING_KEYS,
} from '../src/config/settings.js';
import {
  COMPONENT_STORAGE_CONVERSIONS,
  ComponentStorageConversionRefusedError,
  componentStorageConversionFor,
  reconcileComponentStorageLayout,
  refuseComponentExtractionForUnsafeSystemIds,
  runForwardComponentStorageConversion,
  unsafeExtractionSystemIds,
} from '../src/systems/componentStorageConversion.js';
import { buildComponentStorageConversionConsentPrompt } from '../src/systems/componentStorageConsentPrompt.js';
import { isDefinitionStorageConversionConsented } from '../src/systems/definitionStorageConsentPrompt.js';
import { reconcileRecipeStorageLayout } from '../src/systems/definitionStorageConversion.js';

import {
  component,
  envelopesFor,
  installComponentStorageWorld,
  LAYOUT_KEY,
  PER_RECORD,
  qualified,
  SINGLE_ARRAY,
  system,
  TARGET_KEY,
} from './helpers/componentStorageWorld.js';
import { instrumentReconcilerCalls } from './helpers/reconcilerCallCounter.js';

const { world } = installComponentStorageWorld();

const MAIN_SOURCE = readFileSync(fileURLToPath(new URL('../src/main.js', import.meta.url)), 'utf8');

/** Two systems, two components each: MORE THAN ONE, and spanning more than one system. */
const CORPUS = () => [
  system('sysA', [component('cA1'), component('cA2')]),
  system('sysB', [component('cB1'), component('cB2')]),
];

/** Every component record key the corpus above describes. */
const CORPUS_KEYS = ['sysA.cA1', 'sysA.cA2', 'sysB.cB1', 'sysB.cB2'];

// ---------------------------------------------------------------------------
// 1. Byte equivalence across the conversion
// ---------------------------------------------------------------------------

describe('the conversion moves the component bytes without touching them', () => {
  it('preserves every field, including one the model does not emit', async () => {
    // *Reddens when:* step 2 drops a record, or the conversion hydrates through
    // `_normalizeComponent`, which would delete `fallbackItemIds`.
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: CORPUS() });
    const before = fixture
      .storedSystems()
      .flatMap((record) => record.components)
      .map((entry) => JSON.stringify(entry))
      .sort();
    assert.ok(before.length > 0, 'a non-empty fixture, or the comparison is vacuous');
    assert.ok(
      before.every((bytes) => bytes.includes('fallbackItemIds')),
      'the pre-conversion bytes really do carry a field the model does not emit'
    );

    await runForwardComponentStorageConversion(fixture.seams);

    const after = fixture
      .storedComponents()
      .map((entry) => JSON.stringify(entry))
      .sort();
    assert.deepEqual(after, before, 'the granular corpus is byte-identical to the nested one');
    assert.deepEqual(fixture.recordKeys(), CORPUS_KEYS);
  });
});

// ---------------------------------------------------------------------------
// 3. The extraction OMITS the key rather than emptying it
// ---------------------------------------------------------------------------

describe('step 4 removes the nested key rather than emptying it', () => {
  it('leaves no `components` key on any stored system', async () => {
    // *Reddens when:* step 4 writes `components: []`, which makes the residual detector's
    // empty and absent arms indistinguishable and permanently disarms its discrimination.
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: CORPUS() });
    await runForwardComponentStorageConversion(fixture.seams);
    for (const record of fixture.storedSystems()) {
      assert.equal(
        Object.hasOwn(record, 'components'),
        false,
        `${record.id} still owns a components key`
      );
    }
    // And the rest of the container survived, which is the whole difference from the recipe
    // conversion's step 4.
    assert.deepEqual(
      fixture.storedSystems().map((record) => record.itemTags),
      [['forged'], ['forged']]
    );
  });
});

// ---------------------------------------------------------------------------
// 13 / 14. Extraction eligibility
// ---------------------------------------------------------------------------

describe('extraction eligibility refuses corpus-wide, and still converts when repaired', () => {
  const DOTTED = () => [
    system('sysA', [component('cA1')]),
    system('sys.dotted', [component('cD1')]),
    system('sysB', [component('cB1')]),
  ];

  it('names the offending ids, writes nothing, and does not revert the target', async () => {
    // *Reddens when:* the gate is omitted — it converts the clean systems and leaves the
    // dotted one nested forever, on a world no layout value can describe.
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: DOTTED() });
    const report = await reconcileComponentStorageLayout(fixture.seams);

    assert.equal(report.action, 'refused');
    assert.deepEqual(report.unsafeSystemIds, ['sys.dotted'], 'the IDS, never a count');
    assert.match(report.error.message, /Recreate or re-import/, 'and the repair action');
    assert.deepEqual(fixture.host.calls, [], 'zero document calls');
    assert.deepEqual(fixture.settingWrites(), [], 'zero setting writes');
    assert.equal(fixture.env.settings.get(LAYOUT_KEY), SINGLE_ARRAY, 'the layout is as found');
    assert.equal(
      fixture.env.settings.get(TARGET_KEY),
      PER_RECORD,
      'and the TARGET is NOT reverted — reverting arms the reclaimer on the next boot'
    );
  });

  it('converts once the offending system is repaired', async () => {
    // The half that stops "always refuse" from passing.
    const repaired = DOTTED().filter((record) => record.id !== 'sys.dotted');
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: repaired });
    const report = await reconcileComponentStorageLayout(fixture.seams);
    assert.equal(report.action, 'converted');
    assert.deepEqual(fixture.recordKeys(), ['sysA.cA1', 'sysB.cB1']);
  });

  it('is scoped to component extraction, so the RECIPE conversion still runs', async () => {
    // *Reddens when:* the refusal is raised in the shared reconciler rather than in the
    // component conversion's own gate — the shipped recipe half then stops working on a world
    // canonical spec says must still receive it.
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: DOTTED() });
    fixture.env.settings.set(SETTING_KEYS.RECIPES, [{ id: 'r1', name: 'Recipe' }]);
    fixture.env.settings.set(
      SETTING_KEYS.RECIPE_STORAGE_TARGET,
      DEFINITION_STORAGE_TARGETS.PER_RECORD
    );

    const recipeReport = await reconcileRecipeStorageLayout(fixture.seams);
    assert.equal(recipeReport.action, 'converted', 'the recipe conversion is unaffected');

    const componentReport = await reconcileComponentStorageLayout(fixture.seams);
    assert.equal(componentReport.action, 'refused', 'and the component one still refuses');
  });

  it('the predicate itself fires on the shape it forbids and not on a valid id', () => {
    // A "must be empty" gate is worthless until you have watched it report something.
    assert.deepEqual(unsafeExtractionSystemIds([{ id: 'a.b' }, { id: 'ok-1' }]), ['a.b']);
    assert.deepEqual(unsafeExtractionSystemIds([{ id: 'ok_1' }, { id: 'OK-2' }]), []);
    assert.doesNotThrow(() => refuseComponentExtractionForUnsafeSystemIds([{ id: 'ok' }]));
    assert.throws(
      () => refuseComponentExtractionForUnsafeSystemIds([{ id: 'a b' }]),
      ComponentStorageConversionRefusedError
    );
  });
});

// ---------------------------------------------------------------------------
// 16. Verification gates step 3
// ---------------------------------------------------------------------------

describe('verification gates step 3, never step 4', () => {
  it('a vetoed record leaves the layout unsettled-free and the container intact', async () => {
    // *Reddens when:* the verification sits between steps 3 and 4 — the layout then claims
    // `perRecord` over a corpus missing a record, and step 4 is all that stands between the
    // world and total loss.
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: CORPUS() });
    fixture.host.vetoedKeys.add(qualified('component.sysB.cB2'));
    const layoutValues = [];
    const seams = {
      ...fixture.seams,
      setSetting: async (key, value) => {
        if (key === LAYOUT_KEY) layoutValues.push(value);
        return fixture.seams.setSetting(key, value);
      },
    };

    const report = await reconcileComponentStorageLayout(seams);

    assert.equal(report.action, 'failed');
    // Either shortfall gate may be the one that raises — the create leg's own
    // `_verifyReturned` sees the veto first — and both are the same refusal: a corpus that
    // fell short must never reach step 3.
    assert.match(report.error.message, /a hook or the server dropped|did not land/);
    assert.ok(
      !layoutValues.includes(PER_RECORD),
      'the layout never read perRecord at any point'
    );
    assert.equal(
      fixture.documentExists(LAYOUT_KEY),
      false,
      'and the layout document it created is gone again'
    );
    for (const record of fixture.storedSystems()) {
      assert.equal(Object.hasOwn(record, 'components'), true, 'the container is INTACT');
    }
  });

  it('catches a shortfall the per-leg COUNT check is blind to', async () => {
    // The isolating case for the id-containment verification itself, and it needs its own
    // fixture: a vetoed create is caught by the create leg's OWN short-return check before
    // `_verifyEveryRecordLanded` ever runs, so moving that verification past step 3 changes
    // nothing on the vetoed world and the assertion above would pass either way.
    //
    // The shape a count cannot see is a record the differential SKIPPED as already stored,
    // whose document then disappears — another client's delete, or a partially reclaimed
    // resume. No leg was asked for it, so no leg can return short for it.
    //
    // *Reddens when:* the verification sits between steps 3 and 4 — the layout then claims
    // `perRecord` over a corpus that is provably missing a record.
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: PER_RECORD,
      systems: CORPUS(),
      // Already stored, byte-identical, so `skipUnchanged` omits it from every leg.
      records: envelopesFor('sysA', [component('cA1')]),
    });
    let created = 0;
    const vanishing = () => {
      if (created > 0) {
        for (const [id, document] of fixture.host.collection.documents) {
          if (document.key === qualified('component.sysA.cA1')) {
            fixture.host.collection.documents.delete(id);
          }
        }
      }
      return fixture.host.collection;
    };
    const documentClass = {
      ...fixture.host.documentClass,
      createDocuments: async (data, options) => {
        const result = await fixture.host.documentClass.createDocuments(data, options);
        created += 1;
        return result;
      },
    };
    const layoutValues = [];
    const report = await reconcileComponentStorageLayout({
      ...fixture.seams,
      collection: vanishing,
      documentClass: () => documentClass,
      setSetting: async (key, value) => {
        if (key === LAYOUT_KEY) layoutValues.push(value);
        return fixture.seams.setSetting(key, value);
      },
    });

    assert.equal(report.action, 'failed');
    assert.match(report.error.message, /did not land/, 'the id-containment check is what raised');
    assert.ok(!layoutValues.includes(PER_RECORD), 'the layout never claimed perRecord');
  });

  it('a resume converges to the uninterrupted result once the veto is lifted', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: CORPUS() });
    fixture.host.vetoedKeys.add(qualified('component.sysB.cB2'));
    await reconcileComponentStorageLayout(fixture.seams);
    fixture.host.vetoedKeys.clear();

    const report = await reconcileComponentStorageLayout(fixture.seams);
    assert.equal(report.action, 'converted');
    assert.deepEqual(fixture.recordKeys(), CORPUS_KEYS, 'the pre-indexed survivors converge');
  });
});

// ---------------------------------------------------------------------------
// 17. A refusal writes nothing and does not revert the target
// ---------------------------------------------------------------------------

describe('a refusal writes nothing, and boot two does not destroy the corpus', () => {
  it('refuses an empty source over a non-empty index, and survives the next boot', async () => {
    // *Reddens when:* the refusal is routed through the generic compensation catch — the
    // target then reverts onto `singleArray`, which is the one value the reclaimer is armed
    // by, and boot two deletes every document.
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: PER_RECORD,
      systems: [system('sysA', [])],
      records: envelopesFor('sysA', [component('cA1'), component('cA2')]),
    });

    const report = await reconcileComponentStorageLayout(fixture.seams);
    assert.equal(report.action, 'refused');
    assert.deepEqual(fixture.settingWrites(), [], 'zero setting writes');
    assert.equal(fixture.env.settings.get(LAYOUT_KEY), SINGLE_ARRAY);
    assert.equal(fixture.env.settings.get(TARGET_KEY), PER_RECORD, 'both keys as found');

    const second = await reconcileComponentStorageLayout(fixture.seams);
    assert.equal(second.action, 'refused', 'boot two refuses the same way');
    assert.deepEqual(fixture.recordKeys(), ['sysA.cA1', 'sysA.cA2'], 'and every document lives');
  });
});

// ---------------------------------------------------------------------------
// 19. Forward compensation restores key PRESENCE
// ---------------------------------------------------------------------------

describe('forward compensation restores key PRESENCE, not a value', () => {
  it('deletes the layout document it created on a never-converted world', async () => {
    // *Reddens when:* the forward direction inherits the reverse's value-restoring
    // compensation — the GM is then told the world is untouched while a fabricated layout
    // document sits on it, spending an envelope.
    const fixture = await world({
      layout: SINGLE_ARRAY,
      target: PER_RECORD,
      systems: CORPUS(),
      layoutDocument: false,
    });
    assert.equal(fixture.documentExists(LAYOUT_KEY), false, 'precondition: no layout document');
    fixture.host.vetoedKeys.add(qualified('component.sysA.cA1'));

    await reconcileComponentStorageLayout(fixture.seams);

    assert.equal(
      fixture.documentExists(LAYOUT_KEY),
      false,
      'it does not EXIST afterwards — not merely that it holds singleArray'
    );
    assert.ok(fixture.recordKeys().length > 0, 'the debris survives for the next boot');
    for (const record of fixture.storedSystems()) {
      assert.equal(Object.hasOwn(record, 'components'), true, 'the container is untouched');
    }
  });

  it('restores the VALUE when the document was already there', async () => {
    const fixture = await world({
      layout: DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
      target: PER_RECORD,
      systems: CORPUS(),
    });
    assert.equal(fixture.documentExists(LAYOUT_KEY), true, 'precondition: it exists');
    fixture.host.vetoedKeys.add(qualified('component.sysA.cA1'));

    await reconcileComponentStorageLayout(fixture.seams);

    assert.equal(fixture.documentExists(LAYOUT_KEY), true, 'it still exists');
    assert.equal(fixture.env.settings.get(LAYOUT_KEY), DEFINITION_STORAGE_LAYOUTS.UNSETTLED);
  });
});

// ---------------------------------------------------------------------------
// 20. Step 4's failure completes forward
// ---------------------------------------------------------------------------

describe('step 4 completes forward and is never compensated', () => {
  it('keeps the layout at perRecord and leaves the residual for the next boot', async () => {
    // *Reddens when:* the step-4 failure is routed to the compensation catch — the layout then
    // reverts over a corpus that is already granular.
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: CORPUS() });
    const seams = {
      ...fixture.seams,
      setSetting: async (key, value) => {
        if (key === SETTING_KEYS.CRAFTING_SYSTEMS) throw new Error('socket lost');
        return fixture.seams.setSetting(key, value);
      },
    };

    const report = await reconcileComponentStorageLayout(seams);

    assert.equal(report.action, 'converted', 'it COMPLETED');
    assert.ok(report.reclaimFailure instanceof Error, 'and reported the residual');
    assert.equal(fixture.env.settings.get(LAYOUT_KEY), PER_RECORD);
    assert.equal(fixture.env.settings.get(TARGET_KEY), PER_RECORD, 'the target is unchanged');
    for (const record of fixture.storedSystems()) {
      assert.equal(Object.hasOwn(record, 'components'), true, 'the residual is there to find');
    }

    // The next boot's detector finds it and applies the byte-equal arm.
    const next = await reconcileComponentStorageLayout(fixture.seams);
    assert.equal(next.action, 'settled');
    for (const record of fixture.storedSystems()) {
      assert.equal(Object.hasOwn(record, 'components'), false, 'and clears it silently');
    }
  });
});

// ---------------------------------------------------------------------------
// 21. The interruption windows, counter-driven
// ---------------------------------------------------------------------------

describe('the interruption windows, over a multi-record multi-system fixture', () => {
  /**
   * The counted set is stated rather than implied: every `setSetting` the reconciler issues,
   * every bulk `Setting` document call, and every single-document `Document#delete()`.
   *
   * @param {object} fixture
   * @param {number} abandonAt
   * @returns {Promise<string[]>} the calls that were reached.
   */
  async function abandonAtCall(fixture, abandonAt) {
    const instrumented = instrumentReconcilerCalls(fixture.seams, { abandonAt });
    void reconcileComponentStorageLayout(instrumented.seams);
    await instrumented.reachedAbandonment;
    return instrumented.calls;
  }

  it('pins the exact clean-run total, and it is INVARIANT across corpus sizes', async () => {
    // *Reddens when:* the counter is moved inside a per-record loop — the pre-step-1 and
    // post-step-3 windows become inexpressible and the total scales with the corpus.
    const small = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: CORPUS() });
    const smallCalls = instrumentReconcilerCalls(small.seams);
    await reconcileComponentStorageLayout(smallCalls.seams);
    assert.deepEqual(smallCalls.calls, [
      `setSetting:${LAYOUT_KEY}`,
      'createDocuments:4',
      `setSetting:${LAYOUT_KEY}`,
      `setSetting:${SETTING_KEYS.CRAFTING_SYSTEMS}`,
    ]);

    const wide = await world({
      layout: SINGLE_ARRAY,
      target: PER_RECORD,
      systems: [
        system('sysA', Array.from({ length: 25 }, (_, index) => component(`cA${index}`))),
        system('sysB', Array.from({ length: 25 }, (_, index) => component(`cB${index}`))),
        system('sysC', Array.from({ length: 25 }, (_, index) => component(`cC${index}`))),
      ],
    });
    const wideCalls = instrumentReconcilerCalls(wide.seams);
    await reconcileComponentStorageLayout(wideCalls.seams);
    assert.equal(
      wideCalls.calls.length,
      smallCalls.calls.length,
      'a 75-component corpus costs the same number of calls as a 4-component one'
    );
  });

  it('W1 — abandoned before step 1: nothing has moved at all', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: CORPUS() });
    await abandonAtCall(fixture, 1);
    assert.equal(fixture.env.settings.get(LAYOUT_KEY), SINGLE_ARRAY);
    assert.deepEqual(fixture.recordKeys(), []);
  });

  it('W2 — abandoned in step 2: the layout is unsettled and the container is intact', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: CORPUS() });
    await abandonAtCall(fixture, 2);
    assert.equal(
      fixture.env.settings.get(LAYOUT_KEY),
      DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
      'a THROWING seam would have compensated this back to singleArray and tested nothing'
    );
    for (const record of fixture.storedSystems()) {
      assert.equal(Object.hasOwn(record, 'components'), true);
    }
  });

  it('W4 — abandoned in step 4: the components are granular and the residual survives', async () => {
    const fixture = await world({ layout: SINGLE_ARRAY, target: PER_RECORD, systems: CORPUS() });
    await abandonAtCall(fixture, 4);
    assert.equal(fixture.env.settings.get(LAYOUT_KEY), PER_RECORD);
    assert.deepEqual(fixture.recordKeys(), CORPUS_KEYS);
    for (const record of fixture.storedSystems()) {
      assert.equal(Object.hasOwn(record, 'components'), true, 'step 4 never landed');
    }

    // And a fresh reconciler over the same mutated world converges.
    const resumed = await reconcileComponentStorageLayout(fixture.seams);
    assert.equal(resumed.action, 'settled');
    assert.deepEqual(fixture.recordKeys(), CORPUS_KEYS);
  });
});

// ---------------------------------------------------------------------------
// 22 / 23. Consent, independence, and the completion notice
// ---------------------------------------------------------------------------

describe('consent gates the forward component conversion, independently of the recipe one', () => {
  it('emits complete sentences with the non-destructive choice pre-selected', () => {
    // *Reddens when:* the destructive choice is pre-selected.
    const config = buildComponentStorageConversionConsentPrompt();
    assert.match(config.content, /empty component library/, 'it names the loss it causes');
    assert.match(config.content, /Component Storage Arrangement/, 'and the mitigation control');
    assert.match(config.content, /Nested inside each crafting system/, 'by its shipped label');
    assert.equal(config.default, 'cancel');
    assert.equal(config.buttons[0].default, true, 'the non-destructive button is pre-selected');
    assert.equal(config.buttons[0].action, 'cancel');
    assert.equal(config.buttons[1].default, false);
    for (const token of ['singleArray', 'perRecord', 'unsettled']) {
      assert.equal(config.content.includes(token), false, `${token} leaks into the prompt`);
      assert.equal(config.title.includes(token), false, `${token} leaks into the title`);
    }
  });

  it('reads a decline, a dismissal and an unanswered prompt as REFUSAL', () => {
    // *Reddens when:* dismissal is read as consent (`result === false`).
    assert.equal(isDefinitionStorageConversionConsented('convert'), true);
    for (const answer of [false, null, undefined, '', 'cancel']) {
      assert.equal(isDefinitionStorageConversionConsented(answer), false, `${answer} converts`);
    }
  });

  it('the prompt opens INSIDE the primary-GM gate', () => {
    const method = mainMethodSource('  async _reconcileDefinitionStorage(');
    const gate = method.indexOf('if (game.users?.activeGM?.id !== game.user?.id) return;');
    const ask = method.indexOf('await this._consentToForwardComponentStorageConversion()');
    const convert = method.indexOf('reconcileComponentStorageLayout(');
    assert.ok(gate > -1 && ask > -1 && convert > -1);
    assert.ok(gate < ask, 'the prompt opens inside the gate, never on every connected client');
    assert.ok(ask < convert, 'and before anything converts');
  });

  it('the two consents are INDEPENDENT in both directions', () => {
    // *Reddens when:* a shared consent flag couples the two — the shipped method-level early
    // `return` on decline is exactly that defect, and it is what this asserts is gone.
    const method = mainMethodSource('  async _reconcileDefinitionStorage(');
    const recipeAsk = method.indexOf('_consentToForwardRecipeStorageConversion()');
    const recipeDecline = method.indexOf('await this._revertDeclinedRecipeStorageTarget();');
    const componentAsk = method.indexOf('_consentToForwardComponentStorageConversion()');
    const componentDecline = method.indexOf('await this._revertDeclinedComponentStorageTarget();');
    assert.ok(recipeAsk > -1 && componentAsk > -1, 'both classes ask');
    assert.ok(recipeDecline > -1 && componentDecline > -1, 'and both repair their own decline');
    assert.ok(
      recipeDecline < componentAsk,
      'a RECIPE decline is scoped above the component ask, so it cannot skip it'
    );
    assert.ok(
      componentAsk < componentDecline,
      'and the component decline is scoped to its own block'
    );
    // The mechanical detector for the defect: no `return` may sit between the recipe decline
    // and the component ask, because one there re-creates the coupling exactly.
    const between = method.slice(recipeDecline, componentAsk);
    assert.equal(between.includes('return'), false, 'no early return couples the two');
  });

  it('the forward completion notice differs from the reverse one and names the mitigation', () => {
    // *Reddens when:* the forward path reuses the reverse branch — `Converted` reads "it is
    // now safe to downgrade", the exact inverse of what just happened.
    const strings = JSON.parse(
      readFileSync(fileURLToPath(new URL('../lang/en.json', import.meta.url)), 'utf8')
    ).FABRICATE.Settings.ComponentStorageTarget;
    assert.notEqual(strings.ConvertedToPerRecord, strings.Converted);
    assert.match(strings.ConvertedToPerRecord, /empty component library/);
    assert.match(strings.ConvertedToPerRecord, /Component Storage Arrangement/);
    assert.match(strings.Converted, /safe to downgrade/, 'the reverse says the opposite');
    const announce = mainMethodSource('  _announceCompletedComponentStorageConversion(');
    assert.ok(announce.includes('ConvertedToPerRecord'), 'the forward has its own key');
    assert.ok(
      announce.includes('COMPONENT_STORAGE_CONVERSION_DIRECTIONS.FORWARD'),
      'selected by the direction the conversion REPORTED, never guessed from the target'
    );
  });

  it('no component storage string interpolates a layout or target token', () => {
    const strings = JSON.parse(
      readFileSync(fileURLToPath(new URL('../lang/en.json', import.meta.url)), 'utf8')
    ).FABRICATE.Settings.ComponentStorageTarget;
    for (const [name, value] of Object.entries(strings)) {
      for (const token of ['singleArray', 'perRecord', 'unsettled']) {
        assert.equal(value.includes(token), false, `${name} leaks "${token}"`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The conversion table is DECLARED, not derived
// ---------------------------------------------------------------------------

describe('the conversion table is a frozen declaration', () => {
  it('claims exactly the four transitions this build can perform', () => {
    // *Reddens when:* the lookup becomes a formula — it would then silently start claiming a
    // conversion the moment a value was added to the target enumeration.
    assert.equal(Object.isFrozen(COMPONENT_STORAGE_CONVERSIONS), true);
    assert.deepEqual(
      COMPONENT_STORAGE_CONVERSIONS.map((row) => `${row.from}->${row.to}`),
      [
        'perRecord->singleArray',
        'unsettled->singleArray',
        'singleArray->perRecord',
        'unsettled->perRecord',
      ]
    );
    assert.equal(componentStorageConversionFor('singleArray', 'singleArray'), null);
    assert.equal(componentStorageConversionFor('nonsense', 'perRecord'), null);
  });
});

/**
 * The source of one `src/main.js` method, bounded at the next method declaration.
 *
 * `src/main.js` imports the global stylesheet and the Svelte UI roots at module load, so it
 * cannot be imported under `node --test`. Position is the property being asserted, and no
 * runtime observation of a module that cannot be loaded could make it stronger.
 *
 * @param {string} declaration the method's opening line, including its indentation.
 * @returns {string}
 */
function mainMethodSource(declaration) {
  const start = MAIN_SOURCE.indexOf(declaration);
  assert.ok(start > -1, `main.js declares no \`${declaration}\``);
  const end = MAIN_SOURCE.indexOf('\n  }\n', start);
  assert.ok(end > start, `main.js never closes \`${declaration}\``);
  return MAIN_SOURCE.slice(start, end);
}
