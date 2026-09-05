/**
 * THE WORLD ESSENCE COLOUR, EVERYWHERE AN ESSENCE IS DRAWN (issue 1371 r18-colour, maintainer
 * ruling M29).
 *
 * The maintainer's third live test: the essence editor sets a colour per essence, the world
 * catalogue's bulk `Essence values` rows draw it, and NOTHING ELSE does — the rules library's row
 * chips were one grey pill each, the rules editor's `Essence contribution` tiles were grey with a
 * grey glyph, and the inspector said `1 essence` in plain text. This suite pins the one primitive
 * that closes it and the three system-scope sites that render it:
 *
 *   1. `Chip` gains `tint` — a bare `--fab-tag-*` key that inks the chip in its own colour over the
 *      quiet surface, the face the reference draws for a row's essence dot (`proto:5502`);
 *   2. `EssenceChip` composes it and owns the essence-to-chip mapping — the glyph fallback, the
 *      `{name} {quantity}` accessible name, the count in the mono face — so no site restates it;
 *   3. `ComponentRow`'s badges, `ComponentBrowserInspector`'s essence run and
 *      `EssenceQuantityCard`'s tile each carry the colour, and each is asserted THROUGH the site's
 *      own render, not through a copy of its markup.
 *
 * The DEFAULT-UNCHANGED assertions on `Chip` matter as much as the positive ones: it has 60-odd
 * callers, and a prop that leaked a class or a style onto every one of them would repaint the
 * whole manager to close one ruling.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  componentScopeFor,
  createComponentScopeHarness,
} from '../helpers/componentScopeMountModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const CHIP_PATH = 'src/ui/svelte/apps/manager/Chip.svelte';
const ESSENCE_CHIP_PATH = 'src/ui/svelte/apps/manager/components/EssenceChip.svelte';
const MEDALLION_PATH = 'src/ui/svelte/components/Medallion.svelte';

const chipSource = readFileSync(resolve(repoRoot, CHIP_PATH), 'utf8');
/** The REAL style block, sliced at the tag on its own line (see the chip characterization suite). */
const chipStyleBlock = chipSource.slice(chipSource.search(/^<style>$/m));

function ruleFor(selector) {
  const open = chipStyleBlock.indexOf(`${selector} {`);
  assert.notEqual(open, -1, `${selector} still has a rule of its own`);
  return chipStyleBlock.slice(open, chipStyleBlock.indexOf('}', open));
}

function ruleIndex(selector) {
  return chipStyleBlock.search(
    new RegExp(String.raw`${selector.replaceAll('.', String.raw`\.`)}(?![\w-])`)
  );
}

function authoredClasses(node) {
  return [...node.classList].filter((name) => !name.startsWith('svelte-'));
}

const chip = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-chip-tint-',
  compiledModules: [CHIP_PATH],
  componentPath: CHIP_PATH,
});

const essenceChip = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-chip-',
  compiledModules: [CHIP_PATH, ESSENCE_CHIP_PATH],
  componentPath: ESSENCE_CHIP_PATH,
});

// The ROW ALONE, not the whole browser view: the row is an import-free presentational leaf, so
// mounting it directly is the narrowest tree that renders the badge run through the real row.
const ROW_PATH = 'src/ui/svelte/apps/manager/components/ComponentRow.svelte';
const row = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-row-essence-',
  compiledModules: [
    CHIP_PATH,
    ESSENCE_CHIP_PATH,
    MEDALLION_PATH,
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    ROW_PATH,
  ],
  componentPath: ROW_PATH,
});

// The inspector's manifest is the shared scope tier plus the two extras its own suite names.
const inspector = createComponentScopeHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-inspector-essence-',
  componentPath: 'src/ui/svelte/apps/manager/components/ComponentBrowserInspector.svelte',
  rawExtras: [...SEARCHABLE_POPOVER_RAW_MODULES, 'src/ui/svelte/util/actionMenuLayout.js'],
  compiledExtras: [
    'src/ui/svelte/components/ActionMenu.svelte',
    'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
  ],
});

const CARD_PATH = 'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte';
const card = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-essence-card-tint-',
  compiledModules: ['src/ui/svelte/components/Stepper.svelte', MEDALLION_PATH, CARD_PATH],
  componentPath: CARD_PATH,
});

const FIRE = { id: 'fire', name: 'Fire', icon: 'fas fa-fire', colorToken: 'peach', quantity: 2 };
const EARTH = { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', colorToken: 'sage', quantity: 1 };
/** No icon and no colour: the state the lab world seeds on purpose (`labContent.js`'s `air`). */
const AIR = { id: 'air', name: 'Air', quantity: 3 };

describe('Chip — the `tint` prop (issue 1371 r18-colour, M29)', () => {
  before(async () => {
    await chip.setup();
  });
  after(() => chip.teardown());

  it('DEFAULT-UNCHANGED: a chip that asks for no tint renders exactly the class set it always has', async () => {
    const root = await chip.mount({});
    const node = root.querySelector('.manager-chip');
    assert.deepEqual(authoredClasses(node), ['manager-chip']);
    assert.ok(!node.hasAttribute('style'), 'and carries no inline style at all');
    assert.ok(!node.hasAttribute('data-chip-tint'), 'and stamps no tint hook');
    chip.remount();
  });

  it('inks the chip through `--fab-chip-color` and marks it `has-tint`, both spellings accepted', async () => {
    for (const spelling of ['peach', '--fab-tag-peach']) {
      const root = await chip.mount({ tint: spelling, icon: 'fas fa-fire' });
      const node = root.querySelector('.manager-chip');
      assert.ok(node.classList.contains('has-tint'), `${spelling}: the tint class is on`);
      assert.match(
        node.getAttribute('style') || '',
        /--fab-chip-color:\s*var\(--fab-tag-peach\)/,
        `${spelling}: the colour travels as the palette TOKEN, never as a value`
      );
      assert.equal(node.getAttribute('data-chip-tint'), 'peach');
      chip.remount();
    }
  });

  it('DROPS a tint that is not a bare palette key rather than composing a declaration', async () => {
    for (const bad of ['red; background: url(x)', 'var(--fab-danger)', 'Peach', '']) {
      const root = await chip.mount({ tint: bad });
      const node = root.querySelector('.manager-chip');
      assert.ok(!node.classList.contains('has-tint'), `${JSON.stringify(bad)} is not a tint`);
      assert.ok(!node.hasAttribute('style'), 'and emits no style');
      chip.remount();
    }
  });

  it('composes with a density and a swatch, and shares the swatch’s colour vehicle', async () => {
    const root = await chip.mount({ tint: 'sage', swatch: 'sage', density: 'inspector' });
    const node = root.querySelector('.manager-chip');
    assert.deepEqual(
      authoredClasses(node).sort((a, b) => a.localeCompare(b)),
      ['has-swatch', 'has-tint', 'is-inspector', 'manager-chip']
    );
    assert.equal(
      (node.getAttribute('style').match(/--fab-chip-color/g) || []).length,
      1,
      'one declaration of the vehicle, not one per prop'
    );
    chip.remount();
  });

  it('states the reference face: the colour on the INK over the quiet surface behind the plain hairline', () => {
    // `proto:5502`: `background: var(--surface-soft); border: 1px solid var(--border); color: e.color`.
    const rule = ruleFor('.manager-chip.has-tint');
    assert.match(rule, /(?:^|[^-])color:\s*var\(--fab-chip-color\)/, 'the ink is the chip’s own colour');
    assert.match(rule, /background:\s*var\(--fab-surface-soft\)/, 'over the soft surface');
    assert.match(rule, /border-color:\s*var\(--fab-border\)/, 'behind the plain hairline');
    assert.ok(
      !/(?:padding|font-size|font-weight|min-height|border-radius):/.test(rule),
      'and it states no geometry — a tint is colour only, exactly as a tone is'
    );
  });

  it('is written AFTER every tone and BEFORE the outlined plate, so a tint wins the family and a plate still wins the fill', () => {
    const tint = ruleIndex('.manager-chip.has-tint');
    assert.ok(tint > 0, 'the tint has a rule');
    for (const tone of ['is-active', 'is-info', 'is-danger', 'is-neutral', 'is-secondary', 'is-accent', 'is-muted', 'is-tag']) {
      assert.ok(ruleIndex(`.manager-chip.${tone}`) < tint, `${tone} is written before the tint`);
    }
    assert.ok(ruleIndex('.manager-chip.is-outlined') > tint, 'the plate is written after it');
  });

  it('is lit by the same rule as the tag tone and the swatch, because it too declares a chip colour', () => {
    assert.notEqual(
      chipStyleBlock.search(/\.manager-chip\.has-tint\.is-lit(?![\w-])/),
      -1,
      'a tinted chip can be lit'
    );
  });
});

describe('EssenceChip — the essence-to-chip mapping, owned once (issue 1371 r18-colour)', () => {
  before(async () => {
    await essenceChip.setup();
  });
  after(() => essenceChip.teardown());

  it('renders ONE chip, tinted by the essence’s colour token, carrying its glyph and its count in the mono face', async () => {
    const root = await essenceChip.mount({ essence: FIRE });
    const node = root.querySelector('.manager-chip');
    assert.ok(Boolean(node), 'it renders through the manager’s one chip');
    assert.ok(node.classList.contains('fab-essence-chip'), 'and wears its own class beside it');
    assert.equal(node.getAttribute('data-essence-chip'), 'fire');
    assert.equal(node.getAttribute('data-chip-tint'), 'peach', 'the tint reaches the chip');
    assert.ok(node.querySelector('i.fa-fire'), 'the essence’s own glyph');
    const count = node.querySelector('.fab-essence-chip-count');
    assert.equal(count.textContent, '2');
    assert.ok(!node.querySelector('.fab-essence-chip-name'), 'the name is not drawn unless asked');
    assert.equal(node.getAttribute('title'), 'Fire 2', 'the accessible name pairs name and count');
    assert.equal(node.getAttribute('aria-label'), 'Fire 2');
    essenceChip.remount();
  });

  it('falls back to the shared essence glyph and to NO tint, so an unauthored colour is not an error', async () => {
    const root = await essenceChip.mount({ essence: AIR });
    const node = root.querySelector('.manager-chip');
    assert.ok(node.querySelector('i.fa-mortar-pestle'), 'the default essence glyph');
    assert.ok(!node.classList.contains('has-tint'), 'no tint class');
    assert.ok(!node.hasAttribute('data-chip-tint'), 'no tint hook');
    assert.equal(node.getAttribute('title'), 'Air 3');
    essenceChip.remount();
  });

  it('draws the NAME before the count when asked, and takes a density, a class and any other attribute', async () => {
    const root = await essenceChip.mount({
      essence: EARTH,
      showName: true,
      density: 'inspector',
      class: 'manager-essence-compact-chip',
      'data-component-essence': 'earth',
    });
    const node = root.querySelector('.manager-chip');
    assert.equal(node.querySelector('.fab-essence-chip-name').textContent, 'Earth');
    assert.equal(node.querySelector('.fab-essence-chip-count').textContent, '1');
    assert.ok(node.classList.contains('is-inspector'), 'the density reaches the chip');
    assert.ok(node.classList.contains('manager-essence-compact-chip'), 'the caller class reaches it');
    assert.equal(node.getAttribute('data-component-essence'), 'earth', 'the rest spread reaches it');
    essenceChip.remount();
  });

  it('omits the count when the essence carries none, so a roster chip is a name alone', async () => {
    const root = await essenceChip.mount({ essence: { id: 'water', name: 'Water', colorToken: 'aqua' }, showName: true });
    const node = root.querySelector('.manager-chip');
    assert.ok(!node.querySelector('.fab-essence-chip-count'), 'no count span');
    assert.equal(node.getAttribute('title'), 'Water');
    essenceChip.remount();
  });
});

describe('ComponentRow — the badges carry the essence colour (M29 site a)', () => {
  before(async () => {
    await row.setup();
  });
  after(() => row.teardown());

  it('draws each essence as a TINTED essence chip, keeping the row’s own class and accessible name', async () => {
    const root = await row.mount({
      component: { id: 'coal', name: 'Coal', description: 'Black.', essences: [FIRE, AIR] },
      recipesValue: '2',
      recipesLabel: 'Recipes',
      editLabel: 'Edit rules',
      editNamedLabel: 'Edit rules for Coal',
    });
    const chips = [...root.querySelectorAll(':scope .manager-component-essence-dots [data-essence-chip]')];
    assert.deepEqual(
      chips.map((node) => node.getAttribute('data-essence-chip')),
      ['fire', 'air'],
      'one essence chip per essence, in the row’s order'
    );
    assert.equal(chips[0].getAttribute('data-chip-tint'), 'peach', 'the fire chip is inked peach');
    assert.ok(!chips[1].hasAttribute('data-chip-tint'), 'and the uncoloured air chip is not');
    for (const node of chips) {
      assert.ok(node.classList.contains('manager-essence-compact-chip'), 'the sheet’s row hook survives');
    }
    assert.equal(chips[0].getAttribute('title'), 'Fire 2');
    assert.equal(chips[0].getAttribute('aria-label'), 'Fire 2');
    assert.equal(chips[0].getAttribute('data-component-essence'), 'fire');
    assert.equal(chips[0].querySelector('.fab-essence-chip-count').textContent, '2');
    row.remount();
  });

  it('draws no badge run at all on a ghost row, exactly as before', async () => {
    const root = await row.mount({
      component: { id: 'coal', name: 'Coal', essences: [FIRE] },
      member: false,
      addLabel: 'Add to system',
      addNamedLabel: 'Add Coal to this system',
    });
    assert.ok(!root.querySelector('[data-essence-chip]'), 'a ghost row states no essence');
    row.remount();
  });
});

describe('ComponentBrowserInspector — the essence run under the subline (M29 site c)', () => {
  before(async () => {
    await inspector.setup();
  });
  after(() => inspector.teardown());

  const SCOPE = componentScopeFor();
  const entry = (id) => SCOPE.entries.find((candidate) => candidate.id === id) ?? null;
  const systemRow = (id, systemId) =>
    (entry(id)?.systems ?? []).find((candidate) => candidate?.systemId === systemId) ?? null;

  async function mountCoal(essences) {
    return inspector.mount({
      selectedComponent: {
        id: 'coal',
        name: 'Coal',
        img: '',
        category: 'Raw',
        tags: ['sooty'],
        essences,
        hasRegisteredItemUuid: false,
        salvageSummary: null,
      },
      showTags: true,
      worldEntry: entry('coal'),
      worldSystemRow: systemRow('coal', 'sys-forge'),
      systemName: 'Forge',
    });
  }

  it('draws the component’s essences as tinted essence chips naming the essence, under the subline that counts them', async () => {
    const root = await mountCoal([FIRE, EARTH]);
    assert.equal(
      root.querySelector('[data-component-inspector-subline]').textContent.trim(),
      '2 tags · 2 essences',
      'the subline still states the count'
    );
    const run = root.querySelector('[data-component-essence-list]');
    assert.ok(Boolean(run), 'and the run below it draws them');
    const chips = [...run.querySelectorAll('[data-essence-chip]')];
    assert.deepEqual(chips.map((node) => node.getAttribute('data-essence-chip')), ['fire', 'earth']);
    assert.deepEqual(
      chips.map((node) => node.getAttribute('data-chip-tint')),
      ['peach', 'sage'],
      'each chip is inked in its OWN essence’s colour'
    );
    assert.equal(chips[0].querySelector('.fab-essence-chip-name').textContent, 'Fire');
    assert.equal(chips[0].querySelector('.fab-essence-chip-count').textContent, '2');
    assert.ok(chips[0].classList.contains('is-inspector'), 'at the inspector’s own chip scale');
    inspector.remount();
  });

  it('draws no run when the component contributes nothing, so the subline’s `0 essences` stands alone', async () => {
    const root = await mountCoal([]);
    assert.ok(!root.querySelector('[data-component-essence-list]'), 'no empty run');
    inspector.remount();
  });
});

describe('EssenceQuantityCard — the tile is the shared glyph chip in the essence’s colour (M29 site b)', () => {
  before(async () => {
    await card.setup();
  });
  after(() => card.teardown());

  it('draws the tile as `Medallion variant="glyph-chip"` at 22px, tinted by the colour token', async () => {
    const root = await card.mount({ id: 'fire', name: 'Fire', icon: 'fas fa-fire', colorToken: 'peach', quantity: 2 });
    const tile = root.querySelector(':scope .manager-component-essence-identity [data-medallion="glyph"]');
    assert.ok(Boolean(tile), 'the identity row leads with the shared medallion');
    assert.ok(tile.classList.contains('is-glyph-chip'), 'as the borderless glyph chip the bulk rows draw');
    assert.equal(tile.getAttribute('data-medallion-tint'), 'peach', 'inked in the essence’s colour');
    assert.match(tile.getAttribute('style'), /width:\s*22px;\s*height:\s*22px/, 'at the reference’s 22px (`proto:5717`)');
    assert.ok(tile.querySelector('i.fa-fire'), 'carrying the essence’s glyph');
    assert.equal(root.querySelector('.manager-component-essence-name').textContent, 'Fire');
    card.remount();
  });

  it('draws an untinted tile for an essence with no colour, and the default glyph for one with no icon', async () => {
    const root = await card.mount({ id: 'air', name: 'Air', quantity: 0 });
    const tile = root.querySelector('[data-medallion="glyph"]');
    assert.ok(!tile.hasAttribute('data-medallion-tint'), 'no tint hook');
    assert.ok(!tile.classList.contains('has-tint'), 'no tint class');
    assert.ok(tile.querySelector('i.fa-mortar-pestle'), 'the shared default glyph');
    card.remount();
  });
});
