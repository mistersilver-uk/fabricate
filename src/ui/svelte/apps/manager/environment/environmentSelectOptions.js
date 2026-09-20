/**
 * The environment overview tab's option vocabularies (issue 1510): the id and label normalisers its
 * three converted pickers share, and the sentinel row both membership add-lists open on.
 */

/** What "nothing chosen yet" is: the add-pickers' resting value and their sentinel row's value. */
export const ADD_SENTINEL = '';

/** A vocabulary entry's id, whether it arrives as a record or as a bare string. */
export function optId(option) {
  return String(option?.id ?? option ?? '').trim();
}

/** Its label, falling back to its id. */
export function optLabel(option) {
  return String(option?.label ?? option?.id ?? option ?? '').trim();
}

/** An add-picker's rows: the sentinel, then whatever the row below it does not already hold. */
export function membershipAddOptions(sentinel, available) {
  return [
    { value: ADD_SENTINEL, label: sentinel },
    ...available.map((option) => ({ value: optId(option), label: optLabel(option) })),
  ];
}
