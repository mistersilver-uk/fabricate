/**
 * The Primitive Lab's fixtures (issue 2339): one Svelte component per row that needs a function, a
 * snippet handed an argument or an `act`, named by the row's `fixture` and resolved inside the
 * specimen's iframe, so the row itself stays JSON. A glob, as `importers.js` is.
 */

/** The directory a row's `fixture` names a file in, as the glob below spells it. */
export const FIXTURE_DIRECTORY = './fixtures/';

/** Vite replaces this call with the importer table; Node imports the module without calling it. */
const globFixtures = () => import.meta.glob('./fixtures/*.svelte');

/**
 * Key a glob's importers on the fixture name a row writes.
 *
 * @param {Record<string, () => Promise<object>>} globbed `./fixtures/<Name>.svelte` to its importer.
 * @returns {Record<string, () => Promise<object>>} `<Name>` to its importer.
 */
export function fixtureImporters(globbed) {
  return Object.fromEntries(
    Object.entries(globbed).map(([key, load]) => [
      key.slice(FIXTURE_DIRECTORY.length).replace(/\.svelte$/, ''),
      load,
    ])
  );
}

/**
 * Resolve one row's fixture module: its default export is the component, and its module script
 * may export `act` and `reached`.
 *
 * @param {string} name The row's `fixture`.
 * @param {Record<string, () => Promise<object>>} [importers] From {@link fixtureImporters}.
 * @returns {Promise<object>} The fixture's module namespace.
 * @throws {Error} When no fixture has that name, so the specimen reports a mount failure.
 */
export async function loadFixture(name, importers = fixtureImporters(globFixtures())) {
  const load = Object.hasOwn(importers, name) ? importers[name] : null;
  if (!load) throw new Error(`no fixture named ${name} in tests/view-lab/primitives/fixtures/`);
  return load();
}
