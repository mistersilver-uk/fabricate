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
| `slot`    | no       | `{width?, height?}`, in CSS px. Present at all, the slot's window subtree generates real BOXES at that size rather than `display: contents`. Omit it unless the specimen needs a containing block or a query container — an overlay, or a panel that restyles at a breakpoint. See below.                                                                                     |
| `props`   | no       | A plain object, passed to the component verbatim. Plain JSON only — no functions, no state, no knobs.                                                                                                                                                                                                                                                                         |
| `content` | no       | The `children` snippet, as a node array. See below.                                                                                                                                                                                                                                                                                                                           |
| `snippets` | no      | Named snippets (`body`, `footer`), each a node array in `content`'s shape. See below.                                                                                                                                                                                                                                                                                       |
| `note`    | no       | Why the row is shaped the way it is, in a sentence: the intent of a `slot` box, say. Read by people only; the page ignores it.                                                                                                                                                                                                                                              |
| `inset`   | no       | The padding, in CSS px, of the region the primitive is placed in, for a primitive whose edges bleed into it. Refused beside a boxed `slot`. See below.                                                                                                                                                                                                                                                       |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## `draws` — one drawing, one component

The replacement swaps a single hand-drawn element for a single live one, in
place.
Everything else in the unit survives: the caption above it, the hint below it,
the `k-pair` that holds a stepper and its `gp` label, the `→` arrows between the
three faces of the destructive button, the Wells the gate list is built from.
Emptying the whole `.unit` instead would have destroyed all four of those in the
Controls section alone, and each one is what its caption is about.

Whether the live component replaces the drawing or stands beside it is the
library's per-name status, never the row's (`liveness.js`).
A `shipped` name replaces its drawing.
A `target` or `divergent` name keeps its drawing, because the drawing is the
authority, and the live component follows it under a neutral `live` chip.
The name is the library name the manifest records for the row's `path`, and its
status is read off the entry naming it, so a row under a prose entry takes that
name's own status.

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

A drawing a row replaces may not contain a drawing another row claims, because
the page resolves every address before it places anything, and a replaced
drawing takes the inner one out of the document with it.
A drawing whose specimen stands beside it stays, so a row may claim a drawing
inside it: the `<Card>` drawing keeps its well, and `<Well>`'s row replaces it, so the Card drawing beside the live Card contains the live Well.

## `slot` — when a specimen needs a real box

By default a slot's window subtree is `display: contents`: the elements are in
the DOM and in the inheritance chain, but they generate no boxes, so the
component's own root is what the library's layout lays out and a live control
stands exactly where the drawing stood.
That is right for a control, and it is wrong for two kinds of specimen.

A default slot sizes its `<iframe>` from the specimen, one of two ways.
An inline-level specimen, or one standing where an inline drawing stood, is
shrink-wrapped to its own box, as a control is.
A block-level specimen standing where a block drawing stood **fills** that
drawing's inline size, and only its height comes from the specimen: the page
lets the slot stretch it when the library stretched the drawing, and otherwise
keeps the width the drawing was drawn at, carrying the drawing's `max-width`
either way.
That is what keeps a card, a panel or a bar at the width of the column it
replaces, rather than at its text's single-line width or, for a primitive that
is itself a query container, at no width at all.
The `<iframe>` is given that width before the specimen first lays out, so its
first report is already at the final width and the page never publishes ready
ahead of a corrective resize.
The width is read **once**, when the specimen is stood up: a host whose width
came from flex sizing (`flex: 1`) is frozen at the width it had then, and does
not follow a later window resize.
A drawing with no box of its own (`display: contents`) draws no width, so the
width is left to the page.
A specimen whose reports keep changing after it mounts (a `100vh` or
`min-height: 100%` height follows its own iframe) is stopped after forty
re-measures and reported by name rather than left to grow.

An element with no principal box is **not a containing block** and is **not a
query container**.
`src/ui/svelte/util/overlayHost.js` portals an overlay to the nearest
`.fabricate-manager` and measures its coordinate origin from that same element,
so a popover in a default slot is appended to a host that does not contain it
and positioned against a 0x0 rect — it renders, byte-identically, somewhere else
on the page.
`styles/fabricate.css` puts `container-type: inline-size` on `.fabricate-manager`
and the shipped breakpoints resolve against it, so in a default slot none of them
can fire.

A row that needs either states the box it needs:

```json
"slot": { "width": 300, "height": 320 }
```

Both keys are CSS pixels; an unrecognised key is refused rather than ignored.
State both: each specimen is its own `<iframe>` document, so there is no
surrounding library layout for an omitted dimension to come from.
An overlay needs the height of its open panel, because `.fabricate-manager`
carries `overflow: clip` and a slot only as tall as its trigger swallows the
panel the row exists to show.

**The box cannot be shrink-wrapped, and this is not a limitation of the lab.**
An inline-size container is sized as if it had no contents, so a boxed slot left
to take its width from its specimen measures zero and collapses its `.unit` with
it.
The page re-reads every boxed slot after layout and reports one that came out
zero, so this fails loudly rather than rendering a specimen that is merely
missing.

What a boxed slot reproduces is the window's **box**, not its **chrome**:
position, size, containment, `overflow`, the manager's grid and its own surface
are production's declarations untouched, while the border, radius, shadow and
window `z-index` that draw a floating window are dropped.
And it is exactly as big as the row said, so a breakpoint answer or a flip
decision read off the page is an answer for that box and not for the manager's
real content width.
The box is also the specimen's **viewport**: the page sizes the `<iframe>` to it
before the specimen lays out, so a fixed overlay centres in it and a popover
clamps against it, and core's viewport clamp on a window's height is lifted so
the declared height stands.

## `inset` — when a primitive bleeds into the region around it

Some primitives reach past their own box on purpose: the bulk panel's dock
bleeds by the inspector rail's padding so Apply pins to the rail's edge.
Standing alone, that bleed overflows the specimen.

```json
"inset": 12
```

`inset` is the padding of the region the primitive is placed in, in CSS px; the
specimen is laid out inside it, and it is measured with it.

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

A primitive that takes named snippets rather than children — `<Modal>`'s `body`
and `footer` — gets them from `snippets`, an object of node arrays in the same
shape:

```json
"snippets": { "body": [...], "footer": [...] }
```

Only the names `specimenSnippets.js` lists are rendered, because a Svelte snippet
cannot be built from a name at runtime; any other name is refused rather than
dropped, and the coverage gate checks each name is a prop the component declares.

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
