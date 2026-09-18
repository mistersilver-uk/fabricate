/** Guard against CSS bleed out of Fabricate's windows. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cssPath = fileURLToPath(new URL('../styles/fabricate.css', import.meta.url));

// Selector preludes that are allowed to apply globally. `:root` carries the
// `--fab-*` custom property definitions (inert until referenced, so no bleed).
function isNamespaced(selector) {
  return selector.startsWith('.fabricate') || selector.startsWith(':root');
}

// Strip /* ... */ comments so braces/commas inside them aren't parsed as syntax.
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Split a selector list on commas that separate selectors, ignoring commas
// nested inside `:is(...)`, `:where(...)`, `:not(...)`, etc.
function splitTopLevelCommas(prelude) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of prelude) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Collect every selector prelude in the stylesheet. We track brace depth and read the text
 * preceding each `{`.
 */
function collectSelectors(css) {
  const selectors = [];
  let buffer = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      const prelude = buffer.trim();
      buffer = '';
      if (prelude && !prelude.startsWith('@')) {
        for (const part of splitTopLevelCommas(prelude)) {
          const selector = part.trim();
          if (selector) selectors.push(selector);
        }
      }
      // For `@media`/`@container` blocks the inner rules sit at the next level;
      // because we never skip ahead, the loop keeps reading and validates them.
    } else if (ch === '}') {
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  return selectors;
}

describe('fabricate.css namespacing', () => {
  const selectors = collectSelectors(stripComments(readFileSync(cssPath, 'utf8')));

  it('parses a non-trivial number of selectors', () => {
    // Sanity check so a parser regression can't make the guard vacuously pass.
    assert.ok(selectors.length > 100, `expected many selectors, got ${selectors.length}`);
  });

  it('namespaces every selector under .fabricate (or :root)', () => {
    const offenders = selectors.filter((selector) => !isNamespaced(selector));
    assert.deepEqual(
      offenders,
      [],
      `Unscoped selectors will bleed into other modules' sheets. Namespace them ` +
        `under a .fabricate* root class:\n  ${offenders.join('\n  ')}`
    );
  });
});
