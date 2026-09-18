/**
 * A `game.i18n` backed by the REAL `lang/en.json`. These live in `tests/helpers/`, which is outside
 * the `npm test` glob — it may hold a fixture module but never a `.test.js` (issue 1493).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {string} repoRoot
 * @returns {{ localize: (key: string) => string, format: (key: string, data?: object) => string, lookup: (key: string) => unknown }}
 */
export function createLangBackedI18n(repoRoot) {
  const en = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));

  function lookup(key) {
    return String(key)
      .split('.')
      .reduce((node, part) => (node == null ? undefined : node[part]), en);
  }

  function localize(key) {
    const value = lookup(key);
    return typeof value === 'string' ? value : key;
  }

  function format(key, data = {}) {
    const template = localize(key);
    return template.replace(/\{(\w+)\}/g, (whole, name) =>
      Object.hasOwn(data, name) ? String(data[name]) : whole
    );
  }

  return { localize, format, lookup };
}

/** Install {@link createLangBackedI18n} onto the ambient `game`, returning a restore thunk. */
export function installLangBackedI18n(repoRoot) {
  const i18n = createLangBackedI18n(repoRoot);
  const previous = globalThis.game.i18n;
  globalThis.game.i18n = { ...previous, localize: i18n.localize, format: i18n.format };
  return () => {
    globalThis.game.i18n = previous;
  };
}
