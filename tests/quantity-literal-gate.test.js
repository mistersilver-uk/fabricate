/**
 * Regression gate: no module under `src/**` may re-hardcode the dnd5e/pf2e item stack-quantity path
 * (issue 1024, #853 proposal 1).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { collectSources, repoRoot, stripComments } from './helpers/sourceScan.js';

const srcRoot = join(repoRoot, 'src');

/**
 * The ONE legitimate home for the literal, with the exact number of code occurrences it is allowed.
 */
const ALLOWLIST = Object.freeze({
  'src/config/stackQuantityPathPresets.js': 1,
});

// Hardcoded, for the same reason. The routed implementation leaves exactly the
// allowlisted occurrence and nothing else.
const EXPECTED_FINDING_COUNT = 1;

const SHAPES = [
  // `item.update({ 'system.quantity': 19 })` — the WRITE half, which contains no
  // property access at all and which a property-access-only gate cannot see.
  { name: 'quoted path', pattern: /(['"`])system\.quantity\1/ },
  // `system['quantity']`, `system?.['quantity']`, `item['system']['quantity']`.
  {
    name: 'bracket access',
    pattern: /(?:\bsystem\b|\[\s*(['"])system\1\s*])\s*\??\.?\s*\[\s*(['"])quantity\2\s*]/,
  },
  // `item.system.quantity` and `item.system?.quantity`.
  { name: 'dot access', pattern: /\bsystem\s*\??\.\s*quantity\b/ },
];

/** Scan a `{ path: text }` corpus for hardcoded item stack-quantity paths. */
export function findQuantityLiterals(sources) {
  const findings = [];
  for (const [path, text] of Object.entries(sources || {})) {
    const lines = stripComments(text).split('\n');
    lines.forEach((line, index) => {
      for (const shape of SHAPES) {
        if (shape.pattern.test(line)) {
          findings.push({ path, line: index + 1, shape: shape.name, text: line.trim() });
          break;
        }
      }
    });
  }
  return findings;
}

// The comment stripper is shared with `tests/actor-type-literal-gate.test.js` through
// `tests/helpers/sourceScan.js`, and is proved here — once — rather than in both gates.
describe('the comment stripper', () => {
  it('blanks a line comment, a block comment and a JSDoc block', () => {
    const stripped = stripComments(
      ['/** doc system.quantity */', 'const a = 1; // trailing system.quantity', '/*', ' * system.quantity', ' */', 'const b = 2;'].join('\n')
    );
    assert.equal(/system\.quantity/.test(stripped), false);
    assert.match(stripped, /const a = 1;/, 'code before a trailing comment survives');
    assert.match(stripped, /const b = 2;/, 'and code after a block comment survives');
  });

  it('does NOT treat a `//` inside a string as a comment', () => {
    const stripped = stripComments("const url = 'https://example.test'; const q = item.system.quantity;");
    assert.match(stripped, /system\.quantity/);
  });

  it('recovers on the next line from an unbalanced quote inside a regex', () => {
    const stripped = stripComments(["const q = /['\"]/;", 'const n = item.system.quantity;'].join('\n'));
    assert.match(stripped, /system\.quantity/, 'quote state resets at every newline');
  });

  it('preserves line numbering so a finding points at the right line', () => {
    const stripped = stripComments(['// system.quantity', '', 'a.system.quantity;'].join('\n'));
    assert.equal(stripped.split('\n').length, 3);
    assert.equal(stripped.split('\n')[2], 'a.system.quantity;');
  });
});

describe('the quantity literal gate can actually fail', () => {
  it('reports exactly one finding for a corpus holding one real literal', () => {
    const findings = findQuantityLiterals({
      'src/fake/one.js': ['function have(item) {', '  return item.system.quantity;', '}'].join('\n'),
    });
    assert.deepEqual(
      findings.map((finding) => [finding.path, finding.line, finding.shape]),
      [['src/fake/one.js', 2, 'dot access']]
    );
  });

  it('matches the OPTIONAL-CHAINED spelling as well as the plain one', () => {
    const findings = findQuantityLiterals({
      'src/fake/chained.js': 'const q = Number(item?.system?.quantity ?? 1);',
      'src/fake/plain.js': 'itemData.system.quantity = qty;',
      // Destructured, so `system` is not preceded by a dot at all.
      'src/fake/bare.js': 'const { system } = item; return system.quantity;',
    });
    assert.equal(findings.length, 3);
    assert.deepEqual([...new Set(findings.map((finding) => finding.shape))], ['dot access']);
  });

  it('matches the QUOTED write payload key — the half a property scan cannot see', () => {
    const findings = findQuantityLiterals({
      'src/fake/write.js': "await item.update({ 'system.quantity': qty - count });",
      'src/fake/double.js': 'await item.update({ "system.quantity": 1 });',
      'src/fake/const.js': "const PATH = `system.quantity`;",
    });
    assert.equal(findings.length, 3);
    assert.deepEqual([...new Set(findings.map((finding) => finding.shape))], ['quoted path']);
  });

  it('matches bracket access, which defeats a `.quantity` property match', () => {
    const findings = findQuantityLiterals({
      'src/fake/bracket.js': "const q = item.system['quantity'];",
      'src/fake/optional.js': 'const q = item.system?.["quantity"];',
      'src/fake/both.js': "const q = item['system']['quantity'];",
    });
    assert.equal(findings.length, 3);
    assert.deepEqual([...new Set(findings.map((finding) => finding.shape))], ['bracket access']);
  });

  it('does NOT flag prose, which is how this design is DOCUMENTED', () => {
    const findings = findQuantityLiterals({
      'src/fake/prose.js': [
        '/**',
        ' * The engine used to read `item.system.quantity` directly at ~31 sites.',
        " * The write half was `item.update({ 'system.quantity': next })`.",
        ' */',
        'import { readStackQuantity } from "./itemStackQuantity.js"; // not system.quantity',
        'export const have = (item) => readStackQuantity(item);',
      ].join('\n'),
      // A near-miss that must not be flagged: a DIFFERENT field on `system`.
      'src/fake/near.js': 'const qtd = item.system.qtd; const q = item.quantity;',
    });
    assert.deepEqual(findings, []);
  });
});

describe('src/** carries no hardcoded item stack-quantity path', () => {
  it(`has exactly ${EXPECTED_FINDING_COUNT} allowlisted occurrence(s) and no other`, () => {
    const findings = findQuantityLiterals(collectSources(srcRoot));
    const unexpected = findings.filter((finding) => !Object.hasOwn(ALLOWLIST, finding.path));
    assert.deepEqual(
      unexpected.map((finding) => `${finding.path}:${finding.line}  ${finding.text}`),
      [],
      'the item stack-quantity path is GM-configurable — read and write it through' +
        ' src/systems/itemStackQuantity.js (readStackQuantity / readStoredStackQuantity /' +
        ' hasStackQuantity / setStackQuantity / updateStackQuantity) instead of hardcoding' +
        ' the dnd5e/pf2e field'
    );
    assert.equal(findings.length, EXPECTED_FINDING_COUNT);
  });

  it('every allowlist entry still matches live source, so the list can only shrink', () => {
    const findings = findQuantityLiterals(collectSources(srcRoot));
    for (const [path, expected] of Object.entries(ALLOWLIST)) {
      const actual = findings.filter((finding) => finding.path === path).length;
      assert.equal(
        actual,
        expected,
        `${path} is allowlisted for ${expected} occurrence(s) but holds ${actual}` +
          ' — a stale allowlist entry is a gate that has stopped policing something'
      );
    }
  });

  it('scanned a real corpus — a gate that matched nothing would also pass vacuously', () => {
    const sources = collectSources(srcRoot);
    const paths = Object.keys(sources);
    assert.ok(paths.length > 200, `expected the whole src tree, scanned ${paths.length} files`);
    for (const path of [
      'src/main.js',
      'src/systems/CraftingEngine.js',
      'src/models/IngredientSet.js',
      'src/config/stackQuantityPathPresets.js',
      // A `.svelte` path, so that dropping `.svelte` from `SCANNED_EXTENSIONS` reds this test
      // rather than silently halving the corpus.
      'src/ui/svelte/apps/manager/PartyExpandedBody.svelte',
    ]) {
      assert.ok(paths.includes(path), `${path} must be in the scanned corpus`);
    }
  });
});

describe('the constant-mediated blind spot is closed structurally', () => {
  it('componentStacking no longer exports a hardcoded quantity-path constant', async () => {
    // `DEFAULT_QUANTITY_PATH` was read via `.split('.').reduce(...)`, so it contained NEITHER
    // spelling of the literal and no scan above could ever have matched it.
    const stacking = await import('../src/systems/componentStacking.js');
    assert.equal(stacking.DEFAULT_QUANTITY_PATH, undefined);
    const source = readFileSync(resolve(srcRoot, 'systems/componentStacking.js'), 'utf8');
    assert.equal(/DEFAULT_QUANTITY_PATH/.test(source), false);
  });

  it('the accessor is the only module that resolves the configured path', async () => {
    const accessor = await import('../src/systems/itemStackQuantity.js');
    for (const name of [
      'itemStackQuantityPath',
      'configureItemStackQuantityPath',
      'resetItemStackQuantityPath',
      'normalizeStackQuantityPath',
      'readStackQuantity',
      'readStoredStackQuantity',
      'hasStackQuantity',
      'setStackQuantity',
      'stackQuantityUpdate',
      'updateStackQuantity',
      'probeStackQuantityPath',
    ]) {
      assert.equal(typeof accessor[name], 'function', `${name} must be exported`);
    }
  });
});
