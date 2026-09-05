/**
 * Mounted coverage for the world Tags & Categories screen (issue 1392, epic 1357, PR 7a).
 *
 * ── WHY THE DELETE AFFORDANCE IS ASSERTED ON THE DOM AND NOT ON A PREDICATE ──────────────
 * `VocabularyPanel` renders the one-click delete affordance THREE times — the gate in
 * `requestRemove`, the usage chip (whose else-branch is the muted `Unused` chip) and the delete
 * control's destructive tone — and before this change all three read `row.totalUsage`. The world
 * screen needs a strictly narrower predicate, and the failure mode of rerouting only the GATE is
 * a row that reads `Unused` under a red button and then opens a confirm strip naming four
 * crafting systems: the screen states one thing and does another. No source assertion can see
 * that, because each of the three is correct in isolation. So this file mounts the real page and
 * reads the rendered row.
 *
 * The three rows below are the three states, and the third is the one the whole conjunction
 * exists for: ZERO references, and a deletion that still rewrites four inheriting systems.
 *
 * ── AND WHY THE PROJECTION ARM IS NOT HERE ───────────────────────────────────────────────
 * This file hand-supplies `silentlyDeletable` on its fixture rows, which is exactly what a page
 * receives from the projection — so deleting the COMPUTATION in `projectWorldVocabulary` cannot
 * red anything here, and the panel's default would then silently restore the one-click delete on
 * the one row it must never be offered for. That half is asserted against real stores in
 * `tests/world-vocabulary-store.test.js`.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * Localize out of the SHIPPED `lang/en.json` rather than out of a fixture label map.
 *
 * The page resolves its per-kind copy from a table — one `text()` call site serves all three
 * panels — so it cannot carry a per-kind literal fallback without becoming a second copy of the
 * lang file. That is deliberate, and it is why this suite drives the real strings: the confirm
 * sentences below are the ones a GM reads, and asserting that each renders its numbers is a
 * stronger claim than asserting a hand-written fallback does.
 *
 * The flattening walks the whole tree once and refuses an empty result, because a localizer that
 * resolved nothing would make every copy assertion below pass on the raw key.
 */
function installShippedLocalizer() {
  const labels = {};
  const walk = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') labels[path] = value;
      else if (value && typeof value === 'object') walk(value, path);
    }
  };
  walk(JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8')), '');
  assert.ok(
    Object.keys(labels).length > 1000,
    'the lang flattening found almost nothing, so every copy assertion below would pass on a key'
  );
  globalThis.game = {
    i18n: {
      localize: (key) => labels[key] ?? key,
      format: (key, data) => `${key}:${JSON.stringify(data)}`,
    },
  };
}

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-world-vocabulary-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/iconPickerPopover.js',
    'src/ui/svelte/util/listboxNavigation.js',
    'src/ui/svelte/util/overlayHost.js',
    'src/ui/svelte/util/essenceIcons.js',
    'src/ui/svelte/util/foundryIconVocabulary.js',
    'src/ui/svelte/util/foundryIconCatalogue.js',
    'src/ui/svelte/actions/dismissOnOutsideClick.js',
    'src/ui/svelte/actions/portal.js',
    // IconPicker positions its panel through the shared action (issue 1500), which resolves the
    // manager's clipping boundary from `overlayBounds.js`; both are static imports of the picker,
    // so the closure validator names them the moment the two trees meet.
    'src/ui/svelte/actions/anchoredPopover.js',
    'src/ui/svelte/util/overlayBounds.js',
    'src/utils/managerBrowserViewState.js',
    // The page's own pure leaf and the World Vocabulary core it imports. Omitting either does
    // not fail a test: it HANGS the whole file behind one ERR_MODULE_NOT_FOUND, which
    // `node --test` reports as `# cancelled`.
    'src/ui/svelte/apps/manager/scoped/worldVocabularyStudio.js',
    'src/systems/worldVocabulary.js',
    'src/utils/componentCategories.js',
    'src/utils/recipeCategories.js',
  ],
  compiledModules: [
    'src/ui/svelte/apps/manager/Chip.svelte',
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/IconPicker.svelte',
    'src/ui/svelte/apps/manager/InlineVocabularyAdd.svelte',
    'src/ui/svelte/apps/manager/VocabularyPanel.svelte',
    'src/ui/svelte/components/Field.svelte',
    'src/ui/svelte/components/ManagerButton.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    'src/ui/svelte/components/ManagerSearchField.svelte',
    'src/ui/svelte/components/ManagerToolbar.svelte',
    'src/ui/svelte/apps/manager/scoped/WorldVocabularyPage.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/scoped/WorldVocabularyPage.svelte',
});

/** A projected row, in the shape `projectWorldVocabulary` publishes. */
function row(id, name, totalUsage, confirmTokens, silentlyDeletable) {
  return { id, name, totalUsage, confirmTokens, silentlyDeletable };
}

/**
 * The three affordance states, in ONE panel, plus a populated row in each of the other two so
 * the per-panel assertions below are not stated over an empty vocabulary.
 */
function vocabulary() {
  return {
    available: true,
    total: 5,
    componentCategories: [
      // REFERENCED. Confirm-gated, reference chip, neutral delete.
      row('reagent', 'Reagent', 3, { defaults: 0, inheriting: 0 }, false),
      // GENUINELY UNUSED. `Unused` chip, destructive delete, one click.
      row('spare', 'Spare', 0, { defaults: 0, inheriting: 0 }, true),
      // ZERO REFERENCES AND STILL NOT SILENTLY DELETABLE. The row the conjunction exists for.
      row('curios', 'Curios', 0, { defaults: 2, inheriting: 4 }, false),
    ],
    componentTags: [row('herb', 'herb', 2, { components: 1 }, false)],
    recipeCategories: [row('potions', 'Potions', 4, {}, false)],
  };
}

function mountProps(overrides = {}) {
  return {
    vocabulary: vocabulary(),
    actions: { addEntry: async () => true, removeEntry: async () => true },
    systems: [{ id: 'sys-a', name: 'Alpha' }],
    ...overrides,
  };
}

const panelSelector = (kind) => `[data-wvocab-panel="${kind}"]`;
const categoryCard = (root, id) =>
  root.querySelector(`${panelSelector('componentCategories')} [data-component-category-id="${id}"]`);

describe('the world Tags & Categories screen', () => {
  before(async () => {
    await harness.setup();
    // AFTER `setup()`, which installs its own two-label stub.
    installShippedLocalizer();
  });
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('renders one child of <main>, an accessible name, and all three panels', async () => {
    const root = await harness.mount(mountProps());
    const main = root.querySelector('main.manager-main[data-scoped-page="world-vocabulary"]');
    assert.ok(Boolean(main), 'the page renders its own route hook');
    assert.equal(
      main.getAttribute('aria-label'),
      'Tags & Categories',
      'the released full-width main keeps the accessible name the placeholder supplied'
    );
    // ONE CHILD, because `.manager-main` is `grid-template-rows: minmax(0, 1fr)` on this route:
    // a second top-level child would take an implicit `auto` row and collapse the explicit one.
    assert.equal(main.children.length, 1, '<main> renders exactly one element child');
    for (const kind of ['componentCategories', 'componentTags', 'recipeCategories']) {
      assert.ok(Boolean(root.querySelector(panelSelector(kind))), `${kind} panel renders`);
    }
  });

  it('drives all THREE renderings of the one-click delete from the same per-row predicate', async () => {
    const root = await harness.mount(mountProps());

    // ROW 1 — referenced. Reference chip, no destructive tone, and a click opens the confirm.
    const referenced = categoryCard(root, 'reagent');
    assert.ok(
      Boolean(referenced.querySelector('.manager-chip i.fas.fa-link')),
      'a referenced row states its count on the reference chip'
    );
    assert.ok(
      !referenced.querySelector('.manager-vocabulary-chip-unused'),
      'a referenced row is never marked Unused'
    );
    assert.equal(
      referenced.querySelector('.manager-icon-button').className.includes('is-danger'),
      false,
      'a referenced row does not wear the immediate-delete treatment'
    );
    referenced.querySelector('.manager-icon-button').click();
    flushSync();
    assert.ok(
      Boolean(root.querySelector('[data-vocabulary-confirm="reagent"]')),
      'a referenced row opens the two-step confirm'
    );
    root.querySelector('[data-vocabulary-cancel-remove]').click();
    flushSync();

    // ROW 2 — the POSITIVE CONTROL. A "confirm everything" fix, or one that never marks a row
    // unused, would red here rather than passing quietly.
    const unused = categoryCard(root, 'spare');
    assert.ok(
      Boolean(unused.querySelector('.manager-vocabulary-chip-unused')),
      'an entry nothing names and whose deletion rewrites nothing is marked Unused'
    );
    assert.ok(
      unused.querySelector('.manager-icon-button').className.includes('is-danger'),
      'and it wears the immediate-delete treatment'
    );
    const removed = [];
    harness.remount();
    const secondRoot = await harness.mount(
      mountProps({
        actions: {
          addEntry: async () => true,
          removeEntry: async (kind, id) => {
            removed.push(`${kind}:${id}`);
            return true;
          },
        },
      })
    );
    categoryCard(secondRoot, 'spare').querySelector('.manager-icon-button').click();
    flushSync();
    assert.deepEqual(removed, ['componentCategories:spare'], 'and it deletes in ONE click');
    assert.ok(
      !secondRoot.querySelector('[data-vocabulary-confirm="spare"]'),
      'with no confirm strip at all'
    );

    // ROW 3 — zero references, four inheriting systems. Every rendering must agree.
    const gated = categoryCard(secondRoot, 'curios');
    assert.ok(
      !gated.querySelector('.manager-vocabulary-chip-unused'),
      'a zero-reference row whose deletion rewrites a world default is NOT marked Unused'
    );
    assert.ok(
      Boolean(gated.querySelector('.manager-chip i.fas.fa-link')),
      'it renders its honest reference count instead'
    );
    assert.equal(
      gated.querySelector('.manager-icon-button').className.includes('is-danger'),
      false,
      'and it does not wear the immediate-delete treatment'
    );
    gated.querySelector('.manager-icon-button').click();
    flushSync();
    assert.ok(
      Boolean(secondRoot.querySelector('[data-vocabulary-confirm="curios"]')),
      'it opens the confirm even though nothing references it'
    );
    assert.deepEqual(removed, ['componentCategories:spare'], 'and it deletes NOTHING on one click');
  });

  it('substitutes every token in every confirm sentence, per kind', async () => {
    const root = await harness.mount(mountProps());
    const sentences = [];
    for (const [kind, attribute, id] of [
      ['componentCategories', 'data-component-category-id', 'curios'],
      ['componentTags', 'data-component-tag-id', 'herb'],
      ['recipeCategories', 'data-recipe-category-id', 'potions'],
    ]) {
      const card = root.querySelector(`${panelSelector(kind)} [${attribute}="${id}"]`);
      card.querySelector('.manager-icon-button').click();
      flushSync();
      const copy = root.querySelector(`[data-vocabulary-confirm="${id}"] .manager-vocabulary-confirm-copy`);
      assert.ok(Boolean(copy), `${kind} opens a confirm strip carrying its sentence`);
      sentences.push(copy.textContent);
      root.querySelector('[data-vocabulary-cancel-remove]').click();
      flushSync();
    }
    // THE UNSUBSTITUTED-TOKEN GUARD. `confirmSentence` merges the row's own tokens over `{name}`
    // and `{count}`; a kind whose sentence names a token the row does not carry renders the
    // literal brace, which is the only symptom a GM would ever see.
    for (const sentence of sentences) {
      assert.equal(
        sentence.includes('{'),
        false,
        `an unsubstituted token survived into a rendered confirm sentence: ${sentence}`
      );
    }
    const [categorySentence, tagSentence] = sentences;
    assert.ok(categorySentence.includes(' 0 '), 'the category confirm states its reference count');
    assert.ok(
      categorySentence.includes(' 2 ') && categorySentence.includes(' 4 '),
      `the category confirm states the affected defaults AND the inheriting systems: ${categorySentence}`
    );
    assert.ok(tagSentence.includes(' 1 '), 'the tag confirm states the world components affected');
  });

  it('gives each panel its own row hook, input id and sort label id', async () => {
    const root = await harness.mount(mountProps());
    const rowAttributes = ['data-recipe-category-id', 'data-component-category-id', 'data-component-tag-id'];
    // THREE PANELS ARE MOUNTED AT ONCE, so what the primitive calls a preference is a
    // correctness requirement here: one shared hook would match rows in two panels and make
    // every assertion above, and every capture `expectContained` target, ambiguous.
    for (const attribute of rowAttributes) {
      assert.equal(
        root.querySelectorAll(`[${attribute}]`).length > 0,
        true,
        `${attribute} resolves rows`
      );
    }
    const inputIds = [...root.querySelectorAll('input[id^="world-vocabulary-"]')].map((el) => el.id);
    assert.equal(new Set(inputIds).size, inputIds.length, 'no two add fields share an id');
    assert.equal(inputIds.length, 3, 'one add field per panel');

    const labels = [...root.querySelectorAll('.wvocab-sort-label')];
    assert.equal(labels.length, 3, 'one Sort by label per panel');
    assert.equal(
      new Set(labels.map((label) => label.id)).size,
      3,
      'three copies of one hardcoded id would send every aria-labelledby to the first'
    );
    for (const select of root.querySelectorAll('select[data-wvocab-sort]')) {
      const target = root.querySelector(`#${select.getAttribute('aria-labelledby')}`);
      assert.ok(Boolean(target), 'each sort select names a label that exists');
      assert.equal(
        target.closest('[data-wvocab-panel]'),
        select.closest('[data-wvocab-panel]'),
        'and it is the label inside its OWN panel'
      );
    }
  });

  it('renders the direction control as a real toggle that reverses the order', async () => {
    const root = await harness.mount(mountProps());
    const panel = root.querySelector(panelSelector('componentCategories'));
    const toggle = panel.querySelector('button[data-wvocab-direction]');
    assert.equal(toggle.getAttribute('type'), 'button', 'a bare <button> would submit nothing');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true', 'ascending is the resting state');
    assert.ok(Boolean(toggle.getAttribute('title')), 'the toggle states what it does');

    const namesNow = () =>
      [...panel.querySelectorAll('[data-component-category-id] .manager-vocabulary-main strong')].map(
        (el) => el.textContent
      );
    assert.deepEqual(namesNow(), ['Curios', 'Reagent', 'Spare'], 'Name A-Z is the resting order');
    toggle.click();
    flushSync();
    assert.equal(
      panel.querySelector('button[data-wvocab-direction]').getAttribute('aria-pressed'),
      'false'
    );
    assert.deepEqual(namesNow(), ['Spare', 'Reagent', 'Curios'], 'and the toggle reverses it');
  });

  it('reports a deletion that did not land, from a live region that existed before it', async () => {
    const root = await harness.mount(
      mountProps({ actions: { addEntry: async () => true, removeEntry: async () => false } })
    );
    // THE REGION IS IN THE DOCUMENT AT MOUNT, AND EMPTY. A live region inserted at the same
    // moment as its content is not reliably announced: the assistive technology has nothing to
    // observe the change against. So the element is rendered from the start and filled later.
    const before = root.querySelector('[data-wvocab-status]');
    assert.ok(Boolean(before), 'the live region exists before there is anything to announce');
    assert.equal(before.textContent.trim(), '', 'and it is empty until then');
    assert.equal(
      before.getAttribute('role'),
      'alert',
      'a deletion the GM asked for and did not get is an interruption, not a progress note'
    );

    categoryCard(root, 'spare').querySelector('.manager-icon-button').click();
    await Promise.resolve();
    await Promise.resolve();
    flushSync();
    const status = root.querySelector('[data-wvocab-status]');
    assert.equal(status, before, 'the SAME element is filled, never a replacement one');
    assert.ok(status.textContent.trim().length > 0, 'a refused deletion is stated on the page');
  });

  it('states the reference count ALONE when a deletion rewrites nothing', async () => {
    // The common case for both component vocabularies is that nothing cascades, and a single
    // sentence then reads "clears it from 0 world components, which 0 crafting systems inherit"
    // — three numbers where the honest answer is one.
    const root = await harness.mount(mountProps());
    categoryCard(root, 'reagent').querySelector('.manager-icon-button').click();
    flushSync();
    const copy = root
      .querySelector('[data-vocabulary-confirm="reagent"] .manager-vocabulary-confirm-copy')
      .textContent.trim();
    assert.ok(copy.includes('3'), 'it still states the reference count');
    assert.equal(copy.includes('{'), false, 'and every token is substituted');
    assert.equal(
      / 0 /.test(copy),
      false,
      `a row that rewrites nothing must not state a zero: ${copy}`
    );
  });

  it('drives the add form: a duplicate is blocked, a valid value is normalized', async () => {
    const added = [];
    const root = await harness.mount(
      mountProps({
        actions: {
          addEntry: async (kind, value) => {
            added.push(`${kind}:${value}`);
            return true;
          },
          removeEntry: async () => true,
        },
      })
    );
    const panel = root.querySelector(panelSelector('componentTags'));
    const input = panel.querySelector('input#world-vocabulary-component-tag-add');
    assert.ok(Boolean(input), 'the tag panel owns its own add field');

    const type = (value) => {
      input.value = value;
      input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
      flushSync();
    };

    // A DUPLICATE, in the OTHER case. De-duplication is on the derived id, so the hint has to
    // catch `HERB` against the shipped `herb` before the write path refuses it silently.
    type('HERB');
    const blockedHint = panel.querySelector('.manager-vocabulary-hint');
    assert.ok(Boolean(blockedHint), 'the add form states a hint');
    assert.ok(
      blockedHint.textContent.toLowerCase().includes('already'),
      `a duplicate is refused before submit: ${blockedHint.textContent}`
    );
    panel.querySelector('[data-inline-vocabulary-add]')?.dispatchEvent(
      new globalThis.Event('submit', { bubbles: true, cancelable: true })
    );
    flushSync();
    assert.deepEqual(added, [], 'and a blocked hint refuses the submit');

    // A VALID VALUE, submitted, and handed over LOWERCASED — the tag vocabulary's own rule.
    type('  Moss  ');
    panel.querySelector('[data-inline-vocabulary-add]').dispatchEvent(
      new globalThis.Event('submit', { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
    await Promise.resolve();
    flushSync();
    assert.deepEqual(
      added,
      ['componentTags:moss'],
      'the value reaching the write path is the NORMALIZED one, not the raw input'
    );
  });

  it('draws each vocabulary’s OWN empty state when it has no entries', async () => {
    const root = await harness.mount(
      mountProps({
        vocabulary: {
          available: true,
          total: 0,
          componentCategories: [],
          componentTags: [],
          recipeCategories: [],
        },
      })
    );
    const titles = ['componentCategories', 'componentTags', 'recipeCategories'].map((kind) =>
      root.querySelector(`${panelSelector(kind)} .manager-empty`)?.textContent.trim()
    );
    for (const title of titles) {
      assert.ok(title && title.length > 0, 'every empty panel states something');
    }
    assert.equal(
      new Set(titles).size,
      3,
      'and each states its OWN copy — three identical empty states would mean the per-kind ' +
        'lang table had collapsed to one entry'
    );
  });

  it('states a search MISS with the query the GM typed', async () => {
    const root = await harness.mount(mountProps());
    const panel = root.querySelector(panelSelector('componentCategories'));
    const search = panel.querySelector('.manager-search input');
    search.value = 'zzz';
    search.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    flushSync();

    const miss = panel.querySelector('.manager-empty');
    assert.ok(Boolean(miss), 'a query with no surviving rows renders the search-miss state');
    assert.ok(miss.textContent.includes('zzz'), `the query is substituted: ${miss.textContent}`);
    assert.equal(miss.textContent.includes('{query}'), false);
    assert.equal(
      panel.querySelectorAll('[data-component-category-id]').length,
      0,
      'and no row survives it'
    );
  });

  it('sorts by References, and the direction toggle reverses that too', async () => {
    const root = await harness.mount(mountProps());
    const panel = root.querySelector(panelSelector('componentCategories'));
    const select = panel.querySelector('select[data-wvocab-sort]');
    select.value = 'references';
    select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();

    const namesNow = () =>
      [...panel.querySelectorAll('[data-component-category-id] .manager-vocabulary-main strong')].map(
        (el) => el.textContent
      );
    // 0, 0, 3 ascending, with the two zeroes tie-broken by name.
    assert.deepEqual(namesNow(), ['Curios', 'Spare', 'Reagent']);
    panel.querySelector('button[data-wvocab-direction]').click();
    flushSync();
    assert.deepEqual(namesNow(), ['Reagent', 'Curios', 'Spare']);
  });
});
