import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createMountedComponentHarness,
  PLAYER_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import { FOUNDRY_BRIDGE_RAW_MODULES, LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { NON_PHRASING_CONTENT } from '../helpers/listRowContract.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The block content inside a list-row control, which a native button may not hold. */
function nonPhrasingIn(control) {
  return [...control.querySelectorAll(NON_PHRASING_CONTENT)].map((node) => node.tagName.toLowerCase());
}

/** The text of every element a control's `aria-describedby` names, in order. */
function describedText(control) {
  return (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/u)
    .filter(Boolean)
    .map((id) => globalThis.document.querySelector(`[id="${id}"]`)?.textContent.trim() ?? null);
}

/** Each ListRow root in `list`, with its one control. */
function listRows(target, list) {
  return [...target.querySelectorAll(`:scope .${list} > li > .fabricate-list-row`)].map((row) => ({
    row,
    buttons: row.querySelectorAll('button'),
    control: row.querySelector(':scope > button.fabricate-list-row-open'),
  }));
}

// Standalone fixture constants (NO model imports) so the mounted graph stays on the
// harness allowlist — importing a model would hang the suite as # cancelled.
const ESSENCES = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 }];

function inventoryRow(id, name, { available = 2, held = 2, essences = [] } = {}) {
  return { componentId: id, name, img: null, available, held, essences, disabled: available <= 0 };
}

function knownRecipe(id, name) {
  return {
    id,
    name,
    img: null,
    result: null,
    signatureSummary: [{ setId: `${id}-set`, groups: [], essences: [] }]
  };
}

// ComponentInventoryColumn

describe('ComponentInventoryColumn (mounted)', () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-alchemy-inventory-',
    rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
    compiledModules: [
      // The shared primitives this tree draws.
      ...PLAYER_APP_COMPILED_MODULES,
      'src/ui/svelte/apps/alchemy/EssenceChips.svelte',
      'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte'
    ],
    componentPath: 'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte'
  });

  before(() => harness.setup());
  after(() => harness.teardown());
  beforeEach(() => harness.remount());

  it('renders the name-search input and reports typed input', async () => {
    const calls = [];
    const target = await harness.mount({
      components: [inventoryRow('emberroot', 'Emberroot')],
      hasComponents: true,
      onSearch: (value) => calls.push(value)
    });
    const input = target.querySelector('.alchemy-inventory-search input');
    assert.ok(input.closest('.fabricate-search'), 'the shared search field');
    assert.ok(input, 'the search input renders');
    input.value = 'ash';
    input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    assert.deepEqual(calls, ['ash']);
  });

  it('shows the distinct "no matches" filtered-empty state (NOT the onboarding state)', async () => {
    const target = await harness.mount({ components: [], hasComponents: true, search: 'zzz' });
    assert.ok(target.querySelector('[data-alchemy-inventory-no-matches]'), 'filtered-empty state shown');
    assert.equal(
      target.querySelector('[data-alchemy-empty-inventory]'),
      null,
      'the onboarding empty state is NOT shown when the actor owns components'
    );
  });

  it('shows the onboarding empty state when the actor owns no components', async () => {
    const target = await harness.mount({ components: [], hasComponents: false });
    assert.ok(target.querySelector('[data-alchemy-empty-inventory]'), 'onboarding empty state shown');
    assert.equal(target.querySelector('[data-alchemy-inventory-no-matches]'), null);
  });

  it('renders a drag handle inside the row button and adds on click', async () => {
    const calls = [];
    const target = await harness.mount({
      components: [inventoryRow('emberroot', 'Emberroot')],
      hasComponents: true,
      onAdd: (id) => calls.push(id)
    });
    const row = target.querySelector('[data-alchemy-inventory-row="emberroot"]');
    assert.ok(row.querySelector('.alchemy-inventory-grip i.fa-grip-vertical'), 'grip handle inside the row button');
    row.click();
    assert.deepEqual(calls, ['emberroot']);
  });

  it('renders essence icons + counts on a component row', async () => {
    const target = await harness.mount({
      components: [inventoryRow('emberroot', 'Emberroot', { essences: ESSENCES })],
      hasComponents: true
    });
    const essence = target.querySelector('[data-alchemy-inventory-row="emberroot"] [data-alchemy-essence="fire"]');
    assert.ok(essence, 'the essence chip renders on the row');
    assert.ok(essence.querySelector('i.fa-fire'), 'the essence icon renders');
    assert.ok(essence.textContent.includes('×2'), 'the per-unit essence count renders');
  });

  it('draws each component as one list-row action button, with no pressed state', async () => {
    const target = await harness.mount({
      components: [inventoryRow('emberroot', 'Emberroot', { available: 1, held: 3, essences: ESSENCES })],
      hasComponents: true,
    });
    const [{ row, buttons, control }] = listRows(target, 'alchemy-inventory-list');
    assert.equal(buttons.length, 1, 'the row is one button, with nothing nested or beside it');
    assert.ok(control.classList.contains('alchemy-inventory-row'), 'the control keeps its hook');
    assert.equal(control.getAttribute('data-alchemy-inventory-row'), 'emberroot');
    assert.equal(control.getAttribute('data-keyboard-focus'), 'true');
    assert.ok(!control.hasAttribute('aria-pressed'), 'adding is an action, so nothing is pressed');
    assert.match(control.getAttribute('aria-label'), /^FABRICATE\.App\.Alchemy\.AddComponent/u);
    assert.equal(control.getAttribute('draggable'), 'true');
    assert.deepEqual(nonPhrasingIn(control), [], 'the button holds phrasing content only');
    const leading = control.querySelector(':scope > .fabricate-list-row-leading');
    assert.deepEqual(
      [...leading.children].map((child) => child.className.split(' ', 1)[0]),
      ['alchemy-inventory-grip', 'fab-medallion'],
      'the grip, then the mark, lead the row'
    );
    const add = control.querySelector(':scope .fabricate-list-row-badges > .alchemy-inventory-add');
    assert.ok(Boolean(add), 'the add glyph stays inside the button');
    assert.deepEqual(
      [leading.children[0].getAttribute('aria-hidden'), add.getAttribute('aria-hidden')],
      ['true', 'true'],
      'the grip and the add glyph are drawn only: the name already says what a press does'
    );
    assert.equal(control.querySelector(':scope .alchemy-inventory-name').textContent, 'Emberroot');
    assert.deepEqual(
      describedText(control).map((text) => text.replaceAll(/\s+/gu, ' ')),
      ['FABRICATE.App.Alchemy.Available:{"available":1,"held":3} ×2'],
      'the availability, with its own counts, and the essences describe it'
    );
    assert.ok(!row.classList.contains('is-danger'));
  });

  it('keeps the essences to the availability line: one chip, then a "+N" naming the rest', async () => {
    const essences = [
      { id: 'fire', name: 'Fire', icon: 'fas fa-fire', quantity: 2 },
      { id: 'water', name: 'Water', icon: 'fas fa-droplet', quantity: 1 },
      { id: 'air', name: 'Air', icon: 'fas fa-wind', quantity: 3 },
    ];
    const target = await harness.mount({
      components: [
        inventoryRow('emberroot', 'Emberroot', { essences }),
        inventoryRow('ashbloom', 'Ashbloom', { essences: essences.slice(0, 1) }),
      ],
      hasComponents: true,
    });
    const strips = listRows(target, 'alchemy-inventory-list').map(({ control }) => {
      const strip = control.querySelector(':scope .alchemy-inventory-essences > [data-alchemy-essences]');
      const more = strip.querySelector(':scope > [data-alchemy-essence-more]');
      return {
        capped: strip.classList.contains('is-capped'),
        chips: [...strip.querySelectorAll(':scope > [data-alchemy-essence]')].map((chip) =>
          chip.getAttribute('data-alchemy-essence')
        ),
        more: more && [more.textContent, more.getAttribute('title'), more.getAttribute('aria-label')],
      };
    });
    assert.deepEqual(strips, [
      { capped: true, chips: ['fire'], more: ['+2', 'Water ×1, Air ×3', 'Water ×1, Air ×3'] },
      { capped: true, chips: ['fire'], more: null },
    ]);
  });

  it('a disabled row neither drags nor adds', async () => {
    const added = [];
    const dragged = [];
    const target = await harness.mount({
      components: [
        inventoryRow('emberroot', 'Emberroot'),
        inventoryRow('ashbloom', 'Ashbloom', { available: 0 }),
      ],
      hasComponents: true,
      onAdd: (id) => {
        added.push(id);
      },
      onDragStart: (_event, id) => {
        dragged.push(id);
      },
    });
    const [enabled, disabled] = listRows(target, 'alchemy-inventory-list').map((row) => row.control);
    assert.deepEqual(
      [disabled.disabled, disabled.getAttribute('draggable'), disabled.classList.contains('is-disabled')],
      [true, 'false', true],
      'the unavailable row is a disabled, undraggable button'
    );
    assert.equal(enabled.getAttribute('draggable'), 'true');

    disabled.click();
    const refused = new globalThis.window.Event('dragstart', { bubbles: true, cancelable: true });
    disabled.dispatchEvent(refused);
    assert.deepEqual([added, dragged], [[], []], 'neither the click nor a drag start reached it');
    assert.equal(refused.defaultPrevented, true, 'and the drag start is refused');

    enabled.click();
    enabled.dispatchEvent(new globalThis.window.Event('dragstart', { bubbles: true, cancelable: true }));
    assert.deepEqual([added, dragged], [['emberroot'], ['emberroot']], 'the available row does both');
  });
});

// KnownRecipesColumn

describe('KnownRecipesColumn (mounted)', () => {
  const harness = createMountedComponentHarness({
    repoRoot,
    tmpPrefix: 'fabricate-alchemy-known-',
    rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
    compiledModules: [
      ...PLAYER_APP_COMPILED_MODULES,
      'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte'
    ],
    componentPath: 'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte'
  });

  before(() => harness.setup());
  after(() => harness.teardown());
  beforeEach(() => harness.remount());

  it('places the discipline block (name + Switch) ABOVE the "Known recipes" heading', async () => {
    const target = await harness.mount({
      recipes: [knownRecipe('vigor', 'Elixir of Vigor')],
      knownCount: 1,
      activeSystemName: 'Herbalism',
      canSwitch: true
    });
    const switchBtn = target.querySelector('[data-alchemy-switch]');
    assert.ok(switchBtn.classList.contains('fab-manager-button'), 'the shared button, neutral');
    assert.ok(!/is-(primary|ghost|danger)/.test(switchBtn.className));
    const title = target.querySelector('.alchemy-known-title');
    assert.ok(switchBtn && title, 'both the Switch and the heading render');
    // The switch must precede the heading in document order (block sits above it).
    const relation = switchBtn.compareDocumentPosition(title);
    assert.ok(
      relation & globalThis.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'the discipline block is above the "Known recipes" heading'
    );
  });

  it('searches the known recipes through the shared search field', async () => {
    const calls = [];
    const target = await harness.mount({
      recipes: [knownRecipe('vigor', 'Elixir of Vigor')],
      knownCount: 1,
      onSearch: (value) => {
        calls.push(value);
      },
    });
    const input = target.querySelector(':scope .alchemy-known-search input');
    assert.ok(input.closest('.fabricate-search'));
    input.value = 'vig';
    input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
    assert.deepEqual(calls, ['vig']);
  });

  it('shows the distinct filtered "no matches" state when a search hides every revealed recipe', async () => {
    const target = await harness.mount({ recipes: [], knownCount: 3, search: 'zzz' });
    assert.ok(target.querySelector('[data-alchemy-known-no-matches]'), 'filtered-empty state shown');
    assert.equal(
      target.querySelector('[data-alchemy-zero-known]'),
      null,
      'the onboarding zero-revealed state is NOT shown when recipes exist'
    );
  });

  it('shows the onboarding zero-revealed state when nothing is revealed yet', async () => {
    const target = await harness.mount({ recipes: [], knownCount: 0 });
    assert.ok(target.querySelector('[data-alchemy-zero-known]'), 'onboarding empty state shown');
    assert.equal(target.querySelector('[data-alchemy-known-no-matches]'), null);
  });

  it('renders an essence ingredient option as its resolved NAME x AMOUNT, not the raw id', async () => {
    // The builder now projects essence-type ingredient options with the essence
    // name + required amount (issue 675). The card's sig summary must surface those,
    // e.g. "Toxic ×2 · Water ×1" — never the raw essence uuid.
    const bladeVenom = {
      id: 'blade-venom',
      name: 'Blade Venom',
      img: null,
      result: null,
      signatureSummary: [
        {
          setId: 'bv-set',
          essences: [],
          groups: [
            { options: [{ componentId: null, essenceId: 'toxic-id', name: 'Toxic', icon: 'fas fa-skull', quantity: 2 }] },
            { options: [{ componentId: null, essenceId: 'water-id', name: 'Water', icon: 'fas fa-droplet', quantity: 1 }] }
          ]
        }
      ]
    };
    const target = await harness.mount({ recipes: [bladeVenom], knownCount: 1 });
    const sig = target.querySelector('[data-alchemy-recipe="blade-venom"] .alchemy-recipe-sig');
    assert.ok(sig, 'the signature summary renders');
    assert.equal(sig.textContent.trim(), 'Toxic ×2 · Water ×1', 'resolved essence name + amount, not raw ids');
    assert.ok(!sig.textContent.includes('toxic-id'), 'the raw essence id must not appear in the card');
  });

  it('draws each recipe as one list-row button, pressed only while selected', async () => {
    const selected = [];
    const venom = { ...knownRecipe('venom', 'Blade Venom'), result: { name: 'Venom', quantity: 2 } };
    const target = await harness.mount({
      recipes: [knownRecipe('vigor', 'Elixir of Vigor'), venom],
      knownCount: 2,
      selectedRecipeId: 'vigor',
      onSelect: (id) => {
        selected.push(id);
      },
    });
    const rows = listRows(target, 'alchemy-known-list');
    assert.deepEqual(
      rows.map(({ buttons, control }) => [
        buttons.length,
        control.getAttribute('data-alchemy-recipe'),
        control.getAttribute('aria-pressed'),
        control.classList.contains('is-selected'),
        control.getAttribute('aria-label'),
        control.getAttribute('data-keyboard-focus'),
      ]),
      [
        [1, 'vigor', 'true', true, 'Elixir of Vigor', 'true'],
        [1, 'venom', 'false', false, 'Blade Venom', 'true'],
      ],
      'one named button per recipe, pressed while it is the selected one'
    );
    const vigor = rows[0].control;
    assert.deepEqual(
      [Boolean(vigor.querySelector(':scope .alchemy-recipe-result')), describedText(vigor)],
      [false, []],
      'a recipe with no result and no signature draws no result line and is described by nothing'
    );
    const control = rows[1].control;
    assert.deepEqual(nonPhrasingIn(control), [], 'the button holds phrasing content only');
    assert.equal(control.querySelector(':scope .alchemy-recipe-name').textContent, 'Blade Venom');
    assert.ok(!control.querySelector(':scope .alchemy-recipe-badge'), 'an unmatched row has no badge');
    assert.deepEqual(
      describedText(control).map((text) => text.replaceAll(/\s+/gu, ' ')),
      ['FABRICATE.App.Alchemy.Makes:{"name":"Venom","qty":2}'],
      'its result describes it, and an empty signature adds nothing'
    );
    control.click();
    assert.deepEqual(selected, ['venom']);
  });

  it('names the recipe the bench matches by that match, which its badge alone draws', async () => {
    const target = await harness.mount({
      recipes: [knownRecipe('vigor', 'Elixir of Vigor'), knownRecipe('venom', 'Blade Venom')],
      knownCount: 2,
      matchedRecipeId: 'venom',
    });
    const [vigor, venom] = listRows(target, 'alchemy-known-list').map((row) => row.control);
    assert.equal(vigor.getAttribute('aria-label'), 'Elixir of Vigor');
    assert.equal(
      venom.getAttribute('aria-label'),
      'Blade Venom, FABRICATE.App.Alchemy.MatchedState',
      'the name, then the state the bench match puts it in'
    );
    assert.ok(venom.classList.contains('is-match'), 'the control keeps its match hook');
    assert.equal(venom.getAttribute('aria-pressed'), 'false', 'a match is not a selection');
    const badge = venom.querySelector(':scope .fabricate-list-row-badges > .alchemy-recipe-badge');
    assert.ok(Boolean(badge), 'the badge sits after the name, inside the button');
    assert.equal(badge.getAttribute('aria-hidden'), 'true', 'the name carries the match, so the badge is drawn only');
  });

  it('draws a recipe both selected and matched as pressed, matched and named by its match', async () => {
    const target = await harness.mount({
      recipes: [knownRecipe('vigor', 'Elixir of Vigor'), knownRecipe('venom', 'Blade Venom')],
      knownCount: 2,
      selectedRecipeId: 'venom',
      matchedRecipeId: 'venom',
    });
    const [, venom] = listRows(target, 'alchemy-known-list').map((row) => row.control);
    assert.deepEqual(
      [
        venom.getAttribute('aria-pressed'),
        venom.classList.contains('is-selected'),
        venom.classList.contains('is-match'),
        Boolean(venom.querySelector(':scope .alchemy-recipe-badge')),
        venom.getAttribute('aria-label'),
      ],
      ['true', true, true, true, 'Blade Venom, FABRICATE.App.Alchemy.MatchedState']
    );
  });

  it("titles a recipe's clipped ingredient line with the whole list, and draws its art", async () => {
    const venom = {
      ...knownRecipe('venom', 'Blade Venom'),
      img: 'icons/venom.webp',
      signatureSummary: [
        {
          setId: 'venom-set',
          essences: [],
          groups: [
            { options: [{ name: 'Toxic', quantity: 2 }] },
            { options: [{ name: 'Water', quantity: 1 }] },
            { options: [{ name: 'Nightshade', quantity: 3 }] },
          ],
        },
      ],
    };
    const target = await harness.mount({ recipes: [venom], knownCount: 1 });
    const [{ control }] = listRows(target, 'alchemy-known-list');
    const sig = control.querySelector(':scope .alchemy-recipe-sig');
    assert.equal(sig.getAttribute('title'), 'Toxic ×2 · Water ×1 · Nightshade ×3');
    assert.equal(sig.getAttribute('title'), sig.textContent);
    assert.equal(
      control.querySelector(':scope > .fab-medallion img')?.getAttribute('src'),
      'icons/venom.webp',
      "the recipe's art fills the row's mark"
    );
  });
});

// Render-bug (E) structural guard — pin the clip fix beyond screenshots.
// The row-clipping bug was `.alchemy-known-list { margin: 0 -4px; overflow-y: auto }`
// (and the mirror in the inventory list): `overflow-y: auto` coerces `overflow-x`
// to auto, clipping the first/last row's focus outline + radius. The rows' ring and
// their growth past Foundry's fixed button height are ListRow's now (issue 1778),
// measured in Chromium by `alchemy-known-recipe-layout.test.js`.

describe('Alchemy list clip-fix (source guard)', () => {
  const files = {
    known: 'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte',
    inventory: 'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte'
  };

  function read(relative) {
    return readFileSync(resolve(repoRoot, relative), 'utf8');
  }

  it('neither alchemy scroll list re-introduces a negative horizontal margin', () => {
    for (const [name, relative] of Object.entries(files)) {
      const source = read(relative);
      assert.ok(
        !/margin:\s*0\s+-\d/.test(source),
        `${name} column must not use a negative horizontal margin (it clips row focus outlines)`
      );
    }
  });

});

/** The Alchemy columns' adoption of the shared tile. */
describe('Alchemy column primitive adoption (issue 1514)', () => {
  /** The custom properties and size a medallion composes into its `style` attribute. */
  function tileStyle(tile) {
    return tile?.getAttribute('style') ?? '';
  }

  describe('ComponentInventoryColumn', () => {
    const harness = createMountedComponentHarness({
      repoRoot,
      tmpPrefix: 'fabricate-alchemy-inventory-primitives-',
      rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
      compiledModules: [
        ...PLAYER_APP_COMPILED_MODULES,
        'src/ui/svelte/apps/alchemy/EssenceChips.svelte',
        'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte'
      ],
      componentPath: 'src/ui/svelte/apps/alchemy/ComponentInventoryColumn.svelte'
    });

    before(() => harness.setup());
    after(() => harness.teardown());
    beforeEach(() => harness.remount());

    it('draws the component tile at 38 with the flask glyph, its 14px size and the peach ink', async () => {
      const target = await harness.mount({
        components: [inventoryRow('emberroot', 'Emberroot')],
        hasComponents: true
      });
      const tile = target.querySelector('[data-alchemy-inventory-row="emberroot"] .fab-medallion');
      assert.ok(Boolean(tile), 'the row leads with the shared tile');
      assert.equal(tile.getAttribute('data-medallion'), 'glyph', 'this fixture carries no artwork');
      assert.equal(tile.getAttribute('data-medallion-tint'), 'peach', 'the rule painted --fab-tag-peach');
      assert.match(tileStyle(tile), /width:\s*38px/, "at the art ladder's 38px rung (issue 1778)");
      assert.match(
        tileStyle(tile),
        /--fab-medallion-glyph:\s*14px/,
        "the glyph keeps the row's own inherited 14px rather than the tile's 0.9rem default"
      );
      assert.ok(
        Boolean(tile.querySelector('i.fa-flask')),
        "the flask face the markup's `{:else}` branch drew, not the tile's `fa-scroll` default"
      );
    });

    it('draws both empty branches as the shared panel, filtered only where a search hid the rows', async () => {
      const filtered = await harness.mount({ components: [], hasComponents: true, search: 'zzz' });
      const noMatches = filtered.querySelector('[data-alchemy-inventory-no-matches]');
      assert.ok(noMatches.classList.contains('manager-empty'), 'the filtered empty is the shared panel');
      assert.ok(
        noMatches.classList.contains('is-filtered'),
        'and takes the filtered treatment, which is what distinguishes it from an absence'
      );

      const onboarding = await harness.mount({ components: [], hasComponents: false });
      const empty = onboarding.querySelector('[data-alchemy-empty-inventory]');
      assert.ok(empty.classList.contains('manager-empty'), 'the onboarding empty is the shared panel');
      assert.ok(
        !empty.classList.contains('is-filtered'),
        'an actor who owns nothing is an ABSENCE, not a filtered-to-nothing list'
      );
      assert.ok(
        Boolean(empty.querySelector('h3')),
        'the onboarding branch keeps its title, which the filtered variant deliberately drops'
      );
    });
  });

  describe('KnownRecipesColumn', () => {
    const harness = createMountedComponentHarness({
      repoRoot,
      tmpPrefix: 'fabricate-alchemy-known-primitives-',
      rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
      compiledModules: [
        ...PLAYER_APP_COMPILED_MODULES,
        'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte'
      ],
      componentPath: 'src/ui/svelte/apps/alchemy/KnownRecipesColumn.svelte'
    });

    before(() => harness.setup());
    after(() => harness.teardown());
    beforeEach(() => harness.remount());

    it("draws the recipe tile as the list row's 38px mark, with the flask glyph and the peach ink", async () => {
      const target = await harness.mount({ recipes: [knownRecipe('venom', 'Blade Venom')], knownCount: 1 });
      const tile = target.querySelector('[data-alchemy-recipe="venom"] > .fab-medallion');
      assert.ok(Boolean(tile), "the recipe row leads with the list row's own mark");
      assert.equal(tile.getAttribute('data-medallion-tint'), 'peach');
      assert.match(tileStyle(tile), /width:\s*38px/, "at the art ladder's 38px rung (issue 1778)");
      assert.ok(Boolean(tile.querySelector('i.fa-flask')));
    });

    it('draws the not-yet-revealed footer as the shared callout, with its count above its guidance', async () => {
      const target = await harness.mount({ recipes: [knownRecipe('venom', 'V')], knownCount: 1, undiscoveredCount: 5 });
      const well = target.querySelector('[data-alchemy-undiscovered]');
      assert.ok(Boolean(well), 'the footer states how many are still hidden');
      assert.ok(well.classList.contains('manager-callout'), 'it is the shared callout');
      assert.equal(well.getAttribute('data-callout-tone'), 'neutral', 'at the quiet tone the dashed well drew');
      const title = well.querySelector('.manager-callout-title');
      const body = well.querySelector('.manager-callout-text');
      assert.match(title.textContent, /Undiscovered\b/, 'the count is the callout title');
      assert.match(body.textContent, /UndiscoveredHint/, 'the guidance is the callout body');
    });

    it('keeps the footer placement on a caller-owned wrapper, because the callout declares margin 0', async () => {
      const target = await harness.mount({ recipes: [knownRecipe('venom', 'V')], knownCount: 1, undiscoveredCount: 5 });
      const slot = target.querySelector('.alchemy-known-footer-slot');
      assert.ok(Boolean(slot), 'the wrapper survives the conversion');
      assert.ok(
        Boolean(slot.querySelector('[data-alchemy-undiscovered]')),
        'and it is the callout it wraps, not a sibling left behind'
      );
    });
  });
});
