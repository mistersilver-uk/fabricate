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
