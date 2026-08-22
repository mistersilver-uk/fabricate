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
node scripts/visual-parity/compare.mjs --spec <spec.mjs> --fixture <fixture.json> [--screen <name>]
node scripts/visual-parity/inventory.mjs --spec <spec.mjs> [--screen <name>] [--dump]
```

`extract` drives the prototype in real Chromium and records `getComputedStyle` per named region.
`compare` boots the **real app**, drives it to each screen and reports every computed-style difference, exiting non-zero on any.
`inventory` is the **structural** pass: it walks the prototype's own element tree and fails on every landmark the subject has no counterpart for, against that same real app.

Run **both** halves.
They answer different questions, and neither can answer the other's.
Both boot ONE live subject through the same machinery (`lib/subject.js`, `lib/view-lab.js`), so there is no second implementation of "render the app and drive it to a screen" for one of them to fall behind.

Put the spec and the fixture under `tmp/` (gitignored), beside the prototype.

## Computed styles, never screenshots

A prototype is usually a fixed-width mockup and the real app is not.
A pixel diff cannot survive that, and every attempt to eyeball one fails.
Each side is measured at its **own** natural width, and only width-invariant properties are recorded — colours, type, borders, radii, padding, gaps, fixed control geometry.
A value that *is* width-derived is recorded as an exemption rather than as a number.

## A measurement pass cannot see absence

**A parity gate that only measures what both sides have will always report green on something one side is missing.**

`compare` measures computed styles of regions that exist on BOTH sides, and pointing it at the real app does not change that.
That shape of gate is structurally blind to three things, and all three shipped here behind a green run: an element present in the prototype and **absent** in the subject; a control sitting in the **wrong card**; and a **missing affordance** on a row that otherwise measures identically.
Nine named regions on one screen reported *no drift* while a whole callout card was off the screen, the DC and comparison controls had migrated into the formula card, and every tier row had lost its drag handle.

`chromeSweep` is the same lesson already learnt for colour: a named-region list catches only a colour on a region somebody named, so the sweep is its complement.
`inventory.mjs` is that complement for **structure**.

### What it asserts

It enumerates the prototype's own tree into ordered **landmarks** and enumerates the subject with the same classifier, then, one-directionally:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

- every prototype **card** has a subject counterpart, under the same card ancestry, in the same relative order — a card with no counterpart fails and **names itself**;
- every prototype **label** (a card title, a micro-label, a control's visible name) appears inside the counterpart card. A label found in a *different* card is reported as MISPLACED rather than missing, which is what names a control that moved;
- every prototype **glyph** (a Font Awesome icon name) appears inside the counterpart card, which is what names a missing affordance such as a drag handle.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Why it degrades instead of demanding a 1:1 node map

A hand-maintained map of every node rots faster than the screen changes, and diffing text nodes fails on every piece of world data on screen.
So the classifier is **presentation-derived, never class-derived** — the prototype is a styled-components document whose every element is `class="sc"` — and only tag name, computed style, Font Awesome icon name and short visible text cross between the two documents.
Prose longer than 40 characters is skipped entirely, so the pass never diffs a sentence.
Digit runs collapse to `#`, so `Outcomes · 5 tiers` and `Outcomes · 3 tiers` are one landmark: a count is data, the sentence around it is design.
Roll-data paths and dice expressions are skipped for the same reason.
The assertion is **one-directional for leaf content**: subject labels and glyphs with no prototype counterpart are reported as EXTRAS and never fail, because a product legitimately says more than a mockup.

**It is not one-directional for CARDS.** A subject-only card fails.
That asymmetry is deliberate and was paid for: a card is a claim about the shape of the screen, and a wrapper the product invented — with a title and a description the design never wrote — changes what a GM reads before they read anything inside it.
A run reported `triggers: 0` while a `Check triggers` wrapper card nobody designed sat around the whole list.
The escape hatch is an exemption with a stated reason — a decision someone made — rather than a default nobody chose.

What survives all of that is exactly the class of defect the pass exists for.

### BOTH passes measure the REAL app

State it as a rule rather than as a preference: **a pass run against a mirror can only report what its author already knew.**

`compare` used to render a hand-authored markup fixture.
A fixture is a mirror of what its author believed the app renders, and **a hand-maintained mirror does not fail — it drifts.**
It drifts in the way nobody looks for, too.
This one did not merely keep a stale class: its `roll` screen modelled `SimpleCraftingCheckEditor`'s static-DC card, which was never broken, and never modelled `CraftingCheckEditor`'s routed tier list at all.
When that list shipped wrapped in the bare `.manager-inspector-card` shell — 12px of padding the studio card contract exists to strip, insetting every tier row past the Difficulty card above it — the comparison reported *no drift*, because **it could not be wrong about a component it did not model.**
A maintainer caught it by eye.

So the mirror is retired.
The spec supplies `subject.open(browser)` / `subject.navigate(page, screen)`, both passes share that one session, and every region is a locator against the shipped component tree.
In this repository the subject is the View Lab, which boots once and reaches every section as a tab of one window (`lib/view-lab.js`).

Two consequences worth expecting the first time you re-point a spec:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

- **Everything the mirror was wrong about arrives at once.** The mirror had been standing in for the app on every screen, so its every optimism was invisible. Re-pointing this spec turned one green run into 17 findings — a card that never carried the studio card class, a rows container with none of the prototype's inset, and host chrome painting a scrollbar colour no markup harness could ever have seen.
- **The app needs a STATE, and reaching it is part of navigating.** An empty list draws no row treatment. Seed that state in `subject.open`, not in `navigate`: a gate whose findings depend on which screen ran first reports something different every time somebody adds a region.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### A region the app cannot show

Sometimes the lab's world genuinely cannot put a region on screen — a library with no entries renders no row.
That is a constraint, not drift, and it is recorded the way every other constraint here is: with a stated reason.

```js
'modifier-entry-row': {
  locator: '.manager-modifier-readonly-row',
  unreachable: 'WORLD GAP, not drift. A modifier row is drawn per entry of the SYSTEM’s …',
},
```

The locator is still required, and the absence is still **asserted**: the moment the app starts rendering that element the run fails, telling you to delete the note.
An excuse that outlives the constraint is the same defect as an exemption that outlives the difference.

### Recording a structural exemption

Same discipline as a computed-style exemption, in `inventoryExemptions` on the spec, keyed by the landmark key the report prints in parentheses:

```js
'outcomes|outcome bands|label:tier':
  'STATED DECISION. `CraftingCheckEditor` drops the tier table’s column headers on purpose: …',
```

A reason under 40 characters fails, and so does a key naming a landmark **the prototype no longer draws** — otherwise an exemption outlives the difference it excused.
Expect exemptions for world data the two documents cannot share (record names, tier names, actor names) and for design decisions that deliberately override the prototype.

## The spec

A spec is an ES module exporting:

| Export | What it is |
|--------|------------|
| `prototype` | `{ path, viewport, readySelector, settleMs }` for the prototype document. |
| `screens` | The **closed set** of screen names. |
| `navigate(page, screen)` | Drives the prototype to that screen. |
| `regions` | `{ name, screen, measuredOn?, groups, locator, effectiveBackground? }` per region. |
| `alignments` | `{ name, screen, measuredOn?, edges, regions }` per edge-alignment group. |
| `subject` | The real app: `viewport`, `root`, `open(browser)`, `navigate(page, screen)`, `locators` (region → `{ locator, effectiveBackground?, unreachable? }`), `requiredAncestors`, `chromeSweep`. |
| `inventory` | The structural pass: `roots` (screen → `{ prototype, subject, measuredOn? }`) and optional `limits`. |
| `inventoryExemptions` | Accepted structural divergences, key → reason. |

A region declares property **groups** rather than properties, so adding a region cannot quietly record a narrower set than its siblings.
The groups are in `lib/schema.js`; a spec may extend or replace them.

### A locator is DATA, never an expression

A locator is a CSS selector string, or a list of **steps** from a closed vocabulary: `select`, `children`, `where`, `at`, `child`, `parent`, `sibling`.
`where` filters on `tag`, `text`, `rect`, `style`, `styleNot`, `has`, `childCount` and `leaf`, and an unknown key **fails** rather than filtering nothing.

```js
const rail = [
  { op: 'select', css: 'div.sc' },
  { op: 'where', rect: { minWidth: 301, maxWidth: 359, minLeft: 1151, minHeight: 301 } },
];
const pane = [...rail, { op: 'sibling', offset: -1 }];
```

Compose them in the spec, in **Node**, with whatever little builders read best; what crosses into the page is a list of plain objects.

They used to be JavaScript expressions handed across as source and reconstituted in the page with `new Function`, which SonarCloud rightly flags (`javascript:S1523`) — and the flag was pointing at something real rather than at a serialisation trick.
A fixture that can express any code can express a locator that does something other than locate, and nothing in the schema could tell the two apart.
Nothing crosses that boundary as text now: `page.evaluate` is handed real functions (`lib/page-runtime.js`), which is all it ever needed.

### Adding a screen

1. Add its name to `screens`.
2. Teach `navigate` how to reach it, and `subject.navigate` how to reach its counterpart.
3. Add its regions with `screen: '<name>'`, and their subject locators under `subject.locators`.
4. Add its root pair under `inventory.roots`.
5. Re-extract, then compare, then inventory.

Step 1 alone makes both gates **fail** until steps 3 and 4 are done, which is the point.

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

## A per-region value cannot see a RELATIONSHIP

**Every region on a screen can measure exactly right and still sit in the wrong place.**

An inset applied by an ancestor moves a whole subtree and changes none of the subtree's own computed values.
That is the defect this harness shipped: a tier list wrapped in a card shell with 12px of padding it should not have had.
The rows' padding was right, their gap was right, their border was right, and they sat 12px inside the card above them.

An **alignment group** states the relationship, and it is **derived, never declared**:

```js
export const alignments = [
  { name: 'roll-card-bodies', screen: 'roll', edges: ['left', 'right'],
    regions: ['roll-card-body', 'roll-tier-inset'] },
];
```

The extractor measures those regions' edges **in the prototype** and records which of them the prototype actually shares; the comparator asserts only those.
A group can therefore never demand an alignment the design does not draw, and it stops demanding one the moment the design stops.
Both members must be measured on the same screen — two boxes that were never on screen together share no edge — and the tolerance is half a pixel, which is the resolution of the question rather than a tolerance band on a value.

The report names both ends and the gap:

```text
[roll] alignment "roll-card-bodies".left: the prototype lines these up and the subject insets
  "roll-tier-inset" 12.0px from "roll-card-body" (roll-card-body 464.0, roll-tier-inset 476.0)
```

## The traps, stated as traps

Each of these has already cost a round.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

- **Starting below the shell.** A harness that renders the panel under test, rather than the real ancestor chain, cannot see an inset that lives above it. The first version of this harness passed while 36px of stacked dead space was on screen, because the shell's padding and the grid's gap were not in the tree at all. Declare `subject.requiredAncestors`; the comparator fails when one is missing.
- **Comparing two transparent backgrounds.** Both sides often inherit their surface and report `rgba(0, 0, 0, 0)`, so the assertion passes on *any* background whatsoever. Set `effectiveBackground: true` and the harness walks to the nearest ancestor that actually paints.
- **A named-region list can only catch what someone named.** `subject.chromeSweep` is the complement: it reports every border, outline and scrollbar on the chrome selectors you list that paints a forbidden colour. It is what caught host chrome leaking a crimson scrollbar through a pane as two full-height rules.
- **A landmark nobody can SEE is not a landmark.** A mockup routinely carries a hidden branch of an alternative state, and a walk that reads a `display: none` subtree will demand the subject build a control the prototype does not draw. The classifier skips `display: none` and `visibility: hidden`, and deliberately does NOT skip the clip-path visually-hidden idiom, whose content is announced.
- **A heading is a heading.** A presentational test — weight and size — is all a styled-components prototype can offer, and it is exactly the assumption such a prototype invites. It is wrong about the subject: a card headed by an UPPERCASE MICRO-LABEL, which is this manager's own inspector convention, sits far below any size floor, so the card read as titleless, folded into its parent, and was reported MISSING while on screen. A real `h1`–`h6` counts as a title whatever it measures.
- **Measuring both sides cannot see one side's absence.** A region that is missing is either not in the map (nothing is asserted) or one line about a selector, and a region nobody named is invisible either way. `inventory.mjs` is the complement, and the section above states the rule it exists for.
- **A subject that is a mirror of the app cannot report what the app lacks.** Both passes point at the real app for exactly this reason; running either against a markup fixture is running it against its own author's beliefs.
- **A gate that covers two screens out of six reads as coverage.** The closed `screens` set, and the requirement that every screen owns at least one region, is what turns an unmeasured screen into a failure instead of a silence.
- **Every region right, the screen wrong.** A per-region comparison cannot express a relationship BETWEEN two regions, and an ancestor's inset changes no value inside the subtree it moves. `alignments` is the rule for that class; the section above states it.
- **A region resolved against the whole document.** The app under measurement is one window of a running product, and a document-wide `querySelector` will answer a region with a nav item or a neighbouring panel wearing the same class. Declare `subject.root`; every locator resolves inside it.
- **`column-gap: normal` IS zero** on a grid or flex container. That is the one normalisation `sameComputedValue` performs, and it is a CSS fact rather than a tolerance. Nothing else is normalised: a tolerance band on colours or lengths is the beginning of a gate that cannot fail.
- **Row gaps.** `columnGap` alone cannot see a stacking gutter, which is exactly where dead space hides. The `gap` group covers both axes.
- **Icon fonts.** An icon's weight and text-transform come from the icon font's own sheet, which the harness usually does not load, so recording them compares the harness to itself. Use the `glyph` group (colour and size only).
- **A hand-maintained mirror does not fail — it DRIFTS, and it can drift into modelling a component that was never broken.** That is the lesson this harness paid the most for. The retired markup fixture's `roll` screen modelled a card belonging to a component the screen under test does not even render, so the one component that WAS broken had no representation at all and the run was green about it. Keeping a mirror honest by hand is the part that fails; both passes measure the app now.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## Proving the gate can fail

Before trusting a green run, perturb it and confirm it reds.
Worked controls, all currently passing:

| Perturbation | Expected report |
|--------------|-----------------|
| Delete every region of one screen | `screen "<name>" has no regions` |
| Shorten an exemption's reason | `an exemption needs a stated reason` |
| Exempt an unmeasured property | `exempts a property this region does not measure` |
| Break the real ancestor chain | `missing required ancestor "<selector>"` |
| Paint a chrome element a forbidden colour | `chrome sweep: … border-left` |
| Delete a shipped card from the real component | `MISSING CARD "<its title>"` |
| Give a screen no `inventory.roots` entry | `screen "<name>" has no inventory root on both sides` |
| Exempt a landmark the prototype does not draw | `names a landmark this prototype does not draw` |
| Give a locator step an op the vocabulary has no entry for | `a locator is data, never an expression` |
| Render an `unreachable` region after all | `is marked unreachable, but the app renders it now` |
| Restore a card-contract class the studio strips padding with | `alignment "<name>".left: … insets "<region>" 12.0px from "<region>"` |

Two of these matter most, because each is a failure this harness was extended for.

**The card control**, worked by gating `CraftingCheckEditor`'s check-type card off: the pass went from reporting that card as matched to `MISSING CARD "Check type" … the subject has no card with that title`, and restoring it returned the run to its previous findings.

**The alignment control**, worked by reverting the same component's tier-list wrapper from `manager-inspector-card manager-checks-card` to the bare `manager-inspector-card` — the defect that motivated pointing this pass at the real app.
The run named it twice, in the region and in the relationship:

```text
[roll] roll-tier-card.paddingLeft: subject 12px !== prototype 0px
[roll] alignment "roll-card-bodies".left: the prototype lines these up and the subject insets
  "roll-tier-inset" 12.0px from "roll-card-body" (roll-card-body 464.0, roll-tier-inset 476.0)
```
