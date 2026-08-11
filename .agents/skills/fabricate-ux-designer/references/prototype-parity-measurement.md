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

- **Its subject must be the real app.** `compare.mjs`'s subject is a hand-authored markup fixture, which is a mirror of what its author believed the app renders. A structural pass run against a mirror can only report what its author already knew was missing, so point it at whatever renders the shipped components — here, the View Lab.
- **It reports EXTRAS without failing on them.** The assertion is one-directional on purpose: a product legitimately says more than a mockup, and a gate that failed on the difference would be switched off within a day.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

So: a green `compare` is evidence about the values of what is on screen, and about nothing else.
Ask for the `inventory` run before accepting "the screen matches the prototype".

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
- The structural pass ran against the **markup fixture** rather than the real app, so it could only confirm its author's beliefs.
- The harness renders the panel under test rather than the **real ancestor chain**, so an inset above it is unmeasurable.
- A region compares two **transparent** backgrounds, which passes on any background at all.
- The fixture covers **some screens** and reads as coverage.
- An **exemption** carries no reason, so a value someone deleted is indistinguishable from a difference someone decided.
- The harness loads the global stylesheet but not the **compiled scoped CSS** of the primitives on screen, and measures controls the app never renders that way.

## Relationship to the rest of the UX evidence rules

Parity measurement is an addition to `visual-evidence-and-reuse.md`, never a substitute.
The reference matrix, the reuse inventory and the embedded-screenshot requirement all still apply; a PR does not become exempt from screenshots because a parity run was green.
