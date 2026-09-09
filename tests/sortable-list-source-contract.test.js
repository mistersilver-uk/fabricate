/**
 * Source contract: the ordered row is ONE implementation, at its PUBLISHED API (issue 1512).
 *
 * ── WHY A SOURCE CONTRACT AND NOT ONLY A MOUNTED SUITE ────────────────────────────────────
 * Two of this primitive's obligations are invisible to a mounted test and to a frame alike.
 *
 * The first is the API. `openspec/specs/design-system/library.html` states a Svelte API for
 * `<SortableList>`, and the whole claim this change makes is that the component IS that
 * specimen rather than a component inspired by it. A prop added here and not published there —
 * or published there and never accepted here — is a silent divergence between the specification
 * and the thing it specifies, and neither document can notice it on its own. So the two are read
 * TOGETHER: the destructured `$props()` set is compared against the names the library's own API
 * block lists, in both directions.
 *
 * The second is the shape of the row. `design-system/spec.md` requires the row to stay
 * NON-FOCUSABLE and NOT A BUTTON, because a whole-row button nests the row's own grip, chevrons,
 * disclosure and delete — invalid DOM that `createElement` accepts, that renders identically, and
 * that no mounted assertion resolving a control by its `data-*` hook can see. An absence is
 * exactly what a source read can prove and a rendered read cannot.
 *
 * ── AND THE ONE SWITCH ────────────────────────────────────────────────────────────────────
 * The maintainer's collapsed-body ruling is implemented as a single module-level constant with a
 * single `{#if}` guarding it, deliberately: a prop would be the "callers keep choosing by
 * accident" outcome the open question existed to close. That it is ONE constant is a source fact,
 * and this file is where it is held.
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
 * The AMENDED published set, in the order the component destructures it.
 *
 * The specimen's twelve, plus the seven this change publishes into `library.html:1702` in the
 * SAME commit as the status flip — because this file reads that block, and a contract that read
 * the pre-amendment one would be asserting the component against a specification the change had
 * already superseded.
 */
const DECLARED_PROPS = Object.freeze([
  'items',
  'onReorder',
  'itemLabel',
  'numbered',
  'handles',
  'removable',
  'expandable',
  'expandedId',
  'onToggle',
  'alwaysOpen',
  'body',
  'footer',
  'row',
  'onRemove',
  'reorderable',
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
  // drops props on the floor and would make every clause below quietly smaller.
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
  // A `<b>` may carry SEVERAL names on one line — the specimen writes `numbered · handles ·
  // removable` and `dataAttr / dataValue` that way — so each bold run is split on the two
  // separators the block uses before the names are counted. Reading only single-name `<b>`
  // elements would silently drop five of the nineteen and make the floor below unreachable.
  for (const [, run] of block.matchAll(/<b>([^<]+)<\/b>/gu)) {
    for (const name of run.split(/[·/]/u)) {
      const trimmed = name.trim();
      if (/^[A-Za-z][\w]*$/u.test(trimmed)) names.add(trimmed);
    }
  }
  return names;
}

test('the primitive accepts exactly the AMENDED published prop set, in that order', () => {
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
  // BOTH DIRECTIONS. The clause above catches a prop that arrives in the component and not in the
  // library; this one catches the reverse, which is the shape a specification rots into — a
  // published API that describes something the code stopped doing.
  const published = publishedProps();
  assert.ok(
    published.size >= DECLARED_PROPS.length,
    `the API block publishes only ${published.size} prop names, against the ` +
      `${DECLARED_PROPS.length} this component accepts. The reader has stopped matching, and ` +
      'the clause below would pass over almost nothing.'
  );

  const accepted = new Set(DECLARED_PROPS);
  // `SHIPPED`, `row`'s snippet arity and the note about `expandedId`'s keying are prose in the
  // same block; only names that ARE props are compared, and the direction that matters is that
  // every published PROP is accepted.
  const unaccepted = [...published].filter(
    (name) => !accepted.has(name) && !['SHIPPED'].includes(name)
  );
  assert.deepEqual(
    unaccepted,
    [],
    'the library publishes a prop the component does not accept. A published API that describes ' +
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

  // A WHOLE-ROW BUTTON IS THE DEFECT THIS PRIMITIVE EXISTS TO END. It nests the row's own grip,
  // chevrons, disclosure and delete, which is invalid DOM that `createElement` accepts, that
  // renders identically, and that no mounted assertion resolving a control by its `data-*` hook
  // can see. Each token is asserted separately so a failure names the one that arrived.
  assert.ok(!/role="button"/u.test(rowAttributes), 'the row must not wear an interactive role');
  assert.ok(!/\btabindex=/u.test(rowAttributes), 'the row must not join the tab order');
  assert.ok(!/\bonclick=/u.test(rowAttributes), 'the row must not be clickable as a whole');

  // ONE OPENER. `RowDisclosure` is the only control the list renders that writes `expandedId`,
  // and the copy beside it is inert — which is the maintainer's chevron-only ruling (M3,
  // 2026-09-09) stated where it can be checked.
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
      'KEEP on 2026-09-09, and the reason there is no prop is the reason the question was open ' +
      'at all: a choice offered per call site is how two defensible behaviours became accidental.'
  );
  assert.equal(declarations[0][1], 'true', 'and it implements the ruling, which is KEEP');

  // The component's own header comment names the constant, so the count is taken over the SCRIPT
  // and MARKUP regions rather than over the whole file: a sentence explaining the switch is not a
  // second behaviour keyed on it.
  const code = source.slice(source.indexOf('<script>'));
  const uses = [...code.matchAll(/KEEP_COLLAPSED_BODY/gu)];
  assert.equal(
    uses.length,
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
  // A REGION WRITTEN IN THE SAME MUTATION AS THE FOCUS CHANGE IS NOT ANNOUNCED, which is why the
  // capability states the ordering at all. It is pinned HERE rather than in the mounted suite, and
  // that is a measured limitation rather than a preference: the focus call is imperative and the
  // region's text is STATE, so the text lands on the flush that follows the effect either way —
  // swapping the two statements produces a byte-identical DOM sequence, and the mounted suite
  // cannot tell them apart. Measured: the mounted run is green under both orders.
  //
  // So the ordering is held where it is expressible, and the mounted suite holds the three facts
  // that ARE observable — the move, the focus destination and the sentence's content.
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

test('every control the list renders declares itself focused to Foundry', () => {
  // Not one raw `<button>`: the grip, both rocker chevrons and the remove are `IconButton`s and
  // the disclosure is `RowDisclosure`, and every one of those primitives emits
  // `data-keyboard-focus="true"` itself. A raw button here would be a control Foundry's
  // `KeyboardManager#hasFocus` cannot see — `hasFocus` returns `!!focused.form` for a button and
  // this application renders almost no forms — so the arrows would pan the canvas instead of
  // moving the row, which is the one interaction this primitive exists for.
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
  // `design-system/spec.md`: a shared primitive's family belongs in `styles/fabricate.css`. A
  // Svelte-scoped rule is injected UNLAYERED against a sheet imported at `layer(modules)`, so it
  // silently out-ranks every global rule at any specificity — and the gate that proves a family
  // is not application-rooted cannot see a scoped block at all.
  const source = read(PRIMITIVE);
  // Anchored at the start of a line, because this component's own header comment states the rule
  // and names the element it forbids — a bare `includes` would red on the sentence that explains
  // the requirement rather than on a breach of it.
  assert.ok(!/^<style>/mu.test(source), `${PRIMITIVE} must declare no scoped <style> block`);

  const sheet = read('styles/fabricate.css');
  assert.ok(
    sheet.includes('.fabricate-sortable-list {'),
    'and `styles/fabricate.css` declares the family at the root the component emits'
  );
});
