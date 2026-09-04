/**
 * A `game.i18n` backed by the REAL `lang/en.json`.
 *
 * The mounted-component harness stubs i18n with `localize: (key) => key`, which is fine for
 * a test asserting structure but useless for one asserting COPY: a component reading a key
 * that does not exist renders identically to one reading a key that does.
 *
 * Components used to paper over that with inline English fallbacks, so a mounted test read
 * the fallback rather than the shipped string and a renamed or reworded key changed nothing
 * anybody could see. Installing this instead lets a test assert the rendered words as a
 * literal, which fails on a missing key (the DOM shows the dotted key) AND on drifted copy
 * (the DOM shows the new wording) — without any component carrying a second copy of its own
 * text (issue 1493).
 *
 * `format` mirrors Foundry's `{placeholder}` substitution. Both return the stringId on a
 * miss, exactly as `Localization#localize` and `#format` do.
 *
 * These live in `tests/helpers/`, which is outside the `npm test` glob — it may hold a
 * fixture module but never a `.test.js`.
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

/**
 * Install {@link createLangBackedI18n} onto the ambient `game`, returning a restore thunk.
 *
 * @param {string} repoRoot
 * @returns {() => void}
 */
export function installLangBackedI18n(repoRoot) {
  const i18n = createLangBackedI18n(repoRoot);
  const previous = globalThis.game.i18n;
  globalThis.game.i18n = { ...previous, localize: i18n.localize, format: i18n.format };
  return () => {
    globalThis.game.i18n = previous;
  };
}
