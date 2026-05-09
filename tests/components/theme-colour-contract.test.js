import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const cssPath = resolve(repoRoot, 'styles/fabricate.css');
const productRoots = [
  resolve(repoRoot, 'src/ui'),
  resolve(repoRoot, 'styles')
];
const allowedExtensions = new Set(['.js', '.svelte', '.css']);
const colourLiteralPattern = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|(?<![-\w])(?:white|black)(?![-\w]))/g;
const themeSelectors = Object.freeze({
  fabricate: ':root,\n:root[data-fabricate-theme="fabricate"],\n.fabricate[data-fabricate-theme="fabricate"]',
  mythwright: ':root[data-fabricate-theme="mythwright"],\n.fabricate[data-fabricate-theme="mythwright"]',
  'ironblood-forge': ':root[data-fabricate-theme="ironblood-forge"],\n.fabricate[data-fabricate-theme="ironblood-forge"]',
  'hearth-herb': ':root[data-fabricate-theme="hearth-herb"],\n.fabricate[data-fabricate-theme="hearth-herb"]',
  'starglass-arcana': ':root[data-fabricate-theme="starglass-arcana"],\n.fabricate[data-fabricate-theme="starglass-arcana"]',
  'foundry-native': ':root[data-fabricate-theme="foundry-native"],\n.fabricate[data-fabricate-theme="foundry-native"]'
});
const themePaletteAnchors = Object.freeze({
  fabricate: ['#111A23', '#15212B', '#1B2833', '#2C3B49', '#F1D1B5', '#D9B89C', '#E8C6A7', '#9AB89C', '#B97C78'],
  mythwright: ['#071116', '#0B1720', '#101D27', '#152633', '#F2F7F5', '#63D47B', '#58B7E8', '#F4C04F', '#FF5252'],
  'ironblood-forge': ['#141214', '#1F1A1D', '#2C2428', '#5A4A50', '#F0E2D4', '#C58B5A', '#8E9A8F', '#92A78B', '#A86D66'],
  'hearth-herb': ['#161C19', '#1F2924', '#2B3831', '#53695E', '#F1E9D8', '#C8A36E', '#9BB79E', '#AFC7A4', '#B98378'],
  'starglass-arcana': ['#121824', '#1A2232', '#243147', '#40506B', '#F2ECFF', '#9FC5E8', '#C7A6E6', '#9DC9BD', '#C78A96'],
  'foundry-native': ['#0C0A14', '#111018', '#30282F', '#2E2833', '#F3F3F5', '#BC8963', '#706B70', '#617054', '#A16C60']
});

function collectProductFiles(rootPath) {
  const files = [];

  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = resolve(rootPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectProductFiles(fullPath));
      continue;
    }

    if (allowedExtensions.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function isInsideApprovedThemeBlock(filePath, source, index) {
  if (filePath !== cssPath) return false;

  const productStylesStart = source.indexOf('/* ==========================================');
  return productStylesStart !== -1 && index < productStylesStart;
}

function isSvelteBlockSyntax(source, index) {
  return source[index] === '#' && source[index - 1] === '{';
}

function blockFor(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing block for ${selector}`);
  const bodyStart = source.indexOf('{', start) + 1;
  let depth = 1;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index);
  }

  assert.fail(`unterminated block for ${selector}`);
}

function tokenNames(source) {
  return [...new Set([...source.matchAll(/--fab-[A-Za-z0-9-]+(?=\s*:)/g)].map(match => match[0]))].sort();
}

function tokenReferences(source) {
  return [...new Set([...source.matchAll(/var\((--fab-[A-Za-z0-9-]+)/g)].map(match => match[1]))].sort();
}

function fallbackBackedTokens(source) {
  return new Set([...source.matchAll(/var\((--fab-[A-Za-z0-9-]+)\s*,/g)].map(match => match[1]));
}

function findColourLiteralOffenders() {
  const offenders = [];

  for (const filePath of productRoots.flatMap(collectProductFiles)) {
    const source = readFileSync(filePath, 'utf8');
    let match;

    while ((match = colourLiteralPattern.exec(source))) {
      if (
        isInsideApprovedThemeBlock(filePath, source, match.index) ||
        isSvelteBlockSyntax(source, match.index)
      ) {
        continue;
      }

      offenders.push(`${relative(repoRoot, filePath)}:${lineNumber(source, match.index)} ${match[1]}`);
    }
  }

  return offenders;
}

describe('Theme colour contract', () => {
  it('defines the full supported theme catalog with complete Fabricate token coverage', () => {
    const css = readFileSync(cssPath, 'utf8');
    const rootBlock = blockFor(css, ':root');
    const themeBlocks = Object.fromEntries(
      Object.entries(themeSelectors).map(([themeId, selector]) => [themeId, blockFor(css, selector)])
    );
    const referenceThemeTokens = tokenNames(themeBlocks.fabricate);
    const rootTokens = new Set(tokenNames(rootBlock));
    const allDefinedTokens = new Set(tokenNames(css));
    const allReferencedFabTokens = tokenReferences(css);
    const tokensWithFallbacks = fallbackBackedTokens(css);

    assert.ok(referenceThemeTokens.length > 100, 'theme blocks should define the full Fabricate theme token surface');

    for (const [themeId, block] of Object.entries(themeBlocks)) {
      assert.deepEqual(
        tokenNames(block),
        referenceThemeTokens,
        `${themeId} should define the same theme-token surface as fabricate`
      );

      for (const value of themePaletteAnchors[themeId]) {
        assert.ok(block.includes(value), `${themeId} palette should define ${value}`);
      }
    }

    const unresolvedReferencedTokens = allReferencedFabTokens.filter(token =>
      !referenceThemeTokens.includes(token)
      && !rootTokens.has(token)
      && !allDefinedTokens.has(token)
      && !tokensWithFallbacks.has(token)
    );
    assert.deepEqual(
      unresolvedReferencedTokens,
      [],
      `all shared Fabricate token references should resolve from either the root token layer or every theme block:\n${unresolvedReferencedTokens.join('\n')}`
    );
  });

  it('keeps product UI colour literals inside theme token declarations', () => {
    const offenders = findColourLiteralOffenders();

    assert.deepEqual(
      offenders,
      [],
      `product UI colour literals must use theme variables outside approved theme blocks:\n${offenders.join('\n')}`
    );
  });
});
