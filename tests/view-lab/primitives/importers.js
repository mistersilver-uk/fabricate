/**
 * How the Primitive Lab gets from a catalogue row's `path` to the component that row describes.
 *
 * ── WHY THIS IS A GLOB AND NOT A TABLE ────────────────────────────────────────────────────────
 *
 * The obvious shape is a map literal, one line per catalogued component:
 *
 *   'src/ui/svelte/components/Field.svelte': () => import('../../../src/ui/svelte/components/Field.svelte'),
 *
 * Fifty-seven of those is a uniform table expressed as code, and `scripts/lib/designSystemPrimitives.js`
 * records at length what this project measured when it wrote one: SonarCloud's copy-paste detector
 * NORMALISES string literals, so rows whose text could not be more different reduce to the same
 * token sequence, and a run of them is one long repetition. The manifest failed at 23.0% new-code
 * duplicated lines against a threshold of 3, from 17 groups every one of which matched the file
 * against itself. A compacted one-line form does not help — that was measured too.
 *
 * `import.meta.glob` is not a table. It is one call, Vite resolves it at transform time into the
 * same lazy import map, and there is nothing repetitive for a detector to match. It also cannot
 * drift from the tree the way a hand-written map can: a renamed component becomes a missing key
 * that the coverage gate reports, rather than a stale line nothing reads.
 *
 * ── WHY THE KEYS ARE REWRITTEN ────────────────────────────────────────────────────────────────
 *
 * A root-relative glob yields keys with a LEADING SLASH (`/src/ui/svelte/…`), because the lab's
 * Vite root is the repository root. Every other artifact in this programme — the manifest rows,
 * `componentImporters.js`, a `git diff` — writes the same path WITHOUT one. Rewriting here rather
 * than at each call site means the catalogue is spelled the way a diff spells it, which is the
 * whole premise of keying on the implementation path.
 */

/**
 * Lazy importers for every Svelte component under `src/ui/svelte/`, keyed on the repository-relative
 * POSIX path a diff names.
 *
 * Deliberately the WHOLE subtree rather than the catalogued subset: the glob has to be a static
 * literal, so narrowing it would mean listing directories, and a catalogue row naming a component
 * outside the listed set would fail as "no importer" rather than as what it is. Vite emits one lazy
 * chunk per entry either way, so an uncatalogued component costs nothing until something imports it.
 *
 * @type {Record<string, () => Promise<{default: unknown}>>}
 */
export const COMPONENT_IMPORTERS = Object.fromEntries(
  Object.entries(import.meta.glob('/src/ui/svelte/**/*.svelte')).map(([key, load]) => [
    key.replace(/^\//, ''),
    load,
  ])
);

/**
 * Resolve one catalogue row's component.
 *
 * @param {string} path Repository-relative POSIX path, as the manifest writes it.
 * @returns {Promise<unknown>} The component's default export.
 * @throws {Error} When no component is served at that path, which is a catalogue row naming a file
 *   that does not exist. Thrown rather than returned as null so the specimen's boundary catches it
 *   and the page reports it as a mount failure, instead of rendering an empty stage that looks like
 *   a component with nothing to draw.
 */
export async function loadComponent(path) {
  const load = COMPONENT_IMPORTERS[path];
  if (!load) throw new Error(`no component at ${path}`);
  const module = await load();
  return module.default;
}
