# The Primitive Lab catalogue

One JSON file per group, each an array of catalogue rows.
`model.js` globs this directory, so adding a group file is not also an edit there.

A row says how to DRIVE one component — which is the only thing about a primitive
the lab cannot derive.
Its name, its section, its prose, its manifest evidence and its caller count all
come from `scripts/lib/designSystemPrimitives.json` and
`openspec/specs/design-system/library.html` at load time, and must never be copied
into a row.

## Row shape

<!-- markdownlint-disable MD013 markdownlint-sentences-per-line -->

| Field | Meaning |
| --- | --- |
| `path` | Repository-relative POSIX path, exactly as the manifest writes it. The join key. |
| `root` | `manager` or `app` — which Fabricate root the plinth wears, because that decides both the cascade the component is painted by and the element `resolveOverlayHost` portals its popovers into. |
| `knobs` | One entry per prop the lab drives. See the knob types in `../knobs.js`. |
| `unknobbed` | Props deliberately not driven, each with a `why`. The coverage gate requires every declared prop to be in one list or the other. |
| `states` | Which of the eight spec states this component's own props can express. See below. |
| `stories` | Named state matrices, rendered side by side under the plinth. |
| `fixedProps` | Props passed verbatim on every render, for values a control cannot express. |
| `note` | Anything a reader needs that the library does not already say. Optional. |

<!-- markdownlint-enable MD013 markdownlint-sentences-per-line -->

## Knob types

`select` `boolean` `text` `number` `colour` `json` `snippet` `event`

An `event` knob may declare `writes` — the knob its argument is written back into
— so a controlled primitive behaves in the lab the way it behaves at a real call
site.
Without it a `Stepper` renders, logs its `onChange`, and never moves.
It may also declare `arg` when the value is not the first argument.

## `value` starts the knob; `default` is what the component declares

These are different facts, and conflating them puts a wrong answer on screen.
A row opens on `role: "primary"` because that is the interesting state, but
`ManagerButton`'s own declared default is `neutral`.
An invocation that omitted every prop equal to its STARTING value would therefore
paste `<ManagerButton>` with no `role`, which renders a neutral button under a
specimen showing a primary one.

So `value` seeds the control and `default` states the value a call site gets by
omission.
Declare `default` only where it differs from the type's own zero.

## `states`

An object keyed on the eight states the design system's state-set requirement
names: `rest`, `hover`, `focus-visible`, `disabled`, `loading`, `invalid`,
`readonly` and `empty`.

Each value is either `true`, meaning the component's own props can reach that
state, or a sentence saying why they cannot.
`unknobbed` covers "this prop is not driven"; nothing covered "this state has no
prop", and the difference matters.
`ManagerButton` has no `loading` prop and cannot set `aria-busy`, which the spec
requires of a loading control, and that is a finding rather than a gap in the
catalogue.

Two states are never `true` on any row and must not be claimed.
`:hover` is not settable from a prop, and a scripted `.focus()` does not match
`:focus-visible` in Chromium.
The plinth's live pseudo-class readout is where those two are observed instead.

## Files

`harness-proof.json` is TEMPORARY.
It carries the three rows Phase 1 proved the harness with — `ManagerButton`,
`Stepper` and `SearchablePopover` — because a harness with no catalogue cannot be
shown to work.
All three belong to the Controls and Pickers sections, so the lane that writes
those group files must move these rows into them and delete this file.
Two catalogue files claiming one `path` is a gate failure rather than a merge
conflict, and it is meant to be.
