# Visual parity harness

A development-time instrument for asking a question no other gate in this repository can ask:
**does this screen RENDER like its design prototype?**

It is deliberately **not** part of `npm test` and never runs in CI.
A prototype is a design artefact rather than a repository asset, so the region map, the selectors, the measured values and the screen names all live outside the tree.
What is committed is the screen-agnostic machinery here, so the next prototype costs a spec rather than a rewrite.

## Why it exists

Reviews ask whether a control exists and behaves.
Nothing asked whether it renders correctly, and nothing could: a reviewer's authority table passes rows on presence and behaviour, and two frame sets captured at different viewport widths are distorted before anyone looks at them.
That gap is how a whole studio shipped with the wrong card treatment, the wrong type scale and 36px of dead space nobody had chosen.

## Running it

```sh
node scripts/visual-parity/extract.mjs --spec <spec.mjs> --out <fixture.json>
node scripts/visual-parity/compare.mjs --spec <spec.mjs> --fixture <fixture.json>
```

`extract` drives the prototype in real Chromium and records `getComputedStyle` per named region.
`compare` renders the subject — the real stylesheet plus the real compiled scoped CSS of every primitive involved — and reports every difference, exiting non-zero on any.

Put the spec and the fixture under `tmp/` (gitignored), beside the prototype.

## Computed styles, never screenshots

A prototype is usually a fixed-width mockup and the real app is not.
A pixel diff cannot survive that, and every attempt to eyeball one fails.
Each side is measured at its **own** natural width, and only width-invariant properties are recorded — colours, type, borders, radii, padding, gaps, fixed control geometry.
A value that *is* width-derived is recorded as an exemption rather than as a number.

## The spec

A spec is an ES module exporting:

| Export | What it is |
|--------|------------|
| `prototype` | `{ path, viewport, readySelector, settleMs }` for the prototype document. |
| `screens` | The **closed set** of screen names. |
| `navigate(page, screen)` | Drives the prototype to that screen. |
| `helpersSource` | An expression string evaluating to an object of in-page locator helpers. |
| `regions` | `{ name, screen, measuredOn?, groups, locator, effectiveBackground? }` per region. |
| `subject` | The app under test: `viewport`, `stylesheets`, `screens` (name → markup), `selectors` (region → `{ selector }`), `requiredAncestors`, `chromeSweep`. |

`helpersSource` and `locator` are **strings** because they have to cross into `page.evaluate`, where the spec's own scope does not exist.

A region declares property **groups** rather than properties, so adding a region cannot quietly record a narrower set than its siblings.
The groups are in `lib/schema.js`; a spec may extend or replace them.

### Adding a screen

1. Add its name to `screens`.
2. Teach `navigate` how to reach it.
3. Add its regions with `screen: '<name>'`.
4. Add its markup under `subject.screens` and its selectors under `subject.selectors`.
5. Re-extract, then compare.

Step 1 alone makes the gate **fail** until step 3 is done, which is the point.

### Recording an exemption

Some differences are intentional: a shared primitive the screen may not restyle, an explicit instruction that overrides the prototype, a value that is genuinely width-derived.
Add the property to that region's `exemptions` in the **fixture**, next to the measurement it suspends, with a written reason:

```json
"exemptions": {
  "width": "SHARED PRIMITIVE. The switch is the manager-wide `.manager-status-toggle` …"
}
```

The extractor **carries exemptions across a regeneration** rather than rewriting them.
The comparator refuses an exemption shorter than 40 characters and refuses one naming a property the region does not measure.

An exemption should be a constraint you hit, not a difference you chose to keep.

## The traps, stated as traps

Each of these has already cost a round.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

- **Starting below the shell.** A harness that renders the panel under test, rather than the real ancestor chain, cannot see an inset that lives above it. The first version of this harness passed while 36px of stacked dead space was on screen, because the shell's padding and the grid's gap were not in the tree at all. Declare `subject.requiredAncestors`; the comparator fails when one is missing.
- **Comparing two transparent backgrounds.** Both sides often inherit their surface and report `rgba(0, 0, 0, 0)`, so the assertion passes on *any* background whatsoever. Set `effectiveBackground: true` and the harness walks to the nearest ancestor that actually paints.
- **A named-region list can only catch what someone named.** `subject.chromeSweep` is the complement: it reports every border, outline and scrollbar on the chrome selectors you list that paints a forbidden colour. It is what caught host chrome leaking a crimson scrollbar through a pane as two full-height rules.
- **A gate that covers two screens out of six reads as coverage.** The closed `screens` set, and the requirement that every screen owns at least one region, is what turns an unmeasured screen into a failure instead of a silence.
- **Scoped component CSS.** Svelte compiles `.foo` to `.foo.svelte-<hash>` and injects it *after* the global sheet. A harness loading only the global stylesheet measures an unstyled control and passes on values the app never renders. Load the compiled scoped CSS **and** stamp the hash onto the markup (`tests/helpers/scoped-component-css.js`).
- **`column-gap: normal` IS zero** on a grid or flex container. That is the one normalisation `sameComputedValue` performs, and it is a CSS fact rather than a tolerance. Nothing else is normalised: a tolerance band on colours or lengths is the beginning of a gate that cannot fail.
- **Row gaps.** `columnGap` alone cannot see a stacking gutter, which is exactly where dead space hides. The `gap` group covers both axes.
- **Icon fonts.** An icon's weight and text-transform come from the icon font's own sheet, which the harness usually does not load, so recording them compares the harness to itself. Use the `glyph` group (colour and size only).
- **A subject markup fixture is a hand-maintained mirror.** It keeps rendering a class the component stopped emitting, and the harness goes on measuring something the app no longer draws. Keep the markup honest against the real components, and prefer selectors and classes copied from them.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## Proving the gate can fail

Before trusting a green run, perturb it and confirm it reds.
Worked controls, all currently passing:

| Perturbation | Expected report |
|--------------|-----------------|
| Delete every region of one screen | `screen "<name>" has no regions` |
| Shorten an exemption's reason | `an exemption needs a stated reason` |
| Exempt an unmeasured property | `exempts a property this region does not measure` |
| Remove a required ancestor from the markup | `missing required ancestor "<selector>"` |
| Paint a chrome element a forbidden colour | `chrome sweep: … border-left` |
