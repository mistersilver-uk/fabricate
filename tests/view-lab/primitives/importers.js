/**
 * Lazy importers for every Svelte component under `src/ui/svelte/`, keyed on the
 * repository-relative POSIX path a manifest row and a diff write (the glob's leading `/` removed).
 * A glob rather than a table, so a renamed component is a missing key rather than a stale line.
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
 * @throws {Error} When no component is served at that path, so the specimen reports a mount failure.
 */
export async function loadComponent(path) {
  const load = COMPONENT_IMPORTERS[path];
  if (!load) throw new Error(`no component at ${path}`);
  const module = await load();
  return module.default;
}
