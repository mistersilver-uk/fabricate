/** IoTable (issue 917) as the requirement surface's COMPOSITION ROOT. */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import {
  craftability,
  essenceChoiceCraftability,
  essenceCraftability,
  sharedEssenceCraftability,
} from '../helpers/crafting-fixtures.js';
import { chipGroundAlpha, themeTokens } from '../helpers/chipPaint.js';
import { chipToneOf } from '../helpers/chipTone.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const THEMES = themeTokens(readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8'));

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-io-table-',
  rawModules: CRAFTING_APP_RAW_MODULES,
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/detail/IoTable.svelte',
});

function choiceState(groupId, name, overrides = {}) {
  return {
    groupId,
    name,
    img: `icons/${groupId}.webp`,
    need: 1,
    have: 0,
    satisfied: false,
    hasChoice: true,
    choiceCount: 2,
    ...overrides,
  };
}

function optionChoice(groupId, groupName) {
  return {
    kind: 'option',
    groupId,
    groupName,
    selectedOptionIndex: 0,
    options: [
      { optionIndex: 0, name: `${groupName} A`, img: null, need: 1, have: 1, satisfied: true, isCurrency: false, costLabel: '', affordable: true },
      { optionIndex: 1, name: `${groupName} B`, img: null, need: 1, have: 0, satisfied: false, isCurrency: false, costLabel: '', affordable: true },
    ],
  };
}

/** The open panel's alternative tiles, and the pressable button each wraps. */
function alternativesIn(root) {
  return [...root.querySelectorAll('[data-requirement-alternative]')];
}
function alternativeButtons(root) {
  return alternativesIn(root).map((tile) => tile.querySelector('button'));
}

function twoChoiceCraftability() {
  return craftability({
    canCraft: false,
    ingredientStates: [choiceState('g-herb', 'Herb'), choiceState('g-metal', 'Metal')],
    ingredientChoices: [optionChoice('g-herb', 'Herb'), optionChoice('g-metal', 'Metal')],
  });
}

describe('IoTable mounted behavior', () => {
  before(harness.setup);
  after(harness.teardown);
  afterEach(harness.remount);

  it('keeps the io section marker and renders the rail for a set with requirements', async () => {
    const target = await harness.mount({ craftability: craftability() });
    assert.ok(target.querySelector('[data-recipe-section="io"]'));
    assert.ok(target.querySelector('[data-recipe-section="requirement-rail"]'));
    assert.equal(target.querySelectorAll('[data-requirement-slot]').length, 1);
  });

  it('renders no rail at all for an outputs-only table', async () => {
    const target = await harness.mount({
      craftability: null,
      result: { items: [{ name: 'Potion', img: null, qty: 1 }] },
    });
    assert.ok(!target.querySelector('[data-recipe-section="requirement-rail"]'));
    assert.ok(target.querySelector('[data-io-group="outputs"]'));
  });

  it('1773: previews a choice group as its caption over its alternatives', async () => {
    const members = [
      { name: 'Gem', img: null, qty: 2 },
      { name: 'Gold', kind: 'currency', glyph: 'fa-solid fa-coins', qty: 3, amountText: '3 gp' },
    ];
    const target = await harness.mount({
      craftability: null,
      result: { items: [{ kind: 'group', name: 'You choose one of…', members }] },
    });
    const group = target.querySelector('[data-io-output="group"]');
    assert.equal(group.querySelector('.fab-well').getAttribute('aria-label'), 'You choose one of…');
    assert.deepEqual(
      [...group.querySelectorAll('.crafting-io-output-name')].map((node) => node.textContent),
      ['Gem', 'Gold']
    );
  });

  it('always states the consumption plan alongside the rail', async () => {
    const target = await harness.mount({ craftability: craftability() });
    assert.ok(target.querySelector('[data-recipe-section="consumption-plan"]'));
  });

  // Composition-root wiring, not presentation.
  it('supplies the active language list formatter to the consumption plan', async () => {
    const asked = [];
    globalThis.game.i18n.getListFormatter = (options) => {
      asked.push(options);
      return { format: (names) => names.join(' ~AND~ ') };
    };
    try {
      const target = await harness.mount({ craftability: twoChoiceCraftability() });
      const pending = target.querySelector('[data-consumption-pending]').textContent;
      assert.match(pending, / ~AND~ /, 'IoTable must hand the plan the language formatter');
      assert.deepEqual(asked, [{ style: 'long', type: 'conjunction' }]);
    } finally {
      delete globalThis.game.i18n.getListFormatter;
    }
  });

  // The old surface stacked EVERY group's alternatives below the grid at once.
  it('shows only the open group when a choice slot is open', async () => {
    const target = await harness.mount({
      craftability: twoChoiceCraftability(),
      openSlotId: 'g-metal',
    });
    const panels = [...target.querySelectorAll('[data-requirement-panel]')];
    assert.equal(panels.length, 1, 'one focused group, not one per choice');
    assert.equal(panels[0].getAttribute('data-requirement-panel'), 'g-metal');
    assert.deepEqual(
      alternativesIn(target).map((tile) => tile.textContent.trim().replaceAll(/\s+/g, ' ')),
      ['1/1 Metal A', '0/1 Metal B']
    );
    assert.ok(!target.querySelector('[data-recipe-section="essence-pool"]'));
  });

  it('draws the open group’s options as pressable tiles, the chosen one pressed', async () => {
    const target = await harness.mount({
      craftability: twoChoiceCraftability(),
      chosenGroupIds: ['g-herb'],
      openSlotId: 'g-herb',
    });
    assert.deepEqual(
      alternativeButtons(target).map((button) => button.getAttribute('aria-pressed')),
      ['true', 'false']
    );
    assert.ok(!target.querySelector('[role="radiogroup"]'), 'no option radios beside them');
  });

  it('routes the chosen option back through onChooseOption', async () => {
    const calls = [];
    const target = await harness.mount({
      craftability: twoChoiceCraftability(),
      openSlotId: 'g-herb',
      onChooseOption: (groupId, choice) => calls.push([groupId, choice]),
    });
    alternativeButtons(target)[1].click();
    assert.deepEqual(calls.at(-1), ['g-herb', { optionIndex: 1 }]);
  });

  it('opens the shared essence pool — and not an alternatives group — for an essence slot', async () => {
    const target = await harness.mount({
      craftability: sharedEssenceCraftability(),
      openSlotId: 'essence-pool',
    });
    assert.ok(target.querySelector('[data-recipe-section="essence-pool"]'));
    assert.equal(alternativesIn(target).length, 0);
    assert.equal(
      target.querySelectorAll('[data-essence-meter]').length,
      2,
      'both requirements share one pool'
    );
  });

  it('labels the open panel back at the tile that controls it', async () => {
    const target = await harness.mount({
      craftability: sharedEssenceCraftability(),
      openSlotId: 'essence-pool',
      idPrefix: 'fabricate-req-step-1',
    });
    const panel = target.querySelector('[data-recipe-section="essence-pool"]').closest('[role="region"]');
    const tile = target.querySelector('[data-slot-kind="essence"]');
    assert.equal(panel.getAttribute('id'), 'fabricate-req-step-1-panel');
    assert.equal(tile.getAttribute('aria-controls'), 'fabricate-req-step-1-panel');
    assert.equal(panel.getAttribute('aria-labelledby'), tile.getAttribute('id'));
  });

  // `aria-labelledby` on a roleless `<div>` is not exposed.
  it('exposes the alternatives panel as a named region, not a bare div', async () => {
    const target = await harness.mount({
      craftability: twoChoiceCraftability(),
      openSlotId: 'g-herb',
    });
    const panel = alternativesIn(target)[0].closest('[aria-labelledby]');
    assert.equal(panel.getAttribute('role'), 'region');
    assert.equal(panel.getAttribute('aria-labelledby'), 'fabricate-slot-g-herb');
  });

  // Issue 2142: choosing an essence alternative must not strand the player in the pool.
  it('shows the alternatives with the pool beneath for a group whose chosen option is an essence', async () => {
    const target = await harness.mount({
      craftability: essenceChoiceCraftability(),
      openSlotId: 'g-primal',
    });
    const regions = [...target.querySelectorAll('[role="region"]')];
    assert.equal(regions.length, 1, 'one panel holds both choosers');
    const [region] = regions;
    assert.equal(region.getAttribute('id'), 'fabricate-req-panel');
    assert.equal(region.getAttribute('aria-labelledby'), 'fabricate-slot-g-primal');
    assert.equal(region.getAttribute('data-requirement-panel'), 'g-primal');
    assert.equal(alternativesIn(region).length, 2, 'the group’s alternatives come first');
    const pool = region.querySelector('[data-recipe-section="essence-pool"]');
    assert.ok(pool, 'the pool renders inside the alternatives region');
    assert.ok(!pool.hasAttribute('id'), 'only the region carries the panel id');
    assert.ok(!pool.hasAttribute('aria-labelledby'));
    assert.equal(target.querySelectorAll('#fabricate-req-panel').length, 1);
  });

  it('routes an alternative chosen inside the merged region back through onChooseOption', async () => {
    const calls = [];
    const target = await harness.mount({
      craftability: essenceChoiceCraftability(),
      openSlotId: 'g-primal',
      onChooseOption: (groupId, choice) => {
        calls.push([groupId, choice]);
      },
    });
    alternativeButtons(target.querySelector('[role="region"]'))[0].click();
    assert.deepEqual(calls.at(-1), ['g-primal', { optionIndex: 0 }]);
  });

  it('routes an allocation made in the nested pool back through onAllocateEssence', async () => {
    const calls = [];
    const target = await harness.mount({
      craftability: essenceChoiceCraftability(),
      openSlotId: 'g-primal',
      onAllocateEssence: (itemKey, units) => {
        calls.push([itemKey, units]);
      },
    });
    target
      .querySelector(':scope [role="region"] [data-essence-carrier="Item.moss-1"] [data-stepper-increment]')
      .click();
    assert.deepEqual(calls.at(-1), ['Item.moss-1', 1]);
  });

  it('keeps a plain essence slot on the standalone pool beside a choice-essence group', async () => {
    const base = essenceChoiceCraftability();
    const plain = essenceCraftability();
    const mixed = essenceChoiceCraftability({
      ingredientStates: [...plain.ingredientStates, ...base.ingredientStates],
      essencePool: {
        ...base.essencePool,
        requirements: [...plain.essencePool.requirements, ...base.essencePool.requirements],
      },
    });
    const target = await harness.mount({ craftability: mixed, openSlotId: 'essence-pool' });
    const panel = target.querySelector('[data-recipe-section="essence-pool"]').closest('[role="region"]');
    assert.equal(panel.getAttribute('id'), 'fabricate-req-panel');
    assert.equal(panel.getAttribute('aria-labelledby'), 'fabricate-slot-g-radiant');
    assert.equal(alternativesIn(target).length, 0, 'no group was opened');
  });

  it('shows only the open group when two choice groups both chose an essence', async () => {
    const base = essenceChoiceCraftability();
    const ember = (entry) => ({ ...entry, groupId: 'g-ember', name: 'Ember' });
    const target = await harness.mount({
      craftability: essenceChoiceCraftability({
        ingredientStates: [...base.ingredientStates, ember(base.ingredientStates[0])],
        ingredientChoices: [...base.ingredientChoices, ember(base.ingredientChoices[0])],
        essencePool: {
          ...base.essencePool,
          requirements: [
            ...base.essencePool.requirements,
            ember(base.essencePool.requirements[0]),
          ],
        },
      }),
      openSlotId: 'g-ember',
    });
    assert.deepEqual(
      [...target.querySelectorAll('[data-requirement-panel]')].map(
        (panel) => panel.dataset.requirementPanel
      ),
      ['g-ember']
    );
    assert.equal(target.querySelectorAll('[data-recipe-section="essence-pool"]').length, 1);
    assert.equal(target.querySelectorAll('#fabricate-req-panel').length, 1);
  });

  it('keeps the alternatives region when the essence pool is absent', async () => {
    const target = await harness.mount({
      craftability: essenceChoiceCraftability({ essencePool: null }),
      openSlotId: 'g-primal',
    });
    const region = target.querySelector('[role="region"]');
    assert.equal(region.getAttribute('id'), 'fabricate-req-panel');
    assert.equal(alternativesIn(region).length, 2);
    assert.ok(!target.querySelector('[data-recipe-section="essence-pool"]'));
  });

  it('opens neither chooser for a read-only choice-essence group', async () => {
    const target = await harness.mount({
      craftability: essenceChoiceCraftability(),
      openSlotId: 'g-primal',
      readOnly: true,
    });
    assert.ok(!target.querySelector('[role="region"]'));
    assert.ok(!target.querySelector('[data-recipe-section="essence-pool"]'));
  });

  it('opens no chooser at all on a read-only rail', async () => {
    const target = await harness.mount({
      craftability: sharedEssenceCraftability(),
      openSlotId: 'essence-pool',
      readOnly: true,
    });
    assert.ok(!target.querySelector('[data-recipe-section="essence-pool"]'));
    assert.equal(alternativesIn(target).length, 0);
    assert.ok(target.querySelector('[data-requirement-rail-readonly]'));
  });

  it('routes an allocation change back through onAllocateEssence', async () => {
    const calls = [];
    const target = await harness.mount({
      craftability: sharedEssenceCraftability(),
      openSlotId: 'essence-pool',
      onAllocateEssence: (itemKey, units) => calls.push([itemKey, units]),
    });
    target
      .querySelector('[data-essence-carrier="Item.prism-1"] [data-stepper-increment]')
      .click();
    assert.deepEqual(calls.at(-1), ['Item.prism-1', 1]);
  });

  // Legacy set-level essences are threshold-only and never consumed.
  it('keeps legacy set-level essence rows out of the rail and out of the pool', async () => {
    const target = await harness.mount({
      craftability: craftability({
        essenceStates: [
          { type: 'aether', name: 'Aether', icon: 'fa-regular fa-star', need: 1, have: 1, satisfied: true },
        ],
      }),
    });
    assert.ok(target.querySelector('[data-io-group="essences"] .crafting-io-essence-icon'));
    assert.equal(
      target.querySelectorAll('[data-slot-kind="essence"]').length,
      0,
      'a legacy threshold essence is not a rail slot'
    );
  });

  it('still renders the tool and output groups unchanged', async () => {
    const target = await harness.mount({
      craftability: craftability({
        toolStates: [{ name: 'Mortar', img: 'icons/mortar.webp', available: false }],
      }),
      result: { items: [{ name: 'Potion', img: null, qty: 2 }] },
    });
    assert.ok(target.querySelector('[data-io-group="tools"] .crafting-io-tool-label'));
    assert.equal(
      target.querySelector('[data-io-group="outputs"] .crafting-io-output-qty').textContent.trim(),
      '×2'
    );
  });

  // Issue 1506: the have/need tag retired into the shared chip. Its six sites passed `success`
  // for a satisfied reading, and `Chip` does not paint a tone under that name — it drops it, with
  // no class and no error — so a satisfied essence row would have read as an untoned default chip.
  it('draws the have/need readings as chips, in the tones the map routes them to', async () => {
    const target = await harness.mount({
      craftability: craftability({
        essenceStates: [
          { type: 'aether', name: 'Aether', icon: 'fa-regular fa-star', need: 1, have: 2, satisfied: true },
        ],
      }),
    });

    const [have, need] = [...target.querySelectorAll('[data-io-group="essences"] .manager-chip')];
    assert.equal(chipToneOf(have), 'positive', 'a satisfied holding still reads as green');
    assert.equal(chipToneOf(need), 'neutral', 'and the requirement beside it is a plain fact');
    assert.ok(have.classList.contains('is-list'), 'both take the browser row scale');
    // The word and the count stay two children.
    assert.equal(have.querySelectorAll('span').length, 2, 'the reading is a word and a count');
    assert.match(have.textContent.replaceAll(/\s+/g, ' ').trim(), /2$/, 'the count is the holding');
    // Read over artwork of unknown colour, so both stand on an opaque ground.
    assert.equal(chipGroundAlpha(have, THEMES), 1, 'the have chip is solid');
    assert.equal(chipGroundAlpha(need, THEMES), 1, 'and so is the need chip');
  });

  it('states a pool overshoot in the consumption plan, one line per essence', async () => {
    const base = essenceCraftability();
    const [carrier] = base.essencePool.carriers;
    const over = essenceCraftability({
      essencePool: { ...base.essencePool, carriers: [{ ...carrier, allocatedUnits: 3 }] },
    });
    const target = await harness.mount({ craftability: over, openSlotId: 'essence-pool' });
    const plan = target.querySelector('[data-recipe-section="consumption-plan"]');
    const line = plan.querySelector('[data-consumption-overshoot="radiant"]');
    // Three units of two against a need of four.
    assert.match(line.textContent, /ConsumptionPlan\.Overshoot/);
    assert.match(line.textContent, /"essence":"Radiant"/);
    assert.match(line.textContent, /"amount":2/);

    harness.remount();
    const exact = await harness.mount({ craftability: base, openSlotId: 'essence-pool' });
    assert.ok(!exact.querySelector('[data-consumption-overshoot]'), 'no surplus, no line');
  });

  it('flags a held stack short of the open slot\'s need, from the slot the rail opened', async () => {
    const target = await harness.mount({
      craftability: craftability({
        canCraft: false,
        ingredientStates: [choiceState('g-wood', 'Hardwood', { need: 2, choiceCount: 0 })],
        ingredientChoices: [
          {
            kind: 'stack',
            groupId: 'g-wood',
            groupName: 'Hardwood',
            optionIndex: 0,
            selectedHeldItemId: 'Item.oak',
            stacks: [
              { itemId: 'Item.oak', name: 'Oak Haft', img: null, have: 12 },
              { itemId: 'Item.bog', name: 'Bog Oak', img: null, have: 1 },
            ],
          },
        ],
      }),
      openSlotId: 'g-wood',
    });
    const [oak, bog] = target.querySelectorAll(':scope [data-alt-kind="stack"] [role="radio"]');
    assert.ok(!oak.classList.contains('is-short'), 'twelve held against a need of two');
    assert.ok(bog.classList.contains('is-short'), 'one held against a need of two');
    const reading = target.querySelector(`[id="${bog.getAttribute('aria-describedby')}"]`);
    assert.match(reading.textContent, /"have":1.*"need":2/);
  });

  it('opens the pool for an essence slot only, never beside a plain choice', async () => {
    const pooled = essenceCraftability();
    const target = await harness.mount({
      craftability: craftability({
        canCraft: false,
        ingredientStates: [choiceState('g-herb', 'Herb'), ...pooled.ingredientStates],
        ingredientChoices: [optionChoice('g-herb', 'Herb')],
        essencePool: pooled.essencePool,
      }),
      openSlotId: 'g-herb',
    });
    assert.equal(alternativesIn(target.querySelector('[data-requirement-panel="g-herb"]')).length, 2);
    assert.ok(!target.querySelector('[data-recipe-section="essence-pool"]'));
  });

  // Issue 1782: the three groups are `DataTable`s, each headed, row-headed by its name column.
  describe('the essence, tool and output tables', () => {
    const IO = 'FABRICATE.App.Crafting.Io';
    const groupOf = (target, name) => target.querySelector(`[data-io-group="${name}"]`);
    const rowsOf = (target, name) => [
      ...groupOf(target, name).querySelectorAll(':scope tbody tr.fabricate-data-table-row'),
    ];
    const mountAll = () =>
      harness.mount({
        craftability: craftability({
          essenceStates: [
            { type: 'aether', name: 'Aether', need: 1, have: 1, satisfied: true },
            { type: 'ember', name: 'Ember', need: 3, have: 1, satisfied: false },
          ],
          toolStates: [
            { componentId: 't1', name: 'Mortar', img: null, available: true },
            { componentId: 't2', name: 'Tongs', img: null, available: false },
          ],
        }),
        result: {
          items: [
            { name: 'Potion', img: null, qty: 2 },
            { name: 'Gold', kind: 'currency', qty: 3, amountText: '3 gp' },
            { kind: 'group', name: 'You choose one of…', members: [{ name: 'Gem', qty: 1 }] },
          ],
        },
      });

    it('heads each group and puts every row`s name in a row-scoped th', async () => {
      const target = await mountAll();
      for (const [name, heading] of [
        ['essences', `${IO}.Essences`],
        ['tools', `${IO}.Tools`],
        ['outputs', `${IO}.Output`],
      ]) {
        assert.equal(
          groupOf(target, name).querySelector('.fabricate-data-table-heading').textContent,
          heading
        );
        for (const row of rowsOf(target, name)) {
          assert.equal(row.children[0].tagName, 'TH', `a ${name} row is headed by its name`);
          assert.equal(row.children[0].getAttribute('scope'), 'row');
        }
      }
    });

    it('marks each essence and tool row met or unmet, and states a tool`s status', async () => {
      const target = await mountAll();
      const met = (name) => rowsOf(target, name).map((row) => row.dataset.ioSatisfied);
      assert.deepEqual(met('essences'), ['true', 'false']);
      assert.deepEqual(met('tools'), ['true', 'false']);
      assert.deepEqual(
        rowsOf(target, 'tools').map((row) => row.children[1].textContent.trim()),
        [`${IO}.Available`, `${IO}.Unavailable`]
      );
    });

    it('right-aligns each output amount in mono, and a choice group states none', async () => {
      const target = await mountAll();
      const amounts = rowsOf(target, 'outputs').map((row) => row.children[1]);
      assert.deepEqual(
        amounts.map((cell) => cell.textContent.trim()),
        ['×2', '3 gp', '—']
      );
      for (const cell of amounts) {
        assert.ok(cell.classList.contains('is-align-end') && cell.classList.contains('is-mono'));
      }
      assert.ok(
        Boolean(amounts[2].querySelector('.crafting-io-output-none')),
        'the group’s dash is the muted none mark, not an amount'
      );
    });

    it('draws no essence or tool table for a set that needs neither', async () => {
      const target = await harness.mount({
        craftability: craftability(),
        result: { items: [{ name: 'Potion', img: null, qty: 1 }] },
      });
      assert.ok(!groupOf(target, 'essences') && !groupOf(target, 'tools'));
      assert.ok(Boolean(groupOf(target, 'outputs')), 'precondition: the outputs table draws');
    });
  });

  it('draws an unavailable tool as a danger chip with its own glyph', async () => {
    const target = await harness.mount({
      craftability: craftability({
        toolStates: [{ name: 'Mortar', img: 'icons/mortar.webp', available: false }],
      }),
    });

    const chip = target.querySelector('[data-io-group="tools"] .manager-chip');
    assert.equal(chipToneOf(chip), 'danger', 'a missing tool is red');
    assert.ok(chip.querySelector('i.fa-triangle-exclamation'), 'and keeps its warning glyph');
  });
});
