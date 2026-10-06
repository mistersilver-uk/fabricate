/** An ELEMENT-TYPED `select` leg may not outlive the `<select>` it was written for (issue 1510). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { join, resolve } from 'node:path';

import { measureImporters } from '../scripts/lib/componentImporters.js';
import { compoundsOf, ruleBlocks } from '../scripts/lib/stylesheetLiveClasses.js';
import {
  TEMPLATE_CORPUS,
  nativeSelectSites,
  templatesOf,
  workingTree,
} from './helpers/designSystemRatchet.js';
import { collectSources } from './helpers/sourceScan.js';
import { collectStyleCorpus, splitSelectorList } from './helpers/styleBlockScan.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');

/**
 * The legs that are already dead at a change and are not its to strip. Empty since issue 1777
 * deleted every element-typed leg with the last native select, the two gathering event editor
 * legs issue 1523 owned among them. An entry is `{ file, selector, why }`, `why` naming its issue.
 */
const STRANDED_BASELINE = Object.freeze([]);

const SOURCES = collectSources(join(REPO_ROOT, 'src'), { extensions: ['.svelte'] });
const IMPORT_GRAPH = measureImporters(REPO_ROOT);

const CLASS_TOKEN = /\.(-?[_a-zA-Z][\w-]*)/gu;
const ATTRIBUTE_TOKEN = /\[([-\w]+)/gu;

/** A compound with every functional pseudo-class ARGUMENT removed. */
function withoutFunctionalArguments(compound) {
  let out = '';
  let depth = 0;
  for (const character of compound) {
    if (character === '(') depth += 1;
    if (depth === 0) out += character;
    if (character === ')') depth -= 1;
  }
  return out;
}

/** The element type a compound names, or `''` when it names none. */
function elementOf(compound) {
  return (withoutFunctionalArguments(compound).match(/^[a-z][\w-]*/u) ?? [''])[0];
}

/**
 * A selector with its functional pseudo-classes OPENED OUT into ordinary descendant position.
 * `:is(input, select, textarea)` is three alternatives in one compound, and only one of them is the
 * element this file is about.
 */
function flattenGroups(selector) {
  return selector.replaceAll(/:(?:global|is|where|not|has|matches)\(/gu, ' ').replaceAll(')', ' ');
}

/** Each `.svelte` file's TEMPLATE text: no `<style>` block, no comment of either syntax. */
const TEMPLATES = new Map(
  Object.entries(SOURCES).map(([file, source]) => [
    file,
    source
      .replaceAll(/<style[\s\S]*?<\/style>/gu, ' ')
      .replaceAll(/<!--[\s\S]*?-->/gu, ' ')
      .replaceAll(/\/\*[\s\S]*?\*\//gu, ' '),
  ])
);

/**
 * Whether a template's MARKUP writes a `<select>`. The `<script>` block is dropped first: its `//`
 * comments name the element in prose, and a file that only mentions one would otherwise count as a
 * host that renders one and keep a stranded leg in its scope reporting live.
 */
const RENDERS_SELECT = new Map(
  [...TEMPLATES].map(([file, template]) => [
    file,
    /<select[\s>]/u.test(template.replaceAll(/<script[\s\S]*?<\/script>/gu, ' ')),
  ])
);
const ACCEPTS_CHILDREN = new Map(
  [...TEMPLATES].map(([file, template]) => [file, /@render\s+children|<slot\b/u.test(template)])
);

const EMITTERS = new Map();

/** The templates that write a class or attribute token. */
function emittersOf(token) {
  if (!EMITTERS.has(token)) {
    const pattern = new RegExp(String.raw`(?<![\w-])${token}(?![\w-])`, 'u');
    EMITTERS.set(
      token,
      [...TEMPLATES.keys()].filter((file) => pattern.test(TEMPLATES.get(file)))
    );
  }
  return EMITTERS.get(token);
}

/**
 * Every selector item in the shipped CSS and in every Svelte scoped block that carries a bare
 * `select` element token, with the scope tokens governing it.
 */
function selectElementLegs(corpus = collectStyleCorpus()) {
  const legs = [];
  for (const [file, css] of Object.entries(corpus)) {
    for (const rule of ruleBlocks(css)) {
      for (const item of splitSelectorList(rule.selector)) {
        const compounds = compoundsOf(flattenGroups(item));
        const index = compounds.findIndex((compound) => elementOf(compound) === 'select');
        if (index < 0) continue;
        const prefix = compounds.slice(0, index + 1).join(' ');
        legs.push({
          file,
          line: rule.line,
          selector: item.replaceAll(/\s+/gu, ' '),
          tokens: [
            ...[...prefix.matchAll(CLASS_TOKEN)].map((match) => match[1]),
            ...[...prefix.matchAll(ATTRIBUTE_TOKEN)].map((match) => match[1]),
          ],
        });
      }
    }
  }
  return legs;
}

/** The templates that could render inside a leg's scope. See the file header for the rule. */
function possibleHosts(leg) {
  const scored = leg.tokens
    .map((token, position) => ({ token, owners: emittersOf(token), position }))
    .filter((entry) => entry.owners.length > 0);
  if (scored.length === 0) return new Set();
  scored.sort((a, b) => a.owners.length - b.owners.length || b.position - a.position);

  const hosts = new Set(scored[0].owners);
  for (const owner of scored[0].owners) {
    // The owner's OWN directly rendered children are inside its DOM subtree too: a descendant
    // combinator reaches a `<select>` a child component renders just as it reaches one written
    // inline (issue 1707 phase 2, where the drop editor's `<select>` moved one file down).
    for (const child of IMPORT_GRAPH.importsOf(owner)) {
      if (child.endsWith('.svelte')) hosts.add(child);
    }
    if (!ACCEPTS_CHILDREN.get(owner)) continue;
    for (const importer of IMPORT_GRAPH.importersOf(owner)) hosts.add(importer);
  }
  // A scoped block's own component is always in its scope, whatever its selector names.
  if (leg.file.endsWith('.svelte')) hosts.add(leg.file);
  return hosts;
}

/** The legs whose whole possible-host set renders no `<select>`. */
function strandedLegs() {
  return selectElementLegs().filter((leg) => {
    const hosts = possibleHosts(leg);
    return hosts.size > 0 && ![...hosts].some((host) => RENDERS_SELECT.get(host));
  });
}

const key = (leg) => `${leg.file}  ${leg.selector}`;

/** The templates whose MARKUP writes a `<select>`, by the text scan above. */
const renderers = () =>
  [...RENDERS_SELECT]
    .filter(([, renders]) => renders)
    .map(([file]) => file)
    .sort();

test('the element-typed leg scan is alive, so the clauses below are not quantifying over nothing', () => {
  assert.ok(
    TEMPLATES.size > 100,
    `the component walk found ${TEMPLATES.size} templates, so it is not walking`
  );
  // The text scan is checked against the native-select gate's parsed-template walk rather than
  // against a floor: both empty is agreement, and is the tree since issue 1777.
  const tree = workingTree(TEMPLATE_CORPUS);
  const parsed = nativeSelectSites(templatesOf(tree.readFile, tree.listFiles()));
  assert.deepEqual(
    renderers(),
    [...new Set(parsed.map((site) => site.file))].sort(),
    'the templates this scan says render a `<select>` are not the ones the native-select gate ' +
      'parses one out of, so a leg would be judged against hosts that do not render one, or every ' +
      'leg would report as stranded and the baseline below would be measuring the scan rather ' +
      'than the sheet'
  );
});

test('while no template renders a native <select>, no element-typed `select` leg exists', (t) => {
  if (renderers().length > 0) {
    t.skip('a template renders a native select, so each leg is judged against its hosts below');
    return;
  }
  const corpus = collectStyleCorpus();
  assert.deepEqual(
    selectElementLegs(corpus).map((leg) => `${leg.file}:${leg.line}  ${leg.selector}`),
    [],
    'no Svelte template renders a native `<select>`, so a rule reaching one by ELEMENT TYPE ' +
      'paints nothing; the three DialogV2 bodies that still build one carry no Fabricate root'
  );

  // POSITIVE CONTROL: the same walk over the real corpus with one leg appended to the END of
  // the global sheet finds exactly that leg, so the zero above is the sheet's and not the walk's.
  const sheet = 'styles/fabricate.css';
  assert.ok(corpus[sheet], `${sheet} is missing from the style corpus`);
  const probed = selectElementLegs({
    ...corpus,
    [sheet]: `${corpus[sheet]}\n.fabricate-manager .probe-host select:focus { outline: none; }\n`,
  });
  assert.deepEqual(
    probed.map((leg) => leg.tokens),
    [['fabricate-manager', 'probe-host']],
    'a `select` leg appended to the global sheet is invisible to the walk, so the zero is vacuous'
  );
});

test('no element-typed `select` leg outlives the <select> it was written for', () => {
  const baseline = new Set(STRANDED_BASELINE.map((entry) => key(entry)));
  const stranded = strandedLegs();
  const appeared = stranded
    .filter((leg) => !baseline.has(key(leg)))
    .map((leg) => `${leg.file}:${leg.line}  ${leg.selector}`);

  assert.deepEqual(
    appeared,
    [],
    'these rules reach a `<select>` by ELEMENT TYPE, and no template that can be inside their ' +
      'scope renders one. A converted call site leaves exactly this behind: the declarations ' +
      'survive, every ratchet still counts them, and they paint nothing. Delete the leg, or ' +
      're-point it at `.fabricate-select-trigger` where the geometry has to be preserved:\n  ' +
      appeared.join('\n  ')
  );
});

test('the stranded baseline shrinks and is never added to', () => {
  const stranded = new Set(strandedLegs().map((leg) => key(leg)));
  const spent = STRANDED_BASELINE.filter((entry) => !stranded.has(key(entry))).map((entry) =>
    key(entry)
  );

  for (const entry of STRANDED_BASELINE) {
    assert.ok(
      entry.why.length > 40,
      `${key(entry)} is baselined with no stated reason and no owning issue`
    );
  }
  assert.deepEqual(
    spent,
    [],
    'these baseline entries no longer match a stranded leg. That is the GOOD direction — the ' +
      'rule was deleted or a `<select>` came back — and the entry must be deleted with it, ' +
      'because a spent entry silently re-permits the next stranded leg with the same ' +
      'selector:\n  ' +
      spent.join('\n  ')
  );
});

test('the leg walk still opens a Svelte `:global(...)` wrapper, though no scoped block carries a leg', () => {
  // No scoped block has carried a `select` leg since issue 1510's last conversion, so the Svelte
  // half of the corpus is proven readable here, on a synthetic block, rather than by the tree.
  const legs = selectElementLegs({
    'src/ui/svelte/Probe.svelte': ':global(.probe-panel .probe-toolbar select) { color: red; }',
  });
  assert.deepEqual(
    legs.map((leg) => leg.tokens),
    [['probe-panel', 'probe-toolbar']],
    'a `select` leg inside `:global(...)` is invisible to the walk, so every Svelte scoped block is'
  );
});
