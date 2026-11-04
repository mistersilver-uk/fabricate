/**
 * The standalone style root's admission clause (issues 2456, 2679, 2680), in Chromium: each
 * widened entry's specimens mounted through the real seam in happy-dom into the player window's
 * `.window-content` and into a bare ApplicationV2 one, then drawn in one page per palette with
 * `<html>` naming the other palette. An open overlay's panel is drawn where the seam put it: in
 * the window's frame, and on the standalone layer for the bare host, each shown only while its
 * own host is read, and measured from its own box. Every element computes the same compared
 * properties, pseudo elements and border box in both hosts at rest, under keyboard focus, under the
 * pointer and under reduced motion, and the switch under forced colours; reach, non-vacuity,
 * scoped-style and fixture-order clauses hold each state, the root itself and the core sheets laid
 * under it. The harvested arm repeats the comparison over Foundry's own sheet, with a layout-only
 * rule written alike on both hosts that lays core's stacked windows back in flow.
 * Limit: happy-dom only produces the markup, with each field's live value and checked state
 * written back as attributes; it resolves no cascade layer and lays out nothing.
 * Limit: no arm loads Font Awesome's webfonts, since the harvested arm inlines its stylesheet and
 * its relative font URLs do not resolve, so a glyph's own box is unmeasured.
 * This file holds the specimen table's own checks, with no browser. The measurement runs in the
 * shard files `published-standalone-root-rendered-<n>-of-<count>.test.js` over
 * `tests/helpers/standaloneRootMeasurement.js`, each over a disjoint share of the entries, and
 * the checks here hold that every specimen is measured by exactly one of them.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { PUBLISHED_COMPONENT_MANIFEST } from '../../src/ui/publishedComponentManifest.js';
import * as SHARED_LISTS from '../fixtures/published-components/comparedProperties.js';
import {
  STANDALONE_COMPARED,
  STANDALONE_SPECIMENS,
} from '../fixtures/published-components/standaloneSpecimens.js';
import { walkNodes } from '../helpers/moduleAst.js';
import { componentAstOf } from '../helpers/parsedSource.js';
import { SHIPPED, byName, propLocals } from '../helpers/publishedComponentGate.js';
import {
  ENTRY_OF,
  MEASURED_ELSEWHERE,
  MOVERS,
  PALETTES,
  SCOPED,
  SHARD_COUNT,
  SPECIMENS,
  UNDRAWN_SCOPED,
  WIDENED,
  assertMeasuredOnce,
  mountSpecimens,
  partitionEntries,
  scopedHashes,
  shardFile,
  standaloneShard,
} from '../helpers/standaloneRootMeasurement.js';

const repoRoot = resolve(import.meta.dirname, '../..');
/** The toned cards and wells of issue 2854, which draw nothing focusable either. */
const TONES = ['warning', 'success', 'accent', 'info'];
const TONED_CARDS = TONES.map((tone) => `card-tone-${tone}`);
const TONED_WELLS = TONES.map((tone) => `well-tone-${tone}`);
/** The specimens in which Tab from the sentinel reaches nothing. */
const UNREACHED = Object.freeze([
  'card-filled',
  ...TONED_CARDS,
  'button-disabled',
  'stepper-disabled',
  'well-labelled',
  'well-unlabelled',
  ...TONED_WELLS,
  'icon-button-disabled',
  'cards-disabled',
  'pagination-persistent-single',
]);
/** The specimens no pointer is moved over, and those whose hover target need not change. */
const UNHOVERED = Object.freeze([
  'card-filled',
  ...TONED_CARDS,
  'well-labelled',
  'well-unlabelled',
  ...TONED_WELLS,
]);
const INERT = Object.freeze([
  'button-disabled',
  'button-busy',
  'stepper-disabled',
  'search-empty',
  'search-holding',
  'search-compact-withheld',
  'search-toolbar-count',
  'search-inline',
  'select-form-chosen',
  'select-inline-chosen',
  'select-toolbar-placeholder',
  'select-fill',
  'field-text-input',
  'field-textarea',
  'field-label-host',
  'field-fieldset-host',
  'field-size-26-number',
  'field-size-28-serif',
  'field-size-30-invalid',
  'field-size-34',
  'field-align-center',
  'icon-button-disabled',
  'cards-disabled',
  'pagination-persistent-single',
  'icon-picker-chosen',
  'icon-picker-no-match',
]);

/** The keys whose every value the specimens draw, and the values no literal in a component names. */
const VOCABULARY_KEYS = Object.freeze([
  'role',
  'size',
  'on',
  'fullWidth',
  'disabled',
  'busy',
  'semantics',
  'label',
  'fill',
  'density',
  'format',
  'tone',
  'shape',
  'layout',
  'columns',
  'persistent',
  'activePanelOnly',
  'as',
  'footerLayout',
  'activation',
]);
const DECLARED_VOCABULARIES = Object.freeze({
  columns: Object.freeze(['1', '2', '3']),
  semantics: Object.freeze(['pressed', 'switch']),
});

/** The keys of the object literal `name` declares in a component's script, frozen or not. */
function objectKeysOf(ast, name) {
  for (const node of walkNodes(ast.instance)) {
    if (node.type !== 'VariableDeclarator' || node.id?.name !== name) continue;
    const frozen = node.init?.callee?.property?.name === 'freeze' ? node.init.arguments[0] : null;
    const literal = frozen ?? node.init;
    if (literal?.type !== 'ObjectExpression') return [];
    return literal.properties.map((property) => String(property.key.name ?? property.key.value));
  }
  return [];
}

/** A default's literal value, read through the `const` it names where it names one. */
function literalOf(ast, node) {
  if (node?.type !== 'Identifier') return node?.value;
  const declared = [...walkNodes(ast.instance)].find(
    (each) => each.type === 'VariableDeclarator' && each.id?.name === node.name
  );
  return declared?.init?.value;
}

/** The literals of an array, of `new Set([...])`, or of a name declared as either, or `[]`. */
function listedLiterals(node, declared) {
  const list = node?.type === 'Identifier' ? declared.get(node.name) : node;
  const array = list?.type === 'NewExpression' ? list.arguments[0] : list;
  if (array?.type !== 'ArrayExpression') return [];
  return array.elements.filter((element) => element?.type === 'Literal');
}

/** The literals one node compares `isLocal` with: by `===` or `!==`, a `switch`, or a list's `includes` or `has`. */
function literalsCompared(node, isLocal, declared) {
  if (node.type === 'BinaryExpression' && ['===', '!=='].includes(node.operator)) {
    const other = isLocal(node.left) ? node.right : isLocal(node.right) ? node.left : null;
    return other?.type === 'Literal' ? [other] : [];
  }
  if (node.type === 'SwitchStatement' && isLocal(node.discriminant)) {
    return node.cases.map((each) => each.test).filter((test) => test?.type === 'Literal');
  }
  const method = node.type === 'CallExpression' ? node.callee.property?.name : undefined;
  if ((method === 'includes' || method === 'has') && isLocal(node.arguments[0])) {
    return listedLiterals(node.callee.object, declared);
  }
  return [];
}

/** Each literal the component compares `local` with, in its script or its markup. */
function comparedLiterals(ast, local) {
  const isLocal = (node) => node?.type === 'Identifier' && node.name === local;
  const nodes = [...walkNodes(ast)];
  const declared = new Map(
    nodes
      .filter((node) => node.type === 'VariableDeclarator' && node.id.type === 'Identifier')
      .map((node) => [node.id.name, node.init])
  );
  return nodes
    .flatMap((node) => literalsCompared(node, isLocal, declared))
    .map((literal) => String(literal.value));
}

/**
 * A published key's vocabulary, read from its component: its default, unless the key is required,
 * and each value it maps or compares.
 */
function vocabularyOf(entry, key, declaredBy = DECLARED_VOCABULARIES) {
  const ast = componentAstOf(entry.path);
  const prop = propLocals(ast).find((local) => local.key === key);
  const fallback = literalOf(ast, prop?.fallback);
  if (typeof fallback === 'boolean') return { kind: 'boolean', values: ['false', 'true'] };
  if (declaredBy[key]) {
    return { kind: 'listed', fallback, values: declaredBy[key] };
  }
  const read = [
    ...objectKeysOf(ast, `${key.toUpperCase()}_CLASSES`),
    ...objectKeysOf(ast, `${key.toUpperCase()}S`),
    ...comparedLiterals(ast, prop.local),
  ];
  if (read.length > 0) {
    const defaulted = entry.props[key].required === true ? [] : [String(fallback)];
    return { kind: 'listed', fallback, values: [...new Set([...defaulted, ...read])] };
  }
  return { kind: 'text', fallback, values: ['', 'text'] };
}

function valueOf(vocabulary, props, key) {
  const value = Object.hasOwn(props, key) ? props[key] : vocabulary.fallback;
  if (vocabulary.kind === 'boolean') return String(Boolean(value));
  if (vocabulary.kind === 'listed') return String(value);
  return value ? 'text' : '';
}

const entryNamed = (name) => PUBLISHED_COMPONENT_MANIFEST.find((entry) => entry.name === name);

/**
 * The `Entry key` pairs the manifest publishes for the widened entries under a key in
 * VOCABULARY_KEYS.
 */
const publishedVocabularyPairs = () =>
  new Set(
    WIDENED.flatMap(({ name, props }) =>
      Object.keys(props)
        .filter((key) => VOCABULARY_KEYS.includes(key))
        .map((key) => `${name} ${key}`)
    )
  );

/** Fails, naming each pair, unless `actual` and `expected` hold the same pairs. */
function assertSamePairs(actual, expected, message) {
  const missing = [...expected].filter((pair) => !actual.has(pair)).sort(byName);
  const extra = [...actual].filter((pair) => !expected.has(pair)).sort(byName);
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, message);
}

describe('the standalone specimen table', () => {
  it('names exactly the entries drawn under the standalone style root', () => {
    assert.deepEqual(
      Object.keys(STANDALONE_SPECIMENS).sort(byName),
      WIDENED.map(({ name }) => name).sort(byName)
    );
  });

  it('leaves each entry it does not measure to a file that does', () => {
    const SAME = 'computes the same styles, pseudo elements and border box in both hosts';
    const titleOf = (node) =>
      node.type === 'TemplateLiteral' ? node.quasis[0].value.cooked : String(node.value ?? '');
    for (const [name, file] of Object.entries(MEASURED_ELSEWHERE)) {
      assert.ok(entryNamed(name)?.standaloneRoot, `${name} is a widened entry`);
      const nodes = [...walkNodes(SHIPPED.module(file).ast)];
      assert.ok(
        nodes.some((node) => node.type === 'Literal' && node.value === name),
        `${file} names ${name}`
      );
      assert.ok(
        nodes.some(
          (node) => node.type === 'ImportSpecifier' && node.imported?.name === 'STANDALONE_COMPARED'
        ),
        `${file} compares the shared property list`
      );
      const titles = nodes
        .filter((node) => node.type === 'CallExpression' && node.callee?.name === 'it')
        .map((node) => titleOf(node.arguments[0]));
      assert.ok(
        titles.some((title) => title.startsWith(SAME)),
        `${file} holds the per-state host comparison`
      );
    }
  });

  it('draws every value of each vocabulary key the entries publish, compared or declared', () => {
    const read = new Set();
    const held = new Set();
    for (const [name, specimens] of Object.entries(STANDALONE_SPECIMENS)) {
      const entry = entryNamed(name);
      for (const key of VOCABULARY_KEYS) {
        if (!Object.hasOwn(entry.props, key)) continue;
        const vocabulary = vocabularyOf(entry, key);
        read.add(`${name} ${key}`);
        assert.ok(vocabulary.values.length > 1, `${name} ${key} reads a vocabulary`);
        const drawn = new Set(
          Object.values(specimens).map(({ props }) => valueOf(vocabulary, props, key))
        );
        const expected = [...vocabulary.values].sort(byName);
        assert.deepEqual([...drawn].sort(byName), expected, `${name} ${key}`);
        held.add(`${name} ${key}`);
      }
    }
    const published = publishedVocabularyPairs();
    assert.ok(published.size > 0, 'the entries publish vocabulary keys');
    assertSamePairs(read, published, 'each vocabulary key the entries publish was read');
    assertSamePairs(held, read, 'each vocabulary key read was held');
  });

  it('declares the semantics set StatusToggle itself reads, so a third value cannot hide', () => {
    const { values } = vocabularyOf(entryNamed('StatusToggle'), 'semantics', {});
    assert.deepEqual([...values].sort(byName), [...DECLARED_VOCABULARIES.semantics].sort(byName));
  });

  it('reads the rungs Select maps for size from its frozen table', () => {
    const { values } = vocabularyOf(entryNamed('Select'), 'size');
    assert.deepEqual([...values].sort(byName), ['form', 'inline', 'toolbar']);
  });

  it('opens a panel in a specimen of each overlay entry, and reads it in every other only closed', () => {
    const opened = SPECIMENS.filter(({ open }) => open).map(({ name }) => name);
    const overlays = WIDENED.filter((entry) => entry.overlays === true).map(({ name }) => name);
    assert.deepEqual([...new Set(opened)].sort(byName), ['ActionMenu', 'IconPicker', 'Select']);
    assert.ok(
      SPECIMENS.filter(({ name }) => name === 'Modal').every(({ props }) => props.open === true),
      'a Modal specimen is drawn open, which is its whole face'
    );
    assert.deepEqual(overlays.sort(byName), ['ActionMenu', 'IconPicker', 'Modal', 'Select']);
  });

  it('reads the densities SegmentedControl compares, which no class table maps', () => {
    const { values } = vocabularyOf(entryNamed('SegmentedControl'), 'density');
    assert.deepEqual([...values].sort(byName), ['compact', 'default', 'field', 'inline']);
  });

  it('reads the hosts Field draws for as through its set, with no default for the required key', () => {
    const { values } = vocabularyOf(entryNamed('Field'), 'as');
    assert.deepEqual([...values].sort(byName), ['div', 'fieldset', 'label']);
  });

  it('compares every property the three-host test compares on these controls', () => {
    const shared = Object.entries(SHARED_LISTS);
    assert.equal(shared.length, 6, 'the six lists the two tests share');
    for (const [list, properties] of shared) {
      const missing = properties.filter((property) => !STANDALONE_COMPARED.includes(property));
      assert.deepEqual(missing, [], list);
    }
  });

  it('declares exactly the specimens Tab reaches nothing in', () => {
    assert.deepEqual(
      SPECIMENS.filter(({ reach }) => reach.focus === null).map(({ id }) => id),
      UNREACHED
    );
  });

  it('declares exactly the specimens no pointer is moved over, and those whose hover may not change', () => {
    assert.deepEqual(
      SPECIMENS.filter(({ reach }) => reach.hover === null).map(({ id }) => id),
      UNHOVERED
    );
    assert.deepEqual(
      SPECIMENS.filter(({ reach }) => reach.inert).map(({ id }) => id),
      INERT
    );
  });

  it('draws each scoped component’s hash class in both hosts of a specimen', async () => {
    const markup = await mountSpecimens(SPECIMENS);
    const { document } = new Window();
    const holds = (html, hash) => {
      document.body.innerHTML = html ?? '';
      return Boolean(document.body.querySelector(`.${hash}`));
    };
    const hashes = scopedHashes();
    for (const palette of PALETTES) {
      for (const [at, name] of SCOPED.entries()) {
        if (Object.hasOwn(UNDRAWN_SCOPED, name)) continue;
        const drawn = SPECIMENS.filter(({ id }) =>
          Object.values(markup[palette][id]).every(
            ({ target, panel }) => holds(target, hashes[at]) || holds(panel, hashes[at])
          )
        );
        assert.ok(drawn.length > 0, `a specimen draws ${name} in both hosts (${palette})`);
      }
    }
  });

  it('lays every scoped component of the closures, and names the one no published key draws', () => {
    assert.ok(SCOPED.length > 2, 'the closures state scoped rules');
    for (const name of Object.keys(UNDRAWN_SCOPED)) assert.ok(SCOPED.includes(name), name);
    assert.ok(!Object.hasOwn(entryNamed('EditorTabs').props, 'badges'), 'badges is unpublished');
  });
});

describe('the standalone specimen shards', () => {
  const ids = (list) => list.map(({ id }) => id);
  const shards = Array.from({ length: SHARD_COUNT }, (_, index) => standaloneShard(index));
  const dealt = (kind) => shards.map((shard) => ids(shard[kind]));

  it('runs one file per shard, each naming the shard it measures', () => {
    const files = readdirSync(resolve(repoRoot, 'tests/components'))
      .filter((file) => /^published-standalone-root-rendered-\d+-of-\d+\.test\.js$/.test(file))
      .sort(byName);
    assert.deepEqual(
      files,
      shards.map((_, index) => basename(shardFile(index)))
    );
    for (const [index] of shards.entries()) {
      const started = [...walkNodes(SHIPPED.module(shardFile(index)).ast)]
        .filter(
          (node) =>
            node.type === 'CallExpression' && node.callee.name === 'defineStandaloneRootShard'
        )
        .map((node) => node.arguments.map(({ value }) => value));
      assert.deepEqual(started, [[index]], `${shardFile(index)} measures shard ${index}`);
    }
  });

  it('measures every specimen in exactly one shard, and each state’s subset of them too', () => {
    assertMeasuredOnce(dealt('specimens'), ids(SPECIMENS), 'specimens');
    const subsets = {
      focused: SPECIMENS.filter(({ reach }) => reach.focus !== null),
      hovered: SPECIMENS.filter(({ reach }) => reach.hover !== null),
      switches: SPECIMENS.filter(({ name }) => name === 'StatusToggle'),
      opened: SPECIMENS.filter(({ name, open }) => Boolean(open) || name === 'Modal'),
    };
    for (const [kind, subset] of Object.entries(subsets)) {
      assert.ok(subset.length > 0, `${kind} names specimens`);
      assertMeasuredOnce(dealt(kind), ids(subset), kind);
    }
    assertMeasuredOnce(
      shards.map(({ entries }) => entries),
      Object.keys(STANDALONE_SPECIMENS),
      'entries'
    );
  });

  it('fails a specimen measured by no shard, by two, or by none of the table', () => {
    const everyId = ids(SPECIMENS);
    const fails = (measuredBy) => {
      try {
        assertMeasuredOnce(measuredBy, everyId, 'mutated');
      } catch (error) {
        return error.actual;
      }
      return null;
    };
    const held = dealt('specimens');
    const [first] = held[0];
    assert.deepEqual(fails(held), null, 'the real deal passes');
    const dropped = held.map((list, at) => (at === 0 ? list.slice(1) : list));
    assert.deepEqual(fails(dropped), { wrong: [`${first} x0`], strangers: [] });
    const doubled = held.map((list, at) => (at === 1 ? [...list, first] : list));
    assert.deepEqual(fails(doubled), { wrong: [`${first} x2`], strangers: [] });
    const stranger = held.map((list, at) => (at === 0 ? [...list, 'not-a-specimen'] : list));
    assert.deepEqual(fails(stranger), { wrong: [], strangers: ['not-a-specimen'] });
  });

  it('deals any table to any count of shards so each entry lands once, and no shard runs far ahead', () => {
    for (const count of [1, 2, 3, 4, 5, 8]) {
      const dealtEntries = partitionEntries(STANDALONE_SPECIMENS, count);
      assert.equal(dealtEntries.length, count);
      assertMeasuredOnce(dealtEntries, Object.keys(STANDALONE_SPECIMENS), `${count} shards`);
      const weights = dealtEntries.map((names) =>
        names.reduce((sum, name) => sum + Object.keys(STANDALONE_SPECIMENS[name]).length, 0)
      );
      const heaviest = Math.max(
        ...Object.values(STANDALONE_SPECIMENS).map((each) => Object.keys(each).length)
      );
      assert.ok(
        Math.max(...weights) - Math.min(...weights) <= heaviest,
        `${count} shards hold ${weights} specimens, within the heaviest entry's ${heaviest}`
      );
    }
    assert.deepEqual(
      partitionEntries({ b: { x: {} }, a: { y: {} } }, 2),
      [['a'], ['b']],
      'equal weights are dealt in code point order, ties to the lowest shard'
    );
  });

  it('keeps every entry with a test of its own, and every mover, in the table and in one shard', () => {
    const named = [...Object.values(ENTRY_OF), ...MOVERS];
    for (const name of named) {
      assert.ok(Object.hasOwn(STANDALONE_SPECIMENS, name), `${name} is a table entry`);
      assertMeasuredOnce(
        shards.map(({ entries }) => entries.filter((each) => each === name)),
        [name],
        name
      );
    }
  });
});
