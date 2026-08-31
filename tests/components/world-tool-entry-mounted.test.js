/**
 * The world Tool entry, mounted (issue 1373, epic 1357).
 *
 * ## What this suite is FOR
 *
 * Two gaps this screen shipped with, both of which read as complete from the markup and are not:
 *
 *  1. THE WORLD MASTER SWITCH had no control at all. The Overview tab authored identity and
 *     nothing else, so the one decision that reaches every crafting system at once - is this Tool
 *     on? - was unauthorable from the screen that owns the world record.
 *  2. THE BREAKAGE TAB SET A MODE AND NEVER ITS VALUE. The mode cards write `breakage.mode`, so a
 *     world default reading `Breakage chance` was pinned to whatever `breakageChance` the record
 *     happened to be seeded with. A GM could pick the rule and not the number.
 *
 * The scope is built from the REAL projection rather than a hand-built literal, because
 * `worldEnabled` is answered inside `buildEntry` from the world defaults - a fixture that stamped
 * the flag itself would keep passing after the read moved and would pin nothing.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { projectWorldScopeEntity } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-tool-entry-',
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte',
  rawModules: [
    'src/config/flags.js',
    'src/migration/worldScopeEntityGrouping.js',
    'src/models/Ingredient.js',
    'src/models/IngredientGroup.js',
    'src/models/Tool.js',
    'src/models/match/matchTypes.js',
    'src/models/reconstructibleDefaults.js',
    'src/models/toolDisplay.js',
    'src/systems/componentScope.js',
    'src/systems/essenceScope.js',
    'src/systems/scopedDefinitionStore.js',
    'src/systems/scopedDefinitions.js',
    'src/systems/toolScope.js',
    'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
    'src/ui/svelte/apps/manager/scoped/worldToolStudio.js',
    'src/ui/svelte/apps/manager/tools/toolStudio.js',
    'src/ui/svelte/components/stepperLabels.js',
    'src/ui/svelte/stores/worldScopeProjection.js',
    'src/ui/svelte/util/chanceColorScale.js',
    'src/ui/svelte/util/dropRateTier.js',
    'src/ui/svelte/util/foundryBridge.js',
    'src/utils/rollFormulaRollability.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/ArmedDangerButton.svelte',
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EditorTabs.svelte',
    'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
    'src/ui/svelte/apps/manager/ExplainerCard.svelte',
    'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedEntityPreview.svelte',
    'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldToolEntryPage.svelte',
    'src/ui/svelte/components/ChanceSlider.svelte',
    'src/ui/svelte/apps/manager/IconFactRow.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/Stepper.svelte',
  ],
});

const SYSTEMS = [
  { id: 'sys-forge', name: 'Forge' },
  { id: 'sys-alchemy', name: 'Alchemy' },
];

/**
 * The tool scope, projected for real, with one entity whose world defaults a case may vary.
 *
 * @param {object} [worldDefault] The `defaults` record for `pick`.
 * @param {number} [members] How many of the two systems hold the Tool.
 * @returns {object}
 */
function scopeFor(worldDefault = {}, members = 2) {
  const membership = SYSTEMS.slice(0, members).map((system) => ({
    entityId: 'pick',
    systemId: system.id,
    inherit: {},
    enabled: true,
  }));
  return projectWorldScopeEntity({
    entityType: 'tool',
    corpus: {
      entities: [{ id: 'pick', name: 'Mining Pick', description: 'A pick.', originItemUuid: 'Item.pick' }],
      defaults: [{ id: 'pick', ...worldDefault }],
      membership,
    },
    systems: SYSTEMS,
  });
}

/**
 * Mount the entry and open one tab.
 *
 * @param {object} options
 * @returns {Promise<HTMLElement>}
 */
async function mountTab({ scope, actions = {}, tab = 'identity' }) {
  const target = await harness.mount({ scope, actions, entityId: 'pick' });
  if (tab !== 'identity') target.querySelector(`#world-tool-entry-tab-${tab}`).click();
  return target;
}

describe('the world Tool entry (issue 1373)', () => {
  before(async () => {
    await harness.setup();
  });

  after(() => {
    harness.teardown();
  });

  describe('the world master switch', () => {
    it('draws ON for a record that never authored the flag, and states its reach FIRST', async () => {
      const target = await mountTab({ scope: scopeFor() });
      const card = target.querySelector('[data-world-tool-entry-card="enabled"]');
      assert.ok(Boolean(card), 'the Overview tab carries the switch card the design draws');
      assert.equal(
        target.querySelector('[data-world-tool-entry-enabled]').dataset.worldToolEntryEnabled,
        'on',
        'ABSENT reads as enabled, so an existing world sees no change'
      );
      // THE COUNT IS ON SCREEN BEFORE THE CLICK. There is no confirmation on a world-scope
      // write - every field here persists on change - so the consequence has to be readable
      // beside the control rather than after it.
      assert.match(
        card.querySelector('[data-world-tool-entry-enabled-reach]').textContent,
        /2 crafting systems have this Tool and lose it while this is off\./
      );
    });

    it('pluralises the reach for a single member', async () => {
      const target = await mountTab({ scope: scopeFor({}, 1) });
      assert.match(
        target.querySelector('[data-world-tool-entry-enabled-reach]').textContent,
        /1 crafting system has this Tool/
      );
    });

    it('draws OFF and writes the INVERSE through the tool-family action', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor({ enabled: false }),
        actions: { setWorldEnabled: (id, enabled) => calls.push([id, enabled]) },
      });
      const toggle = target.querySelector('[data-world-tool-entry-enabled]');
      assert.equal(toggle.dataset.worldToolEntryEnabled, 'off');
      toggle.click();
      assert.deepEqual(calls, [['pick', true]]);
    });
  });

  describe('the breakage VALUE, one editor per mode', () => {
    it('offers a uses-per-copy stepper under `Limited uses`, and writes the section MERGED', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor({ breakage: { mode: 'limitedUses', maxUses: 3 } }),
        actions: {
          updateWorldDefaultSection: (id, section, value) => calls.push([id, section, value]),
        },
        tab: 'breakage',
      });
      const input = target.querySelector('[data-world-tool-entry-max-uses]');
      assert.ok(Boolean(input), 'the mode a GM selected has a value they can move');
      assert.equal(input.value, '3');

      input.value = '5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      assert.deepEqual(calls.at(-1), [
        'pick',
        'breakage',
        // THE MODE SURVIVES. `patchSection` merges over the section already on disk, so moving
        // the number never erases the rule the number belongs to.
        { mode: 'limitedUses', maxUses: 5 },
      ]);
    });

    it('offers the break-chance control under `Breakage chance`', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor({ breakage: { mode: 'breakageChance', breakageChance: 8 } }),
        actions: {
          updateWorldDefaultSection: (id, section, value) => calls.push([id, section, value]),
        },
        tab: 'breakage',
      });
      const input = target.querySelector('[data-world-tool-entry-breakage-chance]');
      assert.ok(Boolean(input));
      assert.equal(input.value, '8');
      input.value = '17';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      assert.deepEqual(calls.at(-1), [
        'pick',
        'breakage',
        { mode: 'breakageChance', breakageChance: 17 },
      ]);
    });

    it('offers a formula field under `Dice expression`', async () => {
      const calls = [];
      const target = await mountTab({
        scope: scopeFor({ breakage: { mode: 'diceExpression', formula: '1d20', threshold: 4 } }),
        actions: {
          updateWorldDefaultSection: (id, section, value) => calls.push([id, section, value]),
        },
        tab: 'breakage',
      });
      const field = target.querySelector('[data-world-tool-entry-formula]');
      assert.ok(Boolean(field));
      assert.equal(field.value, '1d20');
      field.value = '2d6';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      assert.deepEqual(calls.at(-1), [
        'pick',
        'breakage',
        { mode: 'diceExpression', formula: '2d6', threshold: 4 },
      ]);
    });

    it('draws exactly ONE editor: the one the selected mode owns', async () => {
      const target = await mountTab({
        scope: scopeFor({ breakage: { mode: 'breakageChance', breakageChance: 8 } }),
        tab: 'breakage',
      });
      assert.ok(!target.querySelector('[data-world-tool-entry-max-uses]'));
      assert.ok(!target.querySelector('[data-world-tool-entry-formula]'));
      assert.ok(Boolean(target.querySelector('[data-world-tool-entry-breakage-chance]')));
    });
  });

  describe('the formula is validated by ROLLING it', () => {
    /**
     * A dice class whose `evaluateSync` refuses anything but a bare `NdM`.
     *
     * MODELLED ON THE REAL TRAP: `Roll.validate` PARSES and does not evaluate, so it answers
     * `true` for expressions that throw the moment a craft rolls them. This double therefore
     * parses everything and evaluates only what a real engine could, which is the distinction
     * the guard has to survive. `total` is `Number(this._total) || 0` on the real class, so the
     * `-Infinity` case is modelled rather than described.
     */
    class FakeRoll {
      constructor(formula) {
        this.formula = String(formula ?? '');
        this._total = 0;
      }

      evaluateSync() {
        if (/^\d*d\d+$/i.test(this.formula.trim())) {
          this._total = 6;
          return this;
        }
        if (this.formula.includes('max(')) {
          this._total = -Infinity;
          return this;
        }
        throw new Error(`unrollable: ${this.formula}`);
      }

      get total() {
        return Number(this._total) || 0;
      }
    }

    /**
     * Mount the Breakage tab with a dice engine installed, and take it away afterwards.
     *
     * @param {string} formula
     * @returns {Promise<HTMLElement>}
     */
    async function mountWithDice(formula) {
      globalThis.Roll = FakeRoll;
      try {
        return await mountTab({
          scope: scopeFor({ breakage: { mode: 'diceExpression', formula } }),
          tab: 'breakage',
        });
      } finally {
        delete globalThis.Roll;
      }
    }

    it('accepts a formula that really rolls', async () => {
      const target = await mountWithDice('2d6');
      assert.ok(!target.querySelector('[data-world-tool-entry-formula-error]'));
      assert.ok(!target.querySelector('[data-world-tool-entry-formula]').hasAttribute('aria-invalid'));
    });

    it('REJECTS one that parses and then throws', async () => {
      const target = await mountWithDice('1000d6 + junk');
      assert.ok(
        Boolean(target.querySelector('[data-world-tool-entry-formula-error]')),
        'the field says so, rather than persisting a value that fails every attempt'
      );
      assert.equal(
        target.querySelector('[data-world-tool-entry-formula]').getAttribute('aria-invalid'),
        'true'
      );
    });

    it('REJECTS an empty-headed function whose total is not finite', async () => {
      // `Roll.validate('max(, 2)')` is TRUE on the shipped stack: the head is optional, the
      // term evaluates to `-Infinity`, and `Roll#total` passes it through as a number. A guard
      // that stopped at "it evaluated without throwing" would accept it.
      const target = await mountWithDice('max(, 2)');
      assert.ok(Boolean(target.querySelector('[data-world-tool-entry-formula-error]')));
    });

    it('says nothing at all with NO dice engine, and nothing on an EMPTY field', async () => {
      // FAIL OPEN. Headless has no `Roll`, so nothing there could evaluate the formula either;
      // painting every authored expression red would be worse than saying nothing. An empty
      // field is UNSET rather than invalid, and the Validation tab is where incompleteness is
      // reported.
      const headless = await mountTab({
        scope: scopeFor({ breakage: { mode: 'diceExpression', formula: 'MAX(1d4, 2)' } }),
        tab: 'breakage',
      });
      assert.ok(!headless.querySelector('[data-world-tool-entry-formula-error]'));

      const empty = await mountWithDice('');
      assert.ok(!empty.querySelector('[data-world-tool-entry-formula-error]'));
    });
  });
});
