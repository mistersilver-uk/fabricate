# Measuring a screen against its design prototype

When a design prototype exists for a surface, "does it look right" is answerable mechanically instead of by eye.
This reference points at the tool that answers it and records what the technique costs when it is done badly.

The tool is `scripts/visual-parity/`, and its own `README.md` is the operating manual — spec schema, how to point it at a new prototype, how to add a screen, how to record an exemption, and the worked negative controls.
Read that file before using it; this page is the *when* and *why*.

It has **two** passes and they answer different questions.
`compare.mjs` measures computed style; `inventory.mjs` walks structure.
Running one and reporting parity is the mistake the next section names.

## A measurement pass cannot see absence

**A parity gate that only measures what both sides have will always report green on something one side is missing.**

This is not a subtlety; it is the shape of the tool.
A computed-style comparison reads named regions that exist on both sides, so three whole classes of defect are outside what it can express: an element the prototype has and the product does not; a control sitting in the wrong parent; and a missing affordance on a row whose chrome measures identically.
All three shipped on one screen of this repository behind a run that printed `parity: no drift` over nine named regions — a missing callout card, two controls that had migrated into a neighbouring card, and a drag handle absent from every row.

`inventory.mjs` is the complement, in the same way `chromeSweep` is the complement of a named-region colour list.
It enumerates the prototype's own tree into landmarks, enumerates the subject with the same presentation-derived classifier, and fails on every prototype landmark with no counterpart — naming the card, or naming the card the control moved to.

Two things about it are worth carrying into a review rather than rediscovering:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

- **Both passes measure the real app.** A pass run against a mirror can only report what its author already knew. `compare.mjs` used to render a hand-authored markup fixture; it does not any more, and the reason is the next section.
- **It reports EXTRAS without failing on them.** The assertion is one-directional on purpose: a product legitimately says more than a mockup, and a gate that failed on the difference would be switched off within a day.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

So: a green `compare` is evidence about the values of what is on screen, and about nothing else.
Ask for the `inventory` run before accepting "the screen matches the prototype".

## A hand-maintained mirror does not fail — it drifts

This is the lesson worth carrying furthest, because it cost a shipped layout defect after the harness existed and was green.

`compare.mjs`'s subject used to be a markup fixture: a hand-written copy of what its author believed the components render.
The obvious failure mode is the boring one — the copy keeps a class the component stopped emitting.
The one that actually happened is worse.
The fixture's roll screen modelled `SimpleCraftingCheckEditor`'s static-DC card, a component that screen does not even render and that was never broken, and it never modelled `CraftingCheckEditor`'s routed tier list at all.
So when that list shipped in the wrong card shell — 12px of padding insetting every tier row past the card above it — the run reported *no drift*, **because it could not be wrong about a component it did not model.**
The structural pass, which does point at the real app, missed it too: it asserts cards, labels and glyphs, and an inset leaves every landmark exactly where it was.

Read the general rule off that rather than the instance: **a mirror you have to keep honest by hand will drift, and it will drift in the direction nobody is checking.**
If a harness's subject is a copy of the thing under test, its green runs are evidence about the copy.

Two consequences the harness now encodes, both worth asking for in a review:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

- **Every region can measure right while the screen is wrong.** An inset applied by an ancestor moves a whole subtree and changes none of its computed values, so no per-region comparison can express it. `alignments` states the relationship between regions instead, and derives from the prototype which edges it may demand.
- **The app needs a state, and reaching it is part of the measurement.** An empty list draws no row treatment. A run that seeds that state says so; a run that quietly measures the empty screen is measuring a screen the prototype has no counterpart for.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Expect a re-pointed harness to arrive with a pile of findings the mirror had been absorbing.
This one went from one green run to seventeen, including host chrome painting a scrollbar colour no markup harness could ever have seen.

## When to reach for it

- A prototype exists and a review question is about rendering rather than behaviour.
- A reviewer has said "this does not look like the design" and nobody can say precisely which values differ.
- A conversion is being done screen by screen and each screen needs a stopping condition.

Do not reach for it to check that a control exists, that a state is reachable, or that copy is right.
It measures computed style; those are questions for mounted tests and for rendered frames.

## What it cannot tell you

**It is measurement, not judgement.**
A green parity run says every measured value matches; it does not say the screen reads well, that the information hierarchy is right, or that a GM can find anything.
Pair it with rendered frames — the View Lab (`node scripts/view-lab-screenshots.mjs apps <case-ids>`) renders real app windows over real Foundry chrome in seconds — and look at them.
Several defects in this codebase's own parity work were invisible to the harness and obvious in the frame: a switch label ellipsising to `Che…`, and two-line rows drawing on top of each other because a host stylesheet fixed a `<button>`'s height.

**It runs locally, never in CI.**
A prototype is a design artefact, not a repository asset.
The spec, the fixture and the prototype all live under `tmp/`.
So drift the harness exposes and nobody closes is carried by a written note, not by a red build — say so explicitly in a handoff rather than assuming the next round will rediscover it.

## The failure modes worth naming in a review

These are the ones that make a parity claim untrue while looking true.
The README states each as a trap; a reviewer should treat any of them as grounds to disbelieve a green run.

- Only the **computed-style** pass was run, so nothing asked whether anything is missing (see above).
- Either pass ran against a **markup fixture** rather than the real app, so it could only confirm its author's beliefs.
- The harness starts at the panel under test rather than the **real ancestor chain**, so an inset above it is unmeasurable.
- A region compares two **transparent** backgrounds, which passes on any background at all.
- The fixture covers **some screens** and reads as coverage.
- An **exemption** carries no reason, so a value someone deleted is indistinguishable from a difference someone decided.
- Every region is measured and no **relationship** is, so a subtree that moved as a whole reads as green.
- A region resolves against the **whole document** rather than inside the app window, and answers with whatever else wears that class.

## Relationship to the rest of the UX evidence rules

Parity measurement is an addition to `visual-evidence-and-reuse.md`, never a substitute.
The reference matrix, the reuse inventory and the embedded-screenshot requirement all still apply; a PR does not become exempt from screenshots because a parity run was green.

## The parity review protocol

This is the sequence a change with a prototype runs, from plan to approval, and the artifact each step leaves behind.
It was assembled from the world catalogue programme (epic 1357), where every step below was learnt by shipping a screen that skipped it.
The planner names each artifact in the delta; the driver produces the mechanical ones from the integrated branch; the reviewers approve only with all of them in hand.

### 1. Authority, decided before anything is built

The prototype is the authority for type, copy, structure, state, order, and which colour ROLE a surface takes.
The design-system library — `openspec/specs/design-system/spec.md`, the vocabulary in `openspec/specs/design-system/library.html` and the shipped rows in `scripts/lib/designSystemPrimitives.json` — wins wherever the two conflict: control heights, corner radii, spacing rungs, the token a role resolves to, and which primitive draws a control.
That is the Checks Studio split, and it is per control and per state, never per whole artifact.
A conflict is escalated before implementation and recorded as a deviation with its reason where a reader meets it; a deviation discovered at review time is already too late.
Two standing traps: the prototype's background ramp is shifted one rung from the shipped one, so a design `--bg1` paints the shipped `--fab-bg-0`; and a raw colour anywhere under `src/ui/**` or `styles/` fails the colour gate (`tests/components/theme-colour-contract.test.js`, which strips no comments and exempts only the theme-palette block of `styles/fabricate.css`), so a prototype hex with no token is an escalation rather than a literal.

### 2. The reachable-state matrix, written at plan time

For every changed screen, enumerate every state a GM can reach: empty, one, many, paged, selected, bulk-selected, hovered, inherited and overridden, warn and block, filtered to nothing, and both sides of every container query at a width a GM actually runs.
Each row names four things: the prototype screen and state it corresponds to, the View Lab case that reaches it (with `expectView` and an `expectSelector` that only that state satisfies), the mounted test that ACTS on its controls, and the screen it maps to in the parity spec.
A state with no case is a gap the plan closes by registering one, not a note for later.
A fixture may not author a state the product cannot reach — the lab renders persisted shape and bypasses every editor guard, so a frame of an impossible combination is a defect wearing evidence's clothes.
A widening filter is exercised at the cohort's zero point, because that is exactly where a zero-check on the wrong array makes the widened state unreachable.

### 3. Extract the prototype, then measure the real app twice

Drive the prototype with `extract.mjs`.
The Design Canvas bundles under `tmp/` replace their `x-dc` element with `#dc-root` on boot, so that is the ready selector; screen roots are `display: contents` and have no box, so waits use `state: 'attached'`; navigation clicks by visible text, because the `sc-camel-on-click` directive is consumed at compile time and is absent from the live DOM.
Then run `compare.mjs` AND `inventory.mjs` against the View Lab, never against a markup mirror of the app; the run that gates review is the driver's, from the integrated coordinator, and a lane's own run informs iteration but is not evidence.
The lab must be opened with the same query parameters as the matrix's case — `openViewLab`'s `query` is what reaches a state, `case` is only a label — and its default world is the POPULATED one, so an empty, cleared or filtered state is asked for by that case's own flags (`clearSystem`, `noTools`) and never assumed; seed it in `subject.open`, not in `navigate`.
It must also be a fresh lab: the harness attaches to anything already serving the lab page on its pinned port 5273, so a server left running from another worktree silently measures a different tree.
Measure at a real window width, on pane content width rather than frame width, and on both sides of every container query.
An extra LABEL or GLYPH never fails, because a product legitimately says more than a mockup; an extra CARD fails exactly as a missing one does, because a card is a claim about the shape of the screen.
Every exemption, computed-style or structural, states a reason of forty characters or more.
Paste both outputs into the lane report — the harness never runs in CI, so drift left open survives only as a written note.

### 4. Frames that show the state, with a control run

Capture every case in the matrix with the scoped View Lab command (`node scripts/view-lab-screenshots.mjs apps <case-ids>`), BEFORE the change, AFTER it, and a CONTROL — a second run of the same after commit.
The lab is not pixel-deterministic, so a difference is real only when the control does not reproduce it.
A frame counts only when it shows the changed state itself; a frame of an unchanged region satisfies nothing.
Judge each frame against explicit criteria — first visible state, clipping, spacing, alignment, scroll containment, the visible control set — and where a lab frame and a smoke frame disagree, the smoke is right and the lab is defective.

### 5. Mounted tests that act, and criteria that can fail

A mounted test asserts the DOM the GM meets, not the spy behind it; a control is covered only when a test acts on it.
Where a write refuses silently, assert the forwarded argument list, never a post-state.
Every acceptance criterion names the mutation that reddens it, every negative assertion carries its positive control, and the cheap mutations are applied, run and pasted red before the lane hands off.
A guard that has never been seen red has proved nothing.

### 6. The gate

The UX reviewer approves a screen with a prototype only with the matrix, both harness outputs and the frames in hand, and disbelieves a parity claim that arrives without the inventory pass.
The quality reviewer approves only with the matrix's mounted column filled and the mutation proofs pasted.
The driver runs the harness and the captures from the integrated coordinator before the review round, so reviewers measure the thing that will ship.
