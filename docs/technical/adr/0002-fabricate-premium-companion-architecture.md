---
layout: default
title: 0002 — Fabricate Premium Companion Architecture
parent: Architecture Decisions
grand_parent: Technical Details
nav_order: 2
---

# ADR 0002 — the fabricate-premium companion architecture

**Status:** Accepted — **D6-a, core builds the `CraftingSystem.extensions` slot now**, and, **as revised on 2026-08-17, core builds a general player navigation extension seam and premium's player-facing Downtime mounts into Fabricate's own player window**, neither of which is the option this record recommended.
The hosting half of D7 as accepted on 2026-08-16 — premium hosting that window in its own Foundry Application — is **reversed**; see the revision entry under *Decision*.
Eight of the eleven decisions were taken as recommended; D1 is narrowed to the monorepo with the lane question left to the first real build; **D2 is demoted from a decision to a channel choice**, because the maintainer's ruling is that distribution is not an architectural constraint; and D6 and D7 diverge.
Confidentiality is not a constraint either — Fabricate does not defend GM-withheld information at the transport layer, in either module — which removes D7's premise rather than overruling it.
Following ADR 0001, the *Recommendation*, the kill criteria, the risk table and every measurement below record the evidence this decision was taken against, not a competing conclusion, and they have not been edited to agree with it.
All eleven positions were settled on 2026-08-16 and are recorded under *Decision*.

**Context:** issue 613 (the core plugin API and premium packaging seam, plan-reviewed at revision 3), issue 345 (economy automation), issue 1185 and PR 1186 (the GM Downtime preview and the companion seam that merged with it).
**Depends on:** issue 1185's shipped seam, `openspec/specs/ui-integration/spec.md` §Downtime Preview and Premium Extension, `openspec/specs/gathering-and-harvesting/spec.md` §Gathering Party, `openspec/specs/integrations/spec.md` (Specification 008), and the private `fabricate-premium` repository's existing release pipeline.
**Decides for:** issue 613's chunk plan, issue 345's delivery route, the `fabricate-premium` repository's build and gate lanes, the outbound seam's home in `ui-integration`, and the scope statement Specification 008 needs.

---

## The problem, in one sentence

Three live, mutually inconsistent pictures of how Fabricate ships a paid companion are all current at once — issue 613's shared-Svelte-runtime plugin API, the DOM-handoff seam PR 1186 actually merged, and the secret-path S3 release pipeline `fabricate-premium` has been shipping for 120 commits — and no document reconciles them.

Issue 613 is plan-reviewed, detailed and largely unbuilt: it specifies a shared Svelte runtime, a `fabricate.registerPlugins` handshake, a `CraftingSystem.extensions` slot, nine manager consult points and a curated `api.services` surface.
PR 1186 shipped a different coupling model — a bare `HTMLElement` handed to a companion that brings its own Svelte — and shipped it without any of that machinery.
`fabricate-premium` meanwhile already ships `fabricate-mythwright` v0.11.0 against core's public API through a 468-line `bridge.js`, through an S3 feed gated by an unguessable path, with no version check of any kind.
Issue 613 also states in terms that "Core ships no advertisement for premium in v1", and PR 1186 shipped padlocks, a rail callout, a title-bar badge and an "Unlock with Premium" call to action.

The cost of not deciding is not confusion in the abstract.
It is that the first paid release will be built against whichever picture the person doing the work happened to read.

---

## What is already settled, and is not re-argued here

Every row below was read from Foundry's own sources at `resources/app` of a local **14.365.0** install, or measured by a runnable experiment.
**V13 is not installed, and `module.json` declares `compatibility: {minimum: "13", verified: "14"}`** — so every Foundry claim here is pinned to V14.365 and the V13 gaps are listed under *What was NOT established*.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Question | Settled answer | Consequence for this ADR |
|:---|:---|:---|
| Can a companion bundling its own Svelte 5 mount into a core-supplied element? | **Yes.** `mount()` wraps construction in `component_root`, which creates a `ROOT_EFFECT` and — because `(ROOT_EFFECT & EFFECT) === 0` — runs it synchronously with the companion runtime's own `active_effect` set. `effect_orphan` is therefore *structurally unreachable* in an own-root mount, not merely unobserved. Measured on two byte-identical copies of `svelte@5.56.3`. | D4 is decidable without shared-runtime coupling. Issue 613's `svelte-runtime.js` / `svelte-public.js` entry-chunk contract, its exact-version lockstep and its "a Svelte bump is a breaking plugin-API change" policy are all unnecessary for UI hosting. |
| Does an installed protected module keep working when entitlement lapses? | **Yes, indefinitely and offline.** `fromManifestPath` verifies `signature.json` with `crypto.createVerify('SHA256')` against a public key literal in `dist/core/license.mjs`. The verified payload has **two branches**, not one: a package-bearing branch over `(license, key, package, version)` and a package-less branch over `(license, key, version)`, selected on whether the signature carries a package name. No network call, no expiry field, no clock. What lapses is the ability to obtain a *new* signature, which is bound to the manifest version. | Foundry revokes the **feed**, not the **artifact**. Issue 613's phrasing "Foundry performs the revocation" must not be repeated. A corollary neither source drew out, and it holds in **both** payload branches because the licence string is an input to each: **changing the Foundry licence key invalidates every installed protected package at once**. That is a support-load fact and is charged in D2's cost table below. |
| What happens to an *unsigned* protected module? | It is **invisible, not disabled.** `fromManifestPath` returns `null`, so `getPackages()` never constructs it; a `level: "error"` entry lands in `packages.warnings`. Foundry's own Publisher Handbook says the same from the publisher side. | Core's "companion absent" fallback is premium's **most likely production state**, not an edge case. It is already covered by `subscribeSurfaceIds` plus the core Downtime fallback. |
| Are custom module socket events namespaced, and is `senderId` trustworthy? | **Yes to both.** `registerCustomSocket` binds `module.<id>` when that manifest sets `socket: true`, and `handleCustomSocket` appends `this.user.id` — taken from the session, never from the client — as the second callback argument. `{recipients: [...]}` is a real server-side fan-out filter. | The only confidential channel available to a module is a GM-computed, `{recipients}`-targeted emit. Premium should declare its own `socket: true` and own `module.fabricate-premium`; core's `module.fabricate` already multiplexes four payload families through one handler. |
| Is any module-owned storage confidential from a player? | **No.** `World#g` builds the connect payload with `Setting.dump()`, `Actor.dump()`, `ChatMessage.dump()` and friends, and `dump({sort})` in `server-document.mjs` takes **no user argument and applies no ownership filter**. `express.static(paths.data)` serves any non-denylisted file under a module directory **to any HTTP client that can reach the server** — its static handlers are installed ahead of the session middleware that populates `req.user`, so no login is required at all. `gmOnlyFields` is a write guard. | A GM-only Document is not confidential; `ownership: {PLAYER: NONE}` is not confidential; a whispered `ChatMessage` is not confidential; a JSON file in premium's own module folder is not confidential. Note the ordering of severity: a module-directory file is **strictly worse** than the connect payload, which at least requires a world login. D7 has exactly one viable mechanism, and it has costs. |
| Is `--debug` a usable escape hatch for the `protected` dev-and-CI invisibility hazard? | **No, on any shipped build.** `resources/app/main.mjs` is unminified and reads `const isDebug = process.argv.includes("--debug") && fs.existsSync("./server")`, then passes `debug: isDebug` into `init.default(...)`. The shipped 14.365 app root has **no `server/` directory**, so `isDebug` is always `false` and `global.options.debug` can never be true. The guard is unreachable rather than merely unused. Worse, the two halves resolve against different bases — `fs.existsSync` against the process CWD, the `import` against `main.mjs`'s own URL — so launching from a CWD that happens to contain `server/` sets the flag and then crashes the import. | Issue 613's conclusion was right and this record's first revision was wrong to park it as undecided. **It constrains D9-b's T5 directly:** the two-module smoke cannot install the companion with `protected: true` and boot past the signature check with `--debug`; it must install the companion unprotected, or supply a valid `signature.json`. F-K4's mitigation rests entirely on emitting `protected` into the released manifest alone. |
| Is module load order guaranteed? | **No.** All ordinary modules sit at one script priority — 7 for `scripts`, 8 for `esmodules` — and within-bucket order is `Data/modules/` directory-listing order. `relationships.requires` plays no part in ordering, and `testAvailability` carries a Foundry source comment admitting dependencies are not checked at all. | The exposure is *not* "the companion loaded before Fabricate existed": every module's ESM top level runs before `init` fires. It is `init`-callback ordering, which the documented `init`-then-`Hooks.once('ready')` fallback closes airtight, because core's own `ready` listener is registered at ESM-evaluation time. Three caveats travel with it and are recorded in D5. |
| Can a `protected` module declare `relationships.requires` on a free module? | **Nothing in code prevents it.** `protected` and `relationships` are independent schema fields with no cross-validation anywhere in V14.365. Foundry's own module-development article documents the dependency shape and nowhere prohibits it. `fabricate-mythwright` already ships that exact declaration. | If this were disallowed it would be marketplace policy rather than code, and policy could not be verified from any retrieved source. **That gap is now closed: Foundry confirmed by email on 2026-08-16 that a `protected` package may declare `relationships.requires` on a free one.** It is an express permission rather than an absence of prohibition, and it is no longer an open item. |
| Do core's `--fab-*` tokens and cascade layers reach a companion subtree? | **Yes.** All seven theme blocks declare on `:root` as well as `.fabricate`, and `applyFabricateTheme` stamps `documentElement`, so custom properties inherit into any subtree with no `.fabricate` class. `styles[].layer` is a free-form nullable string: `"exceptions"` is declared after `modules` in core's layer statement, and `null` emits a bare `@import`, which outranks the whole layer system. | Theme parity is free, and so is the existing trap — the tokens sit on `:root` unconditionally carrying the dark theme, so a companion surface inside light-themed core chrome reads dark tokens. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## The five constraints this must satisfy

Every decision below maps to at least one of these, and they are the maintainer's, not this record's.

1. **Premium's source never enters the public repository.**
2. **Core stays free, public and OSS-licensed, and behaves identically with no companion installed.**
3. **Premium cannot break the base.**
4. **The two must be testable together — both without a real Foundry and inside one.**
5. **The same agentic workflow and gates apply across the public/private pair.**

Constraint 4 is two constraints wearing one coat, and the verification evidence treats it as two: the no-Foundry tier and the in-Foundry tier fail on different things and are owned by different repositories.
Constraint 5 is the only one that is currently, measurably **unmet** — see *Topology and the shared-workflow gap*.

---

## The eleven decisions this record takes a position on

D11 was a bare maintainer question in this record's first revision and is a numbered decision here, because the canonical gathering specification already answers most of it and one of its arms breaches a stated product invariant.
It is appended rather than inserted, so every other number is unchanged.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| # | Decision | Constraints |
|:---|:---|:---|
| **D1** | Where the premium **code** module lives. | 1, 5 |
| **D2** | Distribution and entitlement — **a channel choice, not an architectural constraint**. | 1 |
| **D3** | The licence boundary, including third parties. | 2 |
| **D4** | The coupling model between the two bundles. | 3 |
| **D5** | Version handshake and compatibility policy. | 3, 4 |
| **D6** | The data-ownership boundary. | 3 |
| **D7** | The player-facing surface and redaction. | 3 |
| **D8** | Fault containment. | 3 |
| **D9** | Verification strategy across two repositories. | 4 |
| **D10** | Shared agentic workflow and gates across a public/private pair. | 5 |
| **D11** | Whether Fabricate has one party aggregate or two. | 2, 3 |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**D2 is in that list because this record opened it, not because the architecture turns on it.**
The maintainer's ruling is that distribution is a **channel choice**: premium can ship direct, through Foundry premium content gated by a Patreon tier, or through the FVTT storefront, and not one of D1 or D3 to D11 changes with the answer.
So D2 is demoted below — the Option S, F and H analysis and the kill criteria stay in full as evidence about the channels, but the record no longer treats an undisclosed fee as a blocker on anything, because there is nothing architectural for it to block.
The channel actually chosen is recorded under *Decision*.

---

## Options considered

The D2 rows compare **distribution channels**, not architectural arms, per the demotion noted above; every other row is an arm of a decision this record takes.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Decision | Arm | Shape |
|:---|:---|:---|
| D1 | **D1-a** monorepo, one lane | `packages/fabricate-downtime` inside the existing private monorepo, sharing its CI lane. That repo already has npm workspaces, a generated-manifest pipeline and `packages/fabricate-bridge` as a shared runtime esmodule — but **no bundler at all**, so a Svelte module is the first artefact there needing a real build. |
| D1 | **D1-b** third repository | A separate, code-only private repo. Clean separation, at the price of a third set of CI, release plumbing and agent configuration to keep in step, and it severs the code module from the content it ships beside. |
| D1 | **D1-c** monorepo, own lane | Code stays in the monorepo but gets its own build and gate lane, so the content pipeline (1,490 tracked files, ~93% content, 51 `.js` files) is not slowed by a Svelte toolchain it never uses. |
| D2 | **Option S** secret-path S3 | What ships today. Tester feeds at `testers/<group>/<SECRET_SEGMENT>/<slug>/module.json`, anonymous-readable if you know the path, no signed URLs, no expiry, no per-request auth. Publishing refuses to run if the secret is unset rather than falling back to a guessable path, and `assertSelfContained()` guards a failure mode that once killed a closed beta. Rotation is manual, cohort-wide, and revokes nothing. |
| D2 | **Option F** Foundry premium content | `protected: true`, manifest served by Foundry, no `download` field, Patreon-tier entitlement linked to a Foundry account. Per-user granularity, feed-level withdrawal, in-client onboarding. Costs a per-activation and per-Patreon-usage fee, invoiced quarterly in arrears, **amount undisclosed**. |
| D2 | **Option H** hybrid | The code module through Foundry protected content; the four pure-data content modules through DriveThruRPG / Itch.io / Patreon storefronts. Foundry's Publisher Handbook explicitly sanctions mixing platforms, and premium's own `tools/src/storefront.js` already refuses `kind: "crafting"` modules — the split is one the repository implements today. |
| D3 | **D3-a** status quo | Two `LICENSE` files naming two different copyright holders, and premium's clause 3 describing the core author in third-party terms. Nothing in either repository states they are the same person. |
| D3 | **D3-b** recorded self-grant | An explicit, perpetual, irrevocable self-grant recorded in this ADR; the two copyright lines normalised to one legal name; premium clause 3 rewritten; a CLA or DCO adopted before the first outside PR to core. |
| D3 | **D3-c** relicense core permissively | Removes the question entirely and removes the commercial gate with it. Not seriously in contention; recorded so the option set is complete. |
| D4 | **D4-a** shared Svelte runtime | Issue 613 §4. Core emits unhashed `svelte-runtime.js` and `svelte-public.js`; premium externalises every `svelte` and `svelte/internal/*` specifier and rewrites to `../fabricate/svelte-*.js`; exact-version lockstep; a Svelte bump becomes a breaking plugin-API change with a coordinated release-ordering plan. |
| D4 | **D4-b** DOM handoff | What PR 1186 merged. Core hands a companion a bare, connected, empty `HTMLElement` plus a frozen context; the companion mounts whatever it likes with its own runtime and returns one synchronous cleanup function. |
| D4 | **D4-c** isolation boundary | An iframe or worker. Would genuinely sandbox a companion, and would discard DOM co-tenancy, the inherited `--fab-*` cascade and synchronous cleanup ordering — the three properties the seam is built on. |
| D5 | **D5-a** status quo | `apiVersion: 1` on the provider, a thrown `TypeError` on mismatch, no core-version constant on `game.fabricate.api`, no published compatibility range, and a shipping consumer with no version check at all. |
| D5 | **D5-b** narrow and promise | Publish a core-version constant and a `supports(range)` predicate; degrade rather than throw; narrow the internal-object surface to a named, test-pinned contract with a deprecation policy; premium guards on `game.modules.get('fabricate').version` and refuses with a user-facing notification outside its range. |
| D5 | **D5-c** full plugin contract | Issue 613 §3's SemVer plugin-contract version with a five-guard registrar, an `init`-scoped registration window and a namespaced view-id vocabulary. |
| D6 | **D6-a** core-hosted slice | `CraftingSystem.extensions[pluginId] = {schemaVersion, authoring}`, preserved unconditionally through every read, write, reload, migration, export and import, written only through a plugin-scoped update API that validates JSON-serializability at the write boundary. |
| D6 | **D6-b** premium owns everything | Premium stores its own data in its own world settings and its own namespace. Core stores nothing on premium's behalf and gains no schema slot. |
| D6 | **D6-c** deferred slice | D6-b for the first release, with D6-a built when — and only when — a premium slice must travel inside a crafting-system export. |
| D7 | **D7-a** client-side filtering | Hidden state in a world setting, a GM-only Document or a whisper, redacted in the player's own client. |
| D7 | **D7-b** GM-computed relay | The GM client computes the redacted view and emits it with `{recipients: [playerUserId]}`, which the server enforces as a real fan-out filter. |
| D7 | **D7-c** request/response | The player emits a request to the GM; the GM authorises on the server-attested `senderId` and replies with `{recipients: [senderId]}`. |
| D7 | **D7-d** no player surface in v1 | Ship the GM Downtime Studio only, and defer Player Downtime until D7-b or D7-c is built and gated. |
| D8 | **D8-a** trusted same-realm code | Accept that the companion runs in core's realm; contain what goes wrong inside the call core makes; document the rest as companion obligations. |
| D8 | **D8-b** attempt isolation | Try to contain what happens outside the call — DOM escape, leaked listeners, prototype pollution, i18n and CSS collisions — from inside core. |
| D9 | **D9-a** core-only tiers | Keep everything in core's existing tiers and accept that no test ever sees two real modules together. |
| D9 | **D9-b** six tiers, three gates — two owned by core, one owned by premium and not yet built | The five tiers that exist plus the real-Foundry two-module smoke that does not. Core owns two gates: **in-call** fault containment in the mounted tier, and loadability across the init-to-ready lifecycle in the composition tier. Premium owns the third — the real-Foundry **player-client** assertion that gates redaction, which no core tier can ever run. Core publishes a contract factory; premium consumes it by pinned git tag, and — because a pinned tag only ever validates the core version premium chose — a core-release dispatch plus a premium-side version matrix are needed for it to detect a break before a user does. |
| D10 | **D10-a** copy with attribution | The de facto status quo: `scripts/lib/zip.js` in the public repo is a documented port *from* premium's `tools/src/package-zip.js`, so copying already runs in both directions. |
| D10 | **D10-b** adopt the role system | Premium adds `AGENTS.md`, `.agents/skills/` and both provider binding directories. `npm run validate:agents` is pure Node with no dependencies, no Docker and no network, and it *derives* the role list from the bindings table rather than hard-coding it, so it works unmodified in a second repository. |
| D10 | **D10-c** shared npm package | Publish the shared harness from core and depend on it from premium. |
| D11 | **D11-a** one aggregate, premium projection | Core's `GatheringParty` stays the single Fabricate party record — identity, `name`, `enabled`, `memberActorUuids`, `travelActorUuid` and the composite uniqueness invariant, all owned by `GatheringPartyStore` behind `fabricate.gatheringParties`. Premium stores a **downtime projection** in its own namespace, keyed by `party.id`: icon, tint, map-marker preference, per-activity assignment. Premium reads and writes membership through the already-published `getGatheringPartyStore()` seam. |
| D11 | **D11-b** two aggregates | The GM Downtime brief's own `Party` record, with its own membership, its own `marker: markerId \| null` and its own `party: true` actor-flag fallback, standing beside `GatheringParty`. |
| D11 | **D11-c** core-hosted party slice | Core grows an authoring slot on the party record for premium's projection, so one aggregate carries both halves in one document. Drags in D6-a's whole persistence programme. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## Kill criteria, stated before the evidence

An arm with no losing condition is a preference wearing a decision's clothes.
Two of the criteria below could not be evaluated at all, and that is recorded rather than resolved by guessing.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Arm | Would have been killed by | Fired? |
|:---|:---|:---|
| **D1-a** | A Svelte and Vite toolchain measurably slowing or destabilising a content pipeline whose CI is today `validate` + `node --test` + `audit:cr` + `build`. | **Cannot fire yet.** No such build exists to measure. It is the reason D1-c exists, and it is one of the two places this record refuses to separate two options. |
| **D1-b** | Needing a third set of CI, release plumbing and agent configuration to buy separation a lane split already delivers. | **FIRED.** npm workspaces, the generated-manifest pipeline, the S3 release flow and a shared esmodule package all already exist in the monorepo; only a build is missing, and a lane supplies it. |
| **Option S** | S-K1 the first paid, non-tester cohort; S-K2 a cohort above roughly 50 people; S-K3 a confirmed leak; S-K4 a recurring-revenue product. | **S-K1 fires the moment premium is sold to a non-tester cohort; S-K4 fires in addition only if that product is recurring-revenue rather than a one-off purchase** — a single DriveThruRPG or Itch folio sale is a sale and is not recurring revenue, which is the same distinction Option H draws between the code module and the content modules. Neither has fired *yet*: all five modules in `release.config.json` are `channel: "beta"` in one unpaid `closed-beta-2026` tester group. A bearer URL with no expiry is defensible for unpaid testers and is not defensible once money changes hands, because the first churned subscriber keeps the product permanently and the only remedy defects every innocent member of the cohort. |
| **Option F** | F-K1 a fee above roughly 15% of expected net per unit at realistic volumes; F-K2 an Agreement term incompatible with continued storefront distribution; F-K3 a first approval longer than the launch window; F-K4 the dev and CI invisibility hazard proving unfixable. | **F-K1, F-K2 and F-K3 are NOT EVALUABLE** — the fee, the Agreement and the review SLA are all undisclosed. **F-K4 does not fire, conditional on a task being carried:** premium's manifests are *generated* rather than committed, so `protected` can be emitted into the released manifest alone — provided premium's CI carries a check that **fails** if a dev or smoke artifact carries `protected: true`. The capability is not the control; the check is. `--debug` is no fallback: it is unreachable on any shipped build, per the settled table. |
| **D3-a** | Two `LICENSE` files being readable by a future maintainer, an acquirer or a diligence lawyer as naming two different rights-holders. | **FIRED on its own text.** Core's `LICENSE` says `Copyright (c) 2026 MisterSilver`; premium's says `Copyright (c) 2026 MisterPotts`; premium clause 3 says content is "included under agreement with MisterSilver". Nothing in either repository states they are one person. |
| **D4-a** | Any cheaper coupling delivering UI hosting without version lockstep. | **FIRED.** D4-b delivers hosting with no shared entry chunks, no exact-version pin and no "a Svelte bump is breaking" release policy — measured, not argued. |
| **D4-b** | `effect_orphan` firing on an own-root mount, cross-runtime event double-firing, or a leak with no available cleanup path. | **Did not fire, and the near miss is why cleanup is load-bearing.** `effect_orphan` is structurally unreachable and delegation is isolated by a module-scoped `Symbol('events')` — measured, exactly one handler entry per click on each side. A cleanup path exists and PR 1186 calls it on four routes, so the criterion's *no available cleanup path* is not met. What was measured is the consequence of skipping it: the companion then **leaks a `document` listener and keeps its effects running on a detached tree**. |
| **D4-c** | Needing DOM co-tenancy, an inherited CSS cascade and synchronous cleanup ordering. | **FIRED by the design it would replace.** All three are properties the seam relies on: core hands a bare connected element, `--fab-*` reach it by inheritance, and cleanup ordering is deterministic only because `mount` is synchronous. |
| **D5-a** | A shipping consumer being able to break silently on a core change with no error surface. | **FIRED, and it already shipped.** `bridge.js` calls four core getters with no version check of any kind and latches on the one-shot `fabricate.ready` hook, so any load order in which core reaches `ready` first leaves it permanently inert with no message. |
| **D6-a** | Requiring changes to core's read, write, normalize, import and export paths before premium can ship anything at all. | **FIRED for a first release.** `_normalizeSystem`'s terminal allowlist runs on every read and every write, `updateSystem` shallow-spreads at the top level, the compendium importer's overwrite path replaces `extensions` wholesale, and the admin store's phase-2 publish carries `extensions` across by reference. Each is a real defect for D6-a and none of them exists at all under D6-b. |
| **D7-a** | The server delivering the source to the player regardless of ownership. | **FIRED, from server source.** `dump({sort})` takes no user argument and applies no ownership filter, so every world setting, Document and whispered message is already on the player's machine. |
| **D7-b** | No server-enforced fan-out filter, or a forgeable sender identity. | **Did not fire.** `handleCustomSocket` emits only to the named users' sockets, and `senderId` is the server's own `socket.user.id`. Its four costs are real and are charged in D7 below. |
| **D8-b** | `Object.freeze` being shallow and same-realm, so a hostile companion escapes regardless. | **FIRED.** The executed probe polluted `Object.prototype` through the frozen mount context's prototype, and a node appended to `document.body` plus a class added to `<body>` both survived unregistration and cleanup. Core only calls `target.replaceChildren()`. |
| **D9-a** | A constraint that cannot fail in **any** core-owned tier. | **FIRED, from the tier map rather than from a mutation.** Redaction, two-module load order, the `lang/en.json` merge, and the settings, socket and CSS namespace collisions can fail in no tier core owns; T5 is the only tier they could fail in and it does not exist. The criterion is stated this way deliberately: the earlier wording — "a tier that cannot fail on the thing it is cited for" — is a property of a **tier**, and T3 survives into D9-b unchanged, so it did not discriminate the arms. |
| **D10-c** | Core being unpublishable. | **FIRED.** `package.json` is `"private": true` with no `files`, no `exports`, no `main` and no publish step anywhere; publishing core to npm to serve one private consumer is a large permanent obligation for a Foundry module. |
| **D11-b** | An actor being able to sit in an *enabled* party in each module, so Fabricate gives two answers to "which party is this character in". | **FIRED, from a shipped canonical invariant rather than from taste.** `gathering-and-harvesting/spec.md` §Gathering Party requirement 5 states a composite uniqueness invariant: an actor may be associated with at most one *enabled* party in total, as a member, as the travel actor, or both, so that a selected actor's current-realm resolution is unambiguous. A second GM-authored aggregate cannot see that invariant and cannot be bound by it. The rail collision below is the same breach in the UI. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## D4 is nearly free, and the cost is somewhere else

This is the central finding, and everything after it is downstream of it.

The DOM handoff was settled by a **runnable experiment**, not by reading.
Two byte-identical copies of `svelte@5.56.3` were installed side by side, components were compiled with the 5.56.3 compiler and import-rewritten to their respective runtime, and both were driven under happy-dom 20.10.4 with `node --conditions=browser`.
The two runtimes were confirmed distinct (`A.mount === B.mount` is `false`, and their `event_symbol` values differ), the companion mounted into a core-supplied connected target without throwing, and its own reactivity worked.

It carries **three measured costs**, and presenting the handoff as free would misrepresent it.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Cost | What was measured | Why it matters |
|:---|:---|:---|
| `getContext` does not cross the boundary | `hasContext('core-key')` is `false` and `getContext` is `undefined` from the companion side, because each runtime's `component_context` chain is its own. | The explicit alternative — `mount(C, {context: new Map([...]) })` — works identically under both D4-a and D4-b, so this costs a line of code, not a design. |
| A core `$state` proxy is readable but **untrackable** | The companion's effect never re-ran on a core mutation, then read the *new* value the next time it ran for its own reason. | This is the dangerous one, because nothing errors. Silent staleness looks like a data bug, not a boundary bug. |
| A skipped cleanup leaks | With no cleanup call the companion kept its effects running on a detached tree and its `document` listener was never removed. | This is why PR 1186's four independent cleanup paths — tab switch, route exit, app-shell unmount and the `onDestroy` safety net — are load-bearing rather than defensive tidiness. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The seam's ordering is deliberate and was measured against its reverse: `disposeActiveMount` in `WorldDowntimeExtensionHost.svelte` calls the companion's cleanup inside a `try` and clears the target in the `finally`, so the companion tears down before core removes anything.
`unmount()` is order-tolerant, so the reverse order does not throw — but omitting it entirely leaks, so calling it is both sufficient and necessary.

**And now the point.**
Every capability the premium prototypes actually demand is behavioural, and none of it has a contract.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Demand, from the premium design briefs | What core offers today |
|:---|:---|
| Autocomplete requirement and reward names from the component, tool, currency and recipe catalogs. | Whole internal service objects, reachable and unversioned. Component ids are **not globally unique** — copy-import preserves them — so a companion keying its records on a bare component id breaks on import. |
| `rtype: 'craft'` rewards with `craftMode: 'instant' \| 'advance'`, plus `rtype: 'knowledge'` grants. | `getCraftingEngine()`, `getCraftingRunManager()` and `getRecipeVisibilityService()` are handed out wholesale, so this is *reachable*. But `craft()` is owner-scoped and returns `{success, message}` with no GM relay, so a GM-run economy tick cannot craft for a player-owned actor through that path however reachable it is. |
| Automated checks — `1d20 + @skills.arc.total` against character data, with "rolls are automated, not GM-entered". | Nothing check-shaped is public except `getGatheringGateAndCheckEvaluator()`, which is scoped to gathering gates. A second implementation meets every known roll trap: `Roll.validate` is parse-only, a detached `Roll.validate` reference is false for every formula, and a dismissed `RollResolver` silently digital-rolls. |
| Daily world-time ticks that bank output, drain upkeep and re-check gates. | `processFabricateWorldTime` holds a **literal array of processors inside the function body**. There is no registration point, and `updateWorldTime` is a *synced* hook, so an ungated companion tick runs on every client. This is the single most likely source of a companion bug that looks like a core bug. |
| Currency-denominated rewards, treasury, wages and prices. | `currencyProfile.js` and `currencyAffordance.js` are not exported, and the underlying shapes differ per system — dnd5e is a plain integer, pf2e coins are treasure Items. Reimplementing this guarantees divergence on the axis a player notices first. |
| A player-facing surface where "hidden tiers must not reach the client". | Nothing, and not merely no *service*: the shipped seam is GM-only, so there is **no player-side host either**. See D7 — and note that **no core-owned test tier can ever gate the redaction**, because core hands premium a bare `HTMLElement` and cannot see what is rendered into it. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

So D4 is close to free and the real cost sits in the service surface that has to carry those six rows.
A staging consequence follows directly: if the whole service surface must land before anything ships, the first premium release is gated on the largest piece of core work in the programme.
The question worth answering instead is which subset unblocks the GM Downtime Studio alone, and whether a first release can be UI-plus-own-storage with no core service dependency at all.

---

## The API is internal objects, not a contract

`docs/api/index.md` publishes `getCraftingEngine()`, `getCraftingRunManager()`, `getRecipeVisibilityService()`, `getRecipeManager()`, `getCraftingSystemManager()`, `getGatheringRunManager()`, `getGatheringGateAndCheckEvaluator()` and `getGatheringRichStateService()` — the last of which its own documentation describes as "Gathering rich-state **internals**".

Every method on those objects becomes de facto public the moment premium calls it, with no version marker, no deprecation policy and no test pinning the returned shape.
`tests/fabricate-api-surface.test.js` pins that the *getters* exist, by matching literal strings in `src/main.js`; it pins nothing about what they return.

**This reframes D5 and D6 completely.**
The question is not "what API should core build that premium currently lacks".
It is "which of the already-reachable internals become a supported contract, and which must premium stop touching" — a narrowing exercise with a compatibility promise attached, which is strictly harder to retrofit once a paid product depends on it.
Under D11-a the narrowing list acquires one entry that is not optional: `getGatheringPartyStore()`, and its `getPartyStore` alias on the `game.fabricate.gathering` facade, becomes the seam through which a paid product reaches a core domain aggregate.

One defect shows the cost of no contract, and its history is the point.
`game.fabricate.exportSystem()` passed three arguments to `buildExportPayload` where the UI path passed five, so the public export path silently dropped the whole gathering authoring bundle while the import path read it — the two were not inverses, and nothing detected that.
It was found by the issue-613 research rather than by a test, filed as issue 642, and **has since been fixed**: both call sites now pass all five, and the guard is a source comment naming the issue.
Verified on this record's own base rather than inherited from the July research, because D6-a makes the export path load-bearing and a stale "still broken" claim here would misdirect the first implementer.
What the episode establishes is not a live bug but the failure mode: two call sites of one internal function drifted apart across a published API boundary, silently, and only a line-by-line read caught it.

**Selecting D5-b amends a canonical specification, and that must not be discovered during implementation.**
`openspec/specs/ui-integration/spec.md` requires that "a conflicting provider on the same surface, **an unsupported version**, an empty or duplicated tab set, malformed chrome or action, or an asynchronous mount **fails with a deterministic error**".
D5-b's "degrade rather than throw" contradicts that clause directly for the unsupported-version case.
It is a defensible amendment — a deterministic error is the right answer for a malformed provider and the wrong one for a merely old companion — but it is a specification change with its own delta, not a code tweak, and it is recorded under *Consequences* as such.

### Companion Identity is a concept core does not have

`src/ui/managerExtensions.js` builds the frozen mount context with `surfaceId: provider.id`.
The provider id **is** the surface id, so core never learns which Foundry module registered — only which Manager route was claimed.

Five decisions in this record presuppose an identity the shipped seam does not model.
D6-a is written against `extensions[pluginId]`, a key space that does not exist anywhere in core.
D5-b's compatibility promise implies core knows who it is promising to.
D8-a's "companion obligations" attach to a nameable party.
D9-b's fixture-identity gap is the same concept in the test tier — the fixture is an object literal in the same file, so it has no module identity to be wrong about.
And D3's third-party position states that "the API cannot detect or block a paid caller", which is a statement about missing identity.

Name it once, so the five stop inventing it separately: **Companion Identity — the Foundry module id a registrant declares, distinct from the surface id it claims.**
Introducing it is a small, additive change to the registrar, and it is a precondition for two things this record wants elsewhere: keying the title-bar premium badge on a *known* companion rather than on any registrant at all, and attaching a compatibility promise to a named consumer.
If it is introduced it needs a `DOMAIN.md` glossary row beside the existing **Manager Navigation Surface / Provider Seam** row, which today defines surface and provider and is silent on who the provider is.

### There is already a shipping consumer, and it has no version check

`fabricate-premium/packages/fabricate-bridge/src/bridge.js` is a 468-line single-file esmodule, copied into each crafting module at build time and declared as that module's `esmodules` entry.
It ships today in `fabricate-mythwright` v0.11.0 — the only premium module declaring `relationships.requires` on `fabricate`.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| What it calls | Guard |
|:---|:---|
| `Hooks.on('fabricate.ready', …)` | none |
| `game.fabricate?.importFromPack(…)` | optional chaining plus one `typeof … !== 'function'` test |
| `game.fabricate.getGatheringRealmStore?.()` | optional call |
| `game.fabricate.getGatheringEnvironmentStore?.()` | optional call |
| `game.fabricate.getGatheringPartyStore?.()` | optional call |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The whole compatibility strategy is ad-hoc optional chaining, and the failure mode is a `ui.notifications.warn`.

**Worse, core now has two opposite timing contracts for companions and only one is written down as an exception.**
`src/main.js` carries a comment beside `whenReady()` naming the exact hazard — `fabricate.ready` is one-shot, and "a late manager launch can never latch on a spent event" — which is why the replay-safe `whenReady()` promise exists.
`docs/api/index.md` teaches the one-shot hook in **eleven** worked examples and never mentions `whenReady()` at all.
Meanwhile `registerWorldNavProvider` is deliberately exempted from the readiness rule and documented as such, because its registry lives in a module-scope closure and survives the init-to-ready rebind.
So the documented entry point is the unsafe one, the safe one is undocumented, and the one shipping consumer uses the documented unsafe one.

Four caveats attach to the `init`-then-`ready` fallback and belong in any published load contract:

1. `Hooks.once` deregisters **before** invocation, so a fallback that throws has already burned its one shot and will not be retried.
2. `Hooks.callAll` iterates a snapshot, so arming `ready` from inside `ready` never fires; arming it from `init` is fine.
3. If `fabricate` is merely **disabled** while the companion is enabled, `relationships.requires` does not stop the companion loading, and its fallback returns quietly with no user-visible message.
4. The fallback must be armed **from inside `init`**, never at ESM top level.
The settled table's "closes airtight" claim rests on core's own `ready` listener being registered at ESM-evaluation time, which is necessary but not sufficient: it also requires the companion's `ready` listener to be registered *later*, and that holds only because the documented pattern arms it from within `init`.
A companion writing the more natural top-level `Hooks.once('ready', …)`, from a module directory sorting before `fabricate`, registers **before** core does and therefore runs before `bindFabricateGlobal()`.
That is reachable rather than theoretical, because D3 opens the seam to third parties and nothing stops one being named `aaa-companion`.

### The cross-repo contract suite cannot trust its exit code

This is a D5 decision, not a testing footnote, because the failure mode it produces is exactly the one a contract suite exists to catch: core changed, and premium's fixture builder now throws.

Measured on Node v22.22.2: a `describe`-body throw reports `# tests 0 # suites 1 # pass 0 # fail 0` and **exit code 0**.
In the multi-file shape CI actually uses — one throwing file beside one healthy file — it reports `# tests 1 # pass 1 # fail 0`, exit 0.
A fully green run that executed nothing.

**Any core-published contract suite that premium's CI runs must assert `grep -c '^not ok'` and an expected test count.**
Trusting the exit code is not a viable design, and the same applies to any scoped run: a typo'd `--test-name-pattern` reports `# tests 1 # pass 1` with exit 0, because the "1" is the `describe` wrapper.

### And a contract pinned by git tag cannot detect the break it exists to detect

"Core publishes a contract factory; premium consumes it by pinned git tag" validates premium against the core version **premium chose**, which by construction is not the version a user runs.
Foundry updates modules independently, and this record relies on that independence elsewhere — it is why D5 needs a version handshake at all.
So as stated, a core release that breaks premium is discovered by a user, not by CI.

Two halves close it, and only one of them costs anything.

The premium-side half is a **core-release dispatch into premium's CI** plus a premium-side matrix over core's latest, previous and `main`.
That is the half with an owner problem, and D9 under *Decision* answers it by deferral: the immediate plan is a manually tested local build, so the dispatch and the matrix arrive with the automated two-module tier rather than before it, and until then the residual below is the live position.

The core-side half is nearly free and should be taken regardless.
The mounted tier already deep-equals `Object.keys(context).sort()` against the nine context key names it expects; **pin that assertion to `schemaVersion`**, so adding, removing or renaming a context key forces a `schemaVersion` bump in the same commit.
A silent context-key break becomes a deliberate one.

If the maintainer would rather not own the dispatch, the residual is recorded rather than hidden: **first notice of a core-side break is a user report.**

---

## D11: one party aggregate, or two

This record's first revision carried "one `Party` aggregate or two?" as a bare maintainer question with no options row, no kill criterion and no recommendation, and priced two aggregates as "a duplication a GM will resent".
That was wrong on the facts.
The canonical gathering specification has already decided most of this, and it decided it in premium's favour.

**What the shipped canonical spec already says.**
`openspec/specs/gathering-and-harvesting/spec.md` §Gathering Party is not a gathering-local record dressed up as a party.

- Requirement 1 makes parties **world-level** Fabricate records in `fabricate.gatheringParties`, explicitly because the same party interacts with multiple crafting systems; only `currentRealmOverrides` is keyed by `systemId`.
- Requirement 4 states in terms that a party need not stand on a map at all: enabling does not require a travel actor, a party without one senses no scene regions and resolves to `unresolved`, and **"a downtime party that never stands on a map is therefore a supported configuration rather than a rejected one"**.
  Realm gating is opted **into** by assigning a travel actor.
  So a pure downtime party is already an instance of the core aggregate, not a new kind of thing.
- Requirement 5 states the **composite uniqueness invariant** that kills D11-b, quoted in the kill-criteria table above.
- Requirement 3 makes `travelActorUuid` an **Actor** document UUID and says so twice over — "not a placed Token UUID or prototype-token reference".
  The GM Downtime brief's `marker: markerId | null` linking a party to a map token is a second, colliding answer to "where is this party", and the core answer is the one that silently governs `NO_CURRENT_REALM` location blocking.
- Requirement 7 says membership is actor-based and **"must not depend on a game-system-supplied party/group actor type"**.
  Core deliberately refused exactly the brief's "every character flagged `party: true`" fallback, so adopting it in premium re-imports a rejected design.

**And there is a shipped navigation collision the first revision missed.**
`openspec/specs/ui-integration/spec.md` puts both `Parties` and `Downtime` in the GM Manager's permanent World navigation, and makes the rail's Downtime children render the active provider's tabs.
The GM Downtime brief's five tabs include Parties.
So the moment a real provider registers, one rail shows **World > Parties** and **World > Downtime > Parties** side by side, from two modules, over the same actors.
That is not a copy problem; it is two aggregates surfacing at once.

**D11-a is recommended, and the reason it is cheap is that it needs no new core work at all.**
`game.fabricate.getGatheringPartyStore()` is already published and already documented in `docs/api/index.md`, with a shorter `getPartyStore` alias on the `game.fabricate.gathering` facade, and premium's shipping `bridge.js` **already calls it**.
Premium therefore reads and writes party identity, membership and travel actor through a seam that exists today, and stores only its own downtime projection — icon, tint, marker preference, per-activity assignment — in its own namespace keyed by `party.id`.
Nothing in D6-a is required, and D11-c is the arm that would drag it in.

Two consequences follow and are charged elsewhere in this record.
`getGatheringPartyStore()` and its `getPartyStore` alias join the **D5 narrowing list as a load-bearing contract** rather than sitting there as an incidental getter, because under D11-a a paid product's core domain object is reached through them.
And the aggregate's `Gathering` prefix now misleads: it is world-level, cross-system and already hosts downtime parties, and it is the prefix that makes "two aggregates" look reasonable in the first place.
A rename is recorded under *Ubiquitous language* as a cheap follow-up, not a blocker.

---

## D6-b is the cheap arm, not the free one

**This section's conclusion has since been superseded by the maintainer's selection of D6-a and is deliberately left unedited.**
Its analysis is not superseded: the dangling-reference, durable-identity and independent-migration costs below all still apply to whatever premium keeps **outside** the core-hosted slice, which is most of its data.
What no longer holds is the framing — that a first release pays none of D6-a's costs — and the reasoning for that is under *Decision*.

The kill-criteria table prices D6-**a**'s defects — the terminal allowlist, the shallow spread, the wholesale importer replace, the phase-2 reference carry — and every one of them is real.
But pricing only one arm's defects is how a record talks itself into an arm.
D6-b has its own defect class and it is not zero.

**Dangling cross-boundary references.**
Under D6-b premium's records reference core components, recipes, currencies and gathering tasks, and **core cannot enumerate premium's references**.
`openspec/specs/ui-integration/spec.md` requires a destructive delete to route through a confirm dialog carrying **referenced-by evidence**, and `openspec/specs/destructive-changes-and-migrations/spec.md` states the principle that nothing is left dangling.
Neither can see across the boundary.
So deleting a component in the free module can silently break paid content, and the GM gets a confirmation whose reference count is honest about core and blind about premium.

**This record accepts that for the first release, and says so rather than leaving it to be discovered.**
The alternative — a reference-declaration seam through which a companion registers what it points at, so core's referenced-by computation can consult it — is real core work of exactly the kind D6-c exists to defer, and it is not on the D5 narrowing list for that reason.
The accepted consequence is that cross-boundary references dangle silently, and the companion obligation that follows is that **premium must re-validate its own core references on load and degrade visibly**, because nothing on core's side will warn anyone.

**Identity.**
Component ids are **not globally unique** — copy-import preserves them — which this record states in the payload table and which is a constraint on D6, not a piece of trivia.
Under D6-b premium **must** key its records on durable identity: system-scoped, or the per-system roles map, never a bare component id.
A premium record keyed on a bare id survives a copy-import and then points at the wrong component.

**Migration.**
D6-c names one trigger for revisiting: a premium slice needing to travel inside a crafting-system export.
There is a second.
Core schema migrations run under `fabricate.migrationVersion`, and premium data keyed to core ids **cannot ride core's migration counter** — it has no entry in core's registry and core's pass will not touch it.
Premium needs its own migration line, versioned independently, and it needs it from the first release rather than the first breaking change.

---

## Distribution and entitlement

**Read this section as an assessment of channels, not as a decision the architecture rests on.**
D2 is demoted: distribution is a channel choice, so nothing in D1 or D3 to D11 moves with the answer and the undisclosed fee blocks nothing.
The analysis is kept in full because it is the evidence a channel was chosen against, and because the operational facts in it — feed-level rather than artifact-level withdrawal, the licence-key invalidation hazard, the approval gate — remain true whichever channel is used.
The channel actually chosen, and the two kill criteria the maintainer's answers have since resolved, are recorded under *Decision*.

The billing *shape* is a **fee, not a revenue share**, and half of that shape is known.
Foundry's Publisher Handbook says: "You will be billed at the end of each calendar quarter for the number of Content Keys which were activated and the amount of Patreon subscription usage during that time period", invoiced from Stripe and due within 30 days.

**The key-activation half is count-based and that is established from the quoted sentence.**
The **Patreon half is not.**
"The amount of Patreon subscription usage" is undefined in every retrieved source, and it may be metered on subscription **revenue** rather than on a count of entitled accounts.
That matters more than it looks, because under the recommended hybrid the code module is Patreon-entitled, so **the Patreon half is the half that actually bills**.
The downstream claim — that unit economics scale with **activation count**, so a cheap high-volume product is worse under this model than a percentage cut while an expensive low-volume product is better — therefore holds firmly for content keys and rests on an undisclosed basis for the Patreon line.
How that phrase is metered is added to the Foundry email list and to *What was NOT established*.

**Money flowing through Patreon does not avoid the fee.**
The handbook's billing sentence meters Patreon usage explicitly, so Option F's cost stack is Patreon's platform fee, plus Patreon's payment processing, plus Foundry's premium-content fee.

**It is also a cash-flow liability.**
You may owe Foundry for activations up to a quarter earlier, and **whether a subsequent refund or chargeback is credited against a billed activation is not disclosed** in any retrieved source.
Which refund regime applies is a per-product-line fact, not a single answer: a Foundry premium-content *purchase* falls under Foundry's own policy, which allows a refund within 30 days if the content has not been installed, whereas under Patreon-tier entitlement there is no Foundry purchase to refund and handling collapses to Patreon's policy.
Under the recommended hybrid the code module sits in the second regime and the storefront content modules sit in neither — they are governed by DriveThruRPG's and Itch.io's own terms.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Property | Option S (shipped) | Option F |
|:---|:---|:---|
| Platform fee | Zero | Per-activated-key and per-Patreon-usage, quarterly in arrears, **amount undisclosed** |
| Withdrawal | None. Cohort-wide manual S3 deletion, which defects every current patron | Feed-level and per-user. **Not** retroactive: the installed copy keeps working indefinitely and offline |
| Per-user granularity | None — one bearer URL per cohort | Per-account entitlement; content keys are single-use and permanently bound once redeemed |
| Leak blast radius | The whole cohort, permanently, until manual deletion | One account |
| Onboarding | Manual URL distribution, or a manual zip install with auto-update disabled | In-client, through the Setup screen's Subscribed Content |
| Approval gate | None | One-off first approval, **no published SLA** |
| Terms | Fully self-owned | Bound to a Premium Content Agreement nobody has read |
| Infrastructure you run | An S3 bucket, its policy, secret rotation and CI redaction | None |
| Support load from the entitlement mechanism itself | Rotation is cohort-wide, so every rotation is a support event for every current patron | **Changing the Foundry licence key invalidates every installed protected package at once**, because the licence string is an input to the signed payload in both of its branches. It is silent — the module becomes invisible rather than erroring — and a customer who re-keys their server for unrelated reasons will report it as your bug |
| Source-repository requirements | None | **None found.** Foundry's process ingests a built artifact through its Upload Tool, and no retrieved document mentions source-repository visibility, so a private repository is no obstacle to Option F and constraint 1 is untouched. This is an absence-of-evidence inference and is cheap to confirm in the same email as the fee |
| Maturity | Working today, 120 commits, hardened after a real past outage | Never implemented |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Precedent points one way.**
Across every free-plus-paid Foundry case found — JB2A, theripper93, Companion Bridge, Baileywiki, The MAD Cartographer — the dominant entitlement mechanism is Patreon-tier linking to a Foundry account, which is Option F.
**No precedent was found for the unguessable-URL model being used for a *paid* audience**; where creators distribute outside Foundry they use named storefronts with keys or account-bound downloads.
The load-bearing case is JB2A, because it matches Fabricate's structure most closely: a free half under a **noncommercial** licence, listed on the official package list, and a paid half sold by the same authors through Patreon.

Option H is defensible rather than a fudge, for four reasons.
Foundry's handbook explicitly sanctions mixing DriveThruRPG, Itch.io, Patreon and personal webstores simultaneously — **on the Handbook's wording; the Premium Content Agreement was not obtained**, and the Handbook is publisher-facing marketing copy while the Agreement is the instrument that binds.
Premium's own `tools/src/storefront.js` already draws exactly this line in code, accepting `kind: "content"` and refusing crafting modules.
The properties match the risk: the code module has ongoing update value so feed-level withdrawal actually bites, while content modules are one-shot data purchases where "keep what you bought" is the correct customer expectation.
And it de-risks Option F by learning Foundry's process, fee and approval timing on **one** module before committing five.

Its honest costs are two distribution paths to maintain and document, two support surfaces for a customer who buys from both, and a real compatibility burden between a Foundry-updated code module and a manually-updated content module.

**And one of its four pillars rests on the unread Agreement, which makes F-K2 bite Option H harder than Option F.**
Option F signs the Agreement and distributes one module through Foundry.
Option H signs the same Agreement *while continuing* to distribute four content modules through DriveThruRPG and Itch.io — so an exclusivity, pricing-control or content-approval term would break the hybrid specifically, and would leave Option F standing.
F-K2 is recorded as NOT EVALUABLE above; this is where its asymmetry lands.

---

## The licence boundary

**This section is a reading of the licence text by a non-lawyer and is not legal advice.**
The construction questions it turns on are listed under *What was NOT established*, and one of them — what PolyForm NC's "permitted purpose" attaches to — is the question the second table row below is decided by.
The conclusions here are stated because they are the right working assumption to plan against, not because they are settled.

Core is PolyForm Noncommercial 1.0.0.
PolyForm NC **restricts purpose, not architecture**: it has no copyleft, no source-disclosure obligation, no distribution-triggered reciprocity, and no "combined work" or "linking" concept anywhere in its text.
Its only downstream obligation is passing on the terms.
GPL intuitions do not transfer, and `relationships.requires` is Foundry package metadata, not a legal act.

Two of its clauses were missed in this record's first revision and both bear on the third-party position.
Termination is **not immediate on first violation**: under *Violations*, a first written notice leaves the licences alive if the recipient comes into full compliance and takes practical steps to correct past violations "within 32 days of receiving notice".
That is reassuring for enforcement — the realistic first step against an infringing third party is a notice and a cure window, not an instant cutoff.
And *These terms do not allow you to sublicense or transfer any of your licenses to anyone else* means a third party cannot pass its rights on, which also bears on whether premium could ever be assigned separately from core.

Three actors get three different answers, and conflating them is the main error risk.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Actor | Position |
|:---|:---|
| A GM who buys the companion and runs core at their own table | Permitted. Buying a companion does not make the *user's* use of core commercial. |
| The companion publisher, developing and testing against core with anticipated commercial application | Not a permitted purpose **on the licence's own words, and subject to the construction question below** — whether "permitted purpose" attaches to the act of running a copy while writing a paid product, or to the paid product itself, is exactly the point on which professional advice is wanted. On the reading taken here it needs a separate commercial licence. This does not depend on any theory that the companion is a derivative work — it is about the publisher's own development use. |
| Whoever distributes the companion zip | Untouched by core's licence, provided no core code or assets are bundled. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**On the facts, the second row does not bite on the maintainer.**
Core has one human author across 775 commits under three identities sharing email addresses, plus bots; there are no third-party human contributors and no CLA.
As a general proposition a sole copyright holder cannot infringe their own copyright and may grant themselves any terms they like.

**But the paperwork currently says otherwise, and that is the actual risk.**
Read literally, the two `LICENSE` files name two different holders and premium's clause 3 describes the core author in arm's-length terms.
If the maintainer selects D3-b, the wording to record is:

> Fabricate core and Fabricate Premium are authored and owned by the same natural person, who publishes under the names "MisterSilver" and "MisterPotts".
> As sole copyright holder in `fabricate`, that person grants themselves — and any entity they control that publishes Fabricate Premium — a perpetual, irrevocable, worldwide, royalty-free commercial licence to use, modify, and build against `fabricate` for the purpose of developing, testing, distributing, and selling companion modules.
> This self-grant is recorded here so that no assignment, acquisition, or change of maintainer can leave the Premium line without a licence to the engine it requires.
> Any transfer of `fabricate` must carry this grant forward, or Premium must be transferred with it.

Two things about that remedy should be said rather than assumed.

**Premium's clause 3 cannot serve as the licence even if it is read as a genuine third-party agreement**, because it covers "creature and item content" — it says nothing about core's **code**, which is the thing premium actually builds against.
That is what makes a fresh instrument necessary rather than merely tidy: there is no existing clause to reinterpret.

**And a self-grant recorded in the repository it purports to licence is evidentiary, not obviously an executed instrument.**
It is good evidence of intent and dated by the commit, which is worth having on day one.
Whether it is the *right* instrument, or whether the protection properly belongs in a **reservation on any future transfer** of `fabricate` — so that the grant survives in the transfer document rather than in a file the acquirer now owns — is a fourth question for professional advice and is listed as such below.

**The third-party position is a product decision, and it should be said out loud rather than discovered.**
The seam is deliberately generic: `registerWorldNavProvider` accepts any surface id and inspects nothing about who is calling.
So a third party may build a **free** companion against it under PolyForm NC with no permission and no contact.
A **paid** third-party companion needs a commercial licence from the maintainer, obtained through Patreon, and **the gate is contractual rather than technical** — the API cannot detect or block a paid caller, and enforcement is a licence claim after the fact.
That commercial licence is currently subscription-contingent, and the clause must be quoted in full because its second sentence materially softens it.
Core's README says the licence "remains active only while you maintain the required Patreon tier subscription", and then: *"If that subscription ends, you must stop **new** commercial use of Fabricate unless we agree a separate license in writing."*
So a lapsed third party need not withdraw a product it has already shipped — which is a much less hostile term than the first sentence alone reads as.
It is still a hard term for anyone planning a long-lived product, because "new commercial use" is undefined and a shipped module's continued maintenance, ports and updates sit somewhere inside that ambiguity.
Whether the clause is enforceable and workable as drafted is already on the professional-advice list, and the meaning of "new commercial use" belongs with it.
If an ecosystem is wanted, a perpetual paid-up option alongside the subscription tier is still worth considering — though it was sized in this record's first revision against the harsher reading of the clause, and the carve-out reduces how much it buys.
The answer belongs in the API documentation as well as here, because a third party reading the API docs will not read this record.

**Precedent is thin in exactly one place, and it is called out as such.**
Free Foundry libraries with published APIs and third-party ecosystems plainly exist — Sequencer, Item Piles, libWrapper, socketlib.
**No documented case was found of a Foundry module publishing a plugin API on which a third-party *paid* module builds as an advertised, sanctioned arrangement.**
That is a "not found", not a proof of absence.
The nearest analogues are paid modules depending on free *permissively*-licensed libraries, which raises no licence question at all — so Fabricate's noncommercial licence is precisely what makes this new ground.

---

## Confidentiality: exactly one mechanism has it

**Every reading in this section is pinned to V14.365 and none of it is verified on V13**, in the same terms as the settled table above.
That pin is load-bearing rather than boilerplate: the redaction reading is what rules out D7-a, what justifies D6-b's storage line, and what makes "no core-owned test tier can ever gate premium's redaction" true.
It is listed in the V13 gap list under *What was NOT established* along with the other V14-only readings this record leans on.

Hosting precedes redaction, and D7 must be read in that order.
The shipped seam is **GM-only**: `ui-integration/spec.md` gives core the Manager shell and the "GM gate", and `DOMAIN.md` describes it as a GM Manager presentation seam.
There is no player-side registry at all.
So a player-facing premium surface has two possible shapes before redaction is even reached — premium ships its own Foundry Application, in which case core hosts nothing, contains nothing, and D8's containment analysis does not apply to it; or core builds a **second, player-side seam**, which appears nowhere in the eleven decisions and is unscoped work.
This strengthens D7-d considerably: deferring the player surface defers an unscoped hosting decision, not merely a redaction mechanism.
And after the maintainer's ruling below, hosting is the **only** reason left to defer it, because redaction has stopped being a constraint.

The generalisation that hidden state is safe in a GM-only Document is false, and Foundry's server source disproves it.
`World#g` dumps **every** document source — `User`, `Actor`, `Cards`, `ChatMessage`, `Combat`, `Folder`, `Item`, `JournalEntry`, `Macro`, `Playlist`, `RollTable`, `Scene`, `Setting` — and `dump({sort})` takes no user argument and applies no ownership filter.
Ownership is a client-side UI concern.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Mechanism | Confidential? | Failure mode |
|:---|:---|:---|
| GM computes the redacted view and emits with `{recipients: [playerUserId]}` | **Yes** — the server withholds the bytes from every other socket | Requires an online GM client; fire-and-forget with no persistence, so it is lost on a player reload unless re-requested; several GMs must elect one emitter or the player gets duplicates; `recipients` targets a **User**, so every tab that user has open receives it |
| Request/response over the server-attested `senderId` | **Yes** — same withholding, and the sender cannot be forged | Same online-GM dependency, plus a round trip per view, plus its own timeout and retry, and the GM side must authorise every request because a malicious client may ask freely |
| A world setting or Document filtered on the player's client | **No** | Total leak. Every byte is already in `game.settings` or `game.actors` on the player's machine, and one console read defeats it |
| A **compendium pack** filtered on the player's client | **No**, for a different reason | Pack *documents* are **not** in the connect payload — `World#g` pushes only `pack.index` (the declared index fields) and `pack.folders` — so "every byte is already on the player's machine" is false here. It leaks anyway because pack reads carry **no server-side authorization**: `_getDocuments` in `dist/database/backend/server-backend.mjs` runs `_preGetOperation` and then `find` with no requesting-user filter, so one `getDocuments()` socket round trip retrieves it. A maintainer who later argues "compendiums are different, they aren't in the payload" is right about the payload and wrong about the outcome |
| Document `ownership: {PLAYER: NONE}` | **No** | Sidebar and UI visibility only |
| A `ChatMessage` whisper | **No** | Message documents are dumped unfiltered; `isContentVisible` is client-side cosmetics |
| A JSON or asset file in the companion's own module directory | **No**, and it is the **worst** of these | `express.static(paths.data)` serves it to any HTTP client that can reach the server, because the static handlers are installed ahead of the session middleware. Not "any authenticated session" — no login at all. It is strictly weaker than the connect payload, which at least requires a world login |
| `documentTypes.*.gmOnlyFields` | **No**, for reads | A write guard that blocks a non-GM update, never a read |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

So "hidden faction tiers must not reach the client" forces the first or second row, and there is no third answer, because Foundry gives a module no server-side storage its clients cannot read.

Two further facts belong with this decision.
Premium should declare `"socket": true` in its own manifest and own `module.fabricate-premium`, because core's single `module.fabricate` handler already multiplexes four payload families and core has never used `{recipients}` at all.
And **no core-owned test tier can ever gate premium's redaction**: `context.isGM` is a client-side boolean any fake can set either way, and core cannot see what premium renders into the element it hands over.
A real-Foundry **player-client** assertion is the only possible gate, and that tier does not exist.

### The maintainer's ruling: this is an accepted exposure, not a problem to solve

**Taken 2026-08-16, and general rather than scoped to factions.**
Fabricate does not treat GM-withheld information as a confidentiality boundary, and buys no architecture to enforce one, in either module.
The reasoning is recorded because everything above argues the other way: a player who crawls the API to find what their GM is withholding has chosen to spoil their own game, most players will never know it is possible, and the mechanisms that would prevent it cost more than the exposure is worth.

Every measurement above stays true; what changes is its disposition.
The first two rows of that table are **not required**, so D7-b and D7-c are struck, D7-a becomes the arm this record carries, and the relay's four costs — an online GM, emitter election among several GMs, loss on a player reload, and `{recipients}` targeting a User rather than a tab — are avoided rather than accepted.
The finding that no core-owned test tier can ever gate premium's redaction also stops mattering, because there is nothing left to gate: D9-b's third gate is no longer required for redaction, though T5 remains the only place the `lang` merge, the namespace collisions and the two-stylesheet cascade can fail.

Two boundaries on the ruling, so it is not read wider than it is.

It is a statement about **transport**, not about presentation.
Core's existing redaction helpers stay exactly as they are — `getGatheringLocationForActor`'s "redaction-safe" current-realm summary, `listAlchemyForActor`'s "leak-safe" player listing, and the fix from issue 901 that stopped a blind gathering task id persisting unredacted in a player-readable actor flag.
Read as security those three contradict this ruling; read as "do not gratuitously hand the player the answer in a flag they can see" they are cheap hygiene and they are correct.
What the ruling forecloses is **new** work to extend them, and any design that simulates the server-side read authorization Foundry does not provide.

It also settles the Economy payload in advance.
The player Settlements brief names "secrecy" as a feature of the trade counter; under this ruling secrecy there is a presentation concept, not a transport guarantee, and it needs no separate decision when that surface is built.

---

## Fault containment: what the seam contains, and what it does not

Twenty-three faults were enumerated and the interesting ones were **executed** against the mounted tier rather than reasoned about.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Class | Faults | Note |
|:---|:---|:---|
| Contained **and** asserted | A throwing `mount`; a non-function return; an `async` `mount` refused at registration; a throwing cleanup; a throwing subscriber including on first replay; `javascript:` and `data:` href injection; duplicate surface registration; a stale unregister handle; a write back into the frozen context; the companion being absent altogether | Ten faults, and the fault-handling design is genuinely good |
| Contained but **unasserted** | A throwing header-action `onSelect`; an infinite `requestRemount()` from inside `mount`; mutation of `provider.tabs` after registration | All three are cheap tests. Two are contained **by accident** — by Svelte's internals rather than by core code — so a Svelte upgrade could silently un-contain them. The remount probe ran **1001 synchronous mounts** with no error surfaced to console or user; the bound is Svelte's effect-depth limit, not core's |
| Containable but **not contained** | DOM escape outside the target; leaked timers and listeners; a throwing Foundry hook handler; `lang/en.json` key collision under `FABRICATE.*`; CSS bleed; settings-namespace collision; socket abuse on `module.fabricate`; mutation of `game.fabricate.api` | The probe appended a node to `document.body` and added a class to `<body>`, and **both survived unregistration and cleanup**, because core only calls `target.replaceChildren()`. Two of these eight are core's to close and six are the companion's; they are written out below rather than gestured at |
| **Inherent** | `Object.prototype` pollution through the context's prototype; a blocking synchronous `mount` | `Object.freeze` is shallow and same-realm, and a synchronous `mount` is what makes cleanup ordering deterministic. Only an iframe or worker boundary would contain either, which D4-c would buy at the price of the whole design |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The honest headline, in the words it deserves: **the seam contains everything that goes wrong inside the call it makes, and nothing that goes wrong outside it.**
That is the correct trade for this design, and it means **`fabricate-premium` is trusted code running in core's realm**.
The verification strategy limits blast radius and detects contract drift; it does not sandbox, and nothing in this record should be read as implying that it does.

### The eight open faults, split by owner

D8-a's entire risk answer is this list, so the list is the record rather than a promise to write one later.

**Two of the eight are core's to close, not premium's**, and they are the "two cheap gaps" the recommendation names.

1. **`emitManagerHook` must guard `Hooks.callAll`.** A third-party listener that throws on an observational `fabricate.manager.*` hook currently propagates into core's own call stack, and nothing about the seam's design requires that.
2. **`game.fabricate.api` must be deep-frozen.** It is mutable today, so any module — companion or otherwise — can overwrite core's exported classes on it.

Both are core defects found in passing and are follow-up issues for the maintainer, listed again under *Consequences*.

**The remaining six are documented companion obligations.**
They are conventions, enforced by nothing, and calling them enforced would be the dishonest version of D8-a.

1. **Do not write outside the supplied target.** Core calls `target.replaceChildren()` and nothing else; a node appended to `document.body` or a class added to `<body>` survives unregistration and cleanup, as measured.
2. **Remove every timer, listener and observer in the returned cleanup function.** Nothing else will, and the cost of skipping it was measured as a detached tree still running effects.
3. **Namespace localization keys away from `FABRICATE.*`.** Foundry merges every module's `lang` file into one dictionary, so a colliding key silently wins or loses by load order.
4. **Scope CSS to the companion's own subtree.** Core's cascade layers and `--fab-*` tokens reach into the companion's DOM by design; the reverse reach is unrestricted.
5. **Register settings under the companion's own namespace.** `fabricate.*` is core's and there is no collision check.
6. **Own a socket namespace.** Emit and listen on `module.fabricate-premium`, declared by the companion's own manifest `socket: true`, and never on `module.fabricate`.

The two largest of these are the first two, and they are the largest precisely because **DOM escape and leaked listeners have no gate at any tier — existing or planned.**
T5 would not catch them either; nothing in the six-tier plan asserts the absence of a node the companion left behind.

---

## Verification: what can actually fail

Five tiers exist and one does not.
Every mutation below was executed, not predicted, from a throwaway copy of the seam worktree with `node --conditions=browser --test`.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Tier | Cost | What it is the **only** place to catch |
|:---|:---|:---|
| **T0** registry unit, 10 tests | 134 ms | Nothing on its own — it is the cheap enumerator. But it is today the only tier that fails when the async-`mount` rejection or the href scheme allowlist is removed, and the seam's one script-injection guard is defended by exactly one test in the cheapest tier |
| **T1** no-Foundry composition, 2 tests | 16.1 s | That the *production module entry* publishes a stable API object across the init-to-ready lifecycle replay. Deleting `bindFabricateGlobal()` from the `ready` hook — a real regression that would strand a companion registered at `init` — was caught **here and nowhere else**, including by the source-text mirror, which still read the literal call in the file and passed |
| **T2** mounted manager, 362 tests | 21.3 s | The DOM handoff itself: cleanup runs exactly once, at the right time, with the target still connected; the context is frozen and re-identified per remount; a throwing mount falls back to core. **This is the gate for *in-call* fault containment** — what goes wrong inside the call core makes — and it is faster and sharper than a Foundry run. It is **not** a gate for cross-module containment: the `lang` merge, the settings and socket namespace collisions and the two-stylesheet cascade can fail only in T5, and DOM escape and leaked listeners can fail in no tier at all |
| **T3** source-text and docs mirrors, 36 + 14 tests | — | Drift detection on hand-maintained mirrors, which is legitimate. The tier spans two files: `tests/components/manager-contract.test.js` is 36 pure source-text assertions and reads no documentation, and `tests/fabricate-api-surface.test.js` is the 14-test docs mirror. **It must never be cited as evidence for a behaviour**: commenting out the fault handler while leaving its text in a comment left the 36-test source-text mirror fully green |
| **T4** real-browser View Lab, one case | one Firefox frame | Real cascade, container queries, overflow and focus ring, which happy-dom cannot compute. Today it photographs a well-behaved provider, never a hostile one |
| **T5** real-Foundry two-module smoke | **does not exist** | Two real module loads at the same `esmodules` priority; the `lang` merge; settings and socket namespace collisions; the CSS cascade with two stylesheets; `game.modules.get('fabricate-premium').active` and the entitlement-invisibility case; and the player client, which is where the redaction constraint actually lives. One shape is already ruled out by the settled table: the fixture companion **cannot** be installed `protected: true` and booted past the signature check with `--debug`, because that flag is unreachable on a shipped build. It must install unprotected, or ship a valid `signature.json` |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**The fixture companion must be adversarial, and that is a measured requirement rather than a style preference.**
Hard-coding core's own four tab ids as accepted membership broke 7 of 10 unit tests, 1 of 2 composition tests and 8 of 362 mounted tests — and then, with the same mutation still applied, a counterfactual fixture whose tabs *mirrored* core's four ids and claimed only core's own surface id passed 2/2, **green**.
A core-mirroring fixture ships clean through a change that would break every real companion.
The existing discipline already de-mirrors ids, counts, order, surface ids and localization; the one gap that matters is **module identity** — the fixture is an object literal in the same file, so the entire class of "two independently loaded ES modules" faults has no fixture at all.

**Three gates, not two, and one of them does not exist.**
D9-b's shape is "six tiers, three gates — two owned by core, one owned by premium and not yet built": T2 gates in-call fault containment, T1 gates loadability across the init-to-ready lifecycle, and the third gate is the real-Foundry two-module assertion that only premium's CI can run, because it needs both artifacts at once.
The third gate survives the confidentiality ruling but changes its justification: it was argued for as the only possible gate on **redaction**, and redaction is no longer a constraint, so it now stands on the `lang` merge, the settings and socket namespace collisions, the two-stylesheet cascade and the entitlement-invisibility case — none of which any core-owned tier can reach either.
Naming only two gates understates the plan's dependency on work that has not started.

Three mechanical hazards travel with the plan and all three are measured.

**Removing one entry from the mounted tier's raw-module allowlist produced `# tests 362 # pass 0 # fail 0 # cancelled 362`** — a CI step that greps `# fail` sees green, and only the exit code and the `not ok` line catch it.
Two facts belong with that number.
The cause is that `tests/components/manager-mounted.test.js` is **hand-rolled** and never calls `validateMountedComponentDependencies`, the guard that protects the mounted suites built on the shared harness.
And the tier it silences is T2 — the containment gate.
The fix is to route that suite through `createMountedComponentHarness` and to make the CI step assert `not ok` counts and an expected test count, which is the same rule D9-b already imposes on the contract runner.

**Dropping `--conditions=browser` fails loudly in one tier and silently in another.**
The mounted tier fails 362 of 362, because the compiled component resolves Svelte's server build.
The composition tier **passes without the flag**, and only because it makes no reactivity assertion at all.
Since T1 is planned to grow a real second module, the first DOM assertion added there goes vacuous under a bare `node --test`.

**And `package.json`'s `test` script is a literal list of nine directory globs that does not include `tests/contract/`**, so a contract suite placed there would pass when invoked directly and never run in CI.

---

## Topology, and the shared-workflow gap

The premium repository is not shaped like the thing issue 613 assumed.
**Six** Foundry modules ship from it, not one.
Manifests are **generated** from `module.partial.json` plus `module.config.json`; no `module.json` is tracked anywhere.
npm workspaces already exist and `packages/fabricate-bridge` is already a shared runtime esmodule consumed by the build.
There is **no bundler at all** — no Vite, no Rollup, no TypeScript — and the one shipped esmodule is copied verbatim with string replacement.

So D1 is a three-way choice, and the middle option is the one issue 613 did not see: keep the code in the monorepo but give it its own build and gate lane.

Constraint 5 is unmet, and the gap is precisely measurable.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Asset | Public `fabricate` | Private `fabricate-premium` |
|:---|:---|:---|
| `AGENTS.md` / `CLAUDE.md` | 983 lines / 79 lines | **absent** |
| `CONTRIBUTING.md` | 1,415 lines | absent; a 29 KB `README.md` covers authoring |
| `.agents/skills/` | 274 KB, 11 skills, provider-neutral | **absent** |
| `.claude/agents/` and `.codex/agents/` | 92 KB across 21 bindings; 96 KB across 22 TOML files | 7 bespoke content-design roles, **zero filename overlap**; no Codex bindings |
| `openspec/specs/` | 12 populated canonical specs | a `.gitkeep` and one stale change directory |
| ESLint, Prettier, Stylelint, markdownlint, commitlint, SonarCloud | all present and enforced | **none** |
| CI workflows | 13 | 4 |
| Foundry E2E, View Lab, PR screenshot evidence | full | **none** |
| semantic-release | three branch lines | **none**; versions are hand-bumped and the bump is the trigger |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**The flow is two-way and the plan must not assume otherwise.**
Premium holds an `orchestration/` Python LangGraph package driving the `claude`, `codex` and `agy` CLIs over throwaway worktree snapshots, with its own suite and CI job; core has no equivalent multi-model runner.
It also holds a content-composition build, self-contained tester feeds with CI log redaction, and storefront zip packaging.
And `scripts/lib/zip.js` in the **public** repo is a documented port *from* premium's `tools/src/package-zip.js`, so copy-with-attribution already runs in both directions and is the de facto status quo.

**What makes sharing tractable is `npm run validate:agents`.**
It is pure Node with no dependencies, no Docker and no network, it *derives* the role list from the `AGENTS.md` bindings table rather than hard-coding it, and it gates harness-document reference integrity, rejects `file.js:NNN` line-number citations, and checks model pins across both provider bindings.
A second repository adopts the whole role system by adding `AGENTS.md`, `.agents/skills/` and the two binding directories, and the validator works unmodified.

**What makes sharing hard** is that core's `lint`, `format` and `format:check` scripts are roughly 3,500 characters of hand-enumerated file paths, self-policed by a coverage test against a committed baseline with an exactly-pinned count.
A second repository cannot inherit those by reference; it re-derives them with globs or copies the discipline.
Note also that the AWS OIDC role `GitHubFoundryModulePublisherRole` is **shared** between the two repositories, so the two release pipelines are less independent than their separate configs suggest.

---

## The reversal this record makes explicit

Issue 613's delta lists under **Out of scope**: "Any teaser / upsell / 'Soon' placeholder nav item for Economy in the free module.
Core ships no advertisement for premium in v1."

PR 1186 shipped, in the free module: per-tab padlock icons on the Downtime nav group, a `PREMIUM` badge, a rail callout reading "PREMIUM PREVIEW / Open any Downtime page to preview how Fabricate Premium can help you run downtime", an "Unlock with Premium" header action linking to `PATREON_URL` on **every** Downtime screen, a title-bar `PREMIUM` badge that lights when any companion registers, and the preview hero's own Patreon call to action.
All of it self-suppresses when a companion owns the surface.

**A decision may be revisited on evidence, and this one was — but the reversal has to be recorded or the repository carries two contradictory decisions and a future maintainer cannot tell which governs.**
It is recorded here.

The evidence for permitting it is real.
No documented Foundry-community backlash over in-module Patreon upsells was found, and no Foundry policy prohibiting or restricting monetisation prompts was found in the Licensing Guide, the FAQ or the AI Content Policy.
`theripper-premium-hub` is a **free package on Foundry's own official package list** whose stated primary function is to notify users about new premium releases and deliver download links to Patreon posts, and it attracted no complaint that could be found.
Fabricate's version is milder than that precedent: it is contextual, it self-suppresses, and it is not a modal, a toast, a chat message or a startup nag.
Absence of evidence is not evidence of absence, and this ecosystem's disputes happen on Discord, which was not searchable.

The residual risk sits in specific design choices rather than in the concept, ranked — with one exception, item 6, which is a live defect rather than a choice.

1. **A padlocked nav item is a claim about withheld capability, not just an advert.**
   Because Downtime code will never live in the public repository, nothing was taken away — but a user cannot tell that from a padlock.
   The single highest-leverage mitigation is preview copy saying explicitly that Downtime is a separate product that has never shipped in the free module.
   **That copy must be scoped to the tabs it is actually true of.**
   It is true of tracking, activities, factions, settings and all of Economy, none of which appear in `openspec/specs/overview/spec.md`'s capability list.
   It is **false of Parties**: GM party management has shipped free and permanently at **World > Parties** and still does.
   A blanket "this has never shipped in the free module" printed over a Parties tab is the one sentence in the mitigation that a user can immediately disprove, which would cost the rest of it its credibility.
   Resolving D11 first makes the problem mostly disappear: under D11-a the premium Parties tab decorates a free aggregate rather than appearing to replace it, so the honest copy is "this extends what World > Parties already does" rather than a withheld-capability claim.
2. **Four premium surfaces for one product**, where the precedent modules advertise once.
   The source comment beside the header action already concedes it exists only because "a shipped control labelled 'Unlock with Premium' that does nothing is dead UI" — which is an argument for removing the control, not for wiring it to Patreon.
3. **An external commercial link opening in a new tab from inside a GM tool** is the specific behaviour that reads as an advert rather than as product information.
4. **The interaction with the noncommercial licence.**
   A free NC-licensed module that advertises the maintainer's own paid product while requiring third parties to buy a commercial licence to do the same thing is a fair-play criticism someone will eventually make out loud.
   It is answerable — sole copyright holder, stated openly — but only if the third-party position is stated up front rather than discovered.
5. **The call to action leads to Patreon, not to an install.**
   Under Option S, entitlement, download and enable are three further manual steps, so the control over-promises.
   **Option F materially reduces this specific risk**, because the Patreon link genuinely does lead to an in-client install path — which is a D2 input, not merely a copy note.
6. **Core asserts "Fabricate Premium is installed and connected" about any third-party companion.**
   This is a shipped defect, not a design trade.
   `CraftingSystemManagerRoot.svelte` derives `premiumInstalled` from `registeredSurfaceIds.length > 0`, and `ui-integration/spec.md` codifies it: the title-bar badge lights "when, and only when, at least one provider is registered on ANY surface id".
   The badge's `title` and `aria-label` both read **"Fabricate Premium is installed and connected"**, from `FABRICATE.Admin.Manager.Titlebar.PremiumStatus`.
   But the registry inspects nothing about who is calling, and D3 deliberately permits a **free** third-party companion.
   So a free third-party companion makes the free module display a false statement about a paid product relationship — and silently annexes that third party's work to the maintainer's paid line, which sharpens item 4 above from a fair-play criticism into a concrete one.
   The cause is exactly the missing **Companion Identity** described under D5: there is no caller identity to key on.
   Only two fixes are honest, and both need it introduced first — the badge keys on a *known* companion identity, or its copy stops naming Premium at all ("Companion module connected").

---

## What was NOT established, and why

A record with no gaps is a record that is hiding some.
This list was written at Proposed status and is pruned here rather than rewritten: the items the maintainer's answers resolved are marked resolved and struck from the open set, and what remains is genuinely open.

**Resolved since this list was written, and no longer open.**

- **The text of the Premium Content Agreement**, and with it **F-K2**.
  The Agreement has been read and accepted by the maintainer, so F-K2 is resolved rather than unevaluable — the kill-criteria table's "NOT EVALUABLE" is left as written because it records the state of the evidence when that table was drawn.
- **Whether Foundry's package policy permits a `protected` package to require a free one.**
  Foundry confirmed by email on 2026-08-16 that it does.
  This is now an express permission, recorded in the settled table above, not an absence of prohibition.
- **First-approval lead time.**
  Still no published SLA, but the maintainer plans against **2 to 4 working days** and carries it as a named risk under *Consequences* rather than as an unquantified unknown.
- **Whether a refunded or charged-back activation is credited against a billed one.**
  Judged non-architectural by the maintainer and dropped.
  It is a commercial-accounting question about one channel, and D2 is a channel choice.
- **The premium S3 bucket, which two sources disagreed about.**
  Resolved in favour of the live enumeration: **`mistersilver-foundry-releases` does not exist and will not be used**, so `release.config.json`'s declared bucket and its `https://releases.mrsilver.io` base URL are dead configuration.
  A bearer-path feed would need a signed download URL to serve a paid audience, and Foundry supplies that, so **Option S is not a distribution arm for the premium code module at all**; the existing S3 pipeline continues to serve the five content modules for now.
- **The four questions needing professional legal advice.**
  Dropped.
  The maintainer is the author of both modules, has granted themselves commercial use of their own module, and has settled the third-party position; the remainder do not block anything.
  What survives is housekeeping rather than a research gap — normalising the two `LICENSE` copyright lines onto one legal name, rewriting premium's clause 3, and adopting a CLA or DCO before the first outside PR to core.

**Still open.**

- **Foundry's premium-content fee amount, and how the Patreon half of it is metered.**
  The amount is **not publicly disclosed anywhere** — absent from the Publisher Handbook, the Content Provider Handbook, the Premium Content article, the FAQ and the Licensing Guide, and multiple targeted searches on 2026-08-16 returned nothing.
  Separately, the billing sentence's phrase **"the amount of Patreon subscription usage" has no defined basis in any public source**: it may be a count of entitled accounts or a share of subscription revenue, and under the chosen channel it is the half that actually bills the code module.
  It is a known unknown about one channel's economics and **not a blocker**, because D2 is a channel choice and no architecture depends on it; F-K1 remains unevaluable and that is now a commercial residual rather than a stale decision.
- **V13, which is now required work rather than a flagged risk.**
  V13 is still not installed and Foundry was never booted for this record, so every Foundry reading here is V14.365-only.
  Unverified on V13: the `@layer` declaration list and whether `exceptions` exists and follows `modules`; the script and style priority table; whether `handleCustomSocket` has the identical `{recipients}` signature and server-attested third argument; whether the `signatureV2` and package-keyed signature payload branches are a V13-to-V14 fork; `express.static` and its denylist and the ordering of the static handlers ahead of the session middleware; `gmOnlyFields` being a write guard rather than a read filter; `_getDocuments` running without a requesting-user filter; the `fromManifestPath` protected guard and the unreachability of `--debug`; the `Hooks` `once`-deregisters-before-invocation and `callAll`-iterates-a-snapshot semantics behind the D5 load caveats; and `World#g`'s connect-payload construction with `ServerDocument.dump`'s absence of a user argument.
  **The maintainer has confirmed V13 stays supported, so verifying these on V13 is scheduled work with an owner, recorded under *Consequences*, and is no longer merely a gap this record names.**
- **Svelte runtime *version* skew.**
  Only two byte-identical copies of 5.56.3 were tested.
  The isolation mechanisms proven — a module-scoped `Symbol`, a module-scoped `active_effect`, a per-runtime batch queue — are version-independent by construction, so this is very likely fine and it is unmeasured.
  The planned local premium build is the first place a real version skew can exist, so it is where this gets measured.
- **The bundle-byte cost of the duplicated runtime, and real-browser behaviour.**
  Neither was measured; the experiment ran under happy-dom only, and no build was run from the read-only lane.
  The planned local build supplies both — measure the bytes with it before this record's successor quotes a number, and drive the mounted companion in a real browser rather than in happy-dom.
- **Whether D1-a or D1-c is right.**
  Both keep the premium code in the existing monorepo and differ only over whether the Svelte build and its gates share the content pipeline's CI lane.
  Nothing has been measured because no such build exists; the planned local build is what produces the number, and until it does this record does not rule either out.
- **Every T5 claim.**
  The tier does not exist, so nothing in it could be mutated.
  No two-module Foundry boot was attempted; the harness delta is derived from reading `foundry-setup-data.mjs` and `foundry-test-run.mjs`, not from running them.
  The automated two-module tier is now explicitly deferred behind a manually tested local build, so these claims stay unverified for longer than the recommendation assumed.
- **socket.io behaviour for `recipients` when the target user has zero open sockets.**
  Reading the loop says the message is dropped with no error and no ack distinction, but this was not exercised.
  It bears on no decision now that the GM relay is struck, and is kept only so a successor does not re-derive it as settled.
- **Whether the shipping `bridge.js` survives the narrowing D5 proposes.**
  It calls four getters that a narrowed contract might not keep.
  Nobody has checked, and it ships in a released module today.

---

## Recommendation

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| # | Recommended arm | The reason, in one line |
|:---|:---|:---|
| **D1** | **D1-c** — monorepo, own build and gate lane | The workspace, the release pipeline and a shared esmodule package already exist; only a build is missing, and a lane keeps a Svelte toolchain off a content pipeline that never uses it |
| **D2** | **Option H**, with Option S retained **only** for unpaid closed-beta testers until S-K1 fires, and the cost line marked **stale** | Every free-plus-paid Foundry case found uses Patreon-tier linking, and none was found for a bearer URL serving paying customers; premium's own toolchain already draws the code/content line; and the hybrid learns Foundry's process on one module instead of five |
| **D3** | **D3-b** — record the self-grant, normalise the copyright lines, rewrite premium's clause 3, adopt a CLA or DCO before the first outside PR | It costs nothing now and is expensive later; once a third party owns any part of core, the self-grant story stops being clean and relicensing becomes a consent problem |
| **D4** | **D4-b** — the DOM handoff, as shipped | Measured to work, with `effect_orphan` structurally unreachable; it delivers UI hosting with no lockstep, no shared entry chunks and no "a Svelte bump is breaking" policy |
| **D5** | **D5-b** — narrow the reachable internals into a named contract with a version constant, a `supports(range)` predicate and degradation instead of throwing | The published surface is already a set of internal objects, so this is a narrowing exercise with a compatibility promise, and it is strictly harder to retrofit after a paid product depends on it |
| **D6** | **D6-c** — premium owns its own storage for the first release; build the core-hosted slice only when a premium slice must ride a system export | Every defect that makes D6-a expensive — the terminal allowlist, the shallow spread, the wholesale importer replace, the phase-2 reference carry — exists only under D6-a |
| **D7** | **D7-d for the first release, then D7-b** | Client-side filtering is ruled out from server source; the GM relay is the only confidential channel and its four costs are real, so it should be built deliberately rather than discovered under a shipping player window |
| **D8** | **D8-a** — accept same-realm trust, close core's two gaps (**guard `Hooks.callAll` in `emitManagerHook`, and deep-freeze `game.fabricate.api`**), and write the remaining six down as companion obligations | Isolation was measured not to hold: prototype pollution succeeded through the frozen context, and escaped DOM survived cleanup |
| **D9** | **D9-b** — six tiers, **three gates**, an adversarial fixture, a contract factory consumed by pinned git tag **plus a core-release dispatch into premium's CI and a premium-side matrix over core's latest, previous and `main`**, the context-key assertion pinned to `schemaVersion`, and a runner that asserts `not ok` counts and an expected test count rather than an exit code | Each gate is the only place its constraint can fail, and one constraint — redaction — has no core-owned gate at all. Both the vacuity of the source-text tier and the green-run-that-ran-nothing were executed rather than predicted. If the dispatch is declined, the residual is that first notice of a core-side break is a user report |
| **D10** | **D10-b** — premium adopts `AGENTS.md`, `.agents/skills/` and both binding directories first; re-derive lint globs per repository; keep copy-with-attribution for everything else | `validate:agents` is dependency-free and derives its role list from the bindings table, so it is the cheapest, highest-leverage thing to share, and core is unpublishable so a shared package is not available |
| **D11** | **D11-a** — one aggregate, premium projection: `GatheringParty` stays the single Fabricate party record and premium stores a downtime projection keyed by `party.id`, reaching membership through the published `getGatheringPartyStore()` | It needs **no new core work**: the getter is published, documented, and already called by the shipping `bridge.js`, and the canonical spec already blesses a downtime party that never stands on a map. D11-b breaches the composite uniqueness invariant and collides in the rail; D11-c drags in D6-a |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**The D7 row above has since been superseded by a maintainer ruling and is deliberately left unedited.**
Confidentiality is not a constraint, so D7-a is the arm this record carries and the player surface is not deferred on redaction grounds.
The row stands as the evidence that ruling was taken against — see *Decision*.

**Two of these agree with issue 613 and three contradict it, and that is worth saying plainly.**
D1 agrees that the code belongs in the existing private repository and refines *where* inside it.
D2 agrees that Foundry-distributed protected content is the right destination for the code module, and adds a hybrid and a staging that issue 613 did not consider.
D4 contradicts issue 613's entire Chunk A and Chunk B programme.
D6 defers issue 613's §5 rather than building it first.
And the premium signal reverses issue 613's explicit "no advertisement in v1".

### Risks of the recommendation, named

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Risk | Severity | Note |
|:---|:---|:---|
| **The service surface is the real work and it is not sized.** D4 being free does not make Downtime shippable: catalogs, craft and knowledge grants, checks, world time and currency all still have no contract. | **High** | The largest caveat in this record. Name the subset that unblocks the GM Studio alone before starting, or the first premium release is gated on the largest core work in the programme. |
| **D2 is recommended with its cost line stale.** Option H is chosen on precedent, revocation properties and staging, **not** on cost, because the fee is undisclosed. | **High** | If the fee lands above F-K1's threshold, the recommendation changes, and the ADR is superseded rather than amended. |
| **`fabricate-premium` is trusted code in core's realm.** D8-a accepts prototype pollution, DOM escape, leaked listeners, i18n collision and CSS bleed as conventions rather than enforcement. | **High** | Acceptable for a first-party companion. It becomes materially riskier the moment the same seam hosts a third party, which the registry deliberately allows. |
| **Redaction has no possible core-owned gate.** Under D7 the only gate is a real-Foundry player-client assertion in premium's CI — the third of D9-b's three gates — and that tier does not exist. | ~~High~~ **Accepted** | **Superseded by the ruling in *Decision***, and left standing because it is the evidence that ruling was taken against. Confidentiality is not a constraint, so there is nothing to gate. The hosting half of the note survives: there is no player-side registry, so the surface itself is still unscoped work. |
| **A shipping consumer has no version check.** Narrowing the internals under D5-b can break `fabricate-mythwright` v0.11.0 silently. | Medium | Check `bridge.js`'s four getters against the narrowed contract before publishing it, and fix the documentation so `whenReady()` is taught instead of the one-shot hook. |
| **A second `Party` aggregate would breach a stated invariant.** Core owns `GatheringParty`; the GM Downtime brief defines its own `Party` with markers, membership moves and a `party: true` flag fallback. | Medium | **The absence of the collision is what is true today only of the preview** — `ui-integration` requires that core's preview and registry create, read and write no party role, assignment, mirror or reference, so no second aggregate exists yet. It arrives with the real provider. This is now decided as **D11**, recommended arm D11-a, on the composite uniqueness invariant and the World > Parties versus World > Downtime > Parties rail collision rather than on taste. |
| **F-K2 is unevaluated, and Option H is more exposed to it than Option F.** | Medium | The Publisher Handbook sanctions multi-storefront distribution, but the Handbook is marketing copy and the **Premium Content Agreement** is the instrument that binds; it has not been read. An exclusivity, pricing-control or content-approval term would break the hybrid specifically while leaving Option F standing. |
| **The containment gate can silently execute nothing.** The mounted tier is hand-rolled and omits `validateMountedComponentDependencies`, so one missing allowlist entry cancels all 362 tests while reporting `# fail 0`. | Medium | Route `tests/components/manager-mounted.test.js` through `createMountedComponentHarness`, and make the CI step assert `not ok` and an expected count — the same rule D9-b already imposes on the contract runner. Measured, not predicted: `# tests 362 # pass 0 # fail 0 # cancelled 362`. |
| **Core asserts a paid-product relationship about any registrant.** `premiumInstalled` is `registeredSurfaceIds.length > 0` and the badge is labelled "Fabricate Premium is installed and connected", with no caller identity anywhere in the seam. | Medium | A free third-party companion makes the free module state something false and annexes that third party to the paid line. Both honest fixes need **Companion Identity** first: key the badge on a known companion, or drop "Premium" from the copy. |
| **D6-c defers a decision it may have to unwind.** If a premium slice turns out to need to travel inside a system export, the core work arrives later and under more pressure. | Medium | The trigger is stated, so this is a scheduled cost rather than a surprise. |
| **The premium signal's padlock reads as withheld capability.** | Medium | Cheap to mitigate in copy; expensive to mitigate after the first public complaint. |
| **V13 is unverified throughout** while `module.json` supports it. | Medium | The `styles[].layer` trick, the socket signature and the priority table are all V14-only readings — and so is **the entire redaction reading** (`World#g`, `ServerDocument.dump`, `express.static`, `gmOnlyFields`, `_getDocuments`), which is what rules out D7-a and justifies D6-b. If V13 differed there, D7's option set would need re-deriving. |
| **Sharing the role system means two copies to keep in step.** | Low–medium | `validate:agents` runs unmodified in the second repository, which converts drift into a failing check rather than a silent divergence. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### If the evidence does not separate two options, say so

It does not separate **D1-a from D1-c**, and it does not separate **Option F from Option H on cost**.

D1-a and D1-c both keep the premium code in the existing monorepo; the only difference is whether the Svelte build and its gates run in the same CI lane as the content pipeline.
Nothing has been measured, because **no such build exists yet to measure**, and the kill criterion for D1-a therefore cannot fire.
D1-c is recommended on the argument that a content pipeline of 1,490 files should not wait on a Svelte toolchain it never uses — which is a prediction, not a result.
If the first build turns out to be fast, D1-a is the simpler configuration and this record should not be read as ruling it out.

Option F and Option H are separated on **staging and blast radius**, not on cost.
Whether Option H's two-storefront overhead is worth paying depends on a fee nobody has seen.
The recommendation is therefore Option H **as a way of learning the fee cheaply**, not Option H as a settled answer to which distribution model is more economical.

---

## Decision

**Accepted 2026-08-16.**
Every position this record opened is taken below — ten decisions selected, D2 demoted to a channel choice, and two adjacent positions settled with them.

Following the precedent set by ADR 0001: the *Recommendation* above, the kill criteria, the risk table and every measurement record the evidence, and they must not be edited to agree with a later divergent decision.
Two decisions diverge from what this record recommended — **D6**, and the hosting half of **D7** — and their reasoning is written here rather than backfilled into the sections they contradict.
One further position, the premium signal, withdraws a statement made in issue 613 rather than in this record, and that withdrawal is recorded here so the repository stops carrying both.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| # | Selected | The maintainer's reason, and what it binds |
|:---|:---|:---|
| **D1** | **Monorepo**, with the lane still undecided between D1-a and D1-c | D1-b is killed on its own criterion and stays killed. The choice between one CI lane and two is settled by the first real premium build, which does not exist yet, so this record leaves it open rather than picking on a prediction |
| **D2** | **Not a decision — a channel choice.** The **code** module through **Foundry premium content gated by a Patreon tier**, initially, at the Guild Artisan tier; the existing S3 pipeline retained for the five content modules for now | Distribution is not an architectural constraint: premium can ship direct, through Foundry premium content gated by Patreon, or through the FVTT storefront, and no other decision in this record moves with the answer. The Option S, F and H analysis and the kill criteria stand as evidence about the channels rather than about the architecture. `mistersilver-foundry-releases` does not exist and will not be used, so **Option S is not a distribution arm for the code module at all** — a paid bearer feed would need a signed download URL, and Foundry supplies that |
| **D3** | **D3-b** — the self-grant, taken | No professional advice was needed. The maintainer authored both modules and permits themselves commercial use of their own module, so the self-grant wording quoted under *The licence boundary* is adopted, and two commercial-use Patreon tiers already exist. The third-party position is settled and is a product statement, not a legal open question: a **free** third-party companion is welcome under PolyForm NC with no permission and no contact, and a **paid** one needs a commercial licence. That belongs in the API documentation as well as here, because a third party reading the API docs will not read this record |
| **D4** | **D4-b** — the DOM handoff, as recommended | Measured rather than argued, and it is the only decision in this record that is already built and shipped |
| **D5** | **D5-b** — narrow and version the API, **yes**, and explicitly **for other module developers** rather than only for premium | It lands **alongside** premium's first release, not before it, so the narrowing is sized against a real consumer instead of a hypothetical one. Naming third-party developers as the audience is what makes it a published contract rather than a private arrangement between two modules with the same author, and it is the same audience D3's third-party position addresses |
| **D6** | **D6-a** — core builds `CraftingSystem.extensions` now. **Diverges from the recommendation** | Premium's data does need to travel inside a crafting-system export, which is precisely the trigger D6-c named, so deferring only moves the same work later and under more pressure. See the subsection below for what it pulls onto the critical path |
| **D7** | **D7-a** carried, and — **as revised on 2026-08-17** — **premium ships its own Foundry module and mounts its player-facing Downtime into Fabricate's own player window** through a general, surface-keyed player navigation extension seam core builds. **The hosting half diverges from the recommendation** | Confidentiality is not a constraint, which removed D7's premise. Hosting was first answered by premium owning the window outright; the maintainer has since reversed that half, so core builds the player-side seam after all. The 2026-08-16 wording of this row — premium's own Application — no longer holds. See the D7 subsection and the revision entry below |
| **D8** | **D8-a** — trusted same-realm code, as recommended | Isolation was measured not to hold, so the honest form of this arm is core closing its two cheap gaps and the six companion obligations being written down as obligations rather than described as enforcement |
| **D9** | **D9-b** as the target shape, with the **immediate** step a simple build of the premium module in the `fabricate-premium` repository, tested manually and locally | The automated two-module Foundry tier is deferred behind that build. The build is also the instrument that settles D1-a versus D1-c, the Svelte version-skew gap and the real-browser gap, which is why all three are listed as open under *What was NOT established* rather than assumed |
| **D10** | **D10-b** — premium adopts `AGENTS.md`, `.agents/skills/` and both provider binding directories, **yes** | `validate:agents` is dependency-free and derives its role list from the bindings table, so a second repository inherits the whole role system by adding four things and running one script, and drift becomes a failing check instead of a silent divergence |
| **D11** | **D11-a** — one aggregate, premium projection | The composite uniqueness invariant in the canonical gathering specification decides it, and it needs no new core work: `getGatheringPartyStore()` is published, documented and already called by the shipping `bridge.js` |
| **Premium signal** | **Stands as shipped** | The maintainer's reason, recorded: *"I want to promote the premium module."* This **withdraws issue 613's "Core ships no advertisement for premium in v1" on the record**, so the repository no longer carries two contradictory statements about the same behaviour. The copy-scoping mitigation is kept and is not optional: the padlock must not imply Parties was withheld, because GM party management ships free at **World > Parties** and always has |
| **V13** | **Still supported** | Every Foundry reading in this record is V14.365-only, so V13 verification stops being a flagged risk and becomes required work with an owner, recorded under *Consequences* |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### D6 diverges: core builds the `CraftingSystem.extensions` slot now

**Selected: D6-a.**
The recommendation was **D6-c** — premium owns its own storage for a first release, and the core-hosted slice is built only when a premium slice must travel inside a crafting-system export.
The maintainer's answer is that premium's data **does** need to travel inside a crafting-system export, so D6-c's own trigger has already fired and deferring would buy nothing.

**D6-a's kill criterion fired, and this decision is taken with that in view rather than waiving it.**
The criterion was "requiring changes to core's read, write, normalize, import and export paths before premium can ship anything at all", and the kill-criteria table records it as FIRED for a first release.
That row stands unedited.
What accepting it means concretely is that the persistence work below sits on the critical path to premium's first release: premium cannot ship until it lands, and each hazard the kill-criteria row names is now a task rather than an argument against the arm.

**What D6-a pulls onto the critical path**, drawn from hazards this record already documents rather than newly discovered.

1. **`_normalizeSystem`'s terminal allowlist runs on every read and every write.**
   A key it does not know is dropped, so an `extensions` slice is erased by the next normalize pass unless the allowlist carries it explicitly.
   This is the highest-risk item of the six, because the erasure is silent and happens on a *read*.
2. **`updateSystem` shallow-spreads at the top level.**
   A write that does not carry `extensions` forward re-defaults it, so a caller updating an unrelated field destroys the slice as a side effect.
3. **The compendium importer's overwrite path replaces `extensions` wholesale.**
   Import must merge or rebind the slice rather than substitute the incoming one, or re-importing a system silently discards the installed companion's data for it.
4. **The admin store's phase-2 publish carries `extensions` across by reference.**
   Sharing object identity with the persisted slice lets a view mutation reach storage, and the phase-2 publish needs a **new** object for a `$derived` consumer to observe the change at all — the projection allowlist must also be extended, or the slice is invisible to the view layer.
5. **A migration forward-guard.**
   Core's migration pass must preserve an `extensions` slice whose `schemaVersion` it does not recognise rather than normalising or dropping it, because the slice is versioned by its owner and not by `fabricate.migrationVersion`.
6. **The import id-lifecycle rebinding must happen before persistence.**
   Import rewrites record ids, so a slice keyed to pre-import ids has to be rebound in the same pass that rewrites them; rebinding after the write leaves the slice pointing at ids that no longer exist.

**Two preconditions come with D6-a that the recommendation never had to price.**
D6-a is written against `extensions[pluginId]`, and **that key space does not exist in core** — the seam models only `surfaceId: provider.id`, so **Companion Identity**, described under *The API is internal objects, not a contract* as a small additive change wanted for two unrelated reasons, is now a hard precondition for D6-a and needs its `DOMAIN.md` row.
And the plugin-scoped update API that validates JSON-serializability at the write boundary joins the **D5 narrowing list** beside `getGatheringPartyStore()`, because it is core API a paid product writes through.

**D6-a supersedes the conclusion of *D6-b is the cheap arm, not the free one*, and invalidates none of its analysis.**
That section's dangling-reference and durable-identity findings apply to whatever premium keeps **outside** the slice, which is most of its data: core still cannot enumerate a companion's references, `ui-integration`'s referenced-by confirm evidence is still blind across the boundary, component ids are still not globally unique so premium must still key on durable identity rather than on a bare id, and premium still needs its own migration line for its own storage.
Only the section's framing changes — that a first release avoids all of D6-a's defects is no longer the arm being carried.
The slice's own contents stay versioned by the `schemaVersion` the slot shape already carries, which is a second versioning line *inside* the first rather than a replacement for premium's.

**One argument elsewhere in this record is weakened by this, and is flagged here rather than rewritten.**
*D11: one party aggregate, or two* prices D11-a partly on "Nothing in D6-a is required, and D11-c is the arm that would drag it in".
With D6-a being built, that cost no longer separates those arms.
D11-a still stands — on the composite uniqueness invariant, on the World > Parties versus World > Downtime > Parties rail collision, and on needing no new core work — but a reader should not treat the D6-a-avoidance line as load-bearing any longer.

One asymmetry that looks like a problem and is not, recorded so nobody has to re-derive it.
Under D11-a the system slice rides a crafting-system export and premium's party projection does not, because the projection lives in premium's own namespace keyed by `party.id`.
That is consistent rather than broken: the canonical gathering specification makes parties **world-level** records precisely so one party can interact with multiple crafting systems, so core's own `GatheringParty` does not ride a per-system export either.
Neither half of a party travels with a system, and a companion projection that did would be the anomaly.
If downtime party decoration must survive some other kind of export, that is a new question about a world-level export path, not a defect in D11-a.

### D7 diverges on hosting, and its premise was already removed

**Read this subsection with the 2026-08-17 revision entry below.**
Its account of the premise is unchanged and still governs, but its hosting answer — premium's own Foundry Application — has been reversed: core builds a general player navigation extension seam and premium's Downtime mounts into Fabricate's player window.
The 2026-08-16 reasoning is left standing below rather than rewritten, because it is what the revision reverses.

Two separate things happened to D7 and they should not be conflated.

**First, the premise was removed.**
Confidentiality is not a constraint: Fabricate does not defend GM-withheld information at the transport layer, in either module.
That is a general stance rather than one scoped to faction data, and it is recorded in full under *Confidentiality* along with the two boundaries that keep it from being read wider than it is — it is a statement about **transport**, not about presentation, and core's existing redaction helpers stay exactly as they are.
D7-d and D7-b were recommended because confidentiality was assumed to be required; with that assumption withdrawn, **D7-a is the arm this record carries**, the GM relay is struck, and its four costs — an online GM, emitter election among several GMs, loss on a player reload, and `{recipients}` targeting a User rather than a tab — are avoided rather than accepted.

**Second, hosting is decided, and this is where the divergence is.**
The recommendation was D7-d for a first release: ship the GM Downtime Studio only, and defer the player surface until a mechanism existed.
The maintainer's answer is that **premium ships its own Foundry module and its own Application** for the Player Downtime window.
So core hosts nothing player-side, builds no second seam, and the unscoped player-side registry that made deferral attractive is not needed at all.

Three consequences follow directly.
**D8's containment analysis does not apply to that window**, because core makes no call into it and hands it no element; the six companion obligations continue to apply to the GM surface premium mounts into, and the player window is premium's own realm end to end.
The Player Downtime app is **unblocked for a first release** rather than deferred behind unbuilt work.
And no player-client test gate is required, because there is no redaction constraint left to gate — T5 still stands, but on the `lang` merge, the settings and socket namespace collisions, the two-stylesheet cascade and the entitlement-invisibility case.

**The *Recommendation* table's D7 row and the corresponding risk row are deliberately left as written**, because they are the evidence this decision was taken against.

### What this record no longer leaves open

The ten-question *Still to answer* table this section used to carry is gone, because every question in it now has an answer above.
These in particular are closed, and a successor should not reopen them as unknowns.

- **Whether the architecture depends on how premium is distributed.**
  It does not.
  D2 is a channel choice and the undisclosed fee blocks nothing.
- **The Premium Content Agreement, and F-K2.**
  Read and accepted.
- **Whether a `protected` package may require a free one.**
  Confirmed by Foundry by email.
- **Whether `mistersilver-foundry-releases` is the premium feed.**
  It does not exist and will not be used.
- **Whether the licence questions need professional advice before anything ships.**
  They do not; the self-grant is taken and the third-party position is settled.
- **Whether core builds `CraftingSystem.extensions`.**
  It does, now, and premium's first release depends on it.
- **Who hosts the player-facing Downtime window.**
  Premium does, in its own module and its own Application.
- **Whether core ships an advertisement for premium.**
  It does, and issue 613's contrary line is withdrawn on the record.
- **Whether V13 stays supported.**
  It does, so verifying this record's V14-only readings on V13 is scheduled work rather than a standing caveat.

What is genuinely still open is listed under *What was NOT established*, and the planned local premium build settles several of those items rather than leaving them to a successor.

### Revision 2026-08-17 — the hosting half of D7 is reversed, and core builds the player seam

**Revised 2026-08-17 (issue 1198).**
The maintainer has reversed the **hosting half** of D7.
Premium's player-facing Downtime does **not** ship as premium's own Foundry Application; it mounts into Fabricate's existing player window through a **general, surface-keyed player navigation extension seam that core builds**, mirroring the shipped Manager seam's registration, lifecycle, fault containment and hook contract.
Everything else D7 settled stands: **D7-a is unchanged**, the GM relay is still struck, and the confidentiality position that removed D7's premise is untouched.

The reversal is recorded here rather than backfilled into the sections it contradicts, exactly as the two 2026-08-16 divergences were.
It falsifies **seven** statements in this record.
Four of them sit in places a successor is instructed not to reopen, so they are named here and left standing:

- the D7 subsection's claim that **D8's containment analysis does not apply to that window**, "because core makes no call into it and hands it no element".
  Under this change core does both: it owns the window, hands the companion a target and calls its `mount`.
  D8's containment analysis and the six companion obligations therefore now govern the player window as well as the GM surface.
- *What this record no longer leaves open* → "**Who hosts the player-facing Downtime window.** Premium does, in its own module and its own Application".
  Premium still ships its own module; it no longer hosts that window.
- the D7 subsection's claim that **the unscoped player-side registry that made deferral attractive is not needed at all**.
  A player-side seam is needed and is built — but the built seam is **surface-keyed**, not the unscoped registry that was rejected, so this is not a reversal of that rejection's reasoning.
- *What this record no longer leaves open* → "**Whether core ships an advertisement for premium.** It does".
  Still true of the GM Manager, and now explicitly **bounded**: the player window carries **no premium signal in any state** — no badge, no padlocked entry, no teaser tab, no upgrade offer, no call to action, whether or not a companion is installed.
  The Manager title bar's `PREMIUM` badge is widened by the same change to light for a registration in **either** registry, and it stays Manager chrome.

Three further statements assert premium's own Application, and none of them sits in a protected artifact, so they are **corrected in place** rather than merely named — a revision entry buried here would otherwise leave the most-read lines of the document asserting the opposite:

- the record's **Status line**;
- the *Decision* table's **D7 row**, and the **opening of the D7 subsection**;
- the *Consequences* entry granting the `fabricate-premium` repository **its own Foundry Application for the Player Downtime window**.

Deliberately left unedited, because they record the evidence this record was decided against and ADR 0001's precedent protects four artifacts rather than three: **D7-a**, the **confidentiality** position, and every *Recommendation*, **kill criterion**, **risk table row** and measurement — including the *Recommendation* table's D7 row and its corresponding risk row, which the 2026-08-16 D7 subsection already declares are left as written.

The seam itself is specified in `openspec/specs/ui-integration/spec.md` §Player Navigation Extension, documented for third parties in `docs/api/index.md`, and carries its own `DOMAIN.md` row beside the Manager one.

---

## Consequences

**Issue 613** is superseded in part and confirmed in part, and neither half should be inferred from the other.
Its Chunk A and Chunk B shared-runtime programme — the unhashed entry chunks, the exact Svelte pin, `assertSharedRuntime`, the build-artifact grep for inlined internals and the "a Svelte bump is a breaking plugin-API change" policy — is superseded by D4-b.
Its §5 persistence work, its nine manager consult points and its admin-store slice are **confirmed and scheduled now, not deferred**: D6-a is selected, its trigger has fired, and every hazard §5 documents is real and lands on the critical path to premium's first release.
Its §12 services surface survives and is reframed as a narrowing exercise rather than a build-from-nothing, and D5 adds an audience §12 did not name — other module developers, not premium alone.
Its phrase "Foundry performs the revocation" must be corrected to future-facing withdrawal of the feed.
And its **"Core ships no advertisement for premium in v1" is withdrawn on the record**, on the maintainer's decision that the premium signal stands, so the issue must not be read as still governing that behaviour.
Its open questions 1 to 4 are answered or resolved rather than carried forward; what is left of them appears under *What was NOT established*, which is now split into resolved and still-open halves.

**Issue 345** stays open and is delivered through the premium module; its build-time edition gate was already superseded and nothing here revives it.
**The issue itself must say so**, in its own body rather than only here: it is a public issue on a public backlog, and left unannotated it advertises a feature that has moved behind the paywall.

**PR 1186** is the shipped answer to D4 and is confirmed by measurement rather than merely accepted.
Its four cleanup paths are load-bearing: without them a companion leaks a `document` listener and keeps running on a detached tree.
Its premium signal reverses issue 613's out-of-scope line, and that reversal is recorded above rather than left implicit.
Its `worldDowntimePreviewProvider.js` correctly states that core's four preview tab ids are not the provider contract — which matters, because the real GM Downtime brief has **five** tabs, and an earlier revision of the seam that froze the set would have blocked the real design.

### Five canonical specifications are affected, and `DOMAIN.md` with them

This record's first revision named one, and one is wrong.

**`openspec/specs/integrations/spec.md`** is 49 lines written entirely for the **inbound** direction, Fabricate consuming a third party.
Its criteria 5, 6 and 7 — mock-the-companion tests, a documented compatibility range, and version-gated feature detection rather than hard crashes — have exact outbound analogues.
Their status is not "none of the three is implemented", which overstated the gap:

- **Criterion 5's analogue is met.** Its outbound form is "covered by unit tests that mock the companion's API surface", and that is precisely what T0, T1 and T2 are — 10 + 2 + 362 tests driving fixture providers.
- **Criterion 6 is not met** in the direction that matters: premium publishes no core-version range.
- **Criterion 7 is not met in that direction either**, but the honest statement is narrower than "core does not degrade": core *does* contain and degrade when a companion misbehaves at runtime, as the ten asserted contained faults show.
  What is unimplemented is the reverse — **premium degrading when core's API changes** — plus `registerWorldNavProvider` throwing on an unsupported `apiVersion` rather than degrading, which D5-b would change.

**But an outbound section cannot simply be bolted onto that specification, and this record picks a destination rather than leaving it open.**
Its Principle 2 requires each integration to be gated behind a crafting-system-level toggle with "zero runtime interaction" when off, and Criterion 1 requires that toggle to exist.
Both are false of the seam on day one: there is no toggle at all, and the seam is world- and Manager-scoped rather than crafting-system-scoped — `craftingSystemId` is nullable by design and the route stays reachable when it is `null`.
Principle 4, "no duplicate data entry", inverts under outbound.
**The outbound contract therefore belongs where it already lives: `openspec/specs/ui-integration/spec.md` §Downtime Preview and Premium Extension**, which owns roughly 44 requirements of it today.
`integrations/spec.md` gains a one-line scope statement declaring itself inbound-only and cross-referencing that section.
A new `extension-seam` capability was the alternative; it was rejected because it would split one seam's requirements across two specifications for no gain.

**`openspec/specs/ui-integration/spec.md`** is therefore the specification D5 actually amends, and **D5-b contradicts it today**: it requires an unsupported version to fail with a deterministic error, and D5-b degrades instead.
Selecting D5-b means amending that clause in the same change, with its own delta.

**`openspec/specs/destructive-changes-and-migrations/spec.md`** is affected by D6 in both directions and went unmentioned.
Its principle is that nothing is left dangling, and `ui-integration` requires a destructive delete to route through a confirm dialog with referenced-by evidence — evidence that cannot see premium's references.
D6-a narrows that exposure to whatever premium keeps **outside** the slice, which is most of its data, so the accepted consequence recorded under *D6-b is the cheap arm, not the free one* still holds and that specification is still where it must be written down.
It also gains D6-a's own obligation: core's migration pass must **forward-guard** an `extensions` slice whose `schemaVersion` it does not recognise, preserving it rather than normalising or dropping it.

**`openspec/specs/data-models/spec.md`** and **`openspec/specs/import-export/spec.md`** are where D6-a lands, and it lands **now** rather than on a trigger.
`data-models` gains the slot shape, the plugin-id key space and the terminal-allowlist entry that stops `_normalizeSystem` erasing it; `import-export` gains the export carry, the importer's merge-or-rebind rule in place of a wholesale replace, and the requirement that the id-lifecycle rebinding happens **before** persistence.

**`openspec/specs/release-and-distribution/spec.md`** is unmentioned by a record whose D2 decides distribution, which cannot stand.
Its Purpose already reads "closed testers, **paying patrons**, and the public", and it defines `channel`, `tester group`, `cohort` and `target` — the exact vocabulary D2 uses for Option S.
Given this record's own finding that the AWS OIDC role `GitHubFoundryModulePublisherRole` is **shared** between the two repositories, D2 must state whether premium's channels fall under that specification or are explicitly outside it.
The recommendation is that they are outside it and that the specification says so, because the specification governs the public module's promotion order and premium's does not participate in it — but the shared role means the boundary has to be written, not assumed.

**`DOMAIN.md`** carries the canonical **Manager Navigation Surface / Provider Seam** row that D5, D6 and D11 all edit.
That row today ends with "This seam neither extends nor uses the **Gathering Party** aggregate", which is correct about the shipped seam and is exactly what D11-a changes.
Both of its conditional rows are now unconditional: D6-a needs an `extensions[pluginId]` key space that core does not model, so a **Companion Identity** row is required and the concept is a precondition rather than an option, and a `slice` row is required because D6-a is selected.

**The `fabricate-premium` repository** gains: its own code build — a simple local build first, tested manually, with the lane question settled by what that build costs — plus core's role system and `validate:agents` under D10-b, a runtime guard on `game.modules.get('fabricate')`'s version, its own `socket: true` and `module.fabricate-premium` namespace, a disjoint localization root, **a registered player navigation provider mounting its Player Downtime into Fabricate's own player window** under D7 as revised on 2026-08-17 (it gains no Foundry Application of its own for that window), writes into core's `extensions` slice through the plugin-scoped update API under D6-a, its own migration line independent of `fabricate.migrationVersion` for everything it keeps outside that slice, a CI check that **fails if any dev or smoke artifact carries `protected: true`** (without which F-K4's non-firing is a capability rather than a control), and a CI check that fails if any file bearing core's PolyForm header lands in a shipped module — so the non-copying property stays true rather than merely being true today.

**`docs/api/index.md`** gains two things D5 and D3 put there rather than here.
The third-party position must be stated where a third party will read it: a **free** companion is welcome under PolyForm NC with no permission and no contact, and a **paid** one needs a commercial licence from the maintainer.
And the narrowed contract is published for **other module developers**, with the core-version constant, the `supports(range)` predicate and the deprecation policy — alongside the fix this record already names, teaching the replay-safe `whenReady()` instead of the one-shot `fabricate.ready` hook that eleven worked examples currently teach.

### Four named consequences with owners

**V13 verification is required work, not a caveat.**
V13 stays supported, and every Foundry reading in this record is V14.365-only, so the readings listed under *What was NOT established* must be re-derived against a V13 install before this record's claims are relied on for a V13 world.
The maintainer owns installing V13; the verification itself is scoped work that belongs on the premium programme's critical path beside D6-a, because the `styles[].layer` behaviour, the script and style priority table, the socket signature and the signature-payload branches all bear on how premium loads at all.

**The first Foundry approval is a named launch risk, planned at 2 to 4 working days.**
No SLA is published, only the *first* upload is gated, and no charges accrue during onboarding — so the exposure is front-loaded and one-off.
It is planned rather than unquantified, and it is the one schedule item in D2 that survives the demotion, because a channel choice still has a lead time.

**Premium adopts the role system, and the adoption is verifiable rather than aspirational.**
`AGENTS.md`, `.agents/skills/` and both provider binding directories move to `fabricate-premium`, and `npm run validate:agents` runs there unmodified because it derives its role list from the bindings table.
Lint, format and format:check cannot be inherited by reference — core's are roughly 3,500 characters of hand-enumerated paths behind a pinned coverage test — so the second repository re-derives them with globs.
The flow stays two-way: premium's `orchestration/` multi-model runner has no core equivalent, and `scripts/lib/zip.js` is already a port from premium.

**Issue 613's advertisement line is withdrawn, and the copy-scoping mitigation is the condition on that.**
The premium signal ships as built, so the issue's "Core ships no advertisement for premium in v1" no longer governs.
The preview copy must be scoped to the tabs it is true of: it is true of tracking, activities, factions, settings and all of Economy, and it is **false of Parties**, because GM party management ships free at **World > Parties**.
Under D11-a the premium Parties tab decorates that free aggregate rather than appearing to replace it, so the honest copy there is "this extends what World > Parties already does".

**Two core defects were found in passing and are follow-up issues for the maintainer:** `emitManagerHook` does not guard `Hooks.callAll`, and `game.fabricate.api` is mutable so any module can overwrite core's exported classes.
They are the **two cheap gaps** the D8 recommendation names, and they are written out beside the six companion obligations under *The eight open faults, split by owner* — this record names them and does not fix them.
A third defect is named under the premium signal and is the same shape: `premiumInstalled` asserts a paid-product relationship about any registrant at all.

---

## Ubiquitous language

Four terms in this record collide with the corpus, and a record that introduces vocabulary should say which sense it is using.

**`companion` has two opposite meanings and they are already both in the repository.**
`openspec/specs/integrations/spec.md` uses it ten times for a module Fabricate *consumes* — Item Piles, Simple Calendar.
`openspec/specs/ui-integration/spec.md`, `DOMAIN.md` and this record use it for a module that consumes *Fabricate*.
Because `integrations/spec.md` now gains an inbound-only scope statement pointing at the outbound section, both senses would otherwise sit one cross-reference apart.
**Pick: `integration partner` for the inbound sense, `companion` for the outbound one**, and rename in `integrations/spec.md` when its scope statement is written.

**`surface` carries four senses here.**
`DOMAIN.md` defines it precisely as a Manager route that can be handed to a companion, named by a surface id.
This record also uses it for the API ("the service surface"), for audience (D7's title, and the hosting half of D7 under *Decision*) and for advert placements ("four premium surfaces").
The audience sense is the dangerous one, because D7's title reads as a claim about a hosting seam that does not exist — see the hosting-precedes-redaction paragraph in *Confidentiality*.
Only the `DOMAIN.md` sense is canonical; the other three are prose and should be rewritten out of any specification text derived from this record.

**`extension`** now means two things at once, because D6-a is selected and the `extensions[pluginId]` slot is being built: a registered UI provider, keyed by surface id, and a persisted data slice, keyed by plugin id, in two different id spaces.
The rename that was conditional on that arm is therefore required rather than optional, and it must be settled before the slot's name reaches a canonical specification.

**`GatheringParty`** is already world-level and cross-system, and its own specification calls one instance "a downtime party".
The `Gathering` prefix now misleads, and it is the prefix that makes D11-b look reasonable.
A rename is the cheap half of D11 and is a follow-up, not a blocker.

**`slice`** was ADR-local jargon, acceptable at Proposed status.
D6-a is selected and this record is Accepted, so it needs its `DOMAIN.md` row.

---

## Provenance

**Foundry facts** were read from a local install at `resources/app`, `package.json` `version: "14.365.0"`, `release: {generation: 14, channel: "stable", build: 365}` — the same generation the smoke image pins.
Foundry was never booted and no Docker was started; V13 is not installed.
Claims are cited by symbol and file throughout — `fromManifestPath`, `installPackage`, `handleCustomSocket`, `dump`, `_getDocuments`, `_getStaticContent`, `component_root`, `validate_effect` — because line numbers rot and `npm run validate:agents` rejects them.
The `--debug` finding is the one Foundry claim read from an **unminified** shipped file: `resources/app/main.mjs` is plain source, its `isDebug` expression is quoted verbatim in the settled table, and the absence of `resources/app/server` was confirmed by directory listing on the same install.

**Domain facts** were read from the canonical specifications in this repository, not from summaries: `gathering-and-harvesting/spec.md` §Gathering Party requirements 1, 3, 4, 5 and 7; `ui-integration/spec.md` §Downtime Preview and Premium Extension and its Data Storage section; `destructive-changes-and-migrations/spec.md`; `release-and-distribution/spec.md`; `integrations/spec.md` in full; and `DOMAIN.md`'s Manager Navigation Surface / Provider Seam row.
The premium-badge defect was read from `CraftingSystemManagerRoot.svelte` and `lang/en.json`, and the missing companion identity from `src/ui/managerExtensions.js`, all at this branch's head.

**The Q1 experiment is runnable and is the reason D4 is settled rather than argued.**
Two copies of `svelte@5.56.3` were installed at `node_modules/svelte-a` and `node_modules/svelte-b`; components were compiled with the 5.56.3 compiler and import-rewritten to their respective runtime; the DOM was happy-dom 20.10.4; the runner was `node --conditions=browser`, without which the compiled component resolves the **server** build and throws — a harness artefact, not a design finding.
Its scripts were `build.mjs`, `run.mjs`, `run2.mjs`, `run3.mjs` and `build-shared.mjs`, and the numbered probes quoted above are its verbatim output: two distinct runtimes at `[0]`, a successful cross-runtime mount at `[1]`, untracked foreign state at `[3]`, isolated delegation at `[4]`, the detached-tree leak at `[6]`, and the ordering comparisons `[O1]` through `[O3]` and `[L3]`.

**The verification figures are executed runs, not predictions.**
They were taken on Node v22.22.2 against a throwaway copy of the seam worktree, with `node_modules` junctioned to the coordinator's, so no tracked file in either worktree was modified.
The mutations were: removing the async-`mount` rejection; widening the href scheme allowlist to accept `javascript:`; recreating the registry on every lifecycle bind; deleting `bindFabricateGlobal()` from the `ready` hook; hard-coding core's four tab ids as accepted membership, then re-running with a core-mirroring fixture under the same mutation; and commenting out the fault-report call while leaving its literal source text in the comment.
The traps were: removing one entry from the mounted tier's raw-module allowlist; dropping `--conditions=browser`; a typo'd `--test-name-pattern`; and a `describe`-body throw in both single-file and multi-file shapes.
The fault probes A through E and C2 were inserted into a sandbox copy of the mounted suite, run under a name pattern, then reverted, with the 362/362 baseline re-verified after restore.

**Commercial claims** were retrieved on 2026-08-16 from Foundry's Publisher Handbook, Content Provider Handbook, Premium Content article, FAQ and Licensing Guide, and from the ecosystem cases named above.
Every negative finding in this record is a "searched and did not find", not a proof of absence, and each is labelled that way where it appears.

**Repository state.** The public repository was read at `origin/main`; the seam was read at the head of PR 1186 (issue 1185), which merged on 2026-08-16; the private repository was read on `main` at 120 commits.
The premium design briefs quoted under *What the premium payload demands* are local, gitignored working documents, not versioned artefacts — which is itself a reason to record their demands here, since nothing else in either repository does.
