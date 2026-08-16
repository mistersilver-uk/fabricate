---
layout: default
title: 0002 — Fabricate Premium Companion Architecture
parent: Architecture Decisions
nav_order: 2
---

# ADR 0002 — the fabricate-premium companion architecture

**Status:** Not yet taken — awaiting maintainer selection.
The options, the kill criteria and the evidence below are the record; the *Decision* section lists the questions the maintainer must answer and what each one turns on.
Ten decisions are in scope and the evidence separates most of them; where it does not, this record says so instead of picking.

**Context:** issue 613 (the core plugin API and premium packaging seam, plan-reviewed at revision 3), issue 345 (economy automation), issue 1185 and PR 1186 (the GM Downtime preview and the companion seam that merged with it).
**Depends on:** issue 1185's shipped seam, `openspec/specs/integrations/spec.md` (Specification 008), and the private `fabricate-premium` repository's existing release pipeline.
**Decides for:** issue 613's chunk plan, issue 345's delivery route, the `fabricate-premium` repository's build and gate lanes, and the outbound half of Specification 008.

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
| Does an installed protected module keep working when entitlement lapses? | **Yes, indefinitely and offline.** `fromManifestPath` verifies `signature.json` with `crypto.createVerify('SHA256')` against a public key literal in `dist/core/license.mjs`, over `(license, key, package, version)`. No network call, no expiry field, no clock. What lapses is the ability to obtain a *new* signature, which is bound to the manifest version. | Foundry revokes the **feed**, not the **artifact**. Issue 613's phrasing "Foundry performs the revocation" must not be repeated. A corollary neither source drew out: because the licence string is an input to the signed payload, **changing the Foundry licence key invalidates every installed protected package at once**, which is a support-load fact and belongs in D2's cost column. |
| What happens to an *unsigned* protected module? | It is **invisible, not disabled.** `fromManifestPath` returns `null`, so `getPackages()` never constructs it; a `level: "error"` entry lands in `packages.warnings`. Foundry's own Publisher Handbook says the same from the publisher side. | Core's "companion absent" fallback is premium's **most likely production state**, not an edge case. It is already covered by `subscribeSurfaceIds` plus the core Downtime fallback. |
| Are custom module socket events namespaced, and is `senderId` trustworthy? | **Yes to both.** `registerCustomSocket` binds `module.<id>` when that manifest sets `socket: true`, and `handleCustomSocket` appends `this.user.id` — taken from the session, never from the client — as the second callback argument. `{recipients: [...]}` is a real server-side fan-out filter. | The only confidential channel available to a module is a GM-computed, `{recipients}`-targeted emit. Premium should declare its own `socket: true` and own `module.fabricate-premium`; core's `module.fabricate` already multiplexes four payload families through one handler. |
| Is any module-owned storage confidential from a player? | **No.** `World#g` builds the connect payload with `Setting.dump()`, `Actor.dump()`, `ChatMessage.dump()` and friends, and `dump({sort})` in `server-document.mjs` takes **no user argument and applies no ownership filter**. `express.static(paths.data)` serves any non-denylisted file under a module directory to any authenticated session. `gmOnlyFields` is a write guard. | A GM-only Document is not confidential; `ownership: {PLAYER: NONE}` is not confidential; a whispered `ChatMessage` is not confidential; a JSON file in premium's own module folder is not confidential. D7 has exactly one viable mechanism, and it has costs. |
| Is module load order guaranteed? | **No.** All ordinary modules sit at one script priority — 7 for `scripts`, 8 for `esmodules` — and within-bucket order is `Data/modules/` directory-listing order. `relationships.requires` plays no part in ordering, and `testAvailability` carries a Foundry source comment admitting dependencies are not checked at all. | The exposure is *not* "the companion loaded before Fabricate existed": every module's ESM top level runs before `init` fires. It is `init`-callback ordering, which the documented `init`-then-`Hooks.once('ready')` fallback closes airtight, because core's own `ready` listener is registered at ESM-evaluation time. Three caveats travel with it and are recorded in D5. |
| Can a `protected` module declare `relationships.requires` on a free module? | **Nothing in code prevents it.** `protected` and `relationships` are independent schema fields with no cross-validation anywhere in V14.365. Foundry's own module-development article documents the dependency shape and nowhere prohibits it. `fabricate-mythwright` already ships that exact declaration. | If this is disallowed it is marketplace policy, not code, and policy could not be verified. It is a maintainer action item, not a design risk. |
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

## The ten decisions this record takes a position on

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| # | Decision | Constraints |
|:---|:---|:---|
| **D1** | Where the premium **code** module lives. | 1, 5 |
| **D2** | Distribution and entitlement. | 1 |
| **D3** | The licence boundary, including third parties. | 2 |
| **D4** | The coupling model between the two bundles. | 3 |
| **D5** | Version handshake and compatibility policy. | 3, 4 |
| **D6** | The data-ownership boundary. | 3 |
| **D7** | The player-facing surface and redaction. | 3 |
| **D8** | Fault containment. | 3 |
| **D9** | Verification strategy across two repositories. | 4 |
| **D10** | Shared agentic workflow and gates across a public/private pair. | 5 |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## Options considered

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
| D9 | **D9-b** six tiers, two gates | The five tiers that exist plus the real-Foundry two-module smoke that does not, with containment gated by the mounted tier and loadability gated by the composition tier. Core publishes a contract factory; premium consumes it by pinned git tag and runs it against the real provider. |
| D10 | **D10-a** copy with attribution | The de facto status quo: `scripts/lib/zip.js` in the public repo is a documented port *from* premium's `tools/src/package-zip.js`, so copying already runs in both directions. |
| D10 | **D10-b** adopt the role system | Premium adds `AGENTS.md`, `.agents/skills/` and both provider binding directories. `npm run validate:agents` is pure Node with no dependencies, no Docker and no network, and it *derives* the role list from the bindings table rather than hard-coding it, so it works unmodified in a second repository. |
| D10 | **D10-c** shared npm package | Publish the shared harness from core and depend on it from premium. |

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
| **Option S** | S-K1 the first paid, non-tester cohort; S-K2 a cohort above roughly 50 people; S-K3 a confirmed leak; S-K4 a recurring-revenue product. | **S-K1 and S-K4 fire the moment premium is sold.** They have not fired *yet*: all five modules in `release.config.json` are `channel: "beta"` in one unpaid `closed-beta-2026` tester group. A bearer URL with no expiry is defensible for unpaid testers and is not defensible once money changes hands, because the first churned subscriber keeps the product permanently and the only remedy defects every innocent member of the cohort. |
| **Option F** | F-K1 a fee above roughly 15% of expected net per unit at realistic volumes; F-K2 an Agreement term incompatible with continued storefront distribution; F-K3 a first approval longer than the launch window; F-K4 the dev and CI invisibility hazard proving unfixable. | **F-K1, F-K2 and F-K3 are NOT EVALUABLE** — the fee, the Agreement and the review SLA are all undisclosed. **F-K4 does not fire:** the guard is `!global.options.debug`, premium's manifests are *generated* rather than committed, and so `protected` can be emitted into the released manifest alone. |
| **D3-a** | Two `LICENSE` files being readable by a future maintainer, an acquirer or a diligence lawyer as naming two different rights-holders. | **FIRED on its own text.** Core's `LICENSE` says `Copyright (c) 2026 MisterSilver`; premium's says `Copyright (c) 2026 MisterPotts`; premium clause 3 says content is "included under agreement with MisterSilver". Nothing in either repository states they are one person. |
| **D4-a** | Any cheaper coupling delivering UI hosting without version lockstep. | **FIRED.** D4-b delivers hosting with no shared entry chunks, no exact-version pin and no "a Svelte bump is breaking" release policy — measured, not argued. |
| **D4-b** | `effect_orphan` firing on an own-root mount, cross-runtime event double-firing, or a leak with no available cleanup path. | **Half-fired on the third, and this is why the seam's cleanup is load-bearing.** `effect_orphan` is structurally unreachable and delegation is isolated by a module-scoped `Symbol('events')` — measured, exactly one handler entry per click on each side. But when core drops the target without calling cleanup, the companion **leaks a `document` listener and keeps its effects running on a detached tree**. |
| **D4-c** | Needing DOM co-tenancy, an inherited CSS cascade and synchronous cleanup ordering. | **FIRED by the design it would replace.** All three are properties the seam relies on: core hands a bare connected element, `--fab-*` reach it by inheritance, and cleanup ordering is deterministic only because `mount` is synchronous. |
| **D5-a** | A shipping consumer being able to break silently on a core change with no error surface. | **FIRED, and it already shipped.** `bridge.js` calls four core getters with no version check of any kind and latches on the one-shot `fabricate.ready` hook, so any load order in which core reaches `ready` first leaves it permanently inert with no message. |
| **D6-a** | Requiring changes to core's read, write, normalize, import and export paths before premium can ship anything at all. | **FIRED for a first release.** `_normalizeSystem`'s terminal allowlist runs on every read and every write, `updateSystem` shallow-spreads at the top level, the compendium importer's overwrite path replaces `extensions` wholesale, and the admin store's phase-2 publish carries `extensions` across by reference. Each is a real defect for D6-a and none of them exists at all under D6-b. |
| **D7-a** | The server delivering the source to the player regardless of ownership. | **FIRED, from server source.** `dump({sort})` takes no user argument and applies no ownership filter, so every world setting, Document and whispered message is already on the player's machine. |
| **D7-b** | No server-enforced fan-out filter, or a forgeable sender identity. | **Did not fire.** `handleCustomSocket` emits only to the named users' sockets, and `senderId` is the server's own `socket.user.id`. Its four costs are real and are charged in D7 below. |
| **D8-b** | `Object.freeze` being shallow and same-realm, so a hostile companion escapes regardless. | **FIRED.** The executed probe polluted `Object.prototype` through the frozen mount context's prototype, and a node appended to `document.body` plus a class added to `<body>` both survived unregistration and cleanup. Core only calls `target.replaceChildren()`. |
| **D9-a** | A tier that cannot fail on the thing it is cited for. | **FIRED twice.** Commenting out the fault handler while leaving its literal source text in a comment left the source-text tier fully green at 36/36 while the mounted tier failed. And a `describe`-body throw reports `# tests 0 # fail 0` with **exit code 0**. |
| **D10-c** | Core being unpublishable. | **FIRED.** `package.json` is `"private": true` with no `files`, no `exports`, no `main` and no publish step anywhere; publishing core to npm to serve one private consumer is a large permanent obligation for a Foundry module. |

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
| A player-facing surface where "hidden tiers must not reach the client". | Nothing. See D7 — and note that **no core-owned test tier can ever gate it**, because core hands premium a bare `HTMLElement` and cannot see what is rendered into it. |

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

One already-recorded defect shows the cost of no contract: `game.fabricate.exportSystem()` passes three arguments to `buildExportPayload` where the UI path passes five, so the public export path silently drops the whole gathering authoring bundle while the import path reads it.

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

Three caveats attach to the `init`-then-`ready` fallback and belong in any published load contract:

1. `Hooks.once` deregisters **before** invocation, so a fallback that throws has already burned its one shot and will not be retried.
2. `Hooks.callAll` iterates a snapshot, so arming `ready` from inside `ready` never fires; arming it from `init` is fine.
3. If `fabricate` is merely **disabled** while the companion is enabled, `relationships.requires` does not stop the companion loading, and its fallback returns quietly with no user-visible message.

### The cross-repo contract suite cannot trust its exit code

This is a D5 decision, not a testing footnote, because the failure mode it produces is exactly the one a contract suite exists to catch: core changed, and premium's fixture builder now throws.

Measured on Node v22.22.2: a `describe`-body throw reports `# tests 0 # suites 1 # pass 0 # fail 0` and **exit code 0**.
In the multi-file shape CI actually uses — one throwing file beside one healthy file — it reports `# tests 1 # pass 1 # fail 0`, exit 0.
A fully green run that executed nothing.

**Any core-published contract suite that premium's CI runs must assert `grep -c '^not ok'` and an expected test count.**
Trusting the exit code is not a viable design, and the same applies to any scoped run: a typo'd `--test-name-pattern` reports `# tests 1 # pass 1` with exit 0, because the "1" is the `describe` wrapper.

---

## Distribution and entitlement

The billing *shape* is known even though the amount is not, and the shape is decisive on its own.
Foundry's Publisher Handbook describes a **fee**, not a revenue share: "You will be billed at the end of each calendar quarter for the number of Content Keys which were activated and the amount of Patreon subscription usage during that time period", invoiced from Stripe and due within 30 days.

Two consequences follow immediately.
It is a **cash-flow liability** — you owe Foundry for activations up to a quarter earlier, whether or not a refund since reversed the sale, and Foundry's own policy allows a refund within 30 days if the content has not been installed.
And unit economics scale with **activation count**, so a cheap high-volume product is worse under this model than a percentage cut would be, while an expensive low-volume product is better.

**Money flowing through Patreon does not avoid the fee.**
The handbook's billing sentence meters "the amount of Patreon subscription usage" explicitly, so Option F's cost stack is Patreon's platform fee, plus Patreon's payment processing, plus Foundry's premium-content fee.

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
| Maturity | Working today, 120 commits, hardened after a real past outage | Never implemented |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Precedent points one way.**
Across every free-plus-paid Foundry case found — JB2A, theripper93, Companion Bridge, Baileywiki, The MAD Cartographer — the dominant entitlement mechanism is Patreon-tier linking to a Foundry account, which is Option F.
**No precedent was found for the unguessable-URL model being used for a *paid* audience**; where creators distribute outside Foundry they use named storefronts with keys or account-bound downloads.
The load-bearing case is JB2A, because it matches Fabricate's structure most closely: a free half under a **noncommercial** licence, listed on the official package list, and a paid half sold by the same authors through Patreon.

Option H is defensible rather than a fudge, for four reasons.
Foundry's handbook explicitly sanctions mixing DriveThruRPG, Itch.io, Patreon and personal webstores simultaneously.
Premium's own `tools/src/storefront.js` already draws exactly this line in code, accepting `kind: "content"` and refusing crafting modules.
The properties match the risk: the code module has ongoing update value so feed-level withdrawal actually bites, while content modules are one-shot data purchases where "keep what you bought" is the correct customer expectation.
And it de-risks Option F by learning Foundry's process, fee and approval timing on **one** module before committing five.

Its honest costs are two distribution paths to maintain and document, two support surfaces for a customer who buys from both, and a real compatibility burden between a Foundry-updated code module and a manually-updated content module.

---

## The licence boundary

Core is PolyForm Noncommercial 1.0.0.
PolyForm NC **restricts purpose, not architecture**: it has no copyleft, no source-disclosure obligation, no distribution-triggered reciprocity, and no "combined work" or "linking" concept anywhere in its text.
Its only downstream obligation is passing on the terms.
GPL intuitions do not transfer, and `relationships.requires` is Foundry package metadata, not a legal act.

Three actors get three different answers, and conflating them is the main error risk.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Actor | Position |
|:---|:---|
| A GM who buys the companion and runs core at their own table | Permitted. Buying a companion does not make the *user's* use of core commercial. |
| The companion publisher, developing and testing against core with anticipated commercial application | Not a permitted purpose on the licence's own words. Needs a separate commercial licence. This does not depend on any theory that the companion is a derivative work — it is about the publisher's own development use. |
| Whoever distributes the companion zip | Untouched by core's licence, provided no core code or assets are bundled. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**On the facts, the second row does not bite on the maintainer.**
Core has one human author across 775 commits under three identities sharing email addresses, plus bots; there are no third-party human contributors and no CLA.
A sole copyright holder cannot infringe their own copyright and may grant themselves any terms they like.

**But the paperwork currently says otherwise, and that is the actual risk.**
Read literally, the two `LICENSE` files name two different holders and premium's clause 3 describes the core author in arm's-length terms.
If the maintainer selects D3-b, the wording to record is:

> Fabricate core and Fabricate Premium are authored and owned by the same natural person, who publishes under the names "MisterSilver" and "MisterPotts".
> As sole copyright holder in `fabricate`, that person grants themselves — and any entity they control that publishes Fabricate Premium — a perpetual, irrevocable, worldwide, royalty-free commercial licence to use, modify, and build against `fabricate` for the purpose of developing, testing, distributing, and selling companion modules.
> This self-grant is recorded here so that no assignment, acquisition, or change of maintainer can leave the Premium line without a licence to the engine it requires.
> Any transfer of `fabricate` must carry this grant forward, or Premium must be transferred with it.

**The third-party position is a product decision, and it should be said out loud rather than discovered.**
The seam is deliberately generic: `registerWorldNavProvider` accepts any surface id and inspects nothing about who is calling.
So a third party may build a **free** companion against it under PolyForm NC with no permission and no contact.
A **paid** third-party companion needs a commercial licence from the maintainer, obtained through Patreon, and **the gate is contractual rather than technical** — the API cannot detect or block a paid caller, and enforcement is a licence claim after the fact.
That commercial licence is currently subscription-contingent — core's README says it "remains active only while you maintain the required Patreon tier subscription" — which is a hard term for anyone who needs to ship a product on a stable licence, and is the specific clause most likely to deter serious third-party adoption.
If an ecosystem is wanted, a perpetual paid-up option alongside the subscription tier is worth considering, and the answer belongs in the API documentation as well as here, because a third party reading the API docs will not read this record.

**Precedent is thin in exactly one place, and it is called out as such.**
Free Foundry libraries with published APIs and third-party ecosystems plainly exist — Sequencer, Item Piles, libWrapper, socketlib.
**No documented case was found of a Foundry module publishing a plugin API on which a third-party *paid* module builds as an advertised, sanctioned arrangement.**
That is a "not found", not a proof of absence.
The nearest analogues are paid modules depending on free *permissively*-licensed libraries, which raises no licence question at all — so Fabricate's noncommercial licence is precisely what makes this new ground.

---

## Confidentiality: exactly one mechanism has it

The generalisation that hidden state is safe in a GM-only Document is false, and Foundry's server source disproves it.
`World#g` dumps **every** document source — `User`, `Actor`, `Cards`, `ChatMessage`, `Combat`, `Folder`, `Item`, `JournalEntry`, `Macro`, `Playlist`, `RollTable`, `Scene`, `Setting` — and `dump({sort})` takes no user argument and applies no ownership filter.
Ownership is a client-side UI concern.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Mechanism | Confidential? | Failure mode |
|:---|:---|:---|
| GM computes the redacted view and emits with `{recipients: [playerUserId]}` | **Yes** — the server withholds the bytes from every other socket | Requires an online GM client; fire-and-forget with no persistence, so it is lost on a player reload unless re-requested; several GMs must elect one emitter or the player gets duplicates; `recipients` targets a **User**, so every tab that user has open receives it |
| Request/response over the server-attested `senderId` | **Yes** — same withholding, and the sender cannot be forged | Same online-GM dependency, plus a round trip per view, plus its own timeout and retry, and the GM side must authorise every request because a malicious client may ask freely |
| A world setting, Document or compendium filtered on the player's client | **No** | Total leak. Every byte is already in `game.settings` or `game.actors` on the player's machine, and one console read defeats it |
| Document `ownership: {PLAYER: NONE}` | **No** | Sidebar and UI visibility only |
| A `ChatMessage` whisper | **No** | Message documents are dumped unfiltered; `isContentVisible` is client-side cosmetics |
| A JSON or asset file in the companion's own module directory | **No** | `express.static(paths.data)` serves it to any authenticated session |
| `documentTypes.*.gmOnlyFields` | **No**, for reads | A write guard that blocks a non-GM update, never a read |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

So "hidden faction tiers must not reach the client" forces the first or second row, and there is no third answer, because Foundry gives a module no server-side storage its clients cannot read.

Two further facts belong with this decision.
Premium should declare `"socket": true` in its own manifest and own `module.fabricate-premium`, because core's single `module.fabricate` handler already multiplexes four payload families and core has never used `{recipients}` at all.
And **no core-owned test tier can ever gate premium's redaction**: `context.isGM` is a client-side boolean any fake can set either way, and core cannot see what premium renders into the element it hands over.
A real-Foundry **player-client** assertion is the only possible gate, and that tier does not exist.

---

## Fault containment: what the seam contains, and what it does not

Twenty-three faults were enumerated and the interesting ones were **executed** against the mounted tier rather than reasoned about.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Class | Faults | Note |
|:---|:---|:---|
| Contained **and** asserted | A throwing `mount`; a non-function return; an `async` `mount` refused at registration; a throwing cleanup; a throwing subscriber including on first replay; `javascript:` and `data:` href injection; duplicate surface registration; a stale unregister handle; a write back into the frozen context; the companion being absent altogether | Ten faults, and the fault-handling design is genuinely good |
| Contained but **unasserted** | A throwing header-action `onSelect`; an infinite `requestRemount()` from inside `mount`; mutation of `provider.tabs` after registration | All three are cheap tests. Two are contained **by accident** — by Svelte's internals rather than by core code — so a Svelte upgrade could silently un-contain them. The remount probe ran **1001 synchronous mounts** with no error surfaced to console or user; the bound is Svelte's effect-depth limit, not core's |
| Containable but **not contained** | DOM escape outside the target; leaked timers and listeners; a throwing Foundry hook handler; `lang/en.json` key collision under `FABRICATE.*`; CSS bleed; settings-namespace collision; socket abuse on `module.fabricate`; mutation of `game.fabricate.api` | The probe appended a node to `document.body` and added a class to `<body>`, and **both survived unregistration and cleanup**, because core only calls `target.replaceChildren()`. Most of these are convention plus the missing Foundry tier, and the ADR should write them down as **documented companion obligations** rather than pretend they are enforced |
| **Inherent** | `Object.prototype` pollution through the context's prototype; a blocking synchronous `mount` | `Object.freeze` is shallow and same-realm, and a synchronous `mount` is what makes cleanup ordering deterministic. Only an iframe or worker boundary would contain either, which D4-c would buy at the price of the whole design |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The honest headline, in the words it deserves: **the seam contains everything that goes wrong inside the call it makes, and nothing that goes wrong outside it.**
That is the correct trade for this design, and it means **`fabricate-premium` is trusted code running in core's realm**.
The verification strategy limits blast radius and detects contract drift; it does not sandbox, and nothing in this record should be read as implying that it does.

---

## Verification: what can actually fail

Five tiers exist and one does not.
Every mutation below was executed, not predicted, from a throwaway copy of the seam worktree with `node --conditions=browser --test`.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Tier | Cost | What it is the **only** place to catch |
|:---|:---|:---|
| **T0** registry unit, 10 tests | 134 ms | Nothing on its own — it is the cheap enumerator. But it is today the only tier that fails when the async-`mount` rejection or the href scheme allowlist is removed, and the seam's one script-injection guard is defended by exactly one test in the cheapest tier |
| **T1** no-Foundry composition, 2 tests | 16.1 s | That the *production module entry* publishes a stable API object across the init-to-ready lifecycle replay. Deleting `bindFabricateGlobal()` from the `ready` hook — a real regression that would strand a companion registered at `init` — was caught **here and nowhere else**, including by the source-text mirror, which still read the literal call in the file and passed |
| **T2** mounted manager, 362 tests | 21.3 s | The DOM handoff itself: cleanup runs exactly once, at the right time, with the target still connected; the context is frozen and re-identified per remount; a throwing mount falls back to core. **This is the containment gate**, and it is faster and sharper than a Foundry run |
| **T3** source-text and docs mirror, 36 tests | — | Drift detection on hand-maintained mirrors, which is legitimate. **It must never be cited as evidence for a behaviour**: commenting out the fault handler while leaving its text in a comment left it 36/36 green |
| **T4** real-browser View Lab, one case | one Firefox frame | Real cascade, container queries, overflow and focus ring, which happy-dom cannot compute. Today it photographs a well-behaved provider, never a hostile one |
| **T5** real-Foundry two-module smoke | **does not exist** | Two real module loads at the same `esmodules` priority; the `lang` merge; settings and socket namespace collisions; the CSS cascade with two stylesheets; `game.modules.get('fabricate-premium').active` and the entitlement-invisibility case; and the player client, which is where the redaction constraint actually lives |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**The fixture companion must be adversarial, and that is a measured requirement rather than a style preference.**
Hard-coding core's own four tab ids as accepted membership broke 7 of 10 unit tests, 1 of 2 composition tests and 8 of 362 mounted tests — and then, with the same mutation still applied, a counterfactual fixture whose tabs *mirrored* core's four ids and claimed only core's own surface id passed 2/2, **green**.
A core-mirroring fixture ships clean through a change that would break every real companion.
The existing discipline already de-mirrors ids, counts, order, surface ids and localization; the one gap that matters is **module identity** — the fixture is an object literal in the same file, so the entire class of "two independently loaded ES modules" faults has no fixture at all.

Two mechanical hazards travel with the plan and both are measured.
Removing one entry from the mounted tier's raw-module allowlist produced `# tests 362 # pass 0 # fail 0 # cancelled 362` — a CI step that greps `# fail` sees green, and only the exit code and the `not ok` line catch it.
And `package.json`'s `test` script is a literal list of nine directory globs that does **not** include `tests/contract/`, so a contract suite placed there would pass when invoked directly and never run in CI.

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

The residual risk sits in specific design choices rather than in the concept, ranked:

1. **A padlocked nav item is a claim about withheld capability, not just an advert.**
   Because Downtime code will never live in the public repository, nothing was taken away — but a user cannot tell that from a padlock.
   The single highest-leverage mitigation is preview copy saying explicitly that Downtime is a separate product that has never shipped in the free module.
2. **Four premium surfaces for one product**, where the precedent modules advertise once.
   The source comment beside the header action already concedes it exists only because "a shipped control labelled 'Unlock with Premium' that does nothing is dead UI" — which is an argument for removing the control, not for wiring it to Patreon.
3. **An external commercial link opening in a new tab from inside a GM tool** is the specific behaviour that reads as an advert rather than as product information.
4. **The interaction with the noncommercial licence.**
   A free NC-licensed module that advertises the maintainer's own paid product while requiring third parties to buy a commercial licence to do the same thing is a fair-play criticism someone will eventually make out loud.
   It is answerable — sole copyright holder, stated openly — but only if the third-party position is stated up front rather than discovered.
5. **The call to action leads to Patreon, not to an install.**
   Under Option S, entitlement, download and enable are three further manual steps, so the control over-promises.
   **Option F materially reduces this specific risk**, because the Patreon link genuinely does lead to an in-client install path — which is a D2 input, not merely a copy note.

---

## What was NOT established, and why

A record with no gaps is a record that is hiding some.
The first three items **block a decision on D2** and are maintainer actions, not research gaps.

- **Foundry's premium-content fee amount.**
  It is **not publicly disclosed anywhere** — absent from the Publisher Handbook, the Content Provider Handbook, the Premium Content article, the FAQ and the Licensing Guide, and multiple targeted searches on 2026-08-16 returned nothing.
  **The maintainer must contact Foundry to obtain the current Premium Content Agreement and fee schedule, and D2's cost line is STALE until that lands.**
  F-K1 cannot be evaluated before it.
- **The text of the Premium Content Agreement.**
  Never publicly retrieved.
  Exclusivity, IP, pricing-control and termination terms are all unknown, and F-K2 cannot be evaluated without reading it.
- **First-approval lead time.**
  No SLA is published anywhere.
  Only the *first* approval is a gate — subsequent uploads are immediately available — so the risk is front-loaded and one-off rather than per-release, and no charges accrue during onboarding and development.
  That is much better than it first appears, but an unquantified delay is still a launch-schedule risk and must not be recorded as "a few weeks".
- **Whether Foundry's package policy permits a `protected` package to require a free one.**
  Nothing in V14.365's code prevents it and no Foundry document prohibits it, but that is absence of prohibition rather than express permission.
  Confirm it in the same email as the fee.
- **V13, entirely.**
  V13 is not installed and Foundry was never booted for this record.
  Unverified on V13: the `@layer` declaration list and whether `exceptions` exists and follows `modules`; the script and style priority table; whether `handleCustomSocket` has the identical `{recipients}` signature and server-attested third argument; and whether the `signatureV2` and `package`-keyed signature payload branches are a V13-to-V14 fork.
  `module.json` declares `minimum: "13"`, so this is a real coverage gap and not a technicality.
- **The premium S3 bucket, which two sources disagree about.**
  `release.config.json` declares `bucket: mistersilver-foundry-releases` and `baseUrl: https://releases.mrsilver.io`.
  A prior live enumeration recorded during the release-model work found all five premium modules sitting in **core's** bucket under `modules/<slug>/`, and found that CDN host did not resolve; core's own `release.s3.config.json` names `fabricate-modules-088545273404-eu-west-2-an`.
  **Neither was re-checked for this record, so config and observed reality remain in conflict and this is marked unverified.**
  It bears directly on D2, because the bucket policy is the entire mechanism that makes Option S's secret-path gate work.
- **Whether `--debug` is a usable escape hatch for the invisibility hazard.**
  The V14.365 guard is `!global.options.debug`, so the flag bypasses the signature check in code.
  Issue 613 states the opposite on the grounds that `ServerSettings#initialize` only sets `debug` when `resources/app/server` exists, which no shipped build has.
  Both readings may be correct — a code-path bypass that cannot be reached on a shipped build — and neither was exercised.
  F-K4's mitigation therefore rests on emitting `protected` only into the released manifest, not on `--debug`.
- **Svelte runtime *version* skew.**
  Only two byte-identical copies of 5.56.3 were tested.
  The isolation mechanisms proven — a module-scoped `Symbol`, a module-scoped `active_effect`, a per-runtime batch queue — are version-independent by construction, so this is very likely fine and it is unmeasured.
- **The bundle-byte cost of the duplicated runtime, and real-browser behaviour.**
  Neither was measured; the experiment ran under happy-dom only, and no build was run from the read-only lane.
  Measure the bytes with the real build before this record's successor quotes a number.
- **Every T5 claim.**
  The tier does not exist, so nothing in it could be mutated.
  No two-module Foundry boot was attempted; the harness delta is derived from reading `foundry-setup-data.mjs` and `foundry-test-run.mjs`, not from running them.
- **socket.io behaviour for `recipients` when the target user has zero open sockets.**
  Reading the loop says the message is dropped with no error and no ack distinction, but this was not exercised.
- **Whether the shipping `bridge.js` survives the narrowing D5 proposes.**
  It calls four getters that a narrowed contract might not keep.
  Nobody has checked, and it ships in a released module today.
- **Three questions needing professional legal advice, which this record frames and does not answer.**
  Whether PolyForm NC's "permitted purpose" attaches to the *act* of running a copy while writing a paid product or to the paid *product* itself, on which no case law construing PolyForm NC was found.
  Whether a companion sharing core's runtime instance in-process could be argued a derivative work independently of the licence text — the reading here is no, and "shares the licensor's runtime instance in-process" is precisely the fact pattern that makes the argument non-trivial, which is one more reason D4-b is preferable to D4-a.
  And whether a subscription-contingent commercial licence is enforceable and workable as drafted.

---

## Recommendation

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| # | Recommended arm | The reason, in one line |
|:---|:---|:---|
| **D1** | **D1-c** — monorepo, own build and gate lane | The workspace, the release pipeline and a shared esmodule package already exist; only a build is missing, and a lane keeps a Svelte toolchain off a content pipeline that never uses it |
| **D2** | **Option H**, with Option S retained **only** for unpaid closed-beta testers until S-K1 fires, and the cost line marked **stale** | Precedent is unanimous for Patreon-tier linking and found nothing for a bearer URL serving paying customers; premium's own toolchain already draws the code/content line; and the hybrid learns Foundry's process on one module instead of five |
| **D3** | **D3-b** — record the self-grant, normalise the copyright lines, rewrite premium's clause 3, adopt a CLA or DCO before the first outside PR | It costs nothing now and is expensive later; once a third party owns any part of core, the self-grant story stops being clean and relicensing becomes a consent problem |
| **D4** | **D4-b** — the DOM handoff, as shipped | Measured to work, with `effect_orphan` structurally unreachable; it delivers UI hosting with no lockstep, no shared entry chunks and no "a Svelte bump is breaking" policy |
| **D5** | **D5-b** — narrow the reachable internals into a named contract with a version constant, a `supports(range)` predicate and degradation instead of throwing | The published surface is already a set of internal objects, so this is a narrowing exercise with a compatibility promise, and it is strictly harder to retrofit after a paid product depends on it |
| **D6** | **D6-c** — premium owns its own storage for the first release; build the core-hosted slice only when a premium slice must ride a system export | Every defect that makes D6-a expensive — the terminal allowlist, the shallow spread, the wholesale importer replace, the phase-2 reference carry — exists only under D6-a |
| **D7** | **D7-d for the first release, then D7-b** | Client-side filtering is ruled out from server source; the GM relay is the only confidential channel and its four costs are real, so it should be built deliberately rather than discovered under a shipping player window |
| **D8** | **D8-a** — accept same-realm trust, close the two cheap gaps, and write the rest down as companion obligations | Isolation was measured not to hold: prototype pollution succeeded through the frozen context, and escaped DOM survived cleanup |
| **D9** | **D9-b** — six tiers, two gates, an adversarial fixture, a contract factory consumed by pinned git tag, and a runner that asserts `not ok` counts and an expected test count rather than an exit code | Each gate is the only place its constraint can fail, and both the vacuity of the source-text tier and the green-run-that-ran-nothing were executed rather than predicted |
| **D10** | **D10-b** — premium adopts `AGENTS.md`, `.agents/skills/` and both binding directories first; re-derive lint globs per repository; keep copy-with-attribution for everything else | `validate:agents` is dependency-free and derives its role list from the bindings table, so it is the cheapest, highest-leverage thing to share, and core is unpublishable so a shared package is not available |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

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
| **Redaction has no possible core-owned gate.** Under D7 the only gate is a real-Foundry player-client assertion in premium's CI, and that tier does not exist. | **High** | Do not ship a player-facing premium surface before it does. |
| **A shipping consumer has no version check.** Narrowing the internals under D5-b can break `fabricate-mythwright` v0.11.0 silently. | Medium | Check `bridge.js`'s four getters against the narrowed contract before publishing it, and fix the documentation so `whenReady()` is taught instead of the one-shot hook. |
| **Two `Party` aggregates.** Core owns `GatheringParty`; the GM Downtime brief defines its own `Party` with markers, membership moves and a flag fallback. | Medium | True today only of the preview. Two GM-authored aggregates grouping the same actors is either a deliberate split or a duplication a GM will resent, and the domain owner must take a position before the Studio ships. |
| **D6-c defers a decision it may have to unwind.** If a premium slice turns out to need to travel inside a system export, the core work arrives later and under more pressure. | Medium | The trigger is stated, so this is a scheduled cost rather than a surprise. |
| **The premium signal's padlock reads as withheld capability.** | Medium | Cheap to mitigate in copy; expensive to mitigate after the first public complaint. |
| **V13 is unverified throughout** while `module.json` supports it. | Medium | The `styles[].layer` trick, the socket signature and the priority table are all V14-only readings. |
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

**Not yet taken — awaiting maintainer selection.**

Following the precedent set by ADR 0001: the *Recommendation* above records the evidence and must not be edited to agree with a later divergent decision.
If the maintainer selects differently, the reasoning for that selection is written here, and the sections above stand as the evidence it was taken against.

The maintainer must answer these, and each one turns on something specific.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| # | Question | What it turns on |
|:---|:---|:---|
| 1 | **Option S, F or H for D2?** | The Foundry fee schedule and the Premium Content Agreement, both undisclosed and both obtainable only by contacting Foundry — and on whether the first paid, non-tester cohort is imminent, because S-K1 and S-K4 fire the moment it is |
| 2 | **Is the D3-b self-grant adopted, and are the two `LICENSE` copyright lines normalised?** | Whether core might ever be transferred, sold or handed to another maintainer, and whether outside PRs will be accepted — because a CLA or DCO must precede the first one, not follow it |
| 3 | **Are paid third-party companions welcome, and on what terms?** | Whether an ecosystem is wanted at all, and whether a perpetual paid-up commercial licence is offered alongside the subscription-contingent tier that currently deters it. The answer belongs in the API documentation, not only here |
| 4 | **Does core narrow the reachable internals into a published contract, and when?** | How much core work premium's first release may depend on. The internals are already reachable, so declining to narrow is a decision to let every method premium calls become de facto public with no deprecation policy |
| 5 | **Does core build the `CraftingSystem.extensions` slot now, or on a trigger?** | Whether a premium slice must travel inside a crafting-system export in the first release. If it must, D6-a lands with all its persistence work; if it need not, D6-c defers it at no cost |
| 6 | **Does the first premium release ship a player-facing surface?** | Whether the GM-relay's four costs — an online GM, emitter election, loss on player reload, and per-User rather than per-tab targeting — are acceptable, and whether premium's CI can run a real-Foundry player-client assertion, because nothing else can gate the redaction |
| 7 | **Who owns and pays for the two-module Foundry tier?** | Whether premium's CI may hold both artifacts, which it can and core's cannot. Core's substitute is a checked-in fake premium module with a real manifest and its own `esmodules` entry, which buys load-order and namespace coverage without the private repository |
| 8 | **Does premium adopt core's `AGENTS.md`, `.agents/skills/` and provider bindings?** | Willingness to keep two copies in step, offset by `validate:agents` turning drift into a failing check. Note the flow is two-way: premium's multi-model orchestration package has no core equivalent |
| 9 | **One `Party` aggregate or two?** | Whether the Downtime Studio's Parties tab extends core's `GatheringParty` or is a deliberate, defensible split. Two GM-authored aggregates over the same actors is a product decision, not a schema detail |
| 10 | **Is the premium signal reversal accepted as shipped, softened, or reverted?** | Whether "Core ships no advertisement for premium in v1" is withdrawn on the record. If it is not withdrawn, the shipped padlocks, badges and call to action must come out; leaving both statements standing is the one outcome that is definitely wrong |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

---

## Consequences

**Issue 613** is superseded in part and confirmed in part, and neither half should be inferred from the other.
Its Chunk A and Chunk B shared-runtime programme — the unhashed entry chunks, the exact Svelte pin, `assertSharedRuntime`, the build-artifact grep for inlined internals and the "a Svelte bump is a breaking plugin-API change" policy — is superseded by D4-b.
Its §5 persistence work, its nine manager consult points and its admin-store slice are **deferred by D6-c, not deleted**: every hazard it documents is real and returns intact the day the trigger fires.
Its §12 services surface survives and is reframed as a narrowing exercise rather than a build-from-nothing.
Its phrase "Foundry performs the revocation" must be corrected to future-facing withdrawal of the feed.
Its open questions 1 to 4 remain open and are items 1 to 4 of *What was NOT established*.

**Issue 345** stays open and is delivered through the premium module; its build-time edition gate was already superseded and nothing here revives it.

**PR 1186** is the shipped answer to D4 and is confirmed by measurement rather than merely accepted.
Its four cleanup paths are load-bearing: without them a companion leaks a `document` listener and keeps running on a detached tree.
Its premium signal reverses issue 613's out-of-scope line, and that reversal is recorded above rather than left implicit.
Its `worldDowntimePreviewProvider.js` correctly states that core's four preview tab ids are not the provider contract — which matters, because the real GM Downtime brief has **five** tabs, and an earlier revision of the seam that froze the set would have blocked the real design.

**`openspec/specs/integrations/spec.md`** is 49 lines written entirely for the **inbound** direction, Fabricate consuming a third party.
Its criteria 5, 6 and 7 — mock-the-companion tests, a documented compatibility range, and version-gated feature detection rather than hard crashes — have exact outbound analogues, and **none of the three is implemented for the outbound seam**: `registerWorldNavProvider` throws on an unsupported `apiVersion` rather than degrading, and no compatibility range is published.
Whichever way D5 is decided, that specification gains an outbound section saying so.

**The `fabricate-premium` repository** gains, under the recommendation: its own code build lane, core's role system and `validate:agents`, a runtime guard on `game.modules.get('fabricate')`'s version, its own `socket: true` and `module.fabricate-premium` namespace, a disjoint localization root, and a CI check that fails if any file bearing core's PolyForm header lands in a shipped module — so the non-copying property stays true rather than merely being true today.

**Two core defects were found in passing and are follow-up issues for the maintainer, not content for this record:** `emitManagerHook` does not guard `Hooks.callAll`, and `game.fabricate.api` is mutable so any module can overwrite core's exported classes.

---

## Provenance

**Foundry facts** were read from a local install at `resources/app`, `package.json` `version: "14.365.0"`, `release: {generation: 14, channel: "stable", build: 365}` — the same generation the smoke image pins.
Foundry was never booted and no Docker was started; V13 is not installed.
Claims are cited by symbol and file throughout — `fromManifestPath`, `installPackage`, `handleCustomSocket`, `dump`, `_getStaticContent`, `component_root`, `validate_effect` — because line numbers rot and `npm run validate:agents` rejects them.

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
