# The Primitive Lab catalogue

One JSON file per library section, each an array of catalogue rows.
`catalogue.js` globs this directory, so adding a section file is not also an edit
there.

A row answers one question and only one: **which real component stands where the
library drew a specimen, and with what props.**
It answers nothing else.
The entry's name, the section it belongs to, the sentence under its heading, the
canonical geometry in its caption, both the `Canonical spec` and `Svelte API`
columns and every `delta` block are `openspec/specs/design-system/library.html`'s
own content, rendered from that file at load time and never copied into a row.
A copy of normative content is a copy nothing can tell has stopped matching, and
this programme has already measured what happens to those.

## Row shape

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field     | Required | Meaning                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec`    | yes      | The library entry's heading, verbatim and decoded — `"<Button> <IconButton>"`. Matched against `div.spec-head > h4`, the anchor `tests/helpers/designLibrary.js` and the coverage gate both use.                                                                                                                                                                              |
| `cap`     | no       | A `.unit` caption in that entry, decoded and whitespace-collapsed — `"page 38 · the header pair only"`. It scopes `draws` to that one unit, which is what makes a caption like `"disabled"` unambiguous. Omit it to scope to the whole entry, for a specimen group the library drew with no `.unit` wrapper — `<Field>`'s six labelled columns are the only such group today. |
| `draws`   | yes      | A CSS selector for the hand-drawn element this row replaces, evaluated inside the scope above. Usually a kit class: `.k-btn`, `.k-step`, `.k-tog`, `.k-cb`, `.k-seg`.                                                                                                                                                                                                         |
| `path`    | yes      | Repository-relative POSIX path to the component, exactly as `scripts/lib/designSystemPrimitives.json` and a `git diff` write it. Also the identity `npm run lab:check` compares the page against.                                                                                                                                                                             |
| `props`   | no       | A plain object, passed to the component verbatim. Plain JSON only — no functions, no state, no knobs.                                                                                                                                                                                                                                                                         |
| `content` | no       | The `children` snippet, as a node array. See below.                                                                                                                                                                                                                                                                                                                           |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## `draws` — one drawing, one component

The replacement swaps a single hand-drawn element for a single live one, in
place.
Everything else in the unit survives: the caption above it, the hint below it,
the `k-pair` that holds a stepper and its `gp` label, the `→` arrows between the
three faces of the destructive button, the Wells the gate list is built from.
Emptying the whole `.unit` instead would have destroyed all four of those in the
Controls section alone, and each one is what its caption is about.

Rows sharing a `(spec, cap, draws)` address are paired **positionally** against
the elements that selector matches, in document order.
Three `.k-btn` rows under `"icon 28"` therefore replace the first, second and
third button in that unit, in the order the rows appear in the file — so row
order is load-bearing, not cosmetic.

The count is the guard, and it is exact: the number of rows sharing an address
must equal the number of elements the selector matches.
`draws` is a hand-written mirror of markup in a file this page may not edit, so a
library edit that adds a button to a unit, renames a kit class or moves a
specimen to another caption fails loudly on the next page load, naming both
numbers.
The alternative is a page that silently draws three live buttons and one drawing
with nothing saying which is which, which is worse than no page at all.

## `content` — what a call site puts inside

For a primitive that takes children — `<Button>`, `<IconButton>`, `<Field>` —
`content` is the markup a real call site would supply, written as a node array
rather than as a markup string.

Each entry is either a plain string, rendered as text, or an object:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Key        | Meaning                                                               |
| ---------- | --------------------------------------------------------------------- |
| `tag`      | The element name.                                                     |
| `attrs`    | Attributes, spread verbatim. A `true` value renders a bare attribute. |
| `text`     | A text child.                                                         |
| `children` | Nested nodes, same shape, any depth.                                  |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Omit both `text` and `children` for a void element — `input`, `br`, `img` —
because Svelte refuses children on one and the catalogue should not have to know
which tags those are.

## What a row deliberately cannot say

There is no `knobs`, no `stories`, no `states`, no `fillers`, no `context` and no
`theme`.
Those fields existed to drive a workbench, and a workbench is not what this page
is.

There is also no write-back: a specimen's props are fixed, so a Stepper's `+`
reports through `onChange` and the value does not move — exactly as the library's
own `readonly` inputs do not move.
What IS live is everything a drawing could never show: real geometry from
`styles/fabricate.css`, real `:hover` and `:focus-visible` from the shipped
rules, real font metrics, and the real element tree a screen reader would walk.
Adding write-back would mean declaring, per row, which prop an event feeds —
which is a knob under another name.

## When a specimen has no row

Nothing happens, which is the point.
An entry for a primitive that is not built, a specimen whose shipped equivalent
has no prop for what the drawing shows, and a composition the library drew to
explain an arrangement rather than a control, all render exactly as authored.
The page is the library either way; a row only makes one drawing real.
