/** The `--fab-*` namespace is ONE generation, and area scoping is spelled out (issue 1399). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { byCodePoint } from './helpers/codePointOrder.js';
import {
  MODULE_CORPUS,
  STYLE_CORPUS,
  assertFloor,
  assertGateCases,
  checkGate,
  gateOver,
  styleCorpusOf,
  workingTree,
} from './helpers/designSystemRatchet.js';
import { collectWorkingTreeSources } from './helpers/sourceScan.js';
import {
  STYLE_CORPUS_EXTENSIONS,
  STYLE_CORPUS_ROOTS,
  collectStyleCorpus,
  declarationsIn,
  maskNonStyleRegions,
  rulesIn,
  splitSelectorList,
} from './helpers/styleBlockScan.js';

/** The roots the product ships from. Prose that must name a retired generation lives outside. */
const SCANNED_ROOTS = Object.freeze(['src', 'styles']);

/**
 * `.js` is load-bearing — see trap 2 in the header. `.svelte` carries both scoped CSS and the
 * template-literal `style=` channel; `.css` carries the global sheet.
 */
const SCANNED_EXTENSIONS = Object.freeze(['.css', '.svelte', '.js']);

/**
 * How many files of each extension the raw-text scan must actually reach, HARD-CODED — see trap 5.
 */
const CORPUS_FLOORS = Object.freeze([
  { extension: '.css', minimum: 1 },
  { extension: '.svelte', minimum: 100 },
  { extension: '.js', minimum: 100 },
]);

/**
 * The three retired shapes, as RAW TEXT patterns rather than as `var()` reads, so a declaration, a
 * read and a bare mention in prose all match.
 */
const RETIRED_NAME_SHAPES = Object.freeze([
  { label: '--fab-v<N>-', pattern: /--fab-v\d+-/g },
  { label: '--fab-mv<N>-', pattern: /--fab-mv\d+-/g },
  { label: '--fab-editor-', pattern: /--fab-editor-/g },
]);

/**
 * The fourteen foundation tokens the twelve manager colour aliases and the two `--fab-v2-*` colour
 * aliases were inlined onto.
 */
const INLINE_TARGETS = Object.freeze([
  '--fab-bg-1',
  '--fab-bg-2',
  '--fab-bg-3',
  '--fab-surface-raised',
  '--fab-border',
  '--fab-border-strong',
  '--fab-text',
  '--fab-text-muted',
  '--fab-text-subtle',
  '--fab-accent',
  '--fab-info',
  '--fab-warning',
  '--fab-danger',
  '--fab-shadow-lg',
]);

/** `:root`, or one compound of a theme block's two-selector list. */
const THEME_ROOT_COMPOUND =
  /^(?::root|:root\[data-fabricate-theme="[^"]+"\]|\.fabricate\[data-fabricate-theme="[^"]+"\])$/;

/**
 * The prefix every area-scoped property carries. The gate still measures the set from declaration
 * sites (issue 1497), and holds the prefix to that set both ways.
 */
const AREA_SCOPED_PREFIX = '--fab-manager-';

/** The namespace prefix every token in this generation carries. */
const TOKEN_PREFIX = '--fab-';

/** The area an area-scoped property is scoped to. */
const AREA_SELECTOR = '.fabricate-manager';

/**
 * One compound that puts a rule inside the area — see trap 4 for why the boundary is not optional.
 */
const AREA_COMPOUND = new RegExp(`${AREA_SELECTOR.replace(/\./gu, '\\.')}(?![\\w-])`, 'u');

/**
 * The three shapes that USE one named property, for the channels that are not CSS. THE NAME IS
 * ESCAPED AND BOUNDED, for the reason `AREA_COMPOUND` above is.
 *
 * @param {string} name A whole custom-property name, e.g. `--fab-manager-recipe-col-io`.
 */
function areaUseShapes(name) {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const ends = String.raw`(?![\w-])`;
  return [
    { label: 'read', pattern: new RegExp(String.raw`var\(\s*${escaped}${ends}`, 'u') },
    { label: 'declaration', pattern: new RegExp(String.raw`${escaped}\s*:`, 'u') },
    { label: 'CSSOM name', pattern: new RegExp(`['"]${escaped}${ends}`, 'u') },
  ];
}

/** The labels of the use shapes of the property `name` that `text` matches. */
function areaUsesIn(name, text) {
  return areaUseShapes(name)
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);
}

/**
 * The compounds of a selector LIST that FAIL `predicate` — trap 4.
 *
 * @param {string} selector A rule's whole selector list.
 * @returns {string[]} The compounds failing `predicate`, in source order.
 */
function compoundsFailing(selector, predicate) {
  return splitSelectorList(selector).filter((compound) => !predicate(compound));
}

/**
 * True when EVERY compound of a selector LIST satisfies `predicate` — trap 4.
 *
 * @param {string} selector A rule's whole selector list.
 */
function everyCompound(selector, predicate) {
  return compoundsFailing(selector, predicate).length === 0;
}

/** Every rule in BOTH shipped stylesheets — the global sheet and every Svelte scoped `<style>`. */
let cachedRules = null;
function shippedStyleRules() {
  if (cachedRules === null) {
    const corpus = collectStyleCorpus({
      roots: [...STYLE_CORPUS_ROOTS],
      extensions: [...STYLE_CORPUS_EXTENSIONS],
    });
    cachedRules = Object.entries(corpus).flatMap(([file, css]) =>
      rulesIn(css).map((rule) => ({ ...rule, file }))
    );
  }
  return cachedRules;
}

/** Floor {@link shippedStyleRules} on BOTH halves, so neither can silently stop contributing. */
function assertBothCorporaReached(rules) {
  const files = [...new Set(rules.map((rule) => rule.file))];
  const globalSheets = files.filter((file) => file.endsWith('.css')).length;
  const scopedBlocks = files.filter((file) => file.endsWith('.svelte')).length;
  assert.ok(
    globalSheets >= 1,
    'no `.css` file contributed a rule, so the global sheet — where all 41 deleted declarations ' +
      'and all 13 forwarders lived — is not being walked at all.'
  );
  assert.ok(
    scopedBlocks > 100,
    `only ${scopedBlocks} Svelte scoped blocks contributed a rule, against the ~180 this tree ` +
      'holds. That is the half stylelint never globs, so it is the half a gate must not lose.'
  );
}

test('no retired token generation survives anywhere under src/ or styles/', () => {
  const sources = collectWorkingTreeSources([...SCANNED_ROOTS], [...SCANNED_EXTENSIONS]);
  const files = Object.keys(sources);

  // NOT VACUOUS, and this is the whole reason the assertion below can be trusted: an absence gate
  // over an empty corpus passes forever.
  assert.ok(
    files.length > 600,
    `the scanned corpus fell to ${files.length} files, which is far below the ~690 this repository ` +
      'holds under `src/` and `styles/` at these three extensions. An absence gate over an empty ' +
      'corpus passes forever, so this is a broken scan rather than a clean tree.'
  );
  for (const { extension, minimum } of CORPUS_FLOORS) {
    const reached = files.filter((file) => file.endsWith(extension)).length;
    assert.ok(
      reached >= minimum,
      `only ${reached} ${extension} files reached the scan, against a floor of ${minimum}, so this ` +
        'gate is blind to that channel. `.css` is the global sheet, which every retired ' +
        'declaration and every forwarder lived in; `.js` is the channel that has actually ' +
        'happened, a module returning a token as a string literal, which no CSS-only pass can see.'
    );
  }

  const offences = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const [index, text] of source.split('\n').entries()) {
      for (const { label, pattern } of RETIRED_NAME_SHAPES) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) offences.push(`${file}:${index + 1} (${label}) ${text.trim()}`);
      }
    }
  }

  assert.deepEqual(
    offences,
    [],
    'the `--fab-v<N>-`, `--fab-mv<N>-` and `--fab-editor-` generations are RETIRED and must not ' +
      'be declared, read, or named in a comment under `src/` or `styles/` — see "The token ' +
      'namespace is one generation and names its purpose" in ' +
      '`openspec/specs/design-system/spec.md`. A surface that wants to name a colour it already ' +
      'gets from a foundation token reads that token directly; a forwarding alias hides it from ' +
      'every surface outside its own selector. Prose that must name a retired generation belongs ' +
      'in the spec or in a test, both outside these roots:\n  ' +
      offences.join('\n  ')
  );
});

test('every inline target is declared only at theme root', () => {
  const allRules = shippedStyleRules();
  assertBothCorporaReached(allRules);

  const declaring = new Map(INLINE_TARGETS.map((name) => [name, []]));
  for (const rule of allRules) {
    for (const declaration of declarationsIn(rule.file, rule.body)) {
      const held = declaring.get(declaration.property);
      if (held) held.push(rule);
    }
  }

  // Non-vacuity: seven theme blocks x fourteen tokens, all fourteen from the global sheet — the
  // Svelte half contributes ZERO today, which is the fact this assertion exists to keep true, so
  // the floor for that half is the file count in `assertBothCorporaReached` and not this total.
  const total = [...declaring.values()].reduce((sum, rules) => sum + rules.length, 0);
  assert.ok(
    total >= 90,
    `only ${total} declarations of the fourteen inline targets were found, against the 98 this ` +
      'sheet carries (seven theme blocks x fourteen). The allow-list assertion below is trivially ' +
      'satisfied by an empty set, so this is a broken walk rather than a tidied stylesheet.'
  );
  for (const [name, rules] of declaring) {
    assert.ok(
      rules.length > 0,
      `${name} is no longer declared anywhere, so it is not a foundation token`
    );
  }

  const offences = [];
  for (const [name, rules] of declaring) {
    for (const rule of rules) {
      if (everyCompound(rule.selector, (compound) => THEME_ROOT_COMPOUND.test(compound))) continue;
      offences.push(`${name} declared on \`${rule.selector}\` (${rule.file}:${rule.line})`);
    }
  }

  assert.deepEqual(
    offences,
    [],
    'a foundation token that twelve manager aliases and two app aliases were INLINED onto is ' +
      'declared somewhere other than `:root` or a theme block. Custom-property substitution is ' +
      'lazy and site-local: the inline moved the substitution point from `.fabricate-manager` to ' +
      'each reading element, and that is value-preserving only while every one of these fourteen ' +
      'resolves to the same text at both places. One redeclaration inside the manager breaks it ' +
      'silently, at hundreds of sites, in the direction nobody looks:\n  ' +
      offences.join('\n  ')
  );
});

test('a rule is cited at the line its own selector starts on', () => {
  // The two assertions above report `file:line`, and until this branch every rule was cited at the
  // PREVIOUS rule's `}` — in a Svelte file, where `maskNonStyleRegions` blanks the whole template,
  // at line 1 for every offence in the file (issue 1497).
  const rules = shippedStyleRules();
  const sources = collectWorkingTreeSources([...STYLE_CORPUS_ROOTS], [...STYLE_CORPUS_EXTENSIONS]);

  const offences = [];
  let checked = 0;
  for (const rule of rules) {
    const [head] = rule.selector.split(/\s/u);
    if (head === undefined || head === '') continue;
    const cited = (sources[rule.file] ?? '').split('\n')[rule.line - 1];
    checked += 1;
    if (cited === undefined || !cited.includes(head)) {
      offences.push(
        `${rule.file}:${rule.line} \`${rule.selector}\` cites "${(cited ?? '').trim()}"`
      );
    }
  }

  assert.ok(
    checked > 1000,
    `only ${checked} rules were line-checked, against the ~4000 both stylesheets hold. An ` +
      'invariant asserted over an empty set passes forever.'
  );
  assert.deepEqual(
    offences,
    [],
    'a rule is reported at a line that does not hold the start of its selector, so every offence ' +
      'either of the assertions above prints sends its reader to the wrong place in a ' +
      '20,000-line stylesheet — or, for a Svelte scoped block, to line 1:\n  ' +
      offences.join('\n  ')
  );
});

/**
 * Every `--fab-*` property whose DECLARATION SITES all sit inside the area (issue 1497), over
 * `rules`, which default to the working tree's.
 *
 * @returns {{names: string[], sites: Map<string, Array<{file: string, line: number, selector:
 * string}>>}}
 */
function areaScopedOf(rules) {
  const sites = new Map();
  for (const rule of rules) {
    for (const declaration of declarationsIn(rule.file, rule.body)) {
      if (!declaration.property.startsWith(TOKEN_PREFIX)) continue;
      if (!sites.has(declaration.property)) sites.set(declaration.property, []);
      sites.get(declaration.property).push({ ...rule, property: declaration.property });
    }
  }
  const names = [...sites.keys()]
    .filter((name) =>
      sites
        .get(name)
        .every((rule) => everyCompound(rule.selector, (compound) => AREA_COMPOUND.test(compound)))
    )
    .sort(byCodePoint);
  return { names, sites };
}

let cachedAreaScoped = null;
function areaScopedProperties() {
  cachedAreaScoped ??= areaScopedOf(shippedStyleRules());
  return cachedAreaScoped;
}

/**
 * The part of a file the CSS clauses do NOT read, so the string clause cannot double-count.
 *
 * @returns {string} Same length, same newlines, style regions blanked.
 */
function nonStyleRegion(file, source) {
  if (!file.endsWith('.svelte')) return source;
  const masked = maskNonStyleRegions(source).split('\n');
  return source
    .split('\n')
    .map((line, index) => (masked[index].trim() === '' ? line : ' '.repeat(line.length)))
    .join('\n');
}

/**
 * Where the prefix and the measured set disagree: an area-scoped name without the prefix, and a
 * prefixed name with a declaration outside the area (spec: a `:root` declaration un-scopes it).
 */
function prefixDisagreements({ names, sites }) {
  const prefixed = [...sites.keys()].filter((name) => name.startsWith(AREA_SCOPED_PREFIX));
  return {
    prefixed,
    unprefixed: names.filter((name) => !name.startsWith(AREA_SCOPED_PREFIX)),
    escaped: prefixed.filter((name) => !names.includes(name)),
  };
}

test('the area-scoped set is measured, and the prefix is exactly that set', () => {
  const { names, sites } = areaScopedProperties();

  assert.ok(
    sites.size > 100,
    `only ${sites.size} distinct \`${TOKEN_PREFIX}\` properties are declared anywhere, against the ` +
      '~135 this tree holds. With none, the set below is empty and all three clauses are vacuous.'
  );
  assert.ok(
    names.length >= 10,
    `only ${names.length} properties measured as area-scoped, against the 16 this tree holds. A ` +
      'set that has collapsed makes every clause below an absence check over nothing.'
  );

  const { prefixed, unprefixed, escaped } = prefixDisagreements({ names, sites });
  assert.ok(
    prefixed.length > 0,
    'no property carries the area prefix, so this control has no domain'
  );
  assert.deepEqual(
    unprefixed,
    [],
    `every property declared only under \`${AREA_SELECTOR}\` is area-scoped, and an area-scoped ` +
      `property carries \`${AREA_SCOPED_PREFIX}\`, so a reader can tell from the name alone that ` +
      'it is undefined outside the manager. Give it the prefix.'
  );
  assert.deepEqual(
    escaped.map(
      (name) =>
        `${name} — declared at ${sites
          .get(name)
          .map((rule) => `${rule.file}:${rule.line}`)
          .join(', ')}`
    ),
    [],
    `a property named \`${AREA_SCOPED_PREFIX}*\` has a declaration site OUTSIDE ` +
      `\`${AREA_SELECTOR}\`. The name promises area scoping and the tree no longer keeps that ` +
      'promise, and the consequence is worse than the broken promise: the scanned set is computed ' +
      'from declaration sites, so this property has just dropped out of it and is now gated by ' +
      'nothing. Either move the stray declaration inside the area, or rename the property.'
  );
});

test('an unprefixed in-area property fails, and a :root declaration takes a name out of the area', () => {
  const judged = (css) => {
    const rules = rulesIn(css).map((rule) => ({ ...rule, file: 'styles/probe.css' }));
    const { unprefixed, escaped } = prefixDisagreements(areaScopedOf(rules));
    return { unprefixed, escaped };
  };
  const inArea = (property) => `.fabricate-manager .probe { ${property}: 4px; }`;
  const atRoot = (property) => `:root { ${property}: 2px; }`;

  assert.deepEqual(judged(inArea('--fab-manager-gap')), { unprefixed: [], escaped: [] });
  assert.deepEqual(judged(inArea('--fab-gap')), { unprefixed: ['--fab-gap'], escaped: [] });
  assert.deepEqual(judged(`${atRoot('--fab-gap')}\n${inArea('--fab-gap')}`), {
    unprefixed: [],
    escaped: [],
  });
  assert.deepEqual(judged(`${atRoot('--fab-manager-gap')}\n${inArea('--fab-manager-gap')}`), {
    unprefixed: [],
    escaped: ['--fab-manager-gap'],
  });
});

test('an area-scoped property is declared and read only inside its area', () => {
  const allRules = shippedStyleRules();
  assertBothCorporaReached(allRules);
  const { names } = areaScopedProperties();

  // THE GLOBAL SHEET ONLY. A scoped `<style>` cannot satisfy this clause even in principle — its
  // selectors are component class names, never `.fabricate-manager …` — so running this over both
  // corpora would report every scoped read twice, once here and once in the clause below that owns
  // that channel.
  const rules = allRules.filter(
    (rule) => rule.file.endsWith('.css') && names.some((name) => rule.body.includes(name))
  );

  // Non-vacuity, and it is the reason this gate is written against the requirement's own words
  // rather than against a directory. Measured at issue 1782's search field: 29 rules, after the
  // data table retired the drop grid's two properties and the search shell retired the two
  // toolbar search rules that read `--fab-manager-recipe-control-font`.
  assert.ok(
    rules.length >= 25,
    `only ${rules.length} sheet rules mention one of the ${names.length} area-scoped properties, ` +
      'against the 29 this sheet holds. With none, the assertion below is vacuous.'
  );

  // THE TOP-LEVEL SPLIT IS EXERCISED BY THE LIVE CORPUS, not only by the fixtures in
  // `style-block-scan.test.js`.
  const shredded = allRules.filter(
    (rule) => rule.selector.split(',').length !== splitSelectorList(rule.selector).length
  );
  assert.ok(
    shredded.length >= 1,
    'no rule in either stylesheet carries a comma inside a functional pseudo-class or an ' +
      'attribute value any more, so nothing live exercises the top-level split and a regression ' +
      "to `String#split(',')` would go unnoticed here. Prove the split against a fixture instead."
  );

  // EVERY compound, with a boundary, and both halves are load-bearing — see trap 4. A rule whose
  // selector list is `.fabricate-app .oops, .fabricate-manager .ok` reads a manager property from
  // a player surface under its first compound, which is this change's motivating defect written
  // as one rule; and `.fabricate-manager-widget` is a different class that merely starts the same.
  const offences = rules.flatMap((rule) => {
    const outside = compoundsFailing(rule.selector, (compound) => AREA_COMPOUND.test(compound));
    if (outside.length === 0) return [];
    const named = names.filter((name) => rule.body.includes(name));
    return [
      `${rule.file}:${rule.line} \`${rule.selector}\` — reads \`${named.join('`, `')}\` outside ` +
        `the area: \`${outside.join('`, `')}\``,
    ];
  });

  assert.deepEqual(
    offences,
    [],
    'an AREA-SCOPED custom property — one whose every declaration site sits inside ' +
      `\`${AREA_SELECTOR}\` — must not be declared or read outside it, by EVERY compound of the ` +
      "rule's selector list, because the cascade applies a comma-joined rule to each of them " +
      'separately. Outside the area the property is undefined, the declaration is invalid at ' +
      'computed-value time, and the value falls back to inheritance — nothing fails, it just ' +
      'looks wrong. Each offence names the compounds that sit outside the area: where they are ' +
      'some of several, split the list so only the manager compound keeps this property; where ' +
      'they are the whole list, the rule is reading an area-scoped property from outside the ' +
      'area, and what it wants is a foundation token:\n  ' +
      offences.join('\n  ')
  );
});

/** A name without its prefix, so a site nets only against the same property under a new prefix. */
const stem = (name) => name.replace(/^--fab-(?:manager-)?/u, '');

/** Every line of a Svelte scoped block naming an area-scoped property, over one side's corpus. */
function areaScopedStyleReads(corpus) {
  const { names } = areaScopedOf(corpus.rules);
  const found = [];
  for (const [file, css] of Object.entries(corpus.styles)) {
    if (!file.endsWith('.svelte')) continue;
    for (const [index, text] of css.split('\n').entries()) {
      if (!text.includes(TOKEN_PREFIX)) continue;
      for (const name of names) {
        if (text.includes(name))
          found.push({ file, line: index + 1, id: `area-scoped read ${name}`, value: stem(name) });
      }
    }
  }
  return found;
}

const AREA_STYLE_READ_GATE = gateOver([STYLE_CORPUS], (readFile, files) =>
  areaScopedStyleReads(styleCorpusOf(readFile, files))
);

test('no Svelte scoped style reaches an area-scoped property', (t) => {
  // A scoped `<style>` cannot guarantee its host renders under `.fabricate-manager`: a component is
  // placed in a directory, not in a DOM subtree, and `apps/manager/ComplicationSummaryRow` is the
  // standing counterexample — it lives under `apps/manager/` and is imported by two player surfaces
  // that render it under `.fabricate-app`.
  const files = Object.keys(collectStyleCorpus({ roots: ['src'], extensions: ['.svelte'] }));
  assertFloor('area-scoped properties reached from a Svelte scoped style', files.length, 100);
  // Absolute as well: the base-relative gate nets a rename, so a revert to a base read is green.
  const tree = workingTree(STYLE_CORPUS);
  assert.deepEqual(
    areaScopedStyleReads(styleCorpusOf(tree.readFile, tree.listFiles())).map(
      (site) => `${site.file}:${site.line} ${site.id}`
    ),
    [],
    'a Svelte scoped style reads an area-scoped property; write the value or a foundation token'
  );
  checkGate(
    t,
    AREA_STYLE_READ_GATE,
    'A component is placed in a directory, not in a DOM subtree, so its scoped CSS cannot ' +
      `guarantee that its host renders under \`${AREA_SELECTOR}\` — and where it does not, the ` +
      'property is undefined and the declaration silently falls back to inheritance. Read a ' +
      'foundation token, or move the rule into the global sheet under an area selector.'
  );
});

test('a use shape matches the whole property name and not a longer one starting with it', () => {
  // BOTH POLARITIES OVER A SYNTHETIC PAIR, because no such pair exists in the corpus today — which
  // is exactly the condition under which an unbounded pattern reads as correct.
  const shorter = '--fab-recipe-col';
  const longer = `${shorter}-io`;

  assert.deepEqual(
    areaUsesIn(shorter, `  color: var(${longer});`),
    [],
    `\`var(${longer})\` is a use of ${longer} and of nothing else. A pattern with no trailing ` +
      'boundary reports it against every name that is a prefix of it.'
  );
  assert.deepEqual(
    areaUsesIn(shorter, `  el.style.setProperty('${longer}', value);`),
    [],
    'the CSSOM shape is anchored by a quote at one end only, so it needs the boundary at the other'
  );
  assert.deepEqual(
    areaUsesIn(shorter, `  ${longer}: 4px;`),
    [],
    'the declaration shape is bounded by its own colon, which the longer name never reaches'
  );

  // The positives, so the boundary is narrowing the gate rather than emptying it.
  assert.deepEqual(areaUsesIn(longer, `  color: var(${longer});`), ['read']);
  assert.deepEqual(areaUsesIn(longer, `  ${longer}: 4px;`), ['declaration']);
  assert.deepEqual(areaUsesIn(longer, `  getPropertyValue('${longer}')`), ['CSSOM name']);
  assert.deepEqual(
    areaUsesIn(shorter, `  color: var(${shorter});`),
    ['read'],
    'the shorter name must still match its OWN use'
  );
});

/** Whether `file` is one the string channel reads: a module or a template under `src/`. */
const inStringChannel = (file) =>
  file.startsWith('src/') && (file.endsWith('.js') || file.endsWith('.svelte'));

/** Every line under `src/` spelling an area-scoped property into a string, over one side. */
function areaScopedStringUses(readFile, files) {
  const { names } = areaScopedOf(styleCorpusOf(readFile, files).rules);
  const found = [];
  for (const file of files) {
    if (!inStringChannel(file)) continue;
    for (const [index, text] of nonStyleRegion(file, readFile(file)).split('\n').entries()) {
      if (!text.includes(TOKEN_PREFIX)) continue;
      for (const name of names) {
        if (!text.includes(name)) continue;
        if (areaUsesIn(name, text).length > 0) {
          found.push({
            file,
            line: index + 1,
            id: `area-scoped property in a string ${name}`,
            value: stem(name),
          });
        }
      }
    }
  }
  return found;
}

const AREA_STRING_GATE = gateOver([STYLE_CORPUS, MODULE_CORPUS], areaScopedStringUses);

test('no module or template under src/ spells an area-scoped property into a string', (t) => {
  // The CHANNEL THAT ACTUALLY HAPPENED, generalised (issue 1508).
  const files = Object.keys(collectWorkingTreeSources(['src'], ['.js', '.svelte']));
  for (const extension of ['.js', '.svelte']) {
    const reached = files.filter((file) => file.endsWith(extension)).length;
    assert.ok(
      reached > 100,
      `only ${reached} ${extension} files reached the scan, against the ~380 and ~306 this tree ` +
        'holds. An absence gate over an empty corpus passes forever.'
    );
  }
  assertFloor('area-scoped properties spelled into a string under src/', files.length, 400);
  checkGate(
    t,
    AREA_STRING_GATE,
    'A JavaScript module and a Svelte template are placed in a directory, not in a DOM subtree, ' +
      'so neither can guarantee that the element it styles renders under ' +
      `\`${AREA_SELECTOR}\` — and where it does not, the property is undefined, the declaration ` +
      'is invalid at computed-value time, and the value falls back to inheritance. Return a ' +
      'foundation token, or put the rule in the global sheet under an area selector. Prose may ' +
      'still name the property, in the backticked spelling the comments under `src/` use, which ' +
      'matches none of the three shapes; a name inside `var(`, followed by a colon, or in ' +
      'straight quotes does match wherever it is written.'
  );
});

test('the area-scoped gates fail a new or grown use against base, measuring the area per side', (t) => {
  const SHEET = 'styles/fabricate.css';
  const PROBE = 'src/ui/svelte/Probe.svelte';
  const sheet = (...lines) =>
    [
      '.fabricate-manager { --fab-manager-gap: 4px; }',
      '.fabricate .x { --fab-ink: red; }',
      ...lines,
      '',
    ].join('\n');
  const probe = (...lines) =>
    [
      '<div class="probe"></div>',
      '<style>',
      '  .probe { gap: var(--fab-manager-gap); }',
      ...lines,
      '</style>',
      '',
    ].join('\n');
  const base = {
    [SHEET]: sheet(),
    [PROBE]: probe(),
    'src/a.js': 'export const a = 1;\n',
    'README.md': 'x\n',
  };
  const read = (name) => `${PROBE}: area-scoped read ${name}`;
  assertGateCases(t, AREA_STYLE_READ_GATE, base, [
    {
      head: { [PROBE]: probe('  .probe { margin: var(--fab-manager-gap); }') },
      failures: [`${read('--fab-manager-gap')} rose from 1 to 2`],
    },
    {
      head: {
        [SHEET]: sheet('.fabricate-manager { --fab-ink-2: blue; }'),
        [PROBE]: probe('  .probe { color: var(--fab-ink-2); }'),
      },
      failures: [`${read('--fab-ink-2')} is new (1)`],
    },
    { head: { [SHEET]: sheet('.fabricate .y { --fab-manager-gap: 2px; }') }, failures: [] },
    { head: { 'README.md': 'y\n' }, skipped: 'corpus-unchanged' },
  ]);
  assertGateCases(t, AREA_STRING_GATE, base, [
    {
      head: { 'src/a.js': "export const a = 'var(--fab-manager-gap)';\n" },
      failures: ['src/a.js: area-scoped property in a string --fab-manager-gap is new (1)'],
    },
    {
      head: {
        'src/a.js':
          "// ratchet-exempt(design-system): a probe\nexport const a = 'var(--fab-manager-gap)';\n",
      },
      failures: [],
    },
    {
      head: { 'src/a.js': 'export const a = `--fab-manager-gap: 4px`;\n' },
      failures: ['src/a.js: area-scoped property in a string --fab-manager-gap is new (1)'],
    },
    {
      head: { 'src/a.js': "el.style.setProperty('--fab-manager-gap', v);\n" },
      failures: ['src/a.js: area-scoped property in a string --fab-manager-gap is new (1)'],
    },
    {
      head: { 'src/a.js': '// Spaced by `--fab-manager-gap` in the sheet.\nexport const a = 1;\n' },
      failures: [],
    },
  ]);

  // A prefix rename nets against the use it replaces within its file; a copy, or a swap to another
  // prefixed property, does not.
  const unprefix = (text) => text.replaceAll('--fab-manager-gap', '--fab-gap');
  const before = { ...base, [SHEET]: unprefix(base[SHEET]), [PROBE]: unprefix(base[PROBE]) };
  const swapped = sheet('.fabricate-manager { --fab-manager-pad: 2px; }');
  assertGateCases(t, AREA_STYLE_READ_GATE, before, [
    { head: { [SHEET]: base[SHEET], [PROBE]: base[PROBE] }, failures: [] },
    {
      head: {
        [SHEET]: base[SHEET],
        [PROBE]: probe('  .probe { margin: var(--fab-manager-gap); }'),
      },
      failures: [`${read('--fab-manager-gap')} is new (2)`],
    },
    {
      head: { [SHEET]: swapped, [PROBE]: probe().replace('gap)', 'pad)') },
      failures: [`${read('--fab-manager-pad')} is new (1)`],
    },
  ]);
  const spelled = (name) => `export const a = 'var(${name})';\n`;
  const spelledBefore = { ...before, 'src/a.js': spelled('--fab-gap') };
  assertGateCases(t, AREA_STRING_GATE, spelledBefore, [
    { head: { [SHEET]: base[SHEET], 'src/a.js': spelled('--fab-manager-gap') }, failures: [] },
    {
      head: { [SHEET]: swapped, 'src/a.js': spelled('--fab-manager-pad') },
      failures: ['src/a.js: area-scoped property in a string --fab-manager-pad is new (1)'],
    },
  ]);
});
