/**
 * The recipe-item library's three filter vocabularies, in the shared `<Select>`'s option shape
 * (issue 1510). Every label is carried verbatim from the `<option>` text it replaced, the limits
 * axis included: its rows read one way in `item` visibility mode and another in `knowledge`, which
 * is the same conditional copy its caption carries. It lives beside the view rather than in it
 * because the view is at its size ledger's ceiling.
 */

/** @returns {Array<{value: string, label: string}>} All statuses, then the two enabled states. */
export function buildStatusOptions(text) {
  return [
    { value: 'all', label: text('FABRICATE.Admin.Manager.BooksScrolls.StatusAll', 'All statuses') },
    { value: 'enabled', label: text('FABRICATE.Admin.Manager.StatusOn', 'On') },
    { value: 'disabled', label: text('FABRICATE.Admin.Manager.StatusOff', 'Off') },
  ];
}

/** @returns {Array<{value: string, label: string}>} All types, then one row per derived type. */
export function buildTypeOptions(types, text) {
  return [
    { value: 'all', label: text('FABRICATE.Admin.Manager.BooksScrolls.TypeAll', 'All types') },
    ...types.map((type) => ({ value: type, label: type })),
  ];
}

/** @returns {Array<{value: string, label: string}>} The limits axis, in the mode's own words. */
export function buildCapOptions(isItemMode, text) {
  return [
    { value: 'all', label: text('FABRICATE.Admin.Manager.BooksScrolls.CapAll', 'All') },
    {
      value: 'limited',
      label: isItemMode
        ? text('FABRICATE.Admin.Manager.BooksScrolls.LimitedUse', 'Limited use')
        : text('FABRICATE.Admin.Manager.BooksScrolls.LimitedLearning', 'Limited learning'),
    },
    {
      value: 'unlimited',
      label: isItemMode
        ? text('FABRICATE.Admin.Manager.BooksScrolls.Unlimited', 'Unlimited')
        : text('FABRICATE.Admin.Manager.BooksScrolls.LearnFreely', 'Learn freely'),
    },
  ];
}
