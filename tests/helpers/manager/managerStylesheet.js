/**
 * The manager classes `styles/fabricate.css` declares a rule for (issue 1691). A structure
 * contract reads ASTs and never text, so the one claim about the stylesheet reads it here and
 * returns class names, never stylesheet text; every class of the selector counts, so a nested or
 * compound rule is not a false red.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { repoRoot } from '../sourceScan.js';

const SHEET = 'styles/fabricate.css';

export function declaredManagerClasses() {
  const css = readFileSync(resolve(repoRoot, SHEET), 'utf8');
  const names = new Set();
  for (const [selector] of css.matchAll(/\.fabricate-manager[^{},]*/g)) {
    for (const [, name] of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) names.add(name);
  }
  return names;
}
