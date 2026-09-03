/**
 * The catalogue: which real component stands where, in the library's own entries.
 *
 * The row shape is documented once, in `catalogue/README.md`, beside the files themselves — this
 * module only assembles them.
 *
 * SPLIT ACROSS FILES, and for a reason that is about people rather than bytes: one file holding
 * the whole library is a single owned path, so two people cataloguing different sections collide
 * on every commit. One file per library section makes them disjoint, and the glob means adding a
 * section file is not also an edit here.
 *
 * ORDER MATTERS AND IS DEFINED. `import.meta.glob` yields its keys sorted, so the rows arrive in
 * file-name then declaration order — the same order `catalogueEntries()` in
 * `scripts/lib/primitiveLabSmoke.js` reads them off disk. Two rows that share a `(spec, cap,
 * draws)` address are paired POSITIONALLY against the drawings that selector matches, so this is
 * not a cosmetic property: it is what decides which button gets which role.
 */

/**
 * Every catalogue row, in file then declaration order.
 *
 * @type {object[]}
 */
export const CATALOGUE = Object.values(
  import.meta.glob('./catalogue/*.json', { eager: true, import: 'default' })
).flat();
