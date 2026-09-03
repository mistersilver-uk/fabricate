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

| Field        | Meaning                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`       | Repository-relative POSIX path, exactly as the manifest writes it. The join key.                                                                                                              |
| `root`       | `manager` or `app` — which Fabricate root the plinth wears, because that decides both the cascade the component is painted by and the element `resolveOverlayHost` portals its popovers into. |
| `knobs`      | One entry per prop the lab drives. See the knob types in `../knobs.js`.                                                                                                                       |
| `unknobbed`  | Props deliberately not driven, each with a `why`. The coverage gate requires every declared prop to be in one list or the other.                                                              |
| `states`     | Which of the eight spec states this component's own props can express. See below.                                                                                                             |
| `stories`    | Named state matrices, rendered side by side under the plinth.                                                                                                                                 |
| `fixedProps` | Props passed verbatim on every render, for values a control cannot express.                                                                                                                   |
| `note`       | Anything a reader needs that the library does not already say. Optional. Rendered under `Note` in the harness window's detail strip, open by default.                                         |
| `width`      | The isolated plinth's width in pixels. Optional; the default is 420. Raise it for a component that is a screen region rather than a control.                                                  |
| `fill`       | `true` when the specimen genuinely fills its container by STRETCH. Optional; see below.                                                                                                       |
| `context`    | Where this primitive actually ships, one entry per call site worth drawing. Optional; see below.                                                                                              |

<!-- markdownlint-enable MD013 markdownlint-sentences-per-line -->

## `context` — the primitive in its screen recipe

The stage draws the selected primitive INSIDE a real ancestor, at the width that
ancestor has at its call site, with the primitive itself outlined.
The ancestor passes the primitive its own props, so the props are real by
construction: nothing here restates a call site, and nothing can drift from one.

Contexts are the tabs the stage opens on; the isolated plinth is the last tab.
A row with no `context` has only the isolated view and no tab strip is drawn.

<!-- markdownlint-disable MD013 markdownlint-sentences-per-line -->

| Field       | Meaning                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ancestor`  | Repository-relative POSIX path of the component to MOUNT. A real importer of this primitive, or a component one level out or in from one.               |
| `site`      | The call site, `File.svelte:NNN`. It is the tab's label. Prose, not a resolved reference: a moved line number is a stale citation, never a broken page. |
| `props`     | The fixture the ancestor is mounted with. Plain JSON only — no functions, no stores, no world.                                                          |
| `width`     | The plinth's width in pixels: the width the ANCESTOR has where it ships, not the manager's.                                                             |
| `why`       | Which ancestor was chosen and why that one. Rendered under `Note`.                                                                                      |
| `highlight` | Optional selector override. Omit it — the lab derives one; see below.                                                                                   |
| `root`      | Optional `manager` / `app` override, when the ancestor's window differs from the primitive's row.                                                       |
| `fill`      | Optional, default `true`: an ancestor is a screen region and fills its plinth. Set `false` for an ancestor that should draw at its intrinsic width.     |

<!-- markdownlint-enable MD013 markdownlint-sentences-per-line -->

### Choosing an ancestor

Prefer one that is (a) a real caller, (b) mountable from a modest plain-data
fixture, and (c) recognisable as a piece of the product.
`scripts/lib/componentImporters.js` exports `measureImporters(repoRoot)`, which
answers who imports what; read the candidate's `$props()` block and take the one
whose props are scalars and arrays.

An ancestor needing a booted world, a store, or a services bag is NOT mountable
honestly.
Go one level out or one level in and record which you chose in `why`.
A context that cannot be mounted honestly must be ABSENT with a stated reason,
never approximated: a fixture that pretends to be a store puts a screen on the
page that no GM could ever see.

### Deriving the width

The manager window is 1280x940 (`SvelteCraftingSystemManagerApp.svelte.js:146`).
Measured in the lab against the real cascade at that size: the manager root is
1278px, `.manager-body`'s `220px minmax(0, 1fr) 300px` gives `.manager-main`
758px, and an `InspectorCard` in a checks editor is 758px too.
So 758 is the number for a card or a route in the manager's main pane.
Measure rather than guess for anything else — the browser is right there.

### The highlight selector is derived, so do not write one

Every row is also mounted in isolation on its own catalogue plinth, and that
specimen's rendered root IS the primitive's root.
`Plinth.svelte` publishes its class list and `contexts.js` drops the `is-*` state
tokens, which leaves the component's identity classes.
`EmptyState` derives `.manager-empty` and `InspectorCard` derives
`.manager-inspector-card`; `RadioCardGroup` derives all three of the identity
classes its `Field` host emits.

The stage draws the selector and the number of nodes it matched, so a wrong one
is visible rather than silent.
Declare `highlight` only for the two shapes the reading cannot cover: a root with
no class at all, and a root that is a BRANCH — `ThresholdBandStrip` renders its
fallback first, so its isolated root is the fallback's.

## `fill` — the isolated plinth does not stretch its specimen

`.fabricate-manager` is a `display: grid`, so a specimen mounted as its only
child used to take the whole column: `Callout`, `EmptyState`, `InspectorCard`,
`ThresholdBandStrip`, `BulkSelectionToolbar` and `ManagerColorPopover` all drew
at exactly 418px, which is a width not one of them has anywhere.
The plinth root now carries `justify-items: start`, so a specimen draws at its
intrinsic width.

That is a no-op for anything that fills by declaring `width: 100%` — a percentage
still resolves against the whole grid area — so most rows need nothing.
`fill: true` is for the ones that filled by STRETCH alone.
Measured: `ManagerSearchField` fell 418 to 212 and `ManagerToolbar` 418 to 181
without it, and `EditorValidationSurface`, `BulkSelectionToolbar` and
`ManagerColorPopover` were unchanged and therefore carry no flag.

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
