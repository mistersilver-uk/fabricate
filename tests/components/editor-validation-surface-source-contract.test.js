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
const SURFACE_PATH = 'src/ui/svelte/components/EditorValidationSurface.svelte';

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
      '`<EditorValidationSurface>` and pass the site\'s own hooks, classes, labels and counts ' +
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
    keys = expression.properties.map((property) =>
      property.key?.name ?? String(property.key?.value ?? '')
    );
  });
  return keys;
}

/**
 * The attribute names one file writes on `<EditorValidationSurface>`.
 *
 * HAYSTACK, STATED, because the thing it replaces got this wrong. This reads `Attribute` nodes on
 * `Component` nodes named {@link TAG} in the PARSED template — nothing else. Docblock prose,
 * `<!-- … -->` blocks, `<style>` contents and string literals in the `<script>` are all outside
 * it, because the parser puts them in nodes this never visits.
 *
 * A text scan over `SOURCES[file]` has the opposite haystack and this corpus makes the difference
 * concrete: `recipe/RecipeValidationTab.svelte`'s own header NAMES `viewDataAttr` in prose, and
 * survives a `\bviewDataAttr=` scan only by not writing the `=`. Moving the real attribute into an
 * HTML comment left that scan green.
 *
 * @param {string} file repo-relative component path
 * @returns {Set<string>} empty when the file renders no `<EditorValidationSurface>` at all
 */
function surfaceAttributeNames(file) {
  const names = new Set();
  walkTemplate(parse(SOURCES[file], { modern: true, filename: file }).fragment, (node) => {
    if (node.type !== 'Component' || node.name !== TAG) return;
    for (const attribute of node.attributes ?? []) {
      if (attribute.type === 'Attribute') names.add(attribute.name);
    }
  });
  return names;
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

test('the recipe editor is the only site hooking the row action, and none restates its name', () => {
  // `viewDataAttr` is the surface's one-caller hook prop, and this is the clause that keeps
  // that honest rather than merely true. `viewLabel` USED to be its pair — a site hooking the
  // action also had to hand the surface a localized verb, and a site that hooked without
  // labelling shipped an untranslated word beside translated ones. Issue 1517 ended that
  // obligation by moving it INTO the surface: the name is a key the surface resolves itself,
  // so the correct number of call sites restating it is zero.
  //
  // READ FROM THE AST, not from the file's text. See {@link surfaceAttributeNames} for the
  // haystack and for the measured way the text scan this replaces could be greened.
  const rendered = Object.keys(SOURCES)
    .map((file) => [file, surfaceAttributeNames(file)])
    .filter(([, attributes]) => attributes.size > 0);
  // NON-VACUITY, because both clauses below are ABSENCE claims over this population: a walk that
  // stopped resolving the component would report the empty set and read as two clean gates.
  assert.ok(
    rendered.length >= 4,
    `only ${rendered.length} files were seen passing an attribute to <${TAG}>; the walk has ` +
      'stopped resolving it and both clauses below are quantified over nothing'
  );
  const withHook = rendered
    .filter(([, attributes]) => attributes.has('viewDataAttr'))
    .map(([file]) => file);
  const withLabel = rendered
    .filter(([, attributes]) => attributes.has('viewLabel'))
    .map(([file]) => file);
  assert.deepEqual(
    withHook,
    ['src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte'],
    'the set of sites hooking the row action changed. A second one is welcome and makes the ' +
      'prop ordinary rather than single-caller; this pin is here so that arrival is a ' +
      'deliberate edit rather than something a reviewer has to notice.'
  );
  assert.deepEqual(
    withLabel,
    [],
    'a call site is passing `viewLabel` again. The surface defaults it to a localization key ' +
      'and resolves it, so a site that passes one is either restating that default — which is ' +
      'a second place the accessible name lives — or overriding it for EVERY row, which is not ' +
      'what varies: a site whose rows need different verbs sets `row.viewLabel` per row. If a ' +
      'genuine whole-surface override arrives, move this pin deliberately:\n  ' +
      withLabel.join('\n  ')
  );
});

/**
 * The surface's own `$props()` defaults, and its View button node, read from the AST.
 *
 * HAYSTACK, stated, because it is the whole reason this is a parser rather than a regex: the
 * `ObjectPattern` of the `let { … } = $props()` declaration, and the template's element tree.
 * Comments, docblocks, `<!-- … -->` blocks and `<style>` are NOT in either — the parser drops
 * them into `ast.comments` or into nodes this never visits. THIS SURFACE'S HEADER EXPLAINS ITS
 * `viewLabel` default and its `localize()` call in prose, naming both the key and the function,
 * so every text-shaped matcher over `SOURCES[SURFACE_PATH]` reports what the DOCUMENTATION says
 * and never reads the code at all. Slices below are taken from AST node ranges for the same
 * reason: a range names exactly one expression.
 *
 * `constants` is the third population and is read for the same reason as the first two: the
 * subject-bearing accessible name is a MODULE constant rather than a prop — a caller must not be
 * able to swap it — so there is no `$props()` default to read it from, and its literal appears in
 * this file's header prose as well as in the declaration.
 *
 * @returns {{defaults: Map<string, object|null>, constants: Map<string, unknown>, button: object,
 *   source: string}}
 */
function surfaceRowAction() {
  const source = SOURCES[SURFACE_PATH];
  const ast = parse(source, { modern: true, filename: SURFACE_PATH });
  const declared = (ast.instance?.content?.body ?? []).find(
    (node) =>
      node.type === 'VariableDeclaration' &&
      node.declarations[0]?.init?.type === 'CallExpression' &&
      node.declarations[0]?.init?.callee?.name === '$props'
  );
  assert.ok(declared, `${SURFACE_PATH} no longer destructures \`$props()\`, so nothing is read`);
  const defaults = new Map();
  for (const property of declared.declarations[0].id.properties ?? []) {
    if (property.type !== 'Property') continue;
    const value = property.value;
    defaults.set(property.key?.name, value.type === 'AssignmentPattern' ? value.right : null);
  }

  const constants = new Map();
  for (const node of ast.instance?.content?.body ?? []) {
    if (node.type !== 'VariableDeclaration') continue;
    for (const declarator of node.declarations) {
      if (declarator.id?.type === 'Identifier' && declarator.init?.type === 'Literal') {
        constants.set(declarator.id.name, declarator.init.value);
      }
    }
  }

  const buttons = [];
  walkTemplate(ast.fragment, (node) => {
    if (node.type === 'Component' && node.name === 'ManagerButton') buttons.push(node);
  });
  assert.equal(
    buttons.length,
    1,
    `${SURFACE_PATH} renders ${buttons.length} <ManagerButton>s; the row action is one button ` +
      'and the clauses below read it by being the only one'
  );
  return { defaults, constants, button: buttons[0], source };
}

/**
 * One static attribute of a node, as the SOURCE TEXT of its single expression.
 *
 * @param {object} node
 * @param {string} name
 * @param {string} source
 * @returns {string|null}
 */
function expressionAttribute(node, name, source) {
  const attribute = (node.attributes ?? []).find(
    (candidate) => candidate.type === 'Attribute' && candidate.name === name
  );
  const value = Array.isArray(attribute?.value) ? attribute.value[0] : attribute?.value;
  const expression = value?.expression;
  return expression ? source.slice(expression.start, expression.end) : null;
}

test("the View button's name is a translatable key, in a shared namespace, resolved here", () => {
  const { defaults, constants, button, source } = surfaceRowAction();

  const fallback = defaults.get('viewLabel');
  assert.equal(fallback?.type, 'Literal', '`viewLabel` must default to a string literal');
  assert.match(
    fallback.value,
    /^FABRICATE\.(?:[A-Za-z0-9_]+\.)+[A-Za-z0-9_]+$/u,
    `\`viewLabel\` defaults to "${fallback.value}". A default written into a \`$props()\` ` +
      'destructuring is a string `game.i18n` never sees, so an English word here is the ' +
      'accessible name of a control on nine validation screens that no world can translate.'
  );
  assert.ok(
    !fallback.value.startsWith('FABRICATE.Admin.Manager.Recipe.'),
    `\`viewLabel\` defaults to "${fallback.value}", under the RECIPE editor's namespace. This ` +
      'is the default name of a shared primitive on nine surfaces, eight of which are not the ' +
      'recipe editor; a key filed under one of the nine reads as that screen\'s property.'
  );

  const children = button.fragment.nodes.filter((node) => node.type !== 'Text');
  assert.equal(children.length, 1, 'the button renders exactly one expression as its name');
  assert.equal(
    source.slice(children[0].expression.start, children[0].expression.end),
    'localize(row.viewLabel ?? viewLabel)',
    'the button must RESOLVE its name. A key default interpolated raw is worse than the ' +
      'English one it replaced — every one of these buttons then reads as a dotted path — and ' +
      'the `??` is what lets one site draw two different verbs down one list ("View task" ' +
      'beside "View event") without a second whole-surface prop.'
  );

  // AND THE ACCESSIBLE NAME CARRIES THE SUBJECT. The visible child above is a verb and nothing
  // else, so a tab of routed rows announces as "View, button" repeated — the row's subject is in
  // a sibling element and the `data-*` hook holds the ROUTE, which assistive technology never
  // reads. One producer routes at eleven sites, and this is the one place a default name for
  // every surface that renders this primitive can be installed.
  assert.equal(
    expressionAttribute(button, 'aria-label', source),
    'localize(VIEW_NAMED_LABEL, { subject: row.title })',
    "the row action must name itself by its row's title. Composing the SUBJECT is the point: " +
      'the verb alone is the same word on every button of the list.'
  );
  const named = constants.get('VIEW_NAMED_LABEL');
  assert.match(
    String(named),
    /^FABRICATE\.(?:[A-Za-z0-9_]+\.)+[A-Za-z0-9_]+$/u,
    `the subject-bearing name resolves "${named}", which is not a localization key. It is the ` +
      'accessible name of a control on every validation screen and it interpolates a title, so ' +
      'an English pattern here is a sentence no world can reorder or re-punctuate.'
  );
  assert.ok(
    !String(named).startsWith('FABRICATE.Admin.Manager.Recipe.'),
    `the subject-bearing name is filed under "${named}", inside the RECIPE editor's namespace, ` +
      'for a default this primitive gives every one of its surfaces'
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
