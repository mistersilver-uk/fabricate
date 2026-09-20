/**
 * The name a whole-header disclosure gives itself, which the record copy it wraps does not supply
 * (issue 1512). One phrase for every repaired header, and COMPLETE key literals rather than a
 * composed base, so `tests/ui-lang-keys-resolve.test.js` checks the two keys themselves.
 */

/** @returns {string} The shared lang key naming the act the header offers. */
export const disclosurePhraseKey = (open) =>
  open ? 'FABRICATE.Common.Disclosure.Collapse' : 'FABRICATE.Common.Disclosure.Expand';
