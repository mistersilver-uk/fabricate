/**
 * Source contract: the ordered row is one implementation, at its published API (issue 1512).
 *
 * Three obligations are invisible to a mounted test and to a frame alike. The API, because
 * `library.html` states a Svelte API for `<SortableList>` and the claim this change makes is that
 * the component IS that specimen — so the two are read together, in both directions. The shape of
 * the row, because a whole-row button nesting the row's own controls is invalid DOM that renders
 * identically, and an absence is what a source read can prove. And that the collapsed-body ruling
 * is ONE constant with no prop, which is a source fact rather than a rendered one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const PRIMITIVE = 'src/ui/svelte/components/SortableList.svelte';
const LIBRARY = 'openspec/specs/design-system/library.html';

const read = (file) => readFileSync(path.join(REPO_ROOT, file), 'utf8');

/**
 * The amended published set, in the order the component destructures it. `handles` is retired
 * because `reorderable` subsumes it, and the library's API block is amended in the same commit.
 */
const DECLARED_PROPS = Object.freeze([
  'items',
  'onReorder',
  'itemLabel',
  'numbered',
  'removable',
  'onRemove',
  'reorderable',
  'expandable',
  'expandedId',
  'onToggle',
  'alwaysOpen',
  'row',
  'body',
  'footer',
  'rowClass',
  'rowData',
  'dataAttr',
  'dataValue',
]);

/** The component's `$props()` destructuring, comments stripped, in source order. */
function destructuredProps() {
  const source = read(PRIMITIVE);
  const opener = 'let {';
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, `${PRIMITIVE} no longer destructures \`$props()\` as \`let { … }\``);
  const end = source.indexOf('} = $props();', start);
  assert.notEqual(end, -1, `${PRIMITIVE}'s \`$props()\` destructuring is unterminated`);

  // `//` comments are stripped rather than matched around: a default holding an arrow function or
  // an object literal carries commas and braces of its own, so a comma-split over the raw text
  // would drop props on the floor and make every clause below quietly smaller.
  const body = source
    .slice(start + opener.length, end)
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/u, ''))
    .join('\n');

  return [...body.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*[=,]/gmu)].map(([, name]) => name);
}

/** The `<b>`-tagged prop names inside the `<SortableList>` specimen's Svelte API block. */
function publishedProps() {
  const library = read(LIBRARY);
  const specimen = library.indexOf('data-status-SortableList=');
  assert.notEqual(specimen, -1, `${LIBRARY} no longer carries a <SortableList> specimen`);
  const apiStart = library.indexOf('<h5>Svelte API</h5>', specimen);
  assert.notEqual(apiStart, -1, 'the <SortableList> specimen no longer states a Svelte API');
  const apiEnd = library.indexOf('</ul>', apiStart);
  assert.notEqual(apiEnd, -1, 'the <SortableList> API block is unterminated');

  const block = library.slice(apiStart, apiEnd);
  const names = new Set();
  // A `<b>` may carry several names on one line — the block writes `numbered · removable · onRemove`
  // and `dataAttr / dataValue` that way — so each bold run is split on the two separators it uses.
  for (const [, run] of block.matchAll(/<b>([^<]+)<\/b>/gu)) {
    for (const name of run.split(/[·/]/u)) {
      const trimmed = name.trim();
      if (/^[A-Za-z][\w]*$/u.test(trimmed)) names.add(trimmed);
    }
  }
  return names;
}

test('the primitive accepts exactly the amended published prop set, in that order', () => {
  assert.deepEqual(
    destructuredProps(),
    [...DECLARED_PROPS],
    'the ordered row accepts a prop set the library does not publish, or has stopped accepting ' +
      'one it does. This component IS the specimen rather than a component inspired by it: the ' +
      'API block and the destructuring are two statements of one contract, and a prop added to ' +
      'either alone is a divergence neither document can notice on its own. Publish it in ' +
      '`openspec/specs/design-system/library.html` in the same change, or do not add it.'
  );
});

test('every published prop is one the component actually accepts', () => {
  // Both directions. The clause above catches a prop arriving in the component and not in the
  // library; this one catches the reverse, which is the shape a specification rots into.
  const published = publishedProps();
  assert.ok(
    published.size >= DECLARED_PROPS.length,
    `the API block publishes only ${published.size} prop names, against the ` +
      `${DECLARED_PROPS.length} this component accepts. The reader has stopped matching, and ` +
      'the clause below would pass over almost nothing.'
  );

  const accepted = new Set(DECLARED_PROPS);
  const unaccepted = [...published].filter(
    (name) => !accepted.has(name) && !['SHIPPED'].includes(name)
  );
  assert.deepEqual(
    unaccepted,
    [],
    'the library publishes a prop the component does not accept. A published API describing ' +
      'behaviour the code does not have is worse than none: a caller reads it, writes the call, ' +
      'and the framework silently discards the value.'
  );
});

test('the row is not a button, and exactly one control in it opens the row', () => {
  const source = read(PRIMITIVE);
  const markup = source.slice(source.indexOf('</script>'));
  const rowStart = markup.indexOf('<li');
  assert.notEqual(rowStart, -1, `${PRIMITIVE} no longer renders its rows as list items`);
  const rowEnd = markup.indexOf('>', markup.indexOf('ondrop=', rowStart));
  const rowAttributes = markup.slice(rowStart, rowEnd);

  // A whole-row button nests the row's own grip, chevrons, disclosure and delete, which is invalid
  // DOM that renders identically. Each token is asserted separately so a failure names the one
  // that arrived.
  assert.ok(!/role="button"/u.test(rowAttributes), 'the row must not wear an interactive role');
  assert.ok(!/\btabindex=/u.test(rowAttributes), 'the row must not join the tab order');
  assert.ok(!/\bonclick=/u.test(rowAttributes), 'the row must not be clickable as a whole');

  // One opener: `RowDisclosure` is the only control the list renders that writes `expandedId`, and
  // the copy beside it is inert, which is the maintainer's chevron-only ruling.
  const togglers = [...markup.matchAll(/onToggle=\{\(\) => toggle\(item\)\}/gu)];
  assert.equal(
    togglers.length,
    1,
    'exactly one control in the row toggles the open state. A second opener is how the copy ' +
      'became a toggle in the first place, and it is the decision the maintainer overturned.'
  );
  assert.ok(
    /<RowDisclosure[\s\S]{0,400}onToggle=\{\(\) => toggle\(item\)\}/u.test(markup),
    'and that control is `RowDisclosure`, the product`s one row disclosure, rather than a ' +
      'chevron this component draws for itself'
  );
});

test('the collapsed-body ruling is one switch, with no prop exposing it', () => {
  const source = read(PRIMITIVE);
  const declarations = [...source.matchAll(/const KEEP_COLLAPSED_BODY = (true|false);/gu)];
  assert.equal(
    declarations.length,
    1,
    'the collapsed-body ruling must be exactly one module-level constant. The maintainer ruled ' +
      'KEEP, and the reason there is no prop is the reason the question was open at all: a ' +
      'choice offered per call site is how two defensible behaviours became accidental.'
  );
  assert.equal(declarations[0][1], 'true', 'and it implements the ruling, which is KEEP');

  // Counted over the script and markup regions rather than the whole file, because the component's
  // header names the constant and a sentence explaining it is not a second behaviour keyed on it.
  const code = source.slice(source.indexOf('<script>'));
  assert.equal(
    [...code.matchAll(/KEEP_COLLAPSED_BODY/gu)].length,
    2,
    'the constant is declared once and read once — the single `{#if}` it guards. A second read ' +
      'is a second behaviour keyed on the same switch.'
  );
  assert.ok(
    !/KEEP_COLLAPSED_BODY\s*=\s*\$bindable/u.test(source) &&
      !destructuredProps().some((name) => /collapsed|keepBody/iu.test(name)),
    'and no prop exposes it'
  );
});

test('focus lands before the live region is written, in the one place that can hold it', () => {
  // A region written in the same mutation as the focus change is not announced, which is why the
  // capability states the ordering. It is pinned here rather than in the mounted suite for a
  // measured reason: the focus call is imperative and the region's text is state, so the text
  // lands on the flush that follows the effect either way and swapping the two statements produces
  // a byte-identical DOM sequence. The mounted suite holds the three facts that ARE observable.
  const source = read(PRIMITIVE);
  const effect = source.slice(source.indexOf('$effect(() => {'));
  const focusAt = effect.indexOf('grip?.focus?.();');
  const announceAt = effect.indexOf('announcement = sentence;');
  assert.ok(focusAt !== -1 && announceAt !== -1, 'the effect still focuses and still announces');
  assert.ok(
    focusAt < announceAt,
    'the live region is written AFTER focus has landed on the moved row`s grip. A region written ' +
      'in the same mutation as the focus change is not announced at all, so a GM moving a row ' +
      'from the keyboard hears nothing.'
  );
});

test('the moved name is read BEFORE the caller round-trips the array', () => {
  // A source read for a measured reason: the caller's `onReorder` is synchronous and the list's own
  // `items` prop does not change until the caller sets it, so a name read AFTER the call still
  // reads the pre-move array inside a mounted harness and both orders agree. On a real surface the
  // caller round-trips through its store, `items[index]` afterwards is a different record, and the
  // announcement names the wrong one — which is invisible to every rendered assertion.
  const source = read(PRIMITIVE);
  const move = source.slice(source.indexOf('function moveFrom('), source.indexOf('/** The keyboard'));
  const nameAt = move.indexOf('reorderAnnouncementText(nameOf(list[index])');
  const emitAt = move.indexOf('onReorder(index, target);');
  assert.ok(nameAt !== -1 && emitAt !== -1, 'the move still names the record and still emits');
  assert.ok(
    nameAt < emitAt,
    'the moved record`s name is composed BEFORE `onReorder`, because the caller round-trips the ' +
      'array and the item at that index afterwards is a different record'
  );
});

test('every control the list renders declares itself focused to Foundry', () => {
  // Not one raw `<button>`: the grip, both rocker chevrons and the remove are `IconButton`s and the
  // disclosure is `RowDisclosure`, and every one of those emits `data-keyboard-focus="true"`. A raw
  // button here would be a control `KeyboardManager#hasFocus` cannot see — it returns
  // `!!focused.form` and this application renders almost no forms — so the arrows would pan the
  // canvas instead of moving the row.
  const source = read(PRIMITIVE);
  const markup = source.slice(source.indexOf('</script>'));
  assert.ok(
    !/<button/u.test(markup),
    'the list renders no raw `<button>`: every control it draws is a primitive that declares ' +
      '`data-keyboard-focus="true"` for itself'
  );
  assert.ok(
    /import IconButton from '\.\/IconButton\.svelte';/u.test(source),
    'the grip, the rocker and the remove render through the shared icon button'
  );
  assert.ok(
    /import RowDisclosure from '\.\/RowDisclosure\.svelte';/u.test(source),
    'and the disclosure through the shared row disclosure'
  );
});

test('the family is declared in the global sheet and not in a scoped block', () => {
  // A shared primitive's family belongs in `styles/fabricate.css`: a Svelte-scoped rule is injected
  // unlayered against a sheet imported at `layer(modules)`, so it silently out-ranks every global
  // rule at any specificity, and the gate proving a family is not application-rooted cannot see a
  // scoped block at all. Anchored at the start of a line, because this component's own header
  // states the rule and names the element it forbids.
  const source = read(PRIMITIVE);
  assert.ok(!/^<style>/mu.test(source), `${PRIMITIVE} must declare no scoped <style> block`);
  assert.ok(
    read('styles/fabricate.css').includes('.fabricate-sortable-list {'),
    'and `styles/fabricate.css` declares the family at the root the component emits'
  );
});
