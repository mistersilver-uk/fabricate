import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  readFreeIconNames,
  resolveFreeStylesheetPath,
} from '../scripts/generate-icon-catalogue.mjs';
import {
  COMPOSITION_EXEMPT_PATHS,
  SCANNED_EXTENSIONS,
  SCANNED_ROOTS,
  classifyIconToken,
  composesIconNames,
  findIconLicensingViolations,
  readFreeIconVocabulary,
} from '../scripts/lib/iconLicensing.js';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Resolved and read at collection, so a missing or unreadable devDependency throws HERE, naming
// the package, rather than yielding an empty oracle against which every Pro name in the tree looks
// free. The same failure mode the catalogue's own licensing guard calls out.
const FREE_STYLESHEET_PATH = resolveFreeStylesheetPath();
const FREE_STYLESHEET = fs.readFileSync(FREE_STYLESHEET_PATH, 'utf8');
const vocabulary = readFreeIconVocabulary(FREE_STYLESHEET);

function scan(text, options = {}) {
  return findIconLicensingViolations({ text, vocabulary, ...options });
}

function collectScannedFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectScannedFiles(entryPath));
    } else if (SCANNED_EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

function scannedSources() {
  return SCANNED_ROOTS.flatMap((root) => collectScannedFiles(path.join(REPOSITORY_ROOT, root))).map(
    (absolute) => ({
      relative: path.relative(REPOSITORY_ROOT, absolute).split(path.sep).join('/'),
      text: fs.readFileSync(absolute, 'utf8'),
    })
  );
}

// THE ORACLE. Everything below is only as good as this, so it is checked before it is used: the
// guard that matters most is the one that fails loudest when it stops discriminating.
describe('the source licensing guard reads Font Awesome Free, not Foundry’s Pro bundle', () => {
  it('resolves its vocabulary from the pinned free devDependency', () => {
    assert.ok(
      FREE_STYLESHEET_PATH.includes(path.join('@fortawesome', 'fontawesome-free')),
      `the oracle must be the devDependency, not a stray stylesheet at ${FREE_STYLESHEET_PATH}`
    );
    // `readFreeIconNames` refuses a stylesheet that is not a free release, which is the check that
    // stops a Foundry bundle being handed to this guard by mistake. A Pro bundle would not narrow
    // anything at all while looking exactly like a run that had.
    assert.equal(readFreeIconNames(FREE_STYLESHEET_PATH).release.edition, 'Free');
  });

  it('agrees with the catalogue generator about what the free set is', () => {
    const generatorNames = readFreeIconNames(FREE_STYLESHEET_PATH).names;
    assert.equal(vocabulary.glyphNames.size, generatorNames.size);
    assert.ok(
      [...generatorNames].every((name) => vocabulary.glyphNames.has(name)),
      'the two halves of the licensing rule must not disagree about the free set'
    );
  });

  it('discriminates: it holds the free book and declines the Pro one', () => {
    assert.ok(vocabulary.glyphNames.size > 1000, `only ${vocabulary.glyphNames.size} free names`);
    assert.ok(vocabulary.glyphNames.has('book'), 'book is a free name');
    assert.ok(!vocabulary.glyphNames.has('book-sparkles'), 'book-sparkles is Pro-only');
    assert.ok(!vocabulary.glyphNames.has('candle-holder'), 'candle-holder is Pro-only');
  });

  it('separates the free utility classes from the glyph names', () => {
    for (const utility of ['fw', 'spin', '2x', 'li', 'border']) {
      assert.ok(vocabulary.utilityClasses.has(utility), `fa-${utility} is a free utility class`);
      assert.ok(!vocabulary.glyphNames.has(utility), `fa-${utility} names no glyph`);
    }
    assert.equal(classifyIconToken('fa-fw', vocabulary), 'free-utility');
    assert.equal(classifyIconToken('fa-book', vocabulary), 'free-glyph');
    assert.equal(classifyIconToken('fa-book-sparkles', vocabulary), 'unknown-glyph');
    assert.equal(classifyIconToken('fas', vocabulary), 'free-style');
    assert.equal(classifyIconToken('fal', vocabulary), 'pro-style');
    assert.equal(classifyIconToken('fa-duotone', vocabulary), 'pro-style');
    assert.equal(classifyIconToken('fa-swap-opacity', vocabulary), 'pro-utility');
  });
});

// THE SHAPES. The defect this guard was written for wore three different shapes across five
// components and a fourth, `class:fa-book-sparkles={…}`, that has no quoted string in it at all:
// the icon name IS the directive name. A guard that only understood quoted class lists would have
// reported four of the five sites and certified the fifth, so each shape is pinned here.
describe('the guard sees an unlicensed name in every shape the codebase writes one', () => {
  const shapes = [
    ['a component prop', '<EmptyState icon="fas fa-book-sparkles" title={title} />'],
    ['a class attribute literal', '<i class="fas fa-book-sparkles" aria-hidden="true"></i>'],
    [
      'a value returned from a script',
      "  function sourceIcon(row) {\n    return row.granted ? 'fas fa-hand-holding' : 'fas fa-book-sparkles';\n  }",
    ],
    [
      'a Svelte class directive, which has no string at all',
      '<i class="fas" class:fa-book-sparkles={idle} class:fa-spinner={busy}></i>',
    ],
    ['a bare class token in a stylesheet', '.fabricate-thing .fa-book-sparkles { color: red; }'],
  ];

  for (const [shape, source] of shapes) {
    it(`reports a Pro-only name written as ${shape}`, () => {
      const violations = scan(source);
      assert.equal(violations.length, 1, `expected exactly one violation in: ${source}`);
      assert.equal(violations[0].kind, 'unlicensed-icon-name');
      assert.equal(violations[0].token, 'fa-book-sparkles');
    });
  }

  it('refuses a name assembled at runtime rather than walking past it', () => {
    const templated = scan('const iconClass = `${prefix} fa-${iconCode}`;');
    assert.equal(templated.length, 1);
    assert.equal(templated[0].kind, 'composed-icon-name');

    const concatenated = scan("const iconClass = 'fas ' + 'fa-' + iconCode;");
    assert.equal(concatenated.length, 1);
    assert.equal(concatenated[0].kind, 'composed-icon-name');
  });

  it('reports a Pro weight worn by a free name', () => {
    const violations = scan('<i class="fa-duotone fa-book fa-swap-opacity"></i>');
    assert.deepEqual(
      violations.map((violation) => violation.token).sort(),
      ['fa-duotone', 'fa-swap-opacity'],
      'a free glyph at a Pro weight is still a Pro reference'
    );
    assert.ok(violations.every((violation) => violation.kind === 'pro-only-style'));
  });

  it('reports the line the name is on', () => {
    const violations = scan(
      '<div>\n  <span></span>\n  <i class="fas fa-book-sparkles"></i>\n</div>'
    );
    assert.equal(violations[0].line, 3);
  });
});

// THE FALSE POSITIVES THE GUARD MUST NOT RAISE. Two shipped modules teach the runtime to READ a
// Pro prefix out of GM-authored icon data; naming a prefix is not writing an icon with it. If
// these ever start failing, the guard has begun forbidding the code that handles Pro data safely.
describe('the guard is silent on the code that recognises Pro prefixes rather than writing them', () => {
  it('passes a prefix recognition set', () => {
    const source = [
      "const STYLE_PREFIXES = new Set(['fas', 'far', 'fal', 'fat', 'fad', 'fa-light',",
      "  'fa-thin', 'fa-duotone', 'fa-sharp', 'fa-sharp-duotone', 'fa-swap-opacity']);",
      'const PREFIX = /^(?:fa[bsrltd]?|fa-solid|fa-light|fa-thin|fa-duotone|fa-brands)$/;',
    ].join('\n');
    assert.deepEqual(scan(source), []);
  });

  it('passes free names, free utilities and free prefixes together', () => {
    assert.deepEqual(scan('<i class="fas fa-book fa-fw fa-spin fa-2x"></i>'), []);
    assert.deepEqual(scan('<i class="far fa-circle"></i>'), []);
    assert.deepEqual(scan("emptyIcon = 'fas fa-download'"), []);
  });

  it('passes prose that names a Pro glyph without its class prefix', () => {
    assert.deepEqual(
      scan('// `candle-holder` is Pro-only, so this declines it in favour of `fa-book`.'),
      [],
      'documentation has to be able to name the glyph it is declining'
    );
  });

  it('passes prose containing an English word that is also a Pro prefix', () => {
    assert.deepEqual(
      scan('// A fast render keeps the fa-spin on the fa-book from stuttering.'),
      [],
      '"fast" is Pro’s sharp-thin prefix and an ordinary English word'
    );
  });
});

// THE TREE. The check the other tests exist to make trustworthy.
describe('no shipped source references a Font Awesome Pro icon', () => {
  const sources = scannedSources();

  // Anti-vacuity. A walk that silently returned nothing, or an extension list that matched no
  // real file, would pass this suite while reading none of the code it claims to have read.
  it('actually reads the shipped source', () => {
    assert.ok(sources.length > 200, `the walk found only ${sources.length} files`);
    const named = new Set(sources.map((source) => source.relative));
    for (const expected of [
      'src/ui/svelte/apps/manager/BooksScrollsView.svelte',
      'src/ui/svelte/apps/inventory/detail/InventoryBookDetail.svelte',
      'src/ui/playerExtensions.js',
      'src/ui/svelte/util/foundryIconCatalogue.js',
      'lang/en.json',
    ]) {
      assert.ok(named.has(expected), `${expected} must be inside the scanned corpus`);
    }
    const iconTokens = sources.reduce(
      (total, source) => total + (source.text.match(/(?<![\w-])fa-[a-z]/g) ?? []).length,
      0
    );
    assert.ok(iconTokens > 200, `the corpus holds only ${iconTokens} icon tokens, so it misread`);
  });

  it('writes no name Font Awesome declines to publish for free', () => {
    const reported = sources.flatMap(({ relative, text }) =>
      scan(text, { allowComposition: COMPOSITION_EXEMPT_PATHS.includes(relative) }).map(
        (violation) => `${relative}:${violation.line} [${violation.kind}] ${violation.detail}`
      )
    );
    assert.deepEqual(
      reported,
      [],
      `${reported.length} Font Awesome Pro reference(s) in shipped source:\n${reported.join('\n')}`
    );
  });

  // The exemption is a hand-maintained list, so it is pinned to a fact rather than trusted: an
  // entry that no longer composes is an entry that is silently widening the guard.
  it('keeps every composition exemption earned', () => {
    for (const relative of COMPOSITION_EXEMPT_PATHS) {
      const absolute = path.join(REPOSITORY_ROOT, relative);
      assert.ok(
        fs.existsSync(absolute),
        `${relative} is exempt from composition but does not exist`
      );
      assert.ok(
        composesIconNames(fs.readFileSync(absolute, 'utf8')),
        `${relative} no longer composes an icon name, so its exemption should be removed`
      );
    }
  });
});
