# The Primitive Lab catalogue

One JSON file per group, each an array of catalogue rows.
`model.js` globs this directory, so adding a group file is not also an edit there.

A row says how to DRIVE one component — which is the only thing about a primitive the lab cannot
derive.
Its name, its section, its prose, its manifest evidence and its caller count all come from
`scripts/lib/designSystemPrimitives.json` and `openspec/specs/design-system/library.html` at load
time, and must never be copied into a row.

## Row shape

| Field | Meaning |
| --- | --- |
| `path` | Repository-relative POSIX path, exactly as the manifest writes it. The join key. |
| `root` | `manager` or `app` — which Fabricate root the stage wears, because that decides both the cascade the component is painted by and the element `resolveOverlayHost` portals its popovers into. |
| `knobs` | One entry per prop the lab drives. See the knob types in `../knobs.js`. |
| `unknobbed` | Props deliberately not driven, each with a `why`. The coverage gate requires every declared prop to be in one list or the other. |
| `stories` | Named state matrices, rendered side by side under the stage. |
| `fixedProps` | Props passed verbatim on every render, for values a control cannot express. |
| `note` | Anything a reader needs that the library does not already say. Optional. |

## Knob types

`select` `boolean` `text` `number` `colour` `json` `snippet` `event`

An `event` knob may declare `writes` — the knob its argument is written back into — so a controlled
primitive behaves in the lab the way it behaves at a real call site.
Without it a `Stepper` renders,
logs its `onChange`, and never moves.
