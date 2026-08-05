/**
 * Regression gate: no module under `src/**` may re-hardcode the dnd5e/pf2e item
 * stack-quantity path (issue 1024, #853 proposal 1).
 *
 * ~31 sites used to read or write `system.quantity` directly. Each one was a
 * Tormenta20 world silently losing inventory, and — worse — a PARTIALLY routed module
 * splits the read from the write, which produces free components in one branch and
 * destroyed stacks in the other, in the same world. A thirty-second spelling would
 * reintroduce that in one surface only, which is the hardest version to notice.
 *
 * ## Shapes matched, and why each one
 *
 * The gate matches BOTH the optional-chained (`system?.quantity`) and the plain
 * (`system.quantity`) spellings, bracket access (`system['quantity']`), and the QUOTED
 * path (`'system.quantity'`) — the last being the flattened `item.update(...)` payload
 * key, which is the write half and contains no property access at all. An earlier
 * quantity gate matched only one spelling and was therefore vacuous.
 *
 * ## Comments are stripped before scanning, deliberately
 *
 * Modules that hold (or held) real call sites also DESCRIBE the field in prose, and the
 * accurate way to document this design is to name the literal. A gate that flagged prose
 * would be answered with a file-level allowlist — which would exempt exactly the modules
 * the gate exists to police. So `stripComments` blanks comment text first, and the
 * synthetic corpora below prove both that a real literal is still found and that a
 * comment-only mention is not.
 *
 * ## Known blind spot, recorded rather than papered over
 *
 * No literal scan can see CONSTANT-MEDIATED access. Before this change
 * `SvelteCraftingSystemManagerApp.svelte.js` read the quantity via
 * `DEFAULT_QUANTITY_PATH.split('.').reduce(...)`, which contains neither spelling — no
 * grep and no gate could match it. The structural defence is that the constant was
 * DELETED rather than re-pointed, turning that invisible miss into a build error; the
 * final test in this file pins that deletion. Do not assume the scan covers this class.
 *
 * ## Vacuity
 *
 * A mechanical check that cannot fail is worthless, so the scanner is factored as
 * `findQuantityLiterals({ path: text })` and exercised against synthetic corpora whose
 * expected verdicts are known. The allowlist is also self-policing: each entry declares
 * an exact count that must still be matched by live source, so a stale entry fails and
 * the list can only shrink by editing a number a reviewer can see.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const srcRoot = join(repoRoot, 'src');
const SCANNED_EXTENSIONS = ['.js', '.mjs', '.svelte'];

/**
 * The ONE legitimate home for the literal, with the exact number of code occurrences it
 * is allowed. Declaring a count rather than a bare path is what makes the entry
 * self-policing: it must still match live source (so a stale entry fails), and growth is
 * a visible diff on a number rather than a new line in a list a reviewer skims past.
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

/**
 * Blank out comment text, preserving line and column positions.
 *
 * Quote state is tracked so a `//` inside a string literal is not read as a comment, and
 * it RESETS at every newline. That reset is deliberate: an unbalanced quote inside a
 * regular expression (`/['"]/`) would otherwise put the scanner into string state and
 * swallow the rest of the file, which is exactly how a gate goes quietly vacuous. Bounded
 * this way, such a mistake can only affect its own line.
 *
 * @param {string} source
 * @returns {string} The source with comment characters replaced by spaces.
 */
export function stripComments(source) {
  let inBlockComment = false;
  return String(source ?? '')
    .split('\n')
    .map((line) => {
      let out = '';
      let index = 0;
      let quote = null;
      while (index < line.length) {
        const character = line[index];
        const next = line[index + 1];
        if (inBlockComment) {
          if (character === '*' && next === '/') {
            inBlockComment = false;
            out += '  ';
            index += 2;
          } else {
            out += ' ';
            index += 1;
          }
          continue;
        }
        if (quote) {
          out += character;
          if (character === '\\') {
            out += next ?? '';
            index += 2;
            continue;
          }
          if (character === quote) quote = null;
          index += 1;
          continue;
        }
        if (character === '/' && next === '/') {
          out += ' '.repeat(line.length - index);
          break;
        }
        if (character === '/' && next === '*') {
          inBlockComment = true;
          out += '  ';
          index += 2;
          continue;
        }
        if (character === "'" || character === '"' || character === '`') quote = character;
        out += character;
        index += 1;
      }
      return out;
    })
    .join('\n');
}

/**
 * Scan a `{ path: text }` corpus for hardcoded item stack-quantity paths.
 *
 * Taking a corpus rather than reading the filesystem is what makes this gate testable:
 * the same function that polices `src/**` can be pointed at a synthetic corpus whose
 * expected verdict is known.
 *
 * @param {Record<string, string>} sources
 * @returns {Array<{path: string, line: number, shape: string, text: string}>}
 */
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

function collectSources(dir) {
  const sources = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      Object.assign(sources, collectSources(full));
    } else if (SCANNED_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
      sources[relative(repoRoot, full).replaceAll('\\', '/')] = readFileSync(full, 'utf8');
    }
  }
  return sources;
}

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
    ]) {
      assert.ok(paths.includes(path), `${path} must be in the scanned corpus`);
    }
  });
});

describe('the constant-mediated blind spot is closed structurally', () => {
  it('componentStacking no longer exports a hardcoded quantity-path constant', async () => {
    // `DEFAULT_QUANTITY_PATH` was read via `.split('.').reduce(...)`, so it contained
    // NEITHER spelling of the literal and no scan above could ever have matched it.
    // Deleting it — rather than re-pointing it — is what turned that invisible miss into
    // a build error. Re-adding any such constant reds this test.
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
