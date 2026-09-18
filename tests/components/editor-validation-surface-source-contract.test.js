/** The END STATE of the editor validation surface's adoption, pinned in source (issue 1444). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
 * A synthetic source for the raw-element detector.
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
 * Register one contract. Both halves of the surface get the identical five clauses.
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
 * @param {string} file repo-relative component path
 * @param {string} attributeName the prop to read
 * @returns {string[]|null} the literal's top-level keys, or null when the site passes no such
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
  // Non-vacuity. A bag prop nothing passes.
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

test('the sites hooking the row action are the two producers and the shell, and none restates its name', () => {
  // `viewDataAttr` is the surface's one-caller hook prop.
  const rendered = Object.keys(SOURCES)
    .map((file) => [file, surfaceAttributeNames(file)])
    .filter(([, attributes]) => attributes.size > 0);
  // NON-VACUITY, because both clauses below are ABSENCE claims over this population.
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
    [
      'src/ui/svelte/apps/manager/environment/EnvironmentValidationTab.svelte',
      'src/ui/svelte/apps/manager/recipe/RecipeValidationTab.svelte',
      'src/ui/svelte/apps/manager/recipe-item/RecipeItemValidationTab.svelte',
      'src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte',
    ],
    'the set of sites hooking the row action changed. THIS PIN MOVED DELIBERATELY at issue ' +
      '1517, TWICE: first the recipe-item tab hooking its own route and `ScopedValidationTab` ' +
      'FORWARDING the prop on behalf of the essence and Tool validation tabs, which reach the ' +
      'surface only through it, and then the environment tab, whose adoption made this prop ' +
      'ordinary rather than a recipe-editor habit. That last one is the ' +
      'arrival the previous wording said was welcome; its hook value carries the `data-` prefix ' +
      'because the surface uses the prop as the WHOLE attribute name. This pin is here so that ' +
      'a further arrival is a deliberate edit rather than something a reviewer has to notice.'
  );
  assert.deepEqual(
    withLabel,
    // THE ONE FORWARDING SHELL, and it is not a call site (issue 1517). It declares `viewLabel`
    // with NO default of its own and passes it straight through, so an essence or Tool tab that
    // says nothing forwards `undefined` and the surface applies its own key. Nothing is restated
    // and nothing is overridden; the shell exists so that a site which one day needs a different
    // verb has somewhere to say so.
    ['src/ui/svelte/apps/manager/scoped/ScopedValidationTab.svelte'],
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
 * HAYSTACK, stated, because it is the whole reason this is a parser rather than a regex: the
 * `ObjectPattern` of the `let { … } = $props()` declaration, and the template's element tree.
 *
 * @returns {{defaults: Map<string, object|null>, constants: Map<string, unknown>, button: object,
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
    expressionAttribute(button, 'aria-label', source)?.replaceAll(/\s+/gu, ' '),
    'localize(VIEW_NAMED_LABEL, { action: localize(row.viewLabel ?? viewLabel), subject: row.title, })',
    "the row action must name itself by its row's title, AND by the verb it visibly renders. " +
      '`action` is fed from the same expression as the visible child on purpose: hard-coding ' +
      '"View" there makes the accessible name of an overriding row ("View: Gather herbs") one ' +
      'that does not contain its visible label ("View task"), which is a WCAG 2.5.3 ' +
      'label-in-name failure and is unreachable for a speech-input user. Composing the resolved ' +
      'verb makes containment true by construction.'
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
  // The corpus floor for the two bag clauses above.
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

test('the shipped name pattern still has somewhere to put the visible verb', () => {
  // THE OTHER HALF OF THE LABEL-IN-NAME CONTRACT.
  const { constants } = surfaceRowAction();
  const key = String(constants.get('VIEW_NAMED_LABEL'));
  const english = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../lang/en.json'), 'utf8')
  );
  const pattern = key.split('.').reduce((node, part) => node?.[part], english);
  assert.equal(
    typeof pattern,
    'string',
    `${key} resolves to nothing in lang/en.json, so every row action is named by the dotted ` +
      'path itself'
  );
  for (const token of ['{action}', '{subject}']) {
    assert.ok(
      pattern.includes(token),
      `the shipped "${key}" pattern is "${pattern}", which drops ${token}. Both are passed by ` +
        'the template and both are load-bearing: `{subject}` is what tells one row action from ' +
        'another, and `{action}` is what keeps the accessible name containing the visible label.'
    );
  }
});
