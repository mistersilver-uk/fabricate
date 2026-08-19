---
layout: default
title: 0003 — Whole-Array Crafting-Definition Storage
parent: Architecture Decisions
nav_order: 3
---

# ADR 0003 — Whole-array crafting-definition storage

**Status:** Accepted — **whole-array storage, one `world` setting key per entity class**.
This **supersedes ADR 0001**, which selected B(1), one setting key per record.

**Context:** issue 1070 (performance programme), issue 1255 (Foundry storage-arrangement measurement), PR 1256 (the measurement and its decision table).
**Supersedes:** ADR 0001 — granular crafting-definition persistence.
**Decides for:** issue 1260 (revert every converted world), issue 1261 (strip the granular surface).
**Closes:** issue 1252, as `wontfix`.

---

## Why this record exists

ADR 0001 chose B(1) against its own spike's recommendation, and it said plainly that the choice rested on a falsifiable condition.
It then amended that condition once, when issue 1080's headless measurement showed the original crossover reasoning was wrong at every corpus size.
The replacement condition was an absolute budget: **1.41 MB of connect overhead**, roughly 4,160 records.

Every number behind both the decision and its amendment came from a **headless model**.
Nothing had ever measured a real Foundry client booting a converted world.

Issue 1255 built that instrument.
This record exists because it fired the condition.

## The measurement

Foundry 14.365, dnd5e 5.3.3, one machine, one run per point.
The same world was converted in place through the shipped conversion and reset between points, at 2,000 / 5,000 / 10,000 recipes over a pinned 10,000-component library.
Every column below is **class 1** — counts and bytes, machine-invariant and assertable.
Bytes are Fabricate's own share of the connect payload; the constant 3,683 bytes of non-Fabricate world settings are excluded, and because that term is identical on both arms the overhead is the same either way.

| recipes | arrangement | setting docs | connect bytes | overhead | added docs | B per added doc | edit bytes |
|:--------|:------------|-------------:|--------------:|---------:|-----------:|----------------:|-----------:|
| 2,000 | whole-array | 13 | 6,021,674 | — | — | — | 1,766,352 |
| 2,000 | per-record | 12,016 | 11,894,238 | **+5,872,564** | 12,003 | **489.3** | **770** |
| 5,000 | whole-array | 17 | 8,473,317 | — | — | — | 4,429,314 |
| 5,000 | per-record | 15,016 | 15,535,200 | **+7,061,883** | 14,999 | **470.8** | **770** |
| 10,000 | whole-array | 17 | 12,557,087 | — | — | — | 8,867,523 |
| 10,000 | per-record | 20,016 | 21,603,409 | **+9,046,322** | 19,999 | **452.3** | **770** |

Every figure is exact and every derived column follows from the two before it, so a maintainer can re-derive the whole table by hand rather than taking it on trust.
In the MiB the budget below is stated in, the three overheads are **5.60 MB, 6.73 MB and 8.63 MB**; `MB` means `MiB` throughout this record.

Edit bytes are `writtenBytes` — what the mutation actually put on the wire, counted at the document layer on both arms.
Wall-clock figures were also recorded, and they are **class 2**: single runs on one machine, non-monotonic across the three corpora, and nothing in this decision rests on them.
They are reported in PR 1256 and deliberately not tabulated here.

## The decision, and the two facts it turns on

**First — ADR 0001's own kill criterion fired at every size measured, including the smallest.**

The budget is 1.41 MB.
At **2,000 recipes the overhead is 5.60 MB — four times over**, and it does not come back under anywhere in the range.
ADR 0001 states the consequence itself: *"If a supported corpus crosses it, this ADR is superseded rather than amended."*

**Second — the modelled per-record constant was optimistic by a third.**

ADR 0001 models 339 bytes of per-record connect overhead.
The measured figure is **452–489 bytes**.
That gap is not a rounding difference; it is the difference between a budget that might have been defensible and one that never was.
Any future record quoting 339 bytes should quote the measured range instead, and should say which client and game system it was measured on.

**What the arrangement genuinely bought, stated fairly.**
The write saving is real, large, and constant: **770 bytes on the wire per edit at every corpus size**, against 1,766,352, 4,429,314 and 8,867,523 bytes — reductions of 2,294×, 5,752× and 11,516×.
That is not a marginal win, and it is the reason the option was worth building and worth measuring.

It is outweighed by *who pays*, and that argument is made entirely in class-1 bytes.
Connect is paid by **every client, on every session**: 5,872,564 bytes of extra payload at the smallest corpus measured, per player, per join.
An edit is paid by **one GM, occasionally**: 8,867,523 bytes saved on a write that happens when a GM renames something.
Spending a permanent per-session cost borne by everyone to buy an occasional cost borne by one person is the wrong trade at every point on this curve, and it is wrong on the byte counts alone.

**Read paths are approximately a wash, and they did not decide this either.**
Player app open measured 1/1, 1/1 and 1.28×; GM app open measured 2.92×, 1.09× and 2.81×.
That scatter is class-2 noise across single runs, so it is recorded and then set aside.
Had it pointed the other way it would still not have decided the question, because a class-2 number measured once on one machine cannot carry an architecture decision — which is a principle ADR 0001 states directly: *"An architecture decision that turned on a millisecond measured on one laptop is one nobody else can check."*

## Decision

Fabricate stores crafting definitions in **whole-array `world` settings** — one key per entity class, as it did before issue 1080.
Granular per-record storage is removed.

The improvements the performance programme landed **independently of arrangement are kept in full**: the retained identity indexes and revision tokens, the per-pass inventory snapshot, the canonical summary projection and paged browsers, the invalidation domains, the bounded import and cascade writes, the Valid Id Basis gate and its mutation-time counterpart, the equivalence oracle, and the measurement instruments.
Issue 1261 enumerates them as an acceptance criterion precisely so that none is discarded by association.

## Consequences

- **A single-record edit again rewrites its whole class.**
  That is the cost this decision accepts, and 8,867,523 bytes per edit at 10,000 recipes is the number to watch.
  The benchmark cases that measure it stay committed, so a future regression or a future revisit starts from evidence rather than from argument.
- **The converted world must come back before anything is deleted, but that is one manual step, not a migration.**
  Per-record storage never reached a public release, so no user's world was ever converted; the only converted world is a synthetic test world.
  Issue 1260 is therefore a script run once by hand — `scripts/manual/revert-storage-arrangement.js`, which drives the already-shipped reverse conversion — rather than a revert build with a release tail behind it, and issue 1261 strips as soon as that script has run.
  The ordering still matters even at a population of one: a build that removed the per-record reader while a converted world existed would present that world as **empty**, silently — the layout says `perRecord`, nothing reads it, and the registered `[]` default is served with no error at all.
  That is why issue 1261 keeps one boot-time detection check after the strip, sized at a log and a notification, protecting this repo's own development worlds rather than any user's.
- **Issue 1252 is closed `wontfix`.**
  Making the arrangement mandatory is the one option this data rules out.
- **The instruments survive the thing they measured.**
  The Foundry arrangement axis and the write-cost benchmark cases remain, so this decision is re-testable rather than re-arguable.
  That is deliberate: ADR 0001's condition went unmeasured against a real client for the whole life of the programme.

## What is left open

**The compendium option is not dead — it is unexplored at scale.**
ADR 0001's candidate **A+** — one `JournalEntry` per record in a dedicated world compendium, payload in module flags, one pack folder per crafting system — was rejected there on a UI-containment ground that still holds: *"A visible pack of unreadable `JournalEntry` records is a cost this project will not pay."*
Issue 1088 Q6 established that no API hides a pack from a GM.

That objection is about **presentation**, not about the connect payload, and issue 1088's own measurement is why A+ stays on the table: a compendium delivers an **index** at connect rather than full documents.
Whether that changes the arithmetic this record turns on has never been measured on a live client, and the instrument to measure it now exists.

Revisit A+ if, and only if, the write cost of whole-array storage becomes the binding constraint in practice — a corpus where GM edits are frequent enough that 8,867,523 bytes per edit is felt.
Any such revisit should measure connect on a real client first, and should treat 452–489 bytes per record as the reference point for what a per-key arrangement costs, not 339.

**What would reopen this record.**
A Foundry release that changes how world settings are delivered at connect — chunking, lazy hydration, or per-document authorization — removes the premise entirely.
Nothing in this decision is about Fabricate's data model; it is about what a client is handed when it joins.
