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
const requiredThemeTokens = [
  '--fab-bg-0',
  '--fab-bg-1',
  '--fab-bg-2',
  '--fab-bg-3',
  '--fab-surface',
  '--fab-border',
  '--fab-border-strong',
  '--fab-border-soft',
  '--fab-text',
  '--fab-text-secondary',
  '--fab-text-muted',
  '--fab-text-subtle',
  '--fab-accent',
  '--fab-accent-hover',
  '--fab-accent-strong',
  '--fab-accent-soft',
  '--fab-on-info',
  '--fab-on-success',
  '--fab-success',
  '--fab-info',
  '--fab-warning',
  '--fab-danger',
  '--fab-purple'
];

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
  it('defines Fabricate and Mythwright theme scopes with required palette tokens', () => {
    const css = readFileSync(cssPath, 'utf8');

    assert.match(css, /:root,\s*:root\[data-fabricate-theme="fabricate"\]/);
    assert.match(css, /:root\[data-fabricate-theme="mythwright"\]/);
    const fabricateBlock = blockFor(css, ':root,\n:root[data-fabricate-theme="fabricate"]');
    const mythwrightBlock = blockFor(css, ':root[data-fabricate-theme="mythwright"]');

    for (const value of [
      '#111A23',
      '#15212B',
      '#1B2833',
      '#2C3B49',
      '#F1D1B5',
      '#D9B89C',
      '#E8C6A7',
      '#9AB89C',
      '#A9C7AA',
      '#B97C78',
      '#BFD5C3',
      '#B9D3DD',
      '#CEC1E6',
      '#E4C0CD',
      '#EBC8B3',
      '#E7DBB1',
      '#B9DDD7',
      '#D8BED4'
    ]) {
      assert.ok(fabricateBlock.includes(value), `Fabricate palette should define ${value}`);
    }

    for (const token of requiredThemeTokens) {
      assert.match(fabricateBlock, new RegExp(`${token}:`), `Fabricate theme should define ${token}`);
      assert.match(mythwrightBlock, new RegExp(`${token}:`), `Mythwright theme should define ${token}`);
    }
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
