/**
 * Fixture checkouts holding the module sheet split into partials (issue 1711), as the
 * `{ repo-relative path: text }` maps the temp-repo and temp-tree tests write.
 */

const importOf = (name) => `@import url("fabricate-${name}.css");\n`;

/** `parts` (`{ name: text }`, in cascade order) as an entry plus `styles/fabricate-<name>.css`. */
export function splitSheet(parts, { entryPrefix = '' } = {}) {
  const names = Object.keys(parts);
  return {
    'styles/fabricate.css': entryPrefix + names.map(importOf).join(''),
    ...Object.fromEntries(names.map((name) => [`styles/fabricate-${name}.css`, parts[name]])),
  };
}

/** A reader over a `{ path: text }` map, as the loader's `readFile` takes it. */
export const mapReader = (files) => (file) => files[file];
