/**
 * The manager classes `styles/fabricate.css` declares a rule for (issue 1691). A structure
 * contract reads ASTs and never text, so the one claim that is about the STYLESHEET rather than
 * about a component reads it here instead.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { repoRoot } from '../sourceScan.js';

const SHEET = 'styles/fabricate.css';

/**
 * @returns {Set<string>} every class named under a `.fabricate-manager` descendant selector
 */
export function declaredManagerClasses() {
  const css = readFileSync(resolve(repoRoot, SHEET), 'utf8');
  return new Set([...css.matchAll(/\.fabricate-manager\s+\.([a-z0-9-]+)/g)].map(([, name]) => name));
}
