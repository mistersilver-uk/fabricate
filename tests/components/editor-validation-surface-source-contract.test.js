/**
 * The END STATE of the editor validation surface's adoption, pinned in source (issue 1444).
 *
 * ── WHAT IT PINS AND WHY ────────────────────────────────────────────────────────────────
 * The validation surface was two things at once: a component, and a CONVENTION — write the
 * `manager-recipe-val-*` and `manager-recipe-rail-*` classes and the global sheet paints the
 * arrangement, whether or not you rendered the component. Two editors still took the second
 * route as issue 1444 opened, so `spec.md`'s "Validation is one screen everywhere" was a
 * sentence three copies of the markup were free to drift from. This file is what makes it an
 * enforceable claim: with the copies gone, a returning raw `.manager-recipe-val-row` is a
 * fourth copy starting, and the only thing that can report it is a source gate.
 *
 * ── WHICH CLASS IS THE CONTRACT, AND THE PREFIX PROBLEM ─────────────────────────────────
 * TWO contracts rather than one, because the surface has two halves that a partial conversion
 * could take separately: `manager-recipe-val-row` is the grouped row stack and
 * `manager-recipe-rail-count` is the aggregate header's count tile.
 *
 * Neither `manager-recipe-val` nor `manager-recipe-rail` is used, and that is a measurement
 * rather than a preference: neither exists as a class on any element in the corpus. They are
 * PREFIXES of the real ones and nothing more, so a contract stated over either would count
 * zero everywhere and both clauses would pass vacuously over an empty domain — the exact
 * failure `tests/helpers/primitiveAdoptionContract.js`'s docblock records the detector
 * shipping with.
 *
 * The two that ARE used are each a prefix of a real sibling, which is why the factory's
 * `(?![\w-])` termination is load-bearing here in both of its forms: `manager-recipe-val-row`
 * is a prefix of `manager-recipe-val-rows`, terminated by a WORD character, and
 * `manager-recipe-rail-count` is a prefix of both `manager-recipe-rail-counts` and
 * `manager-recipe-rail-count-label`, terminated by a word character and by a HYPHEN
 * respectively. A `\b`-terminated pattern counts the hyphenated one, and a substring test
 * counts all four. The detector fixtures below drive every one of those cases.
 *
 * ── WHERE THE FIVE SHARED CLAUSES LIVE ──────────────────────────────────────────────────
 * `tests/helpers/primitiveAdoptionContract.js`, shared with `field-source-contract.test.js`
 * and `manager-filter-bar-source-contract.test.js`. It supplies the raw-element clause, the
 * self-cleaning allowlist, the detector's own discrimination fixture, the valueless-attribute
 * clause and the corpus floors.
 *
 * ── AND THE CLAUSES THAT EARN THIS FILE ─────────────────────────────────────────────────
 * Both are about the surface's two attribute BAGS, and both exist for one reason: a bag keyed
 * by name is silent about a name it does not recognise. `hookAttrs={{ summaryrow: … }}` spreads
 * nothing, renders identically to a site that passed no hook at all, and takes the site's
 * DOM contract with it — which is issue 1116's defect class exactly, unreachable configuration
 * that looks identical to working configuration. The keys are read out of the PRIMITIVE's own
 * source (its `hooksFor('…')` call sites and its `COUNT_ORDER`) rather than re-typed here, so
 * widening the surface widens the gate and a call site cannot be greened by editing this file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'svelte/compiler';

import {
  SOURCES,
  definePrimitiveAdoptionContract,
  walkTemplate,
} from '../helpers/primitiveAdoptionContract.js';

/** The primitive whose adoption this file pins. */
const SURFACE_PATH = 'src/ui/svelte/apps/manager/EditorValidationSurface.svelte';

const TAG = 'EditorValidationSurface';

/**
 * The allowlist for BOTH contracts, and its one entry is the primitive itself.
 *
 * `Field` and `ManagerToolbar` need no such entry because each builds its contract class in a
 * `class={classes}` expression, so the raw-element detector — which reads the `class`
 * attribute's SOURCE TEXT — never sees the token. This surface writes both of its contract
 * classes as literals inside the template, on the row `<li>` and the tile `<li>`, which is the
 * legible thing for the file that OWNS them to do; making them invisible to the detector would
 * mean computing them in the script purely to satisfy a test.
 *
 * So the entry is the owner rather than deferred debt, and unlike every other entry on any of
 * these allowlists it will never reach zero. It is still an exact-count pin and still earns its
 * place: a second raw element in this file carrying either class means the surface has grown a
 * second row stack or a second count rail, which is precisely the drift both clauses exist to
 * refuse.
 *
 * @param {string} contractClass
 * @returns {ReadonlyArray<{path: string, sites: number, why: string}>}
 */
function ownerAllowlist(contractClass) {
  return Object.freeze([
    Object.freeze({
      path: SURFACE_PATH,
      sites: 1,
      why:
        `The primitive itself, which writes \`${contractClass}\` on exactly one raw element ` +
        'as a literal in its template rather than through a `class={…}` expression. The entry ' +
        'is the OWNER rather than deferred debt, so it never reaches zero — but the count is ' +
        'still pinned, because a second raw element carrying this class here would be a second ' +
        'row stack or a second count rail inside the one component that defines the surface.',
    }),
  ]);
}

/**
 * A synthetic source for the raw-element detector, written per contract because the tokens are
 * what is being discriminated.
 *
 * Three negatives, and each is a real class in this corpus rather than an invented one: the
 * `s`-suffixed sibling (`…-rows`, `…-counts`), the hyphen-suffixed sibling (`…-row-label`,
 * `…-count-label`) and the component tag. A substring test counts four sites here, a
 * `\b`-terminated pattern counts three, and the correct one counts two.
 *
 * @param {{contract: string, suffixed: string, hyphenated: string}} tokens
 * @returns {string}
 */
function detectorSource({ contract, suffixed, hyphenated }) {
  return [
    '<!--',
    `  Prose mentioning ${contract}, which is how this surface documents itself.`,
    '-->',
    '<script>',
    `  import ${TAG} from '../EditorValidationSurface.svelte';`,
    '</script>',
    '',
    `<li class="${contract}">a converted-looking site that is still raw</li>`,
    `<li class={\`${contract} is-block\`}>a second one, built from a template</li>`,
    `<ul class="${suffixed}">a longer class the token is a PREFIX of, ending in a word</ul>`,
    `<span class="${hyphenated}">a longer class the token is a PREFIX of, over a hyphen</span>`,
    `<${TAG} class="${contract}">the converted shape, on a component tag</${TAG}>`,
    '',
    '<style>',
    `  .${contract} { color: red; }`,
    '</style>',
  ].join('\n');
}

/**
 * Register one contract. Both halves of the surface get the identical five clauses, and the
 * differences between them are the two tokens and the fixture's negatives.
 *
 * @param {{contract: string, suffixed: string, hyphenated: string, half: string}} spec
 * @returns {{callSites: object[]}}
 */
function defineHalf({ contract, suffixed, hyphenated, half }) {
  return definePrimitiveAdoptionContract({
    label: contract,
    tag: TAG,
    primitive: SURFACE_PATH,
    contractClass: contract,
    allowlist: ownerAllowlist(contract),
    callSiteFloor: 4,
    fileFloor: 4,
    detectorFixture: {
      source: detectorSource({ contract, suffixed, hyphenated }),
      expected: 2,
      lowered: [`class="${contract}"`, 'class="manager-box"'],
      loweredExpected: 1,
    },
    rawRemedy:
      `these components hand-roll the ${half} that ${SURFACE_PATH} owns. Render ` +
      "`<EditorValidationSurface>` and pass the site's own hooks, classes, labels and counts " +
      'as props — `spec.md` requires one arrangement everywhere, and a second copy of the ' +
      'markup is a second thing that can drift from it',
    valuelessRemedy:
      'write `attribute=""` instead — that renders identically on a raw element and through a ' +
      'rest spread, whereas a bare attribute on a COMPONENT tag arrives as boolean `true` and ' +
      'is written out as `="true"`. This surface hit that for real: the moment its root and ' +
      'its counts list grew a spread, its own bare `data-editor-validation-surface` and ' +
      '`data-editor-validation-counts` started rendering `="true"` for every existing caller, ' +
      'and every consumer of both is a presence selector that resolves either way',
  });
}

const rowContract = defineHalf({
  contract: 'manager-recipe-val-row',
  suffixed: 'manager-recipe-val-rows',
  hyphenated: 'manager-recipe-val-row-label',
  half: 'grouped validation row stack',
});

defineHalf({
  contract: 'manager-recipe-rail-count',
  suffixed: 'manager-recipe-rail-counts',
  hyphenated: 'manager-recipe-rail-count-label',
  half: 'validation count rail',
});

/**
 * The keys of the object literal a call site passes to one of the surface's bag props.
 *
 * Parsed from the AST rather than from the attribute's source text: a brace-counting scan over
 * `hookAttrs={{ root: { 'data-x': 'y' } }}` has to know which `{` opens a nested object and
 * which closes a string, and getting that subtly wrong yields an EMPTY key list, which makes
 * every clause below pass over nothing.
 *
 * @param {string} file repo-relative component path
 * @param {string} attributeName the prop to read
 * @returns {string[]|null} the literal's top-level keys, or null when the site passes no such
 *   prop or passes something that is not an object literal
 */
function bagKeys(file, attributeName) {
  const source = SOURCES[file];
  let keys = null;
  walkTemplate(parse(source, { modern: true, filename: file }).fragment, (node) => {
    if (node.type !== 'Component' || node.name !== TAG) return;
    const attribute = (node.attributes ?? []).find(
      (candidate) => candidate.type === 'Attribute' && candidate.name === attributeName
    );
    if (!attribute) return;
    const value = Array.isArray(attribute.value) ? attribute.value[0] : attribute.value;
    const expression = value?.expression;
    if (expression?.type !== 'ObjectExpression') return;
    keys = expression.properties.map(
      (property) => property.key?.name ?? String(property.key?.value ?? '')
    );
  });
  return keys;
}

/**
 * The region names the primitive actually spreads, read out of its own `hooksFor('…')` calls.
 *
 * @returns {string[]}
 */
function declaredRegions() {
  const source = SOURCES[SURFACE_PATH];
  const found = [...source.matchAll(/hooksFor\('([a-zA-Z]+)'\)/g)].map((match) => match[1]);
  assert.ok(
    found.length > 0,
    `${SURFACE_PATH} no longer calls \`hooksFor('…')\`, so the region set cannot be read from it`
  );
  return [...new Set(found)];
}

/** The count vocabulary the primitive declares, read out of its own source. */
function declaredCounts() {
  const declaration = /const COUNT_ORDER = \[([^\]]*)\]/.exec(SOURCES[SURFACE_PATH]);
  assert.ok(declaration, `${SURFACE_PATH} no longer declares \`const COUNT_ORDER = […]\``);
  return [...declaration[1].matchAll(/'([a-z]+)'/g)].map((match) => match[1]);
}

test('the count vocabulary is the closed three, in the order the rail draws them', () => {
  assert.deepEqual(
    declaredCounts(),
    ['passing', 'warnings', 'blocking'],
    'the count set changed. It is closed and ORDERED on purpose: `spec.md` fixes the counts ' +
      'as "the pass, warning and blocking counts in that order", and letting a call site ' +
      'supply the list would let one editor draw them in a different order — which is the ' +
      'thing a GM must never meet on the screen they open when something is wrong.'
  );
});

/**
 * Every call-site key of one bag prop that is not in the vocabulary the primitive declares,
 * with how many sites were examined.
 *
 * ONE walk shared by the two clauses below rather than two copies of it: the shape is
 * identical, and the site count it returns is what keeps each clause from passing over an
 * empty domain when the bag prop is renamed or the tag scan stops resolving.
 *
 * @param {string} attributeName the bag prop to read
 * @param {string[]} vocabulary the keys the primitive recognises
 * @returns {{offenders: string[], sites: number}}
 */
function unknownBagKeys(attributeName, vocabulary) {
  const offenders = [];
  let sites = 0;
  for (const file of Object.keys(SOURCES)) {
    const keys = bagKeys(file, attributeName);
    if (keys === null) continue;
    sites += 1;
    for (const key of keys) {
      if (!vocabulary.includes(key)) offenders.push(`${file}: ${attributeName}.${key}`);
    }
  }
  return { offenders: offenders.sort((left, right) => left.localeCompare(right)), sites };
}

test('every hook region a call site names is one the surface actually spreads', () => {
  const regions = declaredRegions();
  const { offenders, sites } = unknownBagKeys('hookAttrs', regions);
  // Non-vacuity. A bag prop nothing passes, or an AST walk that stopped resolving the tag,
  // reads as zero sites and greens this clause over an empty domain.
  assert.ok(sites >= 2, `only ${sites} <${TAG}> call sites pass \`hookAttrs\`, so this is moot`);
  assert.deepEqual(
    offenders,
    [],
    `a hook region must be one of ${regions.join(', ')}. An unrecognised key spreads NOTHING ` +
      "and renders exactly like a site that passed no hook at all, so the site's DOM contract " +
      'disappears with no error anywhere:\n  ' +
      offenders.join('\n  ')
  );
});

test('every count a call site attaches hooks to is one the surface draws', () => {
  const counts = declaredCounts();
  const { offenders, sites } = unknownBagKeys('countAttrs', counts);
  assert.ok(sites >= 2, `only ${sites} <${TAG}> call sites pass \`countAttrs\`, so this is moot`);
  assert.deepEqual(
    offenders,
    [],
    `a count hook must name one of ${counts.join(', ')}, and a site may hook a SUBSET — the ` +
      'Books & Scrolls tab reports two counts because its checks have no warning tier. An ' +
      'unrecognised key attaches to a tile that is never drawn:\n  ' +
      offenders.join('\n  ')
  );
});

test('every call site that hooks a count also reports it', () => {
  // The two bags are independent, so a site can attach `data-…-count-warnings` to a tile its
  // `counts` never reports. That renders nothing and reads, in the diff, exactly like a hook
  // that works — the same silence the region clause above exists for, one level down.
  const offenders = [];
  for (const file of Object.keys(SOURCES)) {
    const hooked = bagKeys(file, 'countAttrs');
    if (hooked === null) continue;
    const reported = bagKeys(file, 'counts');
    if (reported === null) continue;
    for (const key of hooked) {
      if (!reported.includes(key)) offenders.push(`${file}: countAttrs.${key}`);
    }
  }
  assert.deepEqual(
    offenders.sort((left, right) => left.localeCompare(right)),
    [],
    'these count hooks name a tile the site does not report in `counts`, so the surface never ' +
      'draws the tile and the hook never reaches the DOM:\n  ' +
      offenders.join('\n  ')
  );
});

test('the recipe editor is the only site taking the row action, and it takes both halves', () => {
  // `viewDataAttr` and `viewLabel` are the surface's two one-caller props, and this is the
  // clause that keeps that honest rather than merely true. The View button renders only where
  // a row carries a `target`; the pair is what a site puts ON it, and a site passing the hook
  // without the label ships an untranslated verb next to a translated one.
  const withHook = [];
  const withLabel = [];
  for (const [file, source] of Object.entries(SOURCES)) {
    if (!new RegExp(String.raw`<${TAG}[\s/>]`).test(source)) continue;
    if (/\bviewDataAttr=/.test(source)) withHook.push(file);
    if (/\bviewLabel=/.test(source)) withLabel.push(file);
  }
  assert.deepEqual(
    withHook,
    ['src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte'],
    'the set of sites hooking the row action changed. A second one is welcome and makes both ' +
      'props ordinary rather than single-caller; this pin is here so that arrival is a ' +
      'deliberate edit rather than something a reviewer has to notice.'
  );
  assert.deepEqual(
    withLabel,
    withHook,
    'a site hooking the row action must also localize its label, and vice versa: the two are ' +
      'one decision about one button'
  );
});

test('no call site restates a count label the surface would draw unlabelled', () => {
  // The corpus floor for the two bag clauses above, stated over the call-site scan the shared
  // factory already built rather than over a second walk of its own.
  const files = new Set(rowContract.callSites.map((site) => site.file));
  assert.ok(
    files.has('src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte') &&
      files.has('src/ui/svelte/apps/manager/recipe-item/RecipeItemValidationTab.svelte') &&
      files.has('src/ui/svelte/apps/manager/checks/ChecksValidationTab.svelte') &&
      files.has('src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte'),
    `the four call sites are ${[...files].join(', ')}; a missing one means the surface lost a ` +
      'renderer or the tag scan stopped resolving it'
  );
});
