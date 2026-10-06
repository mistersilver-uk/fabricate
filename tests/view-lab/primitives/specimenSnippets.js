/**
 * The named snippets a catalogue row's `snippets` may supply (issue 1487). `LiveSpecimen.svelte`
 * declares one Svelte snippet per name, because a snippet cannot be built from a name at runtime,
 * and the coverage gate checks every row against this list and against the component's props.
 */
export const SPECIMEN_SNIPPET_NAMES = Object.freeze(['body', 'footer']);

/**
 * Read a row's `snippets`, refusing a name `LiveSpecimen.svelte` has no snippet for.
 *
 * @param {object} row A catalogue row.
 * @returns {Record<string, unknown[]>} The named node arrays, or `{}` when the row has none.
 * @throws {Error} When a name is unsupported or its value is not a node array.
 */
export function readSpecimenSnippets(row) {
  const snippets = row.snippets ?? {};
  for (const [name, nodes] of Object.entries(snippets)) {
    if (!SPECIMEN_SNIPPET_NAMES.includes(name)) {
      throw new Error(
        `\`snippets.${name}\` is not a snippet a specimen renders; it renders ` +
          SPECIMEN_SNIPPET_NAMES.join(' and ')
      );
    }
    if (!Array.isArray(nodes)) throw new TypeError(`\`snippets.${name}\` must be a node array`);
  }
  return snippets;
}
