/**
 * THE PILL FAMILY IS ROUTED, PER DESTINATION (issue 1515).
 *
 * The `.manager-availability-*` family was one CSS vocabulary standing in for seven different
 * things — a removable membership token, a read-only fact chip, an empty state, a container, a
 * field wrapper, a popover trigger and a number editor — and each of those has a shipped answer.
 * Retiring the family is therefore a ROUTING problem and not a rename, which is why this file
 * asserts a destination per site class rather than one blanket "they are all chips": a single
 * class-absence assertion would pass just as well if every site had been deleted, or if the four
 * read-only fact chips had grown a remove control the screen cannot honour.
 *
 * THE HAYSTACK IS THE SIX VIEWS' SOURCE TEXT, MARKUP AND JAVASCRIPT ALIKE, COMMENTS STRIPPED.
 * Three of the sites were never markup at all — the events browser built its chips as data and
 * carried the class on a `pillClass:` string literal — so a markup-only scan would have reported
 * the family retired while three sites still emitted it. Comments are stripped because two of the
 * thirty-nine occurrences are prose recording that a wrapper is GONE, and a check that cannot
 * tell a rendered class from a sentence about one is a check that forbids writing the sentence.
 *
 * EVERY COUNT HAS A FLOOR, and that is the whole reason this file is not a set of `!includes`
 * assertions. An emptied view emits no family class either.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The six views that carried the family. */
const VIEWS = Object.freeze({
  taskEdit: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
  eventEdit: 'src/ui/svelte/apps/manager/GatheringEventEditView.svelte',
  environmentOverview: 'src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte',
  worldCurrency: 'src/ui/svelte/apps/manager/world/WorldCurrencyTab.svelte',
  eventsBrowser: 'src/ui/svelte/apps/manager/GatheringEventsBrowserView.svelte',
  tasksBrowser: 'src/ui/svelte/apps/manager/GatheringTasksBrowserView.svelte'
});

/**
 * The view's source with comments removed: HTML comment blocks, block comments, and whole lines
 * that are a line comment or the continuation of a block one. Deliberately conservative — a `//`
 * inside a string (a URL) is left alone, because only whole comment LINES are dropped.
 *
 * @param {string} source
 * @returns {string}
 */
function withoutComments(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

/**
 * Every `<Element …>…</Element>` occurrence as its own text span, so a per-site assertion reads
 * one element rather than the whole file. Slicing to the closing tag rather than to the end of
 * the open tag is deliberate: an attribute list broken across lines has no single delimiter that
 * survives `{…}` expressions, and a chip's children never contain the prop names asserted below.
 *
 * @param {string} source
 * @param {string} name
 * @returns {string[]}
 */
function elements(source, name) {
  const spans = [];
  const open = `<${name}`;
  const close = `</${name}`;
  let index = source.indexOf(open);
  while (index !== -1) {
    const end = source.indexOf(close, index);
    spans.push(source.slice(index, end === -1 ? source.length : end));
    index = source.indexOf(open, index + open.length);
  }
  return spans;
}

/**
 * Self-closing `<Element … />` occurrences, which `elements` cannot see because they have no
 * closing tag.
 *
 * @param {string} source
 * @param {string} name
 * @returns {string[]}
 */
function selfClosingElements(source, name) {
  return [...source.matchAll(new RegExp(`<${name}\\b[\\s\\S]*?/>`, 'g'))].map((match) => match[0]);
}

const sources = Object.fromEntries(
  Object.entries(VIEWS).map(([key, path]) => [
    key,
    withoutComments(readFileSync(resolve(repoRoot, path), 'utf8'))
  ])
);

test('the routing scan is alive, so every assertion below can fail', () => {
  for (const [key, path] of Object.entries(VIEWS)) {
    assert.ok(
      sources[key].length > 4000,
      `${path} scanned to only ${sources[key].length} characters, so this file is asserting about nothing`
    );
  }
  // The family is a real vocabulary in this tree, not a name nothing ever used: the primitive
  // that KEEPS it still emits it. Without this the "no view emits it" assertions below would
  // read the same on a repo where the class had never existed.
  const modifierPillSelect = readFileSync(
    resolve(repoRoot, 'src/ui/svelte/components/ModifierPillSelect.svelte'),
    'utf8'
  );
  assert.ok(
    withoutComments(modifierPillSelect).includes('manager-availability-pill'),
    'ModifierPillSelect is the family’s remaining emitter; if it has stopped emitting it, this scan has no subject'
  );
});

test('none of the six views emits the availability family any more', () => {
  for (const [key, path] of Object.entries(VIEWS)) {
    const hits = [...sources[key].matchAll(/manager-availability-[a-zA-Z-]+/g)].map(
      (match) => match[0]
    );
    assert.deepEqual(
      hits,
      [],
      `${path} still emits ${[...new Set(hits)].join(', ')} outside a comment`
    );
  }
});

test('the editable sets render removable chips, each with a name for the member it removes', () => {
  // The membership tokens, per view. A removable chip REFUSES to render without a name, so the
  // floor is what makes the refusal reachable rather than hypothetical.
  const expected = { taskEdit: 3, eventEdit: 1, environmentOverview: 2, worldCurrency: 1 };
  for (const [key, floor] of Object.entries(expected)) {
    const removable = elements(sources[key], 'Chip').filter((span) => /\n\s*removable\b/.test(span));
    assert.ok(
      removable.length >= floor,
      `${VIEWS[key]} renders ${removable.length} removable chip site(s), fewer than the ${floor} the editable sets need`
    );
    for (const span of removable) {
      assert.ok(
        /\n\s*removeLabel=\{/.test(span),
        `a removable chip in ${VIEWS[key]} passes no removeLabel, so the primitive refuses to render it`
      );
      assert.ok(
        /\n\s*onRemove=\{/.test(span),
        `a removable chip in ${VIEWS[key]} passes no onRemove, so it offers an edit the screen cannot make`
      );
    }
  }
});

test('the read-only fact chips are chips and are NOT removable', () => {
  for (const key of ['tasksBrowser', 'eventsBrowser']) {
    const chips = elements(sources[key], 'Chip');
    assert.ok(
      chips.length >= 1,
      `${VIEWS[key]} renders no chip at all, so its row facets are not routed`
    );
    for (const span of chips) {
      assert.ok(
        !/\bremovable\b/.test(span),
        `a row fact chip in ${VIEWS[key]} is removable; a chip a GM cannot delete must never offer the control`
      );
    }
    // The face each facet asks for: a biome carries an authored colour and takes the tint, and
    // the two conditions take a tone. Asserting the props rather than the rendered colour is the
    // point — the colour is the theme's, the ROUTE is this view's.
    assert.ok(/\btint: entry\.colorToken \|\| 'sage'/.test(sources[key]), `${VIEWS[key]} drops the biome's authored colour`);
    assert.ok(/tone: 'tag'/.test(sources[key]), `${VIEWS[key]} drops the time-of-day facet's tone`);
    assert.ok(/tone: 'warning'/.test(sources[key]), `${VIEWS[key]} drops the weather facet's tone`);
  }
});

test('the "matches any" lines are the inline empty state, never the icon-and-title panel', () => {
  const expected = { taskEdit: 2, eventEdit: 2 };
  for (const [key, floor] of Object.entries(expected)) {
    const inline = selfClosingElements(sources[key], 'EmptyState').filter((span) =>
      /\binline\b/.test(span)
    );
    assert.ok(
      inline.length >= floor,
      `${VIEWS[key]} renders ${inline.length} inline empty state(s), fewer than the ${floor} its "matches any" lines need`
    );
    for (const span of inline) {
      assert.ok(
        !/\bicon=/.test(span) && !/\btitle=/.test(span),
        `an inline empty state in ${VIEWS[key]} carries an icon or a title, which is the hero panel and not the quiet line`
      );
      assert.ok(
        /\bhint=\{/.test(span),
        `an inline empty state in ${VIEWS[key]} says nothing at all`
      );
    }
  }
});

test('the pill rows are the shared chip container', () => {
  const rows = Object.entries(VIEWS).reduce(
    (total, [key]) => total + (sources[key].match(/class="manager-chip-row"/g) || []).length,
    0
  );
  assert.ok(
    rows >= 8,
    `the six views declare ${rows} shared chip row container(s), fewer than the 8 the family carried`
  );
});

test('the multi wrappers keep the shared field and the popover triggers are re-pointed', () => {
  const fields =
    (sources.taskEdit.match(/<Field as="div"/g) || []).length +
    (sources.eventEdit.match(/<Field as="div"/g) || []).length;
  assert.ok(fields >= 3, `the two gathering editors declare ${fields} div-hosted fields, fewer than the 3 the family wrapped`);

  const triggers =
    (sources.taskEdit.match(/triggerClass="manager-condition-menu-button"/g) || []).length +
    (sources.eventEdit.match(/triggerClass="manager-condition-menu-button"/g) || []).length;
  assert.equal(triggers, 2, 'both condition pickers hand the popover primitive the re-pointed trigger class');
});

test('the sub-unit amount is still an editable number, under a name outside the family', () => {
  const amounts = [...sources.worldCurrency.matchAll(/<input[\s\S]*?\/>/g)].filter((match) =>
    match[0].includes('class="manager-currency-subunit-amount"')
  );
  assert.equal(amounts.length, 1, 'the currency sub-unit amount is one editable number field');
  assert.ok(
    /type="number"/.test(amounts[0][0]),
    'the sub-unit amount is a number a GM can change, not a badge that reads one back'
  );
});

test('every host row that lost its hand-written control books a live region', () => {
  // The obligation is the CALLER'S — a chip primitive cannot own one — and it is one region per
  // ROW, never one per chip: a region wrapped around the row announces each added chip's whole
  // subtree and nothing at all on a removal.
  const expected = {
    taskEdit: 2,
    eventEdit: 2,
    environmentOverview: 2,
    worldCurrency: 1
  };
  for (const [key, floor] of Object.entries(expected)) {
    const regions = (
      sources[key].match(/class="visually-hidden"\s*\n?\s*aria-live="polite"/g) || []
    ).length;
    assert.ok(
      regions >= floor,
      `${VIEWS[key]} books ${regions} live region(s) beside its editable sets, fewer than the ${floor} its host rows need`
    );
  }
});
