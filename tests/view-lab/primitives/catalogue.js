/**
 * The catalogue: one file per library section, row shape in `catalogue/README.md`. Rows arrive in
 * file-name then declaration order, the order `catalogueEntries()` in
 * `scripts/lib/primitiveLabSmoke.js` reads, and rows sharing an address pair positionally.
 *
 * @type {object[]}
 */
export const CATALOGUE = Object.values(
  import.meta.glob('./catalogue/*.json', { eager: true, import: 'default' })
).flat();
