# Companion API

## Purpose

Define the requirements for Fabricate's **outbound behavioural** contract: the capabilities Fabricate publishes so a companion module can settle work against an actor — grant the knowledge an activity teaches, ask what a cost comes to, read what the actor already holds, roll a check for an actor, or settle one roll decision for many.

This specification governs a companion **consuming Fabricate's behaviour**.
Outbound **UI contribution**, by which a companion contributes navigation and content into Fabricate's own windows, lives in `ui-integration/spec.md`.
**Inbound** integrations, by which Fabricate consumes another module's data or services, live in `integrations/spec.md`.

## Scope

This spec governs:

- What the published contract is, where it is read from, and when it is readable.
- What each promise tier does and does not guarantee.
- The authorization, readiness and answer rules every behavioural member obeys.
- How the contract may change without breaking a companion that depends on it.

Behaviour stays with its domain.
The knowledge grant's own gates are specified in `recipe-visibility/spec.md`, the learned-entry shape and the currency rules in `data-models/spec.md`, and the rendering of a granted row in `ui-integration/spec.md`.

## The Published Contract

Fabricate publishes exactly one named, versioned contract for outbound behavioural consumption: `game.fabricate.api.COMPANION`, a frozen `{ schemaVersion, members, outcomes }` descriptor.

`schemaVersion` is readable from **Fabricate's own `init` hook onward**, and for the whole of `setup` and `ready`, before any collaborator exists.
It is **not** guaranteed readable from another package's `init`.
Foundry dispatches `init` listeners in module-script execution order, which is ordered by the `library` manifest flag and then by world module-collection order, and `relationships.requires` does not influence that order.
Fabricate declares no `library` flag, by decision: raising one WOULD close the hole against an ordinary companion, since Foundry's package sort is stable and every `library`-flagged package's scripts run before any non-`library` package's — but the flag is a claim about what the package *is*, "no user-facing functionality," which Fabricate is not, so setting it would misdescribe the package and would additionally reorder Fabricate ahead of the game system; that trade is declined regardless, and the residual gap against another `library: true` package would remain in any case.

A companion MUST therefore read the version in `setup` or `ready`.
A companion that reads it at `init` MUST treat an absent `game.fabricate` as *Fabricate has not loaded yet* and retry — never as *this Fabricate has no contract*, and never as a trigger for a degraded path.

## Promise Tiers

Every member is declared at exactly one promise tier, `stable` or `handle`.
**Nothing outside the declared set is contract, however reachable it is.**

A `stable` member guarantees its name, the arguments it accepts, and its result shape.
It **never throws**: it refuses in the same result shape it succeeds in, carrying a stable `outcome` token alongside a `message` that is **always a localization key**.
Free text is never carried in `message`; where a lower layer produces free text, it rides in `messageData`.

A `handle` member guarantees the accessor's name, and that it answers the object Fabricate itself uses or `null` before readiness.
It guarantees **nothing about that object's method surface** beyond a declared carve-out.

`getCraftingEngine().findComponentItems` declares its carve-outs in full: it takes **documents, not ids**; its third argument is a crafting-system **object**, not an id; and it **throws on a null actor and on a null component**, with only the system argument tolerant.
The carve-out is stated in full because a companion that guards only against a null actor still crashes.

## Behavioural Member Rules

Every `stable` member **that reads or acts on a specific actor** takes an **`actorId`**, never an actor uuid, and resolves it through `Fabricate#_resolveCraftingActor`.
A member that answers a question about the caller's own request rather than about an actor takes none: an ownership gate on an argument the member never reads is ceremony a later reader deletes, and a caller passing one would infer a gate that does not exist.
The narrowing is bounded by the positive rule — any member that **does** touch an actor is still bound by the sentence above, and by the named resolver rather than by a bare collection read.

Every `stable` member is **GM-gated on `isGM`**, refusing `gmOnly` otherwise, and refuses `notReady` before the module is ready rather than throwing.
A member reachable from a handler that fires on **every connected client** additionally requires the caller to declare its **call site**, and for a broadcast call site refuses `notElected` unless this client is the elected executor (`game.users.activeGM?.id === game.user?.id`).
**The election admits assistant GMs and prefers a full GM only when one is connected**: `Users#activeGM` is `getDesignatedUser(u => u.active && u.isGM)`, `getDesignatedUser` returns the highest-role qualifying user with a deterministic id tie-break, and `User#isGM` is `hasRole(ASSISTANT)` — so a sole connected assistant **is** elected, and an assistant-only table is not silently dead.

The gate order is **GM → actor → readiness**, and the order is normative.
The readiness check throws, and a member that may not throw therefore tests readiness **after** the never-throwing refusals rather than before them.
A readiness-first preamble would make a pre-`ready` non-GM call throw where the shipped reset returns `gmOnly`.
A member's own **request validation, and its call-site and election gates, run AFTER the readiness refusal**, inside the member rather than in the shared preamble, exactly as `invalidGrantedBy` and `invalidAmount` do.
Two costs are recorded with the rule rather than left for a companion author to discover: a GM holding a stale `actorId` answers `noActor` before any call-site check, and a pre-`ready` call answers `notReady` before `invalidCallSite`.

The one authorization rule — caller is a GM, and the `actorId` resolves to an actor the caller may act as — exists **once**, as a shared preamble, for every GM-gated **actor-targeted** member, and each such member supplies its **own** refusal strings to it.
A member that targets no actor is GM-gated by its own inline check and answers its own `gmOnly` string; the rule as stated here is a conjunction, and a member satisfying only its first conjunct is not a second copy of it.
A failed grant must not report itself in the words of a failed reset.

## The Outcome Vocabulary

`COMPANION.outcomes` is **open by declaration and closed by enumeration**.
It is complete for the current `schemaVersion`.
A member may emit a **new** outcome without a version bump; renaming or removing one is a bump.

Callers MUST branch on `success` first and treat an unrecognised `outcome` as a generic refusal.
An exhaustive `switch` over the vocabulary is a caller bug, not a contract breach.
This is stated because freezing the vocabulary shut would make every new refusal path a major version, which is the wrong trade for a surface whose purpose is to make refusals legible.

## The Caller's Single-Executor Obligation

A companion invoking any member from a handler that fires on **every connected client** — a synced hook such as `updateWorldTime`, or a socket broadcast — MUST elect a single executor (`game.users.activeGM?.id === game.user?.id`) before acting on the answer.
For a member that **only reads**, reading is harmless; acting on the read from N clients is not, and a grant under N clients is N writes.
Fabricate cannot enforce this from inside a read, which is why the contract states it.

A member that itself produces an externally observable effect — opening a dialog on the executing client, or posting a roll to chat — is **not** a read, so that justification does not cover it.
**Fabricate discharges this obligation for such a member only for a call site truthfully declared `broadcast`**, by refusing `notElected` on an unelected client.
**A companion that declares `gmAction` from a synced hook bypasses the gate entirely and reinstates the caller's obligation in full**, because the declaration is the only signal Fabricate has and nothing in the environment can check it.
The deeper harm is not the duplicated dialog or the duplicated chat message: N clients roll N **different totals** and hand them to N companion instances, which then apply N sets of consequences Fabricate can neither see nor reconcile.

## The Standalone Check Roll

Fabricate publishes its check-roll **mechanics** to a companion that owns no crafting system, as a **Standalone Check Roll**.

"Standalone" is a claim about the **crafting-system** axis: the roll stands outside any `CraftingSystem`.
It is **NOT** a claim about the **game-system** axis, where Fabricate is agnostic on every path including this one — a Standalone Check Roll is exactly as game-system agnostic as every other Fabricate check.
Stating this positively is required rather than optional: a companion author who reads only the negative expects their modifier catalogue to apply and files its absence as a defect.

A Standalone Check Roll is therefore **not "a Fabricate check"**.
A Fabricate check is always taken on a subject inside a crafting system, and carries that system's modifier catalogue, combination rule, tool bonuses, authored triggers, tier stepping and failure-result policy.
A Standalone Check Roll is `@`-placeholder resolution against the actor's roll data, the retired-placeholder shim, the Advantage/Disadvantage rewrite, the free-text situational bonus with its `Roll.validate` net, the roll mode and the chat post, and the pass/fail or raw-total answer — **without the system-derived terms**, because there is no crafting system and no subject to derive them from.

Two members publish it.

`rollActorCheck` rolls one formula for one actor and answers `{ success, passed, total, diceGroups, resolvedFormula, outcome, message }`.
Its request key set is **closed**: exactly `{ actorId, callSite, formula, dc, compare, label, interactive, rollDecision }`, and nothing else is read.
No caller-supplied bag is spread into the options builder, the runner, or the nested roll options: a spread would let a companion inject its own prompt and bypass the dialog, or a speaker impersonating another actor in chat, while satisfying every behavioural assertion.
`img`, `subjects`, `rollMode` and `speaker` are deliberately absent from the first version — `rollMode` is inherited from the client default and `speaker` is derived from the resolved actor and is never caller-supplied — because a member MAY gain an optional argument without a version bump but may not lose one.

`resolveBulkCheckDecision` answers **one** roll decision — situational bonus, roll mode, Advantage disposition — for N rolls the caller will make, and **rolls nothing**.
Its request key set is exactly `{ callSite, formulas }`.
It answers `{ success, decision, allowAdvantage, covered, outcome, message }`, where `covered` is the array of **indices into the caller's own `formulas` array** that the decision covers — indices rather than formulas, because two subjects may share a formula and the caller must map the answer back onto its own subjects.
Answering before anything starts is what makes zero mutation on a dismissal structural rather than compensating.

**Derived answer fields are computed from the outcome and from the member's own internal record, never from a caller-supplied bag.**
`passed` is `true` for `checkPassed`, `false` for `checkFailed`, and `null` for everything else including the ungraded `rolled`, which is not graded and so has no pass.
`total` is **always the raw roll total** and is `null` for every refusal, `engineUnavailable` and `noFormula` included; a legitimate rolled `0` answers `0` and never `null`.
The member never forces an outcome — it passes an empty trigger list explicitly — so the runner's forced-award divergence between the awarding value and the raw total is unreachable, and a later change that admits triggers cannot silently redefine a published field.
`diceGroups` and `covered` are **lists**, so their absence is `[]`; a `null` would force every caller to guard a length read.
The scalars are `null` for the opposite reason: their absence is meaningful, and `0` or `false` would be a confident wrong answer.

**Two pre-dispatch gates are required, not one.**
First a **post-shim usability test**, defined identically to `resolveActiveCraftingCheckFormula`'s — the retirement shim, then a trim, then an emptiness test — refusing `noFormula`.
Then a **dice-engine test**, refusing `engineUnavailable`.
Both are required because the shared evaluator reports "no engine" from **two** sites: a missing dice engine, and a formula the retirement shim empties with the dice engine fully present.
Without the first gate, a formula such as `@craftingmod` reaches the pass/fail runner and returns through its non-blocking free pass as a **pass with the DC ignored**.
That free pass remains reachable from a direct runner caller and is tracked as `fabricate#1296`; this contract closes it at the published member by refusing in front of it.
`noFormula` is tested first because "you gave me nothing to roll" is the better answer than "this client cannot roll" when both are true; the order is safe in either direction, because with no dice engine the shim fails **open** and keeps the residue rather than emptying it.

**The runner's answer is discriminated by a three-step ladder, and the ladder is normative.**
First `cancelled === true`, tested first because it is the one fact true on both arms and at every `interactive` setting.
Then **strictly `value === null`**, never a falsy test, because a legitimate rolled `0` is falsy and a falsy test reports it as a failed roll.
Otherwise grade on the runner's own `outcome`.
The naive discriminator — a false `success` with a null value — is true of a throw, a dismissal and a cancel alike; derived, it reports a broken formula as "the GM declined", and the companion silently does nothing forever with nothing in the console.

`allowAdvantage` is computed over the **usable subset** of the supplied formulas and is all-or-nothing across it: offering Advantage only some rolls could honour would be a lie about the rest of the batch, and denying it because of a formula that can never roll would be a lie about the ones that can.
A batch with **no** usable formula answers `nothingToDecide` with `success: true`, a null decision and an empty `covered`, and opens no dialog — "there is nothing to prompt about" is a correct answer, not a failure.
The bulk prompt's item count is the caller's **whole batch**, not the usable subset, matching the shipped bulk-salvage prompt.

The display label is defaulted to a **localized activity noun**, because the shared flavor template appends the literal word "check" with no guard and an omitted label would post "undefined check" to a GM's chat log.
**The default is an activity noun and MUST NOT itself end in the word "check"**, or the flavor renders a doubled "check check"; a translation of it is bound by the same rule.

**The published member INHERITS every safety behaviour of the shared roll path and exposes no request key that turns any of them off**: the retired-placeholder shim, the `Roll.validate` situational-bonus net, the suppression of Foundry's own roll resolver, chat failures logged and swallowed rather than thrown, and the client's own default roll mode read through the shared reader rather than taken as an argument.
An opt-out for any of these would let a companion reach a throwing dice-engine call through a member that may not throw.
The suppression of Foundry's roll resolver is **inherited, not restored**: a GM configured for manual or physical-dice fulfilment still does not type their die result here.
What this capability restores is a **different** dialog — Fabricate's own roll prompt, which reports its own dismissal so the caller can abort with zero mutation, where Foundry's dice resolver fulfils a closed dialog with a random face indistinguishable from a typed one.

## The Call-Site Rule

A second shared rule exists **once**, beside the authorization preamble and deliberately separate from it, because it answers a different question: the preamble asks WHO is calling, this asks WHERE FROM.
It is sited **after** readiness, because it is request validation.

`callSite` is **required and has no default**.
Nothing in the request or the environment distinguishes a GM's deliberate click from a synced tick that fires on every connected client, so a default would be a coin flip rather than a bad inference.
`gmAction` declares a single-client, user-initiated GM action and is gated on `isGM` alone: there is no duplicate-execution risk, and requiring election would lock out the assistant GMs the surface already admits.
`broadcast` declares a handler that fires on every connected client and is additionally gated on the elected executor.
`invalidCallSite` covers **both** a missing and an unrecognised declaration, because "not declared" is wrong for the second.

The refusal **is** the enforcement.
The shipped internal `caller` discriminator is required of an internal call site, so a forgetful one is caught by Fabricate's own tests; `callSite` is required of an **external** caller on a member that may never throw, which is why an unrecognised value is a first-class outcome rather than a thrown error.

## The Outcome Vocabulary Added By The Standalone Check Roll

The Standalone Check Roll adds exactly these outcomes: `checkPassed`, `checkFailed`, `rolled`, `rollFailed`, `cancelled`, `engineUnavailable`, `noFormula`, `invalidCallSite`, `notElected`, `invalidRollDecision`, `decided`, and `nothingToDecide`.
Of these, `checkPassed`, `checkFailed`, `rolled`, `decided` and `nothingToDecide` answer `success: true`: a check that **rolled** answered the question whichever way it landed, and the caller reads `outcome` to learn what happened rather than the boolean.

`checkPassed` and `checkFailed` carry their prefix deliberately.
A bare `failed` answering `success: true` is a trap, because `success: false` already means "failed" generically across the whole contract; the prefix says **the check** failed, not **the call**.

`invalidRollDecision` exists because a pre-resolved roll decision supplied alongside a non-interactive roll is **silently discarded** by the shared evaluator, which consults one only on its interactive path.
The caller's bonus, Advantage and roll mode would otherwise all vanish with no error while the base formula rolled, so the decision is **refused** rather than dropped.

## The Compatibility Promise

While `game.fabricate.api.COMPANION.schemaVersion` is unchanged, every member of the declared set keeps its name, keeps accepting the arguments documented for it, and keeps answering in the documented shape.
A member may gain an optional argument or an additional result field; it may not lose one, change the meaning of one, or begin throwing where it returned a result.
A new member may be added without a version change, because adding one cannot break a companion that does not call it.
Removing a member, renaming one, or narrowing what one accepts is a `schemaVersion` bump, announced in the release notes, with the previous member retained as a deprecated delegate for at least one minor release.
**Nothing outside the declared set is contract, however reachable it is.**
