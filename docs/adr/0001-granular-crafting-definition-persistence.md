---
layout: default
title: 0001 — Granular Crafting-Definition Persistence
parent: Architecture Decisions
nav_order: 1
---

# ADR 0001 — Granular crafting-definition persistence

**Status:** **SUPERSEDED by [ADR 0003]({% link adr/0003-whole-array-crafting-definition-storage.md %})**, on the terms this record set for itself.
The replacement condition below — 1.41 MB of connect overhead, roughly 4,160 records — was breached by a factor of four at 2,000 recipes, the smallest corpus a live Foundry client was ever measured at, and never came back under.
Nothing in this record is edited to agree with that outcome; it is preserved as the reasoning the decision was actually taken against.

**Superseded status:** Accepted — **B(1), one `world` setting key per record**, which is not the option this spike recommended.
The comparison, the measurements and the recommendation below record the evidence; the *Decision* section records the maintainer's selection against it and the condition on which that selection rests.

**Context:** issue 1070 (performance programme), issue 1079 (this spike).
**Depends on:** issue 1088 (runtime feasibility probe), issue 1089 (repository seam), issue 1071 (headless benchmark harness), issue 1073 (Foundry perf profile).
**Decides for:** issue 1080 (implementation and migration), issue 1092 (cross-client deltas).

---

## The problem, in one number

`RecipeManager.save()` and `CraftingSystemManager.save()` replace a whole `world`-scoped setting array.
So renaming one recipe in a 10,000-recipe world serializes and replicates **12,213,086 bytes** — the entire corpus, plus the nine characters the edit added.
Every connected client then re-runs `JSON.stringify` over that payload twice to detect the change.

That is not a slow path that needs tuning.
It is a storage unit that does not match the mutation unit, and no amount of caching or paging fixes it.

---

## What is already settled, and is not re-argued here

Issue 1088 probed live Foundry 13.351 and 14.365 with a GM client, a real non-GM client, and a third arm that upgraded a V13 world onto V14.
Its findings are inputs to this ADR, not open questions.
Anyone re-opening one should read that issue's evidence first.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Question | Settled answer | Consequence for this ADR |
|:---|:---|:---|
| Can a module create a world compendium at run time? | Yes, from the `setup` hook onward. It fails at `init`, where `game.user` is still `null`. The pack is registered in `world.json`, stored under `Data/worlds/<world>/packs/`, and survives a restart, Foundry's own backup/restore, and a 13.351 → 14.365 upgrade. | Candidate A is buildable. Fabricate's managers initialise at `ready`, which is later than `setup`. |
| Can storage be hidden from players? | **No.** At ownership `PLAYER: NONE` a non-GM client reports `pack.visible === false` and still receives the pack in its connect payload, holds a populated index, and reads every document and flag payload. Foundry has no server-side read authorization for packs. | "Player-invisible storage" is struck from every option's benefits. Confidentiality is a write-time redaction problem and no backend delivers it. No GM read proxy is needed, and none should be filed. |
| Can a module extend the connect-time compendium index? | **No.** The server builds it from the document class's `metadata.compendiumIndexFields`; `CONFIG[type].compendiumIndexFields` is client-side only and setting it merely forces an O(N) round trip. The four fields are `_id`, `name`, `sort`, `folder`. | Summary reads come from those four fields, from one O(N) `getIndex` per session, or from outside the pack. This is what candidate C2 exists to answer — and, as this ADR shows, `folder` turns out to be a third answer nobody had costed. |
| Can `JournalEntry` carry module sub-types? | **No**, on either build (`hasTypeData: false`; the server logs `JournalEntry Documents do not support sub-types` and silently discards the declaration). `Item` and `JournalEntryPage` can. | Payload in flags is **forced, not preferred**. Recorded as a constraint, not a design choice. |
| Does sharding world settings reduce cold-load time or client memory? | **No.** All `world`-scoped settings replicate in full to every client at connect, verified against a client that never called `game.settings.get`. | Every settings-based option is a **write-amplification** fix only, and is measured on that axis alone. |
| Do remote clients learn about a pack write? | Partly, and this is the one place the builds differ. A write fires `updateJournalEntry` and `updateCompendium` — but on **14.365** only for clients that have already loaded that document. A client holding just the connect-time index receives nothing and its index silently goes stale. 13.351 does notify un-hydrated clients. | Every document-backed option requires issue 1092's replacement transport. That cost is charged to those options here, not omitted. |
| Is there an API to hide a pack from a GM? | **No.** Pack configuration offers only `folder`, `sort`, `locked` and `ownership`, and a GM short-circuits to OWNER. | "Creates no ordinary sidebar records" is unachievable. The containment requirement is renegotiated against issue 1088 Q6's enumerated surface list, below. |
| Is registering a setting key after `init` safe? | Yes. A key registered at `setup`, at `ready` and 5 s after `ready` each read its stored value on both builds. | Candidate B(1) is not blocked by registration timing. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## Which 10,000-recipe number, and a correction to issue 1070

Issue 1070 currently reconciles three different sizes for "10,000 synthetic recipes" — 22.3 MB in its own text, 19.8 MB from issue 1071's harness, 7.18 MB from issue 1073's Foundry seed — by saying they come from *different generators producing different recipe shapes*.

**That explanation is wrong for two of the three, and the real one matters.**
Issue 1071 and issue 1073 use the *same* generator and the *same* seed.
What differs is whether the corpus has been through `Recipe.fromJSON` → `Recipe#toJSON`:

- **7,177,534 bytes** — the raw fixture payloads.
  This is what issue 1073's Foundry seeder writes into the setting directly, deliberately, because seeding through `createRecipe()` would be 10,000 whole-corpus saves.
- **12,213,077 bytes** — the same corpus after the model round trip.
  This is what `RecipeManager.save()` actually writes, and it is the figure committed as `recipeManager.save.serializedBytes` in `benchmarks/baselines/simple-corpus.json`.

So issue 1073's Foundry arm under-reports the corpus production pays by **41%**, and the two figures are one corpus in two states rather than two rival measurements.
The 22.3 MB figure predates issue 1136 (which retired the flat `results` alias and every rebuildable default) and is superseded by the 12.2 MB one.

**Every byte in this ADR is the `Recipe#toJSON` shape**, because that is the shape storage holds.
Measuring the raw payloads would have compared every candidate against a baseline 41% smaller than the one production pays, flattering the baseline and understating every alternative.

Reproduced against `simple-corpus`, seed 1071, in a fresh process — see **Provenance of these numbers** below for where the harness lives.

{: .note }
> **Run it in a fresh process if you intend to quote the bytes.**
> `Recipe.fromJSON` mints ids for sub-records through `foundry.utils.randomID()`, which the test
> harness implements as a process-lifetime counter that is never reset.
> Ids get wider as a process runs, so the same corpus serializes to 12,213,077 bytes on the first
> hydration and 12,224,183 on the second — an 11,106-byte drift with no cause but counter width.
> This also means issue 1071's committed `recipeManager.save` baseline is a function of how many
> earlier cases hydrated, which is a latent fragility in that guard and is reported to issue 1071.

---

## Options considered

Seven arms, all implementing the `CraftingDefinitionRepository` interface issue 1089 landed (PR 1141) — deliberately, because that interface is what makes the eventual migration one adapter rather than ~31 call sites across two 3,000–6,000 line managers.
A candidate that could not satisfy it would have been disqualified mechanically rather than argued about; all seven satisfy it.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Arm | Issue 1079 label | Shape |
|:---|:---|:---|
| `settings-corpus` | Baseline | Today. One `world` setting holding the whole array. Wraps the shipped `SettingsCraftingDefinitionRepository`, so the "before" column is literally the shipped code path rather than a re-implementation of it. |
| `settings-per-record` | B(1) | One `world` setting key per record (`recipe.<id>`). |
| `settings-per-system` | B(2) | One `world` setting key per crafting system. |
| `pack-documents` | A | One `JournalEntry` per record in a dedicated world compendium, payload in module flags. |
| `pack-documents-foldered` | A+ | The same, with one pack **folder** per crafting system. Not in the issue's option list; see "The finding nobody had costed". |
| `container-flags` | C1 | One container document, payload at `flags.fabricate.recipes.<id>`. |
| `hybrid-summary-pack` | C2 | Compact summaries in a `world` setting, full bodies as pack documents fetched lazily. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**B(3), linear-hashing buckets, was not prototyped, and that is a decision rather than a gap.**
Issue 1088 Q4 removed its rationale by confirming that world settings replicate in full at connect, so no key granularity can improve cold-load time or client memory.
Issue 1079 then says in terms: *"Bucketing (3) has no remaining rationale; do not prototype it without a new one."*
B(1) already delivers exact O(1) routing with no manifest, no split protocol and no interrupted-split recovery, and this spike found that it needs no manifest at all — the record set is enumerable from `game.settings.settings`, which is a client-side `Map` of every registered key.
Building B(3) would spend a sprint reproducing B(1)'s write amplification with strictly more failure modes.
No new rationale emerged, so it was not built.

---

## Kill criteria, stated before the measurements

Issue 1079 requires these to be explicit, on the grounds that a "preferred hypothesis" with no losing condition is a foregone conclusion.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Arm | Would have been killed by | Fired? |
|:---|:---|:---|
| **A / A+** | (i) A connect-time cost not materially below the settings baseline. (ii) A single-record write not materially below the baseline. (iii) A pack that cannot be created at run time or does not survive backup — closed by issue 1088 Q2. (iv) Needing a custom `DocumentSheet` to be usable. | **No.** Connect payload 7.4× smaller on the LIVE index rate (16.1× on the headless model, which understated the index by 2.2× — see the live section), single write 9,586× smaller, no sheet required. |
| **B(1)** | Failing to reduce single-record write size, **or** making the connect payload worse while doing so. | **FIRED on the second.** It wins the write axis outright (10,254×) and then loses the connect axis outright: the live-measured 340-byte `Setting` envelope × 10,000 keys adds ≈3.4 MB, making the connect payload ≈15.6 MB against the baseline's 12.21 MB — **28% worse**. |
| **B(2)** | Producing no measurable improvement against the *target-scale* fixture. | **FIRED.** Against a single-system corpus — the shape of the field report and of issue 1070's target scale — B(2) is byte-for-byte identical to the baseline. |
| **C1** | `Document#update` transmitting more than the changed subtree, **or** record ids being unable to serve as flag map keys. | **FIRED, on a variant of the first that the criterion did not anticipate.** `Document#update` does send a diff — but `updateCompendium` hands the RECEIVER the whole document, so a one-key write on a 246 KB container costs every hydrated client 246 KB. The second half half-fires too: a dotted id silently corrupts the map, so the id space must be validated. |
| **C2** | A per-edit write not materially below the baseline, **or** a connect payload above candidate A's. | **FIRED on the second, half-fired on the first.** Its connect payload is 1.97× candidate A's on the headless model — it pays the pack index *and* a summary array — and its per-edit saving is a bounded 16.5× rather than a growing one. The live index correction raises both arms' index term equally, so the ratio holds. |
| **Baseline (do nothing structural)** | Being close enough to the alternatives that the complexity is not worth buying. | **No — it is not close.** Issues 1086 and 1087 have both landed, so this arm *is* the post-cheap-mitigation baseline, and it still writes the whole corpus on every edit. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## What was measured, and how

**Headless matrix** — the spike harness (see **Provenance of these numbers**).
Issue 1071's `simple-corpus` fixture (10,000 recipes over a 5,000-component library, seed 1071), hydrated through the real `Recipe.fromJSON` and serialized through the real `Recipe#toJSON` — the exact four accessors `RecipeManager` passes to its repository in production.
Every number is **class 1** under issue 1071's convention: machine-invariant, reproducible from `{profile, seed}` alone, and therefore assertable.
The relations they support were guarded inside `npm test` by the spike's own suite while the prototypes existed.

Bytes are `JSON.stringify(value).length` throughout — UTF-16 code units of the serialized form, exactly as issue 1071's `settingBytes` counts them.
Not a measure of what a socket compresses it to; a consistent size that makes two backends comparable.

**Live Foundry** — the `persistence-experiments` scenario of issue 1073's perf profile (`npm run test:foundry:perf`), which this spike implemented and which had been declared *deferred, blocked by issue 1079*.
It measures only what a fake cannot settle, because a fake asked to transmit a diff will always agree that it transmitted a diff.
Four facts, taken against a real world compendium created at run time and deleted afterwards: the true per-record index rate, the payload a second client is actually handed for a one-document write, the same for a single flag-key write on a container document, and the real `Setting` document envelope.

**Deliberately not committed as a benchmark baseline.**
The obvious home for these cases was `tests/helpers/scale/benchmarkCases.js` and the committed `benchmarks/baselines/simple-corpus.json`.
That was rejected: six of the seven arms are deleted the moment the *Decision* section below is written, and wiring throwaway prototypes into a permanent regression baseline means every one of those deletions churns a file whose whole job is to be stable.

---

## The comparison matrix

`simple-corpus`, 10,000 recipes, one crafting system.
All class 1.

### Write cost of one single-field edit

| Arm | Bytes on the wire | vs baseline | Write round trips |
|:---|---:|---:|---:|
| Baseline | 12,213,086 | 1.0× | 1 |
| B(1) | 1,191 | **10,254×** | 1 |
| B(2) | 12,213,086 | 1.0× | 1 |
| A | 1,274 | **9,586×** | 1 |
| A+ | 1,294 | **9,438×** | 1 |
| C1 | 1,262 | **9,678×** | 1 |
| C2 | 739,064 | 16.5× | 2 |

The four winning arms are within 9% of each other and three to four orders of magnitude from the baseline.
**The write axis does not separate A, A+, B(1) and C1**, and the ADR does not pretend otherwise.

### Bulk import of 50 records

| Arm | Bytes | Server round trips |
|:---|---:|---:|
| Baseline | 12,213,436 | 1 |
| B(1) | 60,045 | **50** |
| B(2) | 12,213,436 | 1 |
| A | 64,135 | **1** |
| A+ | 65,135 | **1** |
| C1 | 62,116 | **1** |
| C2 | 802,275 | 2 |

This is the first axis that separates them, and it is invisible in a byte comparison.
`game.settings` has **no bulk write API at all**, so B(1) cannot coalesce: fifty records cost fifty `game.settings.set` calls however they are wrapped, where a compendium's `Document.updateDocuments` costs one.
Issue 1086 has just landed a fix bounding bulk import to one corpus write; B(1) would reintroduce per-record round trips on that exact path.

### What a cold client receives at connect

Issue 1070 names this the axis most likely to decide the choice.

| Arm | Total bytes | From settings | From pack index | `Setting` documents |
|:---|---:|---:|---:|---:|
| Baseline | 12,213,077 | 12,213,077 | 0 | 1 |
| B(1) | 12,203,076 | 12,203,076 | 0 | **10,000** |
| B(2) | 12,213,077 | 12,213,077 | 0 | 1 |
| A | **757,781** | 0 | 757,781 | 0 |
| A+ | **817,781** | 0 | 817,781 | 0 |
| C1 | 81 | 0 | 81 | 0 |
| C2 | 1,495,562 | 737,781 | 757,781 | 1 |

Three readings that the raw column would otherwise mislead on:

1. **B(1)'s 12,203,076 is not a saving.**
   It is 10,001 bytes of array punctuation that 10,000 separate values no longer pay, and the model counts only the serialized *value* of each key.
   It omits the per-`Setting` document envelope, which one key pays once and 10,000 keys pay 10,000 times.
   The live measurement supplies that envelope, and it moves B(1) the wrong way.
   The direction of this model's error therefore favours the candidate this ADR does not recommend, which is the safe direction for it to be wrong in.
2. **C1's 81 bytes is honest and useless on its own.**
   The container's *index entry* is 81 bytes; the container itself is 12,392,081 bytes and must be loaded in full before any record is readable.
   C1 moves the corpus from the connect payload to the first read.
   That is a real change — it is no longer paid by a client that never opens Fabricate — but it is not a reduction in the data a working client holds.
3. **A and A+ are the only arms where the corpus is genuinely not resident**, and this is the one row the headless model got materially wrong.
   757,781 bytes is 75.8 bytes per record, but real Foundry ships SIX index fields rather than the four `metadata.compendiumIndexFields` declares, and measures **164.8 bytes per record**.
   Read this row as the live extrapolation — **≈1.65 MB at 10,000 records, 7.4× smaller than the baseline** — which is the same order as issue 1088's directly measured 1.41 MB.
   The live section below has the correction and the reason for it.

### Read cost — document round trips

| Arm | Cold load | Cold load bytes | List all | List scoped to one system |
|:---|---:|---:|---:|---:|
| Baseline | 0 | 0 | 0 | 0 |
| B(1) | 0 | 0 | 0 | 0 |
| B(2) | 0 | 0 | 0 | 0 |
| A | 10,000 | 13,300,857 | **0** | **10,000** |
| A+ | 10,000 | 13,360,857 | **0** | **0** |
| C1 | 1 | 12,392,081 | 1 | 1 |
| C2 | 10,000 | 13,300,857 | **0** | **0** |

**This table contains candidate A's biggest caveat and it is stated first.**
`loadAll()` is what the managers do *today* at start-up, and under A that is 10,000 document fetches.
A's connect-time saving is only realised once start-up stops hydrating the whole corpus — which is issues 1075, 1076 and 1091, not this decision.
Until they land, A moves cost from connect to `ready` rather than removing it.
The interface already says as much: `loadAll()` is *"the one operation that is legitimately whole-corpus under every backend"*.

### Replication

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Arm | `readReplicatedSnapshot()` | Consequence |
|:---|:---|:---|
| Baseline, B(1), B(2) | Supported | `reload()` keeps working exactly as today. |
| A, A+, C1, C2 | **`null`** | `reload()` goes inert. Issue 1092 must build the replacement transport, and on 14.365 it must cover the un-hydrated receiver that gets no hook at all. |
<!-- markdownlint-enable markdownlint-sentences-per-line -->

This is a real cost and it is charged to the document-backed arms rather than omitted.
It is worth noting what is *gained* alongside it: a pack write carries the changed document, which is a strictly better delta signal than today's whole-corpus `updateSetting`.

### Concurrent GM writes

No Foundry API offers compare-and-swap on a setting or on a document, so the only question is what a second writer destroys.
Measured in the spike's own suite: two repositories over one storage host, each editing a **different** record.

- **Baseline and B(2):** the first writer's edit is **silently lost**.
  The second `setSetting` replaces the array with a snapshot taken before it.
- **B(1), A, A+, C1:** both edits survive, because the two writes address different records.

That is a **correctness** improvement, not merely a performance one, and this ADR weights it as such.
Issue 1070 already notes that concurrent-GM-write loss exists today; this is the first measurement of how much of it each backend removes.
A primary-GM write funnel remains the honest answer for the residual same-record case under every option, as `_runMigrations` is already gated.

### Failure and recovery

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Arm | Interrupted bulk write leaves | Recovery |
|:---|:---|:---|
| Baseline, B(2) | Nothing applied — one call | None needed |
| B(1) | **Part applied.** Measured: the run tore after 5 of 10 keys | Re-run. No manifest to reconcile, which is exactly B(3)'s complexity that B(1) avoids |
| A, A+, C1 | Nothing applied — one bulk call, all-or-nothing at the call boundary | None needed |
| C2 | **A torn dual write.** Two writes to two subsystems with no transaction between them | `reconcile()`, implemented and tested. Body-then-summary ordering is deliberate: an orphan body is invisible and repairable, a dangling summary is a row that renders and then fails to open |
<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## The finding nobody had costed: `folder` is a usable index field

Issue 1088 Q5 closed "extend the connect-time index", and that has been read since as *summary reads must come from `name` or from outside the pack* — which is what candidate C2 exists to answer.

But the four surviving index fields are `_id`, **`name`**, `sort` and **`folder`**, and `folder` is writable.
**One pack folder per crafting system puts the owning system id into the connect-time index without extending it.**

Measured: a `systemId`-scoped summary listing costs **10,000 document fetches** under plain candidate A and **zero** under A+, for **60,000 extra index bytes** — 7.9% of the modelled index, 6 bytes per record.
Both arms return identical record sets; only the cost differs.
On real Foundry the cost is smaller still in relative terms, because `folder` is already in the index carrying `null`; foldering replaces that null with a folder id, so the added bytes are the id string rather than a whole new field.
This was asserted in the spike's own suite rather than claimed.

It is not free of risk, and both halves belong in the decision:

- The folder id becomes part of the stored shape, so renaming or deleting a system's folder re-homes every record in it, and a record that changes crafting system must change folder in the same update or the index answers a scoped query with a *stale scope* — a silently wrong list, not a slow one.
- **Compendium Folders** and similar modules edit exactly this field.
  That is an ecosystem interaction, not a hypothetical.

The consequence for the wider programme is that **C2's main justification weakens considerably**.
C2 exists to hold summaries outside the pack because the index cannot carry them; A+ shows the index can carry the one summary field the current `DefinitionSummary` needs beyond `name`.
C2 remains the answer if issue 1091's canonical projection needs fields beyond `_id`/`name`/`folder` — which is likely, and is named below as the open question this ADR cannot close.

---

## Live-Foundry measurements

Taken by the `persistence-experiments` scenario against real Foundry, a real world compendium created at run time, and a real second client.
Bounded at 500 records; every per-record rate is stated per record, and any 10,000-record figure derived from it is marked as an extrapolation.

### The connect-time index is SIX fields on 14.365, not four

Issue 1088 Q5 named four — `_id`, `name`, `sort`, `folder` — and that is exactly what `JournalEntry.metadata.compendiumIndexFields` declares.
The index entries a client actually holds carry **six**: `_id`, `folder`, `img`, `name`, `sort`, `uuid`.

`uuid` is derived and `img` comes from core's own document-class configuration rather than from the declared list.
The constraint is unchanged — a **module** still cannot add a field — but two consequences follow, and both matter downstream:

- **`img` is available in the index for free.**
  Issue 1091's canonical summary projection should know that before it decides where a summary image comes from.
- The index is correspondingly larger than a four-field estimate, which is the correction below.

### The real index rate is 165 bytes per record, not the 76 the headless model assumed

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| | Headless model | Live Foundry (14.365, dnd5e 5.3.3) |
|:---|---:|---:|
| Records | 10,000 | 500 |
| Index bytes | 757,781 | 82,393 |
| **Bytes per record** | **75.8** | **164.8** |
| Extrapolated to 10,000 | 757,781 | **1,647,860** |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**The headless model understated candidate A's connect payload by 2.2×**, because it modelled the four declared fields with short values and real Foundry ships six with real ids and image paths.
Every A/A+ connect figure in the matrix above should therefore be read as the live extrapolation, not the modelled one:

- Candidate A at 10,000 records: **≈1.65 MB**, against the settings baseline's 12.21 MB — **7.4× smaller**, not the 16.1× the headless model suggested.
- That extrapolation lands in the same place as issue 1088's direct measurement of **1.41 MB** at 10,000 records, which used shorter document names than this fixture's.
  Two independent measurements, same order, same shape.

The conclusion survives the correction and the correction is applied: **7.4× is the number to quote.**

### One `Setting` document costs 340 bytes of envelope, and that closes B(1)

Measured by registering a per-record-shaped key at run time and reading the resulting `Setting` document back out of `game.settings.storage`:

| | Bytes |
|:---|---:|
| The stored value | 51 |
| The whole `Setting` document | 391 |
| **Envelope** | **340** |

The headless model counted the serialized *value* of each key and nothing else, so it omitted this entirely — an omission that flattered B(1), which is why it was measured rather than assumed.

At 10,000 records B(1) needs 10,000 `Setting` documents, so the envelope alone adds **≈3.4 MB** to the connect payload:

| Arm | Connect payload at 10,000 records |
|:---|---:|
| Baseline (one key) | 12.21 MB |
| **B(1) (10,000 keys)** | **≈15.6 MB — 28% WORSE** |
| A+ (live extrapolation) | ≈1.81 MB |

**B(1)'s second kill criterion fires.**
It was "failing to reduce single-record write size, or making the connect payload worse while doing so", and it makes the connect payload materially worse.
This is the measurement that turns "sharding cannot help cold load" into "sharding actively harms it", and it could only be taken in a real Foundry.

### The settings control, measured in the same run

`definition-edit` — the settings arm this spike is compared against — recorded **12,294,183 bytes** for the `recipes` setting and **2,753,687 bytes** for `craftingSystems`, against a seeded 10,000 recipes and 5,000 components.
That is the same order as the headless baseline's 12,213,077, measured by a completely different route in a completely different process, and it is what makes the two halves of this spike comparable.

### What a receiving client is actually handed — and the part of it that is not established

The measurement no fake can make, because a double asked to transmit a diff will always agree that it did.
A GM and a real second client, both on 14.365; the receiver hydrated on all 501 pack documents and both hooks armed **before** any write.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| | Bytes |
|:---|---:|
| The change the SENDER expressed (`{'flags.fabricate.record': recipe}`) | 1,245 |
| The whole target document | 1,611 |
| Delivered to the receiver as `updateJournalEntry` — keys `flags`, `_stats`, `_id` | **1,155** |
| Delivered to the receiver as `updateCompendium` | **1,613** |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Two things follow, and the second is the one that matters for candidate C1.

1. **`Document#update` really does carry a diff, and the receiver's `updateJournalEntry` really does receive one.**
   1,155 bytes for a 1,245-byte change on a 1,611-byte document — the changed subtree plus `_stats` and `_id`, not the document.
   Candidate A's per-record write cost is confirmed against a live client, and issue 1088 Q3's hydrated case is confirmed with it.
2. **`updateCompendium`, which fires alongside it, carries the WHOLE DOCUMENT.**
   1,613 bytes against a 1,611-byte document.
   So a hydrated receiver pays roughly *diff plus whole document* per write, and the second term scales with document size rather than with change size.

That second point is direct evidence against **C1**, and it is the reason this measurement was worth a licence.
C1's argument is that a one-key flag write on a container document transmits only that key — true on the **send** side, measured at 1,259 bytes for a key on a 246,284-byte container.
But the `updateCompendium` payload is document-sized, so every hydrated client would receive the **whole 246 KB container** for that 1,259-byte change: a 196× receive-side amplification that the send-side measurement completely hides, and that grows with the corpus.
Candidate A pays the same mechanism on a 1.6 KB document instead of a 246 KB one, which is exactly the difference between a per-record store and a container.

{: .warning }
> **The container's own update was not observed, and the run's positive control did not fire.**
> The 196× figure above is inferred from the per-record document's measured `updateCompendium`
> payload being its whole document, not from watching the container's delivery arrive.
> In the same run, the container update produced no delivery inside a 60-second window, and the
> control — a write to an existing Fabricate world setting — produced none either, so that silence
> cannot be attributed to the container rather than to the probe.
> **A negative result whose control did not fire is not a result**, and it is recorded here as an
> open item for issue 1092 rather than counted as evidence.
> What IS established is the positive observation: a hydrated receiver gets a diff under
> `updateJournalEntry` and a full document under `updateCompendium`.

### What could NOT be measured live, and why

- **Nothing was measured on Foundry 13.351.**
  The shipped harness is parameterised by arm (`--arm=v13`), but issue 1088's V13 evidence came from a separate throwaway stack and that arm is an open acceptance item on issue 1088 rather than this spike's.
  The one V13/V14 difference that bears on this ADR — un-hydrated receivers getting no hook on V14 — is already established there.
- **10,000 documents were not created inside Foundry.**
  The scenario is bounded at 500 and the 10,000-record figures above are labelled extrapolations.
  Issue 1088 measured the 10,000-record index directly, and the two agree.
- **The seeded actors did not land.**
  Every run reported `actors: requested 2, Foundry kept 0`, so the inventory-axis scenarios (`player-actor-switch`) measured an empty inventory.
  That is a defect in issue 1073's seeder and is reported to it; it does not touch any persistence measurement, none of which uses actors.

---

## UI containment, against issue 1088 Q6's enumerated surface list

"Creates no ordinary sidebar records" is unachievable and has been dropped.
There is no supported API to hide a pack from a GM.
What remains is a decision about which surfaces are acceptable, taken explicitly:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Surface | Under A / A+ | Acceptable? |
|:---|:---|:---|
| Compendium sidebar | One pack row, suppressible best-effort with a stable internal flag and supported render hooks | **Yes.** One row is not clutter. |
| Directory search | Reachable | **Yes**, with the caveat that record names are Fabricate recipe names and will appear in search results. |
| `game.packs` iteration by other modules | Reachable | **Yes.** Unavoidable, and no worse than any other module's pack. |
| `@UUID` autocomplete | Reachable | **Yes.** |
| World export / backup UI | Included | **Desirable.** This is the property that makes the pack survive Foundry's own backup/restore, and it is why `module.json` is not a fallback — a module-declared pack lives under `Data/modules/<id>/packs/`, replaced on module update and outside the directory backups capture. |
| Items / Journal / Folder directories | **Not used.** The pack is a compendium, not world documents. | The part of the original constraint that IS achievable, and it is met. |
| Custom `DocumentSheet` | **None.** Records are plain storage documents; opening one through an API shows Foundry's default sheet. | **Yes**, and it is a hard constraint met rather than a preference. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## What was NOT measured, and why

Stated because a comparison matrix with no gaps is a comparison matrix that is hiding some.

- **Wall clock as a decision input.**
  Timings were recorded by the spike harness, labelled class 2, and are never asserted or compared across machines.
  An architecture decision that turned on a millisecond measured on one laptop is one nobody else can check.
- **Per-client heap.**
  `performance.memory.usedJSHeapSize` depends on whatever the garbage collector last did and is a hint about allocation pressure, never evidence.
  The connect-payload byte counts above are the honest proxy for "cold-client startup memory", and they are class 1.
- **10,000 documents inside a real Foundry.**
  The live scenario is bounded at 500.
  Creating 10,000 compendium documents is minutes of server work per run, and the facts it exists to settle are properties of a single record.
  Issue 1088 already measured the 10,000-record index directly.
- **Migration cost from the current corpus.**
  That is issue 1080's scope.
  What this ADR does record is that the current migration runner is structurally incompatible with per-record storage: 35 registered migrations read the settings corpus directly, and `MigrationRunner.js` is 803 lines, not the 5,280 the epic once recorded.
- **Babele, Quick Insert, Forge/Molten hosting.**
  Named as ecosystem risks below, not measured.
  A compendium is a more conventional integration surface than a giant setting, so the expected direction is favourable, but that is a prediction rather than a result.
- **B(3) bucketing.**
  Not built; see "Options considered".
- **The un-hydrated-receiver propagation cost.**
  Still deferred in issue 1073's registry, correctly: it is a property of the Documents backend, and the shipped backend is settings.
  Issue 1092 has the named slot.

---

## Recommendation

**Candidate A+ — one `JournalEntry` per record in a dedicated world compendium, payload in module flags, one pack folder per crafting system.**

**This agrees with issue 1070's stated preference rather than contradicting it.**
The epic named "one internal Fabricate record per Foundry Document in a dedicated world compendium, likely `JournalEntry` with Fabricate data in module flags" as the leading hypothesis; the evidence supports it, and the only addition is the pack folder, which is a refinement to the read path rather than a different architecture.
Worth saying explicitly, because a spike that confirms its own preferred hypothesis is exactly the shape a foregone conclusion also takes — so the kill criteria above are stated first, two of them fired, and the one that fired hardest (B(1) on the connect axis, C1 on receive-side amplification) did so on measurements taken specifically to give the alternatives their best case.

The reasoning, in the order the evidence supports it:

1. **The write axis does not decide this.**
   A, A+, B(1) and C1 are within 9% of each other and all roughly four orders of magnitude better than the baseline.
   Anyone quoting the write ratio as the argument for a particular option is quoting the one number that does not separate them.
2. **The connect axis does, and only the pack-backed arms move it.**
   Issue 1088 Q4 settled that no settings arrangement can: every key replicates in full whether or not anyone reads it.
   A+ is 6.7× smaller at connect than the baseline on the live index rate; B(1) is 28% LARGER once its 10,000 `Setting` envelopes are counted, and that number could only be taken in a real Foundry.
   This is the axis issue 1070 named as decisive, and it is the one that eliminates the entire B family.
3. **Bulk writes decide the runner-up.**
   B(1) needs one server round trip per record because `game.settings` has no bulk API; A+ needs one per batch.
   Issue 1086 has just bounded bulk import to a single corpus write, and B(1) would undo that on the same path.
4. **A+ over A**, because it costs 7.9% of the index and removes 10,000 document fetches from every scoped listing — a query the GM manager runs constantly.
5. **A+ over C1**, because C1 keeps the whole corpus in one document.
   Its connect payload is nominally 81 bytes and its first read is 12.4 MB, so it is a write-amplification fix wearing a cold-load fix's clothing.
   The live run then found the deeper problem: `updateCompendium` hands a hydrated receiver the WHOLE document, so C1's 1,259-byte one-key write becomes a 246 KB delivery to every client that has the container loaded — a receive-side amplification the send-side measurement hides entirely, and one that grows with the corpus.
   It also puts unvalidated record ids into dotted flag paths, and one imported dotted id silently nests a key one level deeper than every reader.
6. **A+ over C2**, because C2 pays the pack index *and* a replicated summary array — 1.97× A+'s connect payload — and rewrites the whole summary array on every edit, for a bounded 16.5× rather than a growing saving.
   Its dual-write tearing is real and needed a reconcile pass to close.

**One consequence of the receive-side finding applies to A+ too, and is not hidden here.**
A hydrated client receives the whole changed document under `updateCompendium`, so under A+ every such client pays roughly 1.6 KB per edit rather than the 1.2 KB diff.
That is a small constant on a per-record store and a corpus-sized one on a container store, which is what separates A+ from C1 — but it is a real term, it belongs in issue 1092's sizing, and it means "the write is 1.2 KB" is the SENDER's cost, not the system's.

### If the evidence does not separate two options, say so

It does not separate **A+ from C2 on the read axis**, and that is the honest limit of this ADR.
Both answer a scoped summary query with zero document fetches.
A+ wins on connect bytes and on write size; C2 wins on being able to carry summary fields that are not `_id`, `name` or `folder` — and **issue 1091 has not yet defined the canonical summary projection**.
If that projection needs a field A+'s index cannot hold, the right answer is A+ *plus* a replicated summary setting, which is C2 with a smaller pack index rather than a different architecture.

The recommendation is therefore A+ **with the summary question left open for issue 1091**, not A+ as a closed answer to summary reads.

### Risks of the recommendation, named

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Risk | Severity | Note |
|:---|:---|:---|
| **`loadAll()` still fetches every document.** Until issues 1075/1076/1091 make start-up incremental, A+ moves cost from connect to `ready` rather than removing it. | **High** | The single largest caveat. Sequencing matters: landing 1080 before 1075/1076 buys the connect saving and pays a `ready` cost.  |
| **Issue 1092 becomes mandatory infrastructure, not an optimisation.** `readReplicatedSnapshot()` is `null`, `reload()` goes inert, and on 14.365 an un-hydrated client is never told at all. | **High** | Must be sized against V14, where the gap exists. V13 does notify. |
| **Debuggability regresses.** Today a GM reads the whole corpus from the console in one line. | Medium | Every alternative degrades this. Worth a deliberate console helper in issue 1080 rather than an accepted loss. |
| **Folder coupling.** A stale folder is a silently wrong scoped list, and Compendium Folders edits that field. | Medium | Needs a folder-integrity check and a reconcile path. |
| **35 migrations read the settings corpus directly.** | Medium | Issue 1080's problem, but it is the reason that issue is not small. |
| **Ecosystem interactions are predicted, not measured.** Babele, Quick Insert, Forge/Molten. | Low–medium | A compendium is the more conventional surface; verify during 1080. |
| **Ordering.** The persisted array's insertion order has no equivalent in a pack; the index is `sort`-ordered. | Low | `sort` is an index field, so ordering is representable — but it must be written deliberately, not inherited. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### The interim, if the maintainer wants one

If issue 1080 cannot start soon, **B(1) is a legitimate interim** and would not be wasted work: it sits behind the same `CraftingDefinitionRepository` interface, so replacing it later is one adapter.
It removes the whole-corpus write and the concurrent-write clobber, which are the two *correctness*-adjacent problems, while leaving cold load exactly where it is.
**B(2) is not** — against the single-system corpus that matches the field report and the target scale, it is byte-for-byte identical to doing nothing.

---

## Decision

**Selected: B(1) — one `world` setting key per record.**
This is not the option recommended above, and the reasoning below is the maintainer's rather than the spike's.

### Why

**World settings are the established way for a Foundry module to hold non-user-facing state, and they are how Fabricate already works.**
The corpus lives there today, every one of the 35 registered migrations reads and writes it there, and import/export is defined against it.
B(1) changes the granularity of that storage and nothing else about its nature, so migrations, import/export and the mental model all stay where they are.

**A visible pack of unreadable `JournalEntry` records is a cost this project will not pay.**
Issue 1088 Q6 established that there is no API to hide a pack from a GM — pack configuration offers only `folder`, `sort`, `locked` and `ownership`, and a GM short-circuits to OWNER.
Every GM would therefore see a sidebar compendium full of documents that are meaningless to open, permanently, in exchange for a connect-time saving.
That is a real and daily cost against a benefit measured in a payload most worlds will never approach.

**B(1) does not preclude A+.**
Issue 1089 landed a `CraftingDefinitionRepository` interface precisely so the backend can change without rewriting callers, and this ADR's measurements remain valid the day that trade looks different.
Choosing B(1) now is reversible; the sidebar cost of A+ is not, once GMs have worlds built on it.

### The kill criterion this option fired, recorded rather than waived

**B(1) fired its second kill criterion above, and the decision is taken with that in view.**
Its live-corrected connect payload extrapolates to **≈15.6 MB against the baseline's 12.21 MB — 28% worse** — because a `Setting` document carries a measured 340-byte envelope and 10,000 of them add ≈3.4 MB of pure overhead.
It also costs **50 server round trips** for a 50-record bulk import where every other granular arm costs 1, and its partial-failure mode is real: the prototype run tore after 5 of 10 keys, leaving the write half-applied with no manifest to reconcile against.

**So this decision rests on a condition, and the condition is falsifiable.**
B(1) is sufficient if real worlds sit far enough below 10,000 records that the per-key envelope never accumulates to the crossover — which is at roughly **the point where key count × 340 bytes exceeds the whole-array saving**, and is therefore a function of corpus size, not of taste.
Issue 1080 MUST measure the connect payload at the corpus sizes real installations actually reach, and MUST record the crossover point at which B(1) becomes worse than doing nothing.
If a supported corpus crosses it, this ADR is superseded rather than amended, and A+ is the option already measured and waiting.

#### AMENDED by issue 1080's measurement — the condition above is false as written

The paragraph above is preserved verbatim because it is what the decision was taken against, and it should not be edited to agree with the outcome.
It is nonetheless **wrong**, and the numbers that show it are already in this document.

The "whole-array saving" it weighs 340 bytes against is the array punctuation — and § What a cold client receives at connect, reading 1, already says what that is: *"10,001 bytes of array punctuation that 10,000 separate values no longer pay."*
For `n` records that is `n + 1` bytes in total, so `n × 340 > n + 1` holds from the first record and the gap widens linearly forever.
There is no corpus size below which the envelope "never accumulates", and the crossover is not a function of corpus size after all.

Issue 1080 measured it and confirmed this from the corpus: crossover at n = 1 on every record shape tested, from 50 bytes to 100,000 bytes per record; −2 bytes at n = 0 (`"[]"`), +338 at n = 1.
That harness reproduces this ADR's own arithmetic byte-for-byte at the archived tree — `sum(recordBytes)` 12,203,076, whole-array 12,213,077, B(1) 15,603,076 = +27.76% — so the correction is to the *condition*, not to the measurements.

**The accounting convention behind "n = 1", because an amendment about mis-accounting must be exact about its own.**
Both layouts are compared *exclusive* of the container `Setting` document's own envelope — the convention of the connect table above, which reads the baseline at 12,213,077 and B(1) at 12,203,076 as serialized values on both sides, and which reading 1 states explicitly.
Issue 1080's harness adds back the term one key pays once and 10,000 keys pay 10,000 times, and does not subtract the once term.
Charge the baseline its single envelope too and the difference is `339n − 341` rather than `339n − 1`: the per-record penalty is 339 bytes either way, the corpus-scale figures move by exactly one envelope (340 bytes in 3.39 MB, 0.01%), and the divergence lands on the **second** record instead of the first.
Neither accounting yields a size threshold, which is the finding; and the one used here reports B(1) as 340 bytes worse than the symmetric one does, so its residual error runs toward this amendment's conclusion rather than away from it.
`benchmarks/README.md` § The crossover is at ONE record carries the same disclosure, and `tests/persistence-connect-payload.test.js` pins both readings.

**The honest decision input is a constant, not a crossover.**
Two curves that differ by a fixed per-record term never cross; they diverge from the first record.
B(1) costs **339 bytes per record more at connect, at every corpus size, on every record shape**.

Everything else is that constant divided by something: the **absolute** penalty is 34 KB at 100 records, 339 KB at 1,000 and 3.39 MB at 10,000, independent of shape; the **relative** penalty is `339 / meanRecordBytes`, which is driven entirely by shape and is essentially flat in record count, ranging from **9.0% to 44.1% — a factor of 4.9 — across the measured corpora on this tree**.
Read those two figures off the same tree: 9.0% is `rich-corpus` post-#1135 and 44.1% is `simple-corpus` post-#1135, both at their full corpus, as `benchmarks/README.md` § Both payload shapes tabulates them.
The pre-#1135 rich figure of 3.7% belongs to a payload shape that no longer exists and must not be paired with a post-#1135 number to widen the range.
A relative bound therefore cannot bound corpus size, which is why the replacement condition below is stated in absolute bytes.

**Issue 1135 has since made the relative regression worse, and this decision should be read against the new number.**
It cut the serialized payload 37% (simple) and 59% (rich) while the envelope stayed at 340, so the 28% recorded above is now **44.1%** on the simple corpus at 10,000 records.
The absolute penalty is unchanged at 3.39 MB.
If 28% was the figure this decision was taken against, it is now being asked to stand against 44%.

**One caveat on that headline, stated here rather than only in the harness README.**
`Setting#value` is a string field, so a transmitted `Setting` document escapes the JSON inside it and both layouts grow by the same absolute bytes.
Modelled that way — `escapedRecordBytes` in `tests/helpers/scale/connectPayloadModel.js`, committed per case — `simple-corpus` reads **+38.60%** rather than +44.13%, and `rich-corpus` +7.64% rather than +8.98%.
Escaping cannot touch the per-record penalty, which stays at 339 bytes because the same term is added to both layouts and array punctuation is not escaped, nor the absolute delta, which stays at 3.39 MB.
**+38.6% is the conservative reading of the headline and the replacement condition below is unaffected**, which is the point of stating that condition in absolute bytes.

**Replacement condition.**
B(1) stands while the connect overhead it adds stays within a stated absolute budget:

> **B(1) is sufficient while `record count × 339 bytes` remains at or below 1.41 MB — approximately 4,160 records.**

**That bound is a chosen tolerance pegged to a measured reference, not a crossing point, and the distinction matters here more than anywhere.**
This amendment's whole subject is a condition that read a bookkeeping artefact as a threshold, so it must not repeat the move.

The reference: 1.41 MB is issue 1088's directly measured **compendium index at 10,000 records**, and it corroborates candidate **A**, whose live extrapolation § The real index rate puts at ≈1.65 MB at the same scale.
It is not A+'s payload — § One `Setting` document costs 340 bytes of envelope records A+ at **≈1.81 MB**.

There is no crossing point to find between the two.
A+ costs ≈181 bytes per record at the 10,000-record target (1.81 MB / 10,000) against B(1)'s 339 bytes of overhead per record, so `339n > 181n` holds at **every** n and "B(1)'s overhead alone exceeds A+'s entire payload" is true from the first record.
That comparison is size-mismatched — a *rate* against a *total fixed at one scale* — and cannot be what makes ~4,160 records special.

What the bound actually asserts is a budget: **B(1)'s connect overhead at n records may not exceed what the index alternative would cost in total at this epic's 10,000-record target.**
That is falsifiable, it is stated in the escaping-robust quantity, and the arithmetic behind the record count is plain — 1,410,000 / 339 = 4,159.
It is a tolerance a maintainer set against a reference fixed at one scale, and it should be quoted as one rather than as a derivation.

Crossing this bound supersedes the decision rather than amending it again, on the original terms: A+ is measured and waiting, and issue 1092's replacement transport returns to scope with it.

> **The bound was crossed, and this record is superseded.**
> Issue 1255 measured a real Foundry 14.365 client booting a converted world at 2,000, 5,000 and 10,000 recipes.
> The connect overhead was **5.60 MB, 6.73 MB and 8.63 MB** — four times the budget at the smallest corpus measured, and rising.
> The measured per-record constant was **452–489 bytes**, not the 339 modelled here.
> [ADR 0003]({% link adr/0003-whole-array-crafting-definition-storage.md %}) records the measurement and the reversal.
> A+ is not taken up with it: it stays as future exploration, unmeasured against a live client.

**What remains unmeasured, and is the real exposure.**
The module collects no telemetry, and the only field datum in this issue tree is one user with 1,080 components — comfortably inside the bound, at ~366 KB.
"Real worlds sit far below 10,000 records" is still an **assumption of this ADR, not a finding**.
Issue 1080's harness spans 1 to 10,000 so the penalty can be read at whatever corpus size is believed in, but nothing here establishes which size that is.

#### AMENDED (second) by issue 1080's implementation — B(1) CAN coalesce a bulk write

Appended on the same terms as the amendment above, and for the same reason: the round-trip figures below are what the decision was taken against, so they are preserved verbatim and wrong rather than edited into agreement with this correction.

**The claim being corrected.**
§ Bulk import of 50 records states: *"`game.settings` has **no bulk write API at all**, so B(1) cannot coalesce: fifty records cost fifty `game.settings.set` calls however they are wrapped, where a compendium's `Document.updateDocuments` costs one."*

**The first clause is true; the second does not follow from it.**
`Setting` is an ordinary primary Document, so `Setting.implementation.createDocuments`, `updateDocuments` and `deleteDocuments` are available on **both 13.351 and 14.365** — one socket round trip and one server-side atomic batch per call.
Verified in core source on both builds during issue 1080's plan review.
The missing bulk API is a property of `ClientSettings`, the convenience wrapper the ADR reached for, and not of the storage underneath it.
**A 50-record bulk import is therefore one round trip per leg, not fifty**: at most three calls for the whole batch — creates, then updates, then deletes — independent of corpus size.

**Where the wrong number appears.**
Three places, none of them edited:

- **§ Bulk import of 50 records.**
  The `B(1)` row reads **50** server round trips, and the prose under it adds that B(1) "would reintroduce per-record round trips on that exact path" against issue 1086's bound.
  Read that row as **1 per leg, at most 3 for the batch**, and issue 1086's bound as preserved rather than undone.
- **§ The kill criterion this option fired, recorded rather than waived.**
  *"It also costs **50 server round trips** for a 50-record bulk import where every other granular arm costs 1[…]"*
  That clause is withdrawn.
  The partial-failure clause that continues the same sentence is not withdrawn: partial application is still reachable, in the narrower form described under the failure model below.
- **§ Recommendation, point 3.**
  *"B(1) needs one server round trip per record because `game.settings` has no bulk API; A+ needs one per batch."*
  Both arms cost one per batch, so point 3 does not separate them and no longer supports the runner-up ordering it was written to support.

§ Kill criteria's own `B(1)` row needs no correction: it never quoted a round-trip figure, and the criterion it records as fired is the connect one, which stands.

**This does not rescue the budget.**
The ≈4,160-document ceiling is **unchanged**, because the connect payload is a function of how many `Setting` documents **exist**, not of how they were written.
Fifty records written in one call are still fifty documents paying fifty envelopes.
Every figure in the first amendment stands exactly as recorded — 339 bytes per record, 3.39 MB at 10,000 records, and the 1.41 MB budget the ~4,160-document bound is read off.
So does what that amendment says the bound *is*: **a tolerance a maintainer set against issue 1088's directly measured compendium index at 10,000 records, not a derived crossing point.**
Nothing here makes it one.

**What the correction does change is the failure model, and it is smaller than it sounds.**
An N-way fan-out with N chances to tear was an artefact of the wrong API rather than a property of per-record storage.
It is replaced by a three-call flush with two interior windows, not by an atomic write: the legs are separately awaited, so a tear between them is still reachable and is bounded by ordering the deletes last rather than by a transaction.

**The generalizable lesson, which is why this is an amendment and not a footnote.**
The ADR conflated *"`game.settings` has no bulk write API"* with *"`Setting` has no bulk write API"*.
The first is a fact about a convenience wrapper; only the second would have supported the conclusion drawn from it, and it is false.
The comparison matrix is the artefact the next reader opens when the A+ question reopens at the ceiling, so a wrong round-trip column left standing there would be re-quoted as evidence for a decision it cannot support.

**One caveat, stated precisely so the correction is not over-claimed: `foundry.documents.modifyBatch` is not the transaction its JSDoc describes, and it is V14-only.**
It has **zero matches anywhere in 13.351**, so nothing built on it spans the module's supported range; the three-call path above is what runs on both versions.
Its JSDoc says *"either all must succeed, or all must fail"*, and that sentence describes a **dry-run pre-pass**, not the commit.
The server dry-runs every operation and then runs a **second sequential loop that breaks on the first error, keeping everything already committed**.
The client handler is worse for a caller than a plain write: it **swallows per-operation errors into a toast and resolves — it never rejects** — where a single `modifyDocument` does reject, so any in-session compensation keyed on a rejected call would silently never fire.
The pre-pass is not worthless, and its limit is the part worth stating exactly: it **does** hold for deterministic failures a dry run can see — validation, permission, a `_preCreate` veto — and fails for state-dependent or racy ones, which are precisely what a batch write is exposed to.
`modifyBatch` is therefore out of scope for issue 1080, and this correction rests on `createDocuments` / `updateDocuments` / `deleteDocuments` alone.

### Scope: components as well as recipes

**The change extends to components, and that is a different shape of work from recipes.**
Recipes are already a top-level array in the `recipes` setting, so B(1) splits an existing collection into per-record keys.
Components are **nested inside each crafting system** (`system.components`) in the single `craftingSystems` setting, alongside tools, essences and recipe-item definitions — so one component edit currently rewrites every system in the world.
Extending B(1) to components therefore requires extracting them from their container into records of their own before they can be keyed, which is a data-model change with its own migration, and not merely a persistence-granularity change.

Issue 1080 owns both, and should sequence them separately: recipes first, because the collection already exists, and components second, because the extraction is the larger risk.
The same question then applies to tools, essences and recipe-item definitions, which share the container and the same whole-corpus write.

### What this changes about the sections above

The recommendation, the comparison matrix and every measurement stand as recorded — they are the evidence this decision was taken against, not a competing conclusion, and they should not be edited to agree with it.
Issue 1092's replacement transport is **not** required: B(1) supports `readReplicatedSnapshot()`, so `reload()` keeps working exactly as it does today, which is one of the costs A+ would have imposed.
Issue 1080 is rewritten to B(1).

---

## Consequences once a backend is chosen

- Issue 1080 implements one `CraftingDefinitionRepository` adapter and the migration; no manager call site changes, which is the whole reason issue 1089 ran first.
- Issue 1092 builds the cross-client transport, mandatory for any document-backed choice and sized against V14's un-hydrated-receiver gap.
- Issue 1091 defines the canonical summary projection, which decides whether A+'s index suffices or a replicated summary setting is also needed.
- Issue 1073's `propagation-unhydrated` measurement gains a real subject and can be implemented.
- The prototypes are already deleted — see **Provenance of these numbers**.
- **Issue 1080's connect measurement amended this ADR's decision condition** — see § The kill criterion this option fired.
  The condition as originally written is false at every corpus size; B(1) still stands, now bounded by a chosen absolute budget of 1.41 MB of connect overhead (~4,160 records) rather than by a crossover.
  That 1.41 MB is issue 1088's measured compendium index at 10,000 records — candidate **A**'s corroborating reference, not A+'s payload — and the budget is a maintainer tolerance pegged to it at that scale, not a derived crossing point.
  The measurement instrument is `tests/helpers/scale/connectPayloadModel.js`, and the reading is re-derived on every run rather than pinned.
- **Issue 1080's implementation amended this ADR a second time, on bulk writes** — see § The kill criterion this option fired.
  `Setting` is an ordinary primary Document with `createDocuments` / `updateDocuments` / `deleteDocuments` on both 13.351 and 14.365, so B(1)'s bulk import costs one round trip per leg rather than one per record, and issue 1086's single-write bound is preserved rather than undone.
  The ceiling is untouched by it: connect payload counts documents that exist, not the calls that made them.

---

## Provenance of these numbers

The prototypes that produced every figure above are **deliberately not versioned on `main`**.
Seven backends were built in order to select one, so six were throwaway from the moment the spike started, and carrying them in the module's test fixtures would have run 2,681 lines of disposable code in CI on every push for the rest of the project.

They are preserved where they can still be read: in the commits of the pull request that introduced this ADR, titled `feat(#1079): prototype seven persistence backends behind the repository seam` and `feat(#1079): measure the persistence candidates inside a real Foundry`.
GitHub retains a merged pull request's individual commits, so the harness, the storage host and the measurement suite remain inspectable there without living in the test corpus.

The two commits are not equally disposable, and the argument above covers only the first of them.
`feat(#1079): prototype seven persistence backends behind the repository seam` is genuinely throwaway — six of its seven arms were dead the moment a backend was chosen.
`feat(#1079): measure the persistence candidates inside a real Foundry` is not: it is the measurement instrument that filled the `persistence-experiments` slot issue 1073 reserved, it holds no prototype, and the four live figures this ADR leans on hardest came from it — the six-field compendium index, 164.8 B/record, the 340-byte `Setting` envelope, and the 1,155-byte receiver diff.
It was dropped with the other only because it has no subject to measure until issue 1080 implements the selected adapter.

Re-deriving the headless figures means re-authoring a harness against the interface `CraftingDefinitionRepository` already presents, which is what the prototypes implemented.
Re-deriving the four live figures means more than that: a Foundry scenario that creates and deletes real documents, plus a two-client probe to observe what a second client receives.
The method is recorded above in enough detail to do either: the fixture and its seed, the two-class measurement convention, the four accessors `RecipeManager` passes to its repository, and the kill criterion each candidate was measured against.
