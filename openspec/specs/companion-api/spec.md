# Companion API

## Purpose

Define the requirements for Fabricate's **outbound behavioural** contract: the capabilities Fabricate publishes so a companion module can settle work against an actor, or against a set of actors — grant the knowledge an activity teaches, ask what a cost comes to, read what the actor already holds, read what a whole party holds between them, roll a check for an actor, settle one roll decision for many, place components on the actor's sheet, credit currency to it, or take a set of costs from the party's combined holdings.
Three kinds of capability are now published, not one.
A member that **asks** a question, a member that **places value**, and — since the pooled holdings consume — a member that **removes** it.
Every rule below that separates a question from an act binds harder on the second kind than on anything published before it, and hardest of all on the third: an award a GM did not want is value to find and reverse, while a take a GM did not want is a player's inventory gone.

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
The award members split the same way.
The currency credit's ladder rules, its spender write-truth rules and its consequences for a GM's `increment` macro are specified in `data-models/spec.md`; the reciprocal statement that the knowledge grant's idempotency has no counterpart on these two members is in `recipe-visibility/spec.md`; and the **gathering** award's own stacking rules, which are not these, stay in `gathering-and-harvesting/spec.md`.
The pooled members split the same way: the pooled base-value read, the base-unit denomination of a pooled debit and the `balance` macro key are specified in `data-models/spec.md`, and what this spec governs is the contract those rules are published through.

## The Published Contract

Fabricate publishes exactly one named, versioned contract for outbound behavioural consumption: `game.fabricate.api.COMPANION`, a frozen `{ schemaVersion, members, outcomes, callSites }` descriptor.

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

The **awarding** half of that pair is now published in its own right.
`awardComponents` is a `stable` member that consumes the carve-out internally, so a companion placing a component on a sheet has a supported route that never requires it to call the carve-out at all, and never has to defend against either of its throw conditions.
The carve-out remains published because a companion still reads what an actor already holds through it, and because the award deliberately publishes no item handle of its own.

## Behavioural Member Rules

Every `stable` member **that reads or acts on one specific actor** takes an **`actorId`**, never an actor uuid, and resolves it through `Fabricate#_resolveCraftingActor`.
A member that answers a question about the caller's own request rather than about an actor takes none: an ownership gate on an argument the member never reads is ceremony a later reader deletes, and a caller passing one would infer a gate that does not exist.
The narrowing is bounded by the positive rule — any member that **does** touch one actor is still bound by the sentence above, and by the named resolver rather than by a bare collection read.

**A member that answers about a SET of actors takes an `actorUuids` list, and a member that writes DESTRUCTIVELY takes UUIDs rather than ids.**
The two pooled holdings members are both, and the departure is stated here rather than left as an inconsistency.
`game.actors.get()` cannot distinguish an unlinked token actor from its world prototype, because the synthetic actor's `id` **is** the base actor's id, so a token-scoped id silently resolves to the prototype.
Every member published before this pair **gives**, and for a give that ambiguity costs a player value landing where they will not see it.
This pair **deletes**, and deleting from a prototype corrupts every other token derived from it while the token that should have paid keeps its items.
An address a member may not be wrong about is therefore an unambiguous one, and `fromUuid("Scene.<id>.Token.<id>.Actor.<baseActorId>")` is Foundry's own handle for exactly that.
The rule is a widening rather than a contradiction: an `actorId` remains correct for a member that acts on one actor, and the uuid form is required only where the set or the destruction makes it so.

**The set-valued preamble is an EXTENSION of the once-only authorization rule, and it SHARES that rule's GM text rather than routing through it.**
`_requireGmActors` cannot call `_requireGmActor` for its actor half: the singular preamble resolves its target by id, through `_resolveCraftingActor`, and an id is exactly what the uuid form exists to avoid, because a synthetic token actor's id IS its base actor's.
So the GM check is DUPLICATED rather than shared through the singular preamble: `_requireGmActors` opens with its own literal `if (game.user?.isGM !== true)`, in the same words as the singular preamble's, and only what follows it is delegated — the bound, the address-based lookup, and the split between "not one of these resolved" and "the list itself was wrong" — to `gatePooledActorUuids`, the ONE place that resolution logic exists.
There are therefore now TWO GM-gate texts and TWO actor resolvers rather than one of each: the singular preamble's id-keyed `_resolveCraftingActor`, and the plural preamble's address-keyed `globalThis.fromUuidSync` plus a `documentName === 'Actor'` test.
Both duplications are deliberate, and both are pinned as literal source strings by tests, on the production text and on its harness mirror, so neither can drift from the other without the suite failing red.
Both members **fail closed** on a set that does not fully resolve, and the answer echoes the resolved set back so a caller can see the exact set an answer was computed over.
Silently dropping an unresolvable UUID — as `_resolveCraftingSources` does for its own, different purpose — would compute a pool over fewer actors than the caller believes, and a consume would then draw from a different set than the read reported.
`noActor` is answered when **not one** supplied UUID addresses an actor, which is the same word every other actor-targeted member answers.
`invalidActorUuids` covers the request itself: absent, empty, over the bound, carrying a non-string entry, or a list where **some** resolved and some did not.

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

A member that **writes value** — placing items on a sheet, or crediting coin — is neither of the two cases above, and for it the deeper harm inverts.
N clients do not produce N different answers to reconcile; they produce **N copies of the same value** on a player's sheet, with no `alreadyKnown` no-op and no natural key to absorb the repeat.
The obligation therefore binds hardest exactly where the "a read is harmless" justification is weakest, which is why both award members require a `callSite` and why neither is idempotent.
The `gmAction`-from-a-synced-hook bypass is correspondingly more consequential for a member that moves inventory than for one that posts chat: a duplicated message is noise a GM deletes, while a duplicated award is items and coin a GM must find and reverse by hand.

**A member that REMOVES value is the sharpest case of all, and the obligation is restated for it rather than inherited by implication.**
N unelected clients running the pooled holdings consume delete N times the components and take N times the coin, across every actor in the supplied set at once.
There is no absorbing repeat and no natural key: a second take is indistinguishable from a first, so nothing in the answer or the world tells a GM which one was intended.
Reversing a duplicated award means finding value that arrived; reversing a duplicated take means reconstructing inventory that left, from a ledger of whichever call happened to be looked at.
That is why the member requires a `callSite` and refuses `notElected`, and why the declaration being **truthful** is a contract obligation on the caller rather than a hint.

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
`img`, `subjects` and `speaker` are deliberately absent from the first version — `speaker` is derived from the resolved actor and is never caller-supplied — because a member MAY gain an optional argument without a version bump but may not lose one.
There is no bare top-level `rollMode` key: the roll uses the client's own default unless the caller supplies a `rollDecision`, in which case `rollDecision.rollMode` overrides the default exactly as `rollDecision.bonus` and `rollDecision.advantage` do.
The accepted values are Foundry's legacy roll-mode vocabulary, `publicroll | gmroll | blindroll | selfroll`, and `resolveBulkCheckDecision`'s own picker never produces anything outside that list, so a caller that only ever forwards a decision it received from that member cannot construct an invalid one; a caller that builds a `rollDecision` by hand can, and an unrecognised value there fails safe on every supported Foundry release rather than aborting the roll.

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
It binds every member that declares a call site — `rollActorCheck`, `resolveBulkCheckDecision`, `awardComponents`, `creditCurrency` and `consumePooledHoldings` — and it exists as **one** implementation, sited in the Foundry-free contract module beside the published `callSites` vocabulary rather than inside any one member's module.
A member carrying its own copy would be free to drift on exactly the question a write may not be wrong about.

`callSite` is **required and has no default**.
Nothing in the request or the environment distinguishes a GM's deliberate click from a synced tick that fires on every connected client, so a default would be a coin flip rather than a bad inference.
`gmAction` declares a single-client, user-initiated GM action and is gated on `isGM` alone: there is no duplicate-execution risk, and requiring election would lock out the assistant GMs the surface already admits.
`broadcast` declares a handler that fires on every connected client and is additionally gated on the elected executor.
`invalidCallSite` covers **both** a missing and an unrecognised declaration, because "not declared" is wrong for the second.

The accepted pair is **published on the descriptor** as `COMPANION.callSites`, on the same rule that publishes `COMPANION.outcomes`: a caller reads a symbol rather than writing a bare string.
The rule binds harder here than there, because `callSite` is the contract's one required, no-default, refused-on-mismatch input, so `invalidCallSite` is the entirety of a typo's feedback and a documented worked example that instructs an author to hand-write the literal is the surface that produces the typo.

The refusal **is** the enforcement.
The shipped internal `caller` discriminator is required of an internal call site, so a forgetful one is caught by Fabricate's own tests; `callSite` is required of an **external** caller on a member that may never throw, which is why an unrecognised value is a first-class outcome rather than a thrown error.

## The Outcome Vocabulary Added By The Standalone Check Roll

The Standalone Check Roll adds exactly these outcomes: `checkPassed`, `checkFailed`, `rolled`, `rollFailed`, `cancelled`, `engineUnavailable`, `noFormula`, `invalidCallSite`, `notElected`, `invalidRollDecision`, `decided`, and `nothingToDecide`.
Of these, `checkPassed`, `checkFailed`, `rolled`, `decided` and `nothingToDecide` answer `success: true`: a check that **rolled** answered the question whichever way it landed, and the caller reads `outcome` to learn what happened rather than the boolean.

`checkPassed` and `checkFailed` carry their prefix deliberately.
A bare `failed` answering `success: true` is a trap, because `success: false` already means "failed" generically across the whole contract; the prefix says **the check** failed, not **the call**.

`invalidRollDecision` exists because a pre-resolved roll decision supplied alongside a non-interactive roll is **silently discarded** by the shared evaluator, which consults one only on its interactive path.
The caller's bonus, Advantage and roll mode would otherwise all vanish with no error while the base formula rolled, so the decision is **refused** rather than dropped.

## The Award Members

Fabricate publishes two `stable` members that place value on an actor.
`awardComponents({ actorId, callSite, systemId, awards })` places one or more components on an actor's sheet and answers `{ success, awarded, placements, outcome, message }`.
`creditCurrency({ actorId, callSite, unitId, amount })` credits one denomination of the world coin ladder to an actor and answers `{ success, credited, outcome, message }`.

Both request key sets are **closed**, including the nested `awards[i]` set, which is exactly `componentId` and `quantity`.
No caller-supplied bag is spread into any collaborator, seam or item payload: a spread would put caller-controlled arbitrary keys onto a created Foundry document, which is itself a leading cause of a create the client silently drops.
`awards` holds at most 64 entries, because every entry is a document write and an unbounded list is an unbounded write batch driven by an external caller; the bound starts small because widening what a member accepts is free under the compatibility promise while narrowing it is a version bump.
`systemId` is declared once per call rather than per entry, and every entry resolves within it, so a mixed-system award is two calls.
That is a rule about the **award's** request shape and not about every member: the pooled holdings members resolve a system **per cost entry**, because a downtime stage's requirements are mixed-system by construction and splitting one stage into one call per crafting system would make the caller compose the all-or-nothing guarantee itself.
A component id is not unique across crafting systems, so per-entry resolution has to report an unresolved ambiguity rather than settle it: a name matching in two systems answers `ambiguous` on the read, and a system a cost names that does not exist is a **row-level** `systemNotFound` on the consume where the award answers it at call level.

**Both award members target WORLD actors, and cannot address an unlinked token actor.**
Every actor-targeted member resolves `actorId` against the world actor collection through the shared resolver named above, never against a token, a token id or a uuid.
An unlinked token's synthetic actor carries its **base actor's id**, so no `actorId` can name one — and not because Fabricate declines to look: every unlinked token created from one base actor shares that id, so an `actorId` could not tell two synthetic actors apart even in principle, and widening the resolver could not fix it.
A caller that passes such an id therefore addresses the **world prototype** and receives `success: true`.
For these two members alone among the actor-targeted set the consequence is that the value lands where the player will never see it, which is why the resolver's limit is restated with them.
The published remedies are: **link the token, or do not use these members for it.**
Foundry does publish a handle for a synthetic actor — `fromUuid("Scene.<id>.Token.<id>.Actor.<baseActorId>")` — so this is Fabricate's deliberate `actorId`-not-uuid convention rather than a Foundry gap, and it is the shape any future widening would take.

**A write seam is judged by its RETURN VALUE.**
Neither member reports an amount it did not observe.
A Foundry document create can resolve with fewer documents than requested, or with none, carrying no error and raising no notification; an update whose path is not in the target's data model is discarded just as quietly; and a currency spender may report success for a write it never observed.
Both members therefore derive every reported amount from what the write itself returned, and — on a spend strategy whose own answer carries no information — from a balance read taken before and after.
**A reported `placed` or `credited` is an observation, never a restatement of the request.**

**Neither award member is idempotent, and the caller owns not double-awarding.**
An award has no natural key: awarding 3 hides twice is legitimately 6 hides, and crediting 50 gp twice is legitimately 100 gp.
`grantRecipeKnowledge` is idempotent only because the learned map is its own key, and no equivalent state exists here.
Fabricate will not add an idempotency key: a per-actor ledger of caller-supplied award ids is a new persisted shape with unbounded growth and no restore semantics, and a partial guarantee is more dangerous than a published non-guarantee because it invites a caller to stop defending itself.
The recommended caller discipline is a **claim recorded in front of the irreversible act**, not a guard inside it, and Fabricate cannot supply that claim because it does not own the activity the award settles.

The election gate is a mitigation rather than a lock, and its strength is stated exactly.
It removes the **steady-state** multi-client duplication class, but the activity flag it reads is client-local and maintained by a broadcast, so immediately after a higher-role GM joins there is a window in which two clients both consider themselves elected.
Two concurrent awards of the same component to the same actor may also produce two documents rather than one stack, because the matcher reads the actor's items at call time and there is no lease.
Where two concurrent awards do land on one stack the loss is arithmetic rather than structural: each reads the stored count and writes that count plus its own quantity, so one update overwrites the other while **both** answers report their full `placed`.

**Retry is safe for an enumerated ZERO-MUTATION SET, and for nothing else.**
`success` is not the axis, and neither is a zero amount, so each member publishes by name the set of outcomes Fabricate declares to have mutated nothing.
`awardComponents` declares `gmOnly`, `noActor`, `notReady`, `invalidCallSite`, `notElected`, `invalidAwards`, `systemNotFound` and **`awardFailed`**.
`creditCurrency` declares `gmOnly`, `noActor`, `notReady`, `invalidCallSite`, `notElected`, `invalidAmount`, `ladderEmpty`, `ladderInvalid`, `unitNotFound` and **`creditNotConfigured`**.
Every other outcome — including `partiallyAwarded`, `creditFailed` and `creditUnavailable` — may have moved value, and retrying one double-awards.

The asymmetry between the two failure tokens is why the sets are published separately from the scalars.
`awardFailed` is inside its set because that member runs no third-party code: every one of its failures is a refusal taken before any write, a create that returned no document, a stack write whose own return said Foundry accepted no change, or a server-side rejection — each an **observed non-write**.
`creditFailed` is outside its set because under two of the three spend strategies the mechanism is code Fabricate does not own, so a mechanism that wrote and then reported failure is a possibility Fabricate cannot rule out.

**Both award members require a `callSite`, where `grantRecipeKnowledge` does not.**
An award is a write with no absorbing repeat, so the election gate is the one structural mitigation Fabricate provides against a synced handler awarding N times.
`grantRecipeKnowledge` needs none, because N grants of one recipe are one write and N−1 `alreadyKnown` no-ops.
The asymmetry is stated positively so a companion author who notices only that one write member takes a `callSite` and another does not cannot infer that the field is optional decoration.

**`awardComponents`' answer expresses partial success structurally.**
`placements` is a list of `{ index, componentId, requested, placed, stacked, outcome, message }` in the caller's own order with `placements[i].index === i`, and `componentId` and `requested` echo the caller's entry verbatim, so the map-back does not depend on the caller having kept its own array.
It holds **exactly one entry per requested award whenever anything was attempted**, including for `awardFailed`, and is `[]` for every pre-attempt refusal.
That pair is the distinction between *everything was attempted and nothing landed* and *nothing was attempted*, and neither half carries it alone.
`stacked` is `true` when the member added to an existing item, `false` for a successful create, and `null` for an entry that placed nothing; it is published because it is the fact the resolver was published to enable, and a caller writing an append-only log needs "added 3 to an existing stack" to read differently from "created a new item".

`awarded` is the **sum of `placements[].placed`**, computed by the member from its own record and never supplied by a caller, because a caller-supplied total could disagree with the placements it accompanies and a reader would have no way to know which was right.
It is `null` for every pre-attempt refusal and `0` for `awardFailed`.
**Read that beside `creditCurrency`'s `credited`, which is `0` for the same refusal class, and the two are not inconsistent:** `awarded` is a sum over `placements[]`, so an empty attempt record makes the sum vacuous rather than zero, while `credited` has no companion structure to be vacuous over and falls to the provability rule alone.

Every entry carries its own `message`, a localization key from this member's own table, because the whole purpose of `placements` is that a caller records each entry and without a key it would have to compose free text from `outcome`.
Every **entry-level** key interpolates nothing: the entry already carries `componentId` and `requested`, so a placeholder would only put literal braces in front of a GM.
The answer is **deep-frozen** — the result, the array, and every entry.

**The award loop accumulates and does not abort.**
A failing entry does not stop the entries after it.
The currency deduction bounds loss by stopping and the currency refund bounds stranding by continuing; an award is a give, so stopping compounds nothing and withholds value the GM authorised.
Accumulating is also what makes one placement per requested entry an invariant rather than a range.

**`awardComponents` validates every quantity as a whole number.**
A `quantity` must be a positive safe integer, or a numeric string naming one.
`0`, a negative, a fraction, a non-finite value, a boolean, an array, a missing value and anything above the safe-integer range each refuse that entry with `invalidQuantity` and place nothing.
This is required rather than defensive: the underlying stacking seam coerces a non-finite or non-positive quantity to **one** on its stack path while writing a fraction verbatim on its create path, so an unvalidated request awards a quantity nobody asked for.

**`awardComponents` refuses a multi-unit award the world cannot express, and never invents a count.**
Fabricate writes the requested quantity into the item payload and then **reads back what it wrote**.
When the stored value is not the requested one — because the item schema carries no field at the configured stack-quantity path, or because the configured path resolves an object rather than a count — a request for more than one unit refuses that entry with `multiUnitUnsupported` and places nothing, rather than creating a single item and reporting N.
A request for exactly one unit succeeds, and a second single-unit request for the same component creates a second document rather than inventing a count on the first.

Two causes reach this outcome and their remedies differ, so the published guidance names both.
A game system whose item schema genuinely carries no quantity field is a real capability limit.
A **wrong GM-configured stack-quantity path** is a misconfiguration Fabricate already diagnoses through its own stack-quantity advisory, and a companion whose world hits that cause must **not** respond by looping single awards: that produces N loose documents that will never stack, which is the duplicate-versus-stack failure these members exist to prevent.

**`awardComponents` resolves its stack targets through the published resolver and nowhere else.**
It resolves matches through `getCraftingEngine().findComponentItems` — the member published for exactly this — so what an award stacks onto and what salvage consumes can never disagree.
The stack write itself is this member's own; the shared create-or-stack seam is consumed as the **create** primitive alone.

That resolver applies the list-aware different-component veto on its durable-identity branch, and falls back to a **case-sensitive exact-name** match with no veto **whenever no owned item resolved to the component by durable identity**.
The fallback is therefore not a legacy edge: a fully stamped component whose actor happens to hold an *unstamped* item of the same name reaches it, which in an unmigrated world is the ordinary case rather than the exception.
The companion award inherits both branches rather than growing a second matcher, and it differs on that second branch from the **gathering** award, whose rules are specified under "Award Item Stacking" in `gathering-and-harvesting/spec.md` and whose own fallback is shared raw source references rather than a name match at all.

**Both pooled holdings members inherit that same resolver, and therefore that same name fallback and its telemetry.**
They MUST: a pooled read predicts what a pooled consume will take, and a consume matches what salvage and bulk destroy match, so a read on one matcher and a write on another is precisely the gate that lies.
A pooled consume can therefore emit issue-540 name-only-match telemetry, and so can a pooled read — the report is deduped per session on `(systemId, definition, item name)`, so a companion polling every stage cannot inflate it.
**What the read MUST NOT do is resolve the caller's own cost NAME through the reporting tier.**
A cost's `name` is resolved to a crafting-system **definition** through the definition index's silent primitive, never through `componentNameMatch`'s warn-once reporter.
The distinction is between an owned item resolving to a definition — the deprecated fallback the telemetry measures — and an authored requirement's spelling resolving to a definition, which is this member's own lookup and no part of what issue 540 is counting.
Reporting the second would corrupt the very measurement that justifies removing the first, with a signal whose magnitude is a companion's naming convention and its polling interval.

The member calls the resolver **only after** its own component resolution has succeeded, which is what makes the carve-out's two throw conditions unreachable from a member that may not throw.
**Within one call, two entries naming the same component stack onto one item wherever the world can express a stack count**: the member carries forward what it has already placed rather than depending on the actor's item collection having caught up.
Where the world cannot express a count the second entry creates a second document instead, so nothing is invented and nothing is refused.

**`creditCurrency` has no partial success and answers a three-valued `credited`.**
It publishes no per-part shape, because the spender interface answers one boolean.
It makes no atomicity claim about Foundry: one strategy performs a single batched actor update, one delegates to a game system adapter's own item mutation, and one runs GM-authored macro code.

Four outcomes carry three values of `credited`, and nobody should mint a fourth.
It is **the amount** for `credited`; **`0` for `creditNotConfigured` and for every refusal taken before any mechanism ran**; and **`null` for both `creditFailed` and `creditUnavailable`**.
So `0` means *provably zero* and `null` means *Fabricate cannot say*, exactly as `affordable: null` already separates "this actor is short" from "this question could not be answered", with `outcome` carrying the rest.
Reporting `0` for `creditFailed` would state a third party's word as Fabricate's own proof.

`creditNotConfigured` names a world whose currency configuration cannot express the credit and where **nothing was written**, and it is the GM's to fix.
Its producers are: no spender for the configured spend strategy, a spender with no refund method, no `increment` macro configured — which is a documented-normal state, because `increment` is one of two optional keys among the (now four) macro keys, `balance` being the other, while `canAfford` and `decrement` are required by validation — an `increment` uuid naming nothing runnable, a configured actor path Foundry discarded, a configured actor path holding a value that is not a number, and a pre-write balance read that failed or threw before any mechanism was invoked.
Collapsing it into `creditFailed` would report a misconfiguration as a domain answer; collapsing it into `creditUnavailable` would tell a log that something may have landed when nothing possibly could.

**`creditCurrency` resolves its denomination through the same resolution as `checkAffordability`.**
One shared resolution answers both members, so the check and the credit cannot disagree about what a unit is.
The four ladder refusals `invalidAmount`, `ladderEmpty`, `ladderInvalid` and `unitNotFound` are reused **by token**, each member answering with its own message key, because a fifth spelling of "no such unit" would be new vocabulary for an identical fact while a failed credit must not report itself in the words of a failed check.
`creditCurrency` **requires a positive safe-integer amount rather than truncating one**, because a truncated amount is a different amount and because the credit's own arithmetic stops being exact beyond the safe-integer range; a numeric string naming such an amount is accepted.
`checkAffordability` continues to accept a fraction and is deliberately **not** harmonised with it, because narrowing what a published member accepts is a `schemaVersion` bump.

**Neither award member takes a provenance label in v1, and neither publishes an item handle.**
Nothing persists a provenance label, and a field a caller fills that nothing reads is worse than its absence.
A companion re-derives an item handle through the published `findComponentItems`, and a handle published before its form is settled cannot be withdrawn.
Either member may gain either later without a version bump, on the compatibility promise's asymmetry.

## The Outcome Vocabulary Added By The Award Members

The award members add exactly these outcomes: `awarded`, `partiallyAwarded`, `awardFailed`, `componentNotFound`, `invalidQuantity`, `multiUnitUnsupported`, `invalidAwards`, `credited`, `creditFailed`, `creditUnavailable`, and `creditNotConfigured`.
Of these, `awarded`, `partiallyAwarded` and `credited` answer `success: true`.
An award is an **act** rather than a question, so an award that landed nothing answers `success: false`, where `notAffordable` — a question answered *no* — answers `success: true`.

`componentNotFound`, `invalidQuantity` and `multiUnitUnsupported` are **entry-level only** and can never be a call-level `outcome`; `awarded` and `awardFailed` are answered at both levels.
The split is declared as data a test can read rather than as prose a reviewer remembers, because the contract's own rule that every declared outcome must be answerable by some member forces the three entry-only tokens into a member's key table, where a reader would otherwise take them for call-level answers.
A second word for the concept `awarded` already names was rejected at the entry level, because a caller would then have to branch on both.

They also reuse the already-declared `systemNotFound`, `unitNotFound`, `invalidAmount`, `ladderEmpty`, `ladderInvalid`, `invalidCallSite` and `notElected`, and the shared `gmOnly`, `noActor` and `notReady`.

## The Pooled Holdings Members

Fabricate publishes two `stable` members that answer about a **set** of actors' combined holdings.
`readPooledHoldings({ actorUuids, costs })` answers `{ success, actorUuids, readings, outcome, message }` and **writes nothing**.
`consumePooledHoldings({ actorUuids, callSite, costs })` takes those costs and answers `{ success, actorUuids, consumed, ledger, outcome, message }`.

**POOLED HOLDINGS** is the bound term for one answer over a combined supply, and it is deliberately not **BULK**, which names many subjects settled serially.
Bulk salvage salvages N components one after another and reports N results; a pooled read produces ONE number about a party.

### The Read Is Not A Reservation

The read is exact **at read time** and holds nothing.
Nothing prevents an item being sold, dropped, traded or consumed between a read and a consume, and no lease, claim or reservation is taken by either member.
A caller that must not overdraw MUST call the consume and read **its** refusal, rather than treating a `sufficient` it read a moment ago as a promise about a later write.
This is required to be stated rather than left to be inferred, because the pair is designed to be called one after the other and the intervening gap is exactly where a caller assumes a guarantee that was never offered.

Fabricate will not add a reservation to close it.
A lease over another module's actors is a persisted shape with an expiry policy, a release path and a failure mode in which a crashed companion leaves a party's inventory locked — and a partial guarantee here is more dangerous than a published non-guarantee, on the same reasoning that refused an award idempotency key.

### `null` Means Cannot See, `0` Means Provably None

The shipped `creditCurrency` rule binds here unchanged, and neither member may collapse the two.
A component nobody in the set is carrying answers `available: 0`, which is a confident answer: the matcher ran on every actor and nothing resolved.
A currency cost answers `available: null` where the world cannot be read at all — an empty coin ladder, an invalid profile, a `macro` world with no `balance` macro, or a set containing one actor whose purse could not be read.
A pool containing one unreadable actor is UNREADABLE rather than partial, because a sum over a subset is a number about a different group than the caller asked about and is always too SMALL, so a gate built on it would refuse parties that can pay while looking authoritative.

`sufficient` is DERIVED from `available` against `requested` and is `null` wherever `available` is, so *the pool is short* and *the pool could not be read* never collapse into the same confident `false`.
A TOOL is the single exception: it answers a `state` from the shipped Required Tool Display State vocabulary and no `available`, and its `sufficient` is `state === 'present'` and nothing else.
That vocabulary is display-only in its own home and never relaxes the start-attempt tool gate, so a `sufficient` derived from the state token alone would admit a `damaged` tool the shipped gate refuses.

`balanceNotConfigured` is a **reading-level** outcome and never a call-level one, and that placement IS its behaviour: one axis Fabricate cannot answer MUST NOT cost the caller the axes it can.

### Names In On The Read, Ids In On The Consume

The read accepts a human-written `name` on all three axes and answers the canonical `systemId`, `componentId` and `unitId` that name resolved to.
The consume accepts those resolved ids and MUST NOT resolve a name at all.
The reason is the promise tier: Fabricate's owned-item name matcher is case-SENSITIVE and deprecated, and no `stable` promise authorising a **delete** may be built on top of a tier that is scheduled for removal.

**A name Fabricate PRINTED is a name Fabricate ACCEPTS.**
That is a correctness property rather than a convenience, and it is what the currency axis had been failing: a unit resolved by exact `id` only, so a caller authoring requirements the way a person writes them could name a component and a tool but never a coin.
A coin therefore resolves in two tiers, and the order is load-bearing.
An exact `id` match wins outright, so a caller already holding Fabricate's internal ids is byte-identically unaffected and an unrelated label edit cannot redirect a working caller — the same durable-identity-beats-display-name precedence the component matcher already applies.
Otherwise every name folds into ONE case-insensitive tier in which abbreviation and label rank LEVEL, because the display-name derivation renders whichever of the two is present and a caller holding a printed string cannot know which field it came from; ranking them would settle a genuine collision by a coin flip that looks authoritative.

**Ambiguity is REPORTED and never resolved silently, on every axis.**
A cost name matching a component in more than one crafting system, or a coin name answering to more than one unit, sets `ambiguous: true` on that reading and resolves to the first in order.
`ambiguous` is a strict boolean rather than a nullable one: `false` is a true statement about every reading that resolved, and about every refusal too.
It is required because the caller is liable to CONSUME by the id the read handed back, so a quietly chosen system is a quietly chosen set of documents and a quietly chosen coin is a quietly chosen debit.

### The Consume Takes Components First And Coin Last

The order is normative, and it follows from which leg has a reliable inverse rather than from a preference.

A deleted component HAS an exact inverse: the document is snapshotted with `toObject()` before the delete and re-created with `{ keepId: true, keepEmbeddedIds: true }`, so the `_id` — and therefore the UUID — is retained, embedded documents keep their own ids, and flags, system data and active effects return verbatim.
A partial take needs no snapshot at all, because the inverse of a decrement is restoring the count, and the restore writes the value the plan recorded BEFORE the take rather than an increment a concurrent change could compound.
The component-award primitive is deliberately NOT reached for, because it rebuilds from the component template and is therefore lossy.

Currency is the leg whose inverse may be ABSENT or LOSSY: under `macro` the `increment` macro is explicitly optional, under the pf2e inventory provider a give-back creates treasure Items, and under `actorProperty` it lands in the unit's own denomination rather than the base unit that was debited.
So the recoverable leg is taken first, the unrecoverable leg last, and **a currency cost is REFUSED UP FRONT** — `creditNotConfigured`, before the pool is read and before any component is written — in a world that has published no way to give coin back at all.
That refusal reads world configuration alone, so taking it before the pool is read is required and not merely tidy: an intended zero-effect refusal must not first fire a GM's `balance` macro once per actor.

**Three residues of the restore are ACCEPTED and are declared rather than hidden.**
A restore fires `createItem` per document, because `noHook` gates only the pre-hook, so Fabricate's own fragment-discovery and recipe-learning hooks can fire on an undo.
The restored document is also a NEW JS object, so a third-party module holding an `Item` reference across the take holds a stale one even though the UUID resolves.
`_stats.modifiedTime` and `lastModifiedBy` are refreshed, and `createdTime` is NOT preserved: Foundry's server-side stats tagging (`ServerDocumentMixin#_tagStats`, reached from `_initializeSource` on a creation) sets `createdTime` to that write's own timestamp whenever the write is a creation, and a `keepId` restore IS a creation, so the original document's age does not survive it (verified on 14.365; 13.350 carries the identical doc-string on `DocumentStatsField.managedFields` but its server source was not read, so this is strong inference rather than proof on that version).
And on an UNLINKED TOKEN ACTOR, the restore promotes an inherited item to a delta-managed one: before the take, an unmodified item on the token is INHERITED from the base actor, the delete writes a tombstone, and the `keepId` re-create lands as a managed record on the token's own delta.
The uuid, `_id`, effect ids, flags and system data are all identical, so nothing a companion can observe changes, but the item no longer tracks later edits to the base actor — and only core's own `EmbeddedCollectionDelta#restoreDocuments` re-links it, which is not a route a module can reasonably use here.

### All-Or-Nothing, And The Zero-Mutation Set

A shortfall anywhere refuses everywhere.
One cost the pool cannot cover refuses the WHOLE call as `insufficient` before anything is written, with every ledger row reporting `attempted: false`, because a partly-paid downtime cost is worse than an unpaid one.

The consume's zero-mutation set is `gmOnly`, `noActor`, `notReady`, `invalidCallSite`, `notElected`, `invalidActorUuids`, `invalidCosts`, `insufficient` and `creditNotConfigured`.
**`consumeFailed` is deliberately EXCLUDED**, and a give-back that itself failed is the reason.
Some `consumeFailed` answers wrote nothing — a cost naming a system or component that does not resolve is refused in the pre-check — and some wrote and could not fully un-write, and the outcome token alone cannot carry that distinction.

The **ledger** carries it, and the discrimination is four-way rather than two-way:
`consumed === null` with an empty `ledger` means the request was refused before any cost was priced;
`consumed === 0` with every row `attempted: false` means the pool was priced and the call refused, and nothing was written;
`consumed === 0` with some row `attempted: true` means writes were issued and every one was given back;
and `consumed > 0` beside `consumeFailed` means the give-back did NOT fully complete, that much is still gone, and each row's `takes` name from whom.
`attempted` is DERIVED from the row's own outcome and `consumed` is SUMMED from the rows, which are themselves summed from their takes, so no two published figures can disagree.
A row whose whole component bucket failed before the give-back reports its FULL planned allocation rather than the part that was written, which over-states on the safe side: a caller deciding whether to make a player whole again is better served by a number that cannot be too small.

The published refusal message for `consumeFailed` MUST NOT assert that everything taken was put back.
It states that a give-back was attempted and directs the reader to the ledger, because the fourth case above is exactly the case in which the reassuring wording would be false.

### An Unreadable Pool Refuses The Consume Outright

`balanceNotConfigured`, `ladderEmpty` and `ladderInvalid` are declared by the READ and have **no token in the consume's key table**, and the asymmetry is deliberate.
A read can report one unreadable cost and answer every other; a take that cannot see what a party is carrying MUST NOT take from them at all.
So a consume in that world refuses at CALL level as `consumeFailed` with every row reporting `notAttempted` and nothing written, and a caller that needs the cause calls the read, which names it on the currency reading itself.
Minting a row token for it would publish a word the contract does not declare, and borrowing `unitNotFound` for a broken ladder would send a GM looking for a unit that is spelled perfectly well.

### Denominations Are Not Reconciled Between `requested` And `consumed`

A currency row's `requested` echoes the CALLER'S OWN unit, because every per-entry answer promises a faithful echo a caller can map back onto the request it wrote.
Its `takes` — and therefore its `consumed` — are in the ladder's TERMINAL BASE UNIT, because that is the only denomination in which a debit split across several payers is exact.
So on a `gp → sp → cp` ladder a 2 gp cost answers `requested: 2` beside `consumed: 200`, and the two are NOT reconciled.

Both alternatives were considered and both are refused.
Expressing a payer's share back in the caller's unit makes it fractional, and a three-way split of one unit does not sum back to one in floating point, so the ledger would stop adding up.
Collapsing the lines into a single whole-cost take discards the per-actor attribution the ledger exists to provide.
A coin count is exact; a converted one is not.

The READ does not carry this seam: its `available` is converted back into the caller's own unit and FLOORED, because a pool holding three and a half gold pieces cannot pay four, and because deriving `sufficient` from two different denominations would err PERMISSIVE — the one direction a gate may never err in.

### The Consume Is Not Idempotent

Exactly the award members' position, for exactly their reason.
There is no natural key for Fabricate to absorb a repeat with: taking three hides twice is legitimately six hides gone, and nothing readable distinguishes a duplicated call from a second, intended one.
No idempotency key will be added, on the reasoning already recorded for the awards.
The `callSite` election removes the steady-state multi-client duplication class and is **not a lease**; not double-consuming is the caller's own obligation, discharged by recording a claim in front of the irreversible act rather than by a guard inside it.

### Bounds

`actorUuids` holds at most **32** actors and `costs` at most **32** entries.
Both are bounded LOWER than the award's 64 because the work these members do is the PRODUCT of the two rather than either one: every cost is scanned across every actor, and the consume then issues one batched write per actor that paid.
Each refusal string interpolates its own bound as `max` rather than restating the number.
Widening a published bound is free under the compatibility promise and narrowing one is a `schemaVersion` bump, so the bounds start where the cheap direction stays available.

### Which Axes Each Member Serves

The declared cost axes are `component`, `currency` and `tool`.
The read serves all three; the consume serves `component` and `currency`, and a `tool` cost on the consume answers `costTypeUnsupported` because tool WEAR is out of scope rather than because `tool` is not an axis.
`essence` and `tag` are axes this domain names that NO pooled member serves, and they answer `costTypeUnsupported` on both.
A string naming no axis at all answers `invalidCostType`, and the two refusals MUST stay distinct: the difference is *not yet* against *you mistyped*, and collapsing them sends an author hunting for a spelling mistake that is not there.

## The Outcome Vocabulary Added By The Pooled Members

The pooled members add exactly these outcomes: `read`, `readFailed`, `consumed`, `consumeFailed`, `insufficient`, `notAttempted`, `balanceNotConfigured`, `toolNotFound`, `invalidCostType`, `costTypeUnsupported`, `invalidCosts`, and `invalidActorUuids`.
Of these, only `read` and `consumed` answer `success: true`.

`insufficient` is deliberately NOT one of them, and that is the line separating it from `notAffordable`, which is.
A QUESTION answered no is a success; a REFUSED ACT is not.
`consumeFailed` is absent for the reason `awardFailed` is: an act that did not happen at all answers `false`.

`read`, `readFailed`, `consumed`, `consumeFailed` and `insufficient` are answered at BOTH the call level and the entry level.
`balanceNotConfigured`, `toolNotFound`, `invalidCostType`, `costTypeUnsupported` and `invalidQuantity` are **reading-level only** on the read.
`notAttempted`, `componentNotFound`, `unitNotFound`, `systemNotFound`, `invalidCostType`, `costTypeUnsupported` and `invalidQuantity` are **row-level only** on the consume.
Each split is declared as DATA a test can read rather than as prose a reviewer remembers, on the precedent the award members set, and each member's declared CALL-level set is its key table MINUS that list rather than a second enumeration two places can disagree about.
A call can never answer `notAttempted`: "nothing was attempted" is the consequence of a reason rather than a reason.

Two tokens were considered and are deliberately NOT minted.
`costNotFound` would be a third spelling of the shipped `componentNotFound` and `unitNotFound`, so a cost naming nothing answers one of those, or `toolNotFound` for a tool.
`partiallyConsumed` would name a state this design cannot reach, because the take is all-or-nothing by construction; declaring it would additionally force a key-table entry for a refusal no member can emit, which the contract's dead-vocabulary sweep forbids.

The names were chosen against near-misses, and the near-miss is recorded with each.
`invalidActorUuids` is not `invalidPool`, because POOL already names a resource reservoir in this domain.
`balanceNotConfigured` is not `poolingUnsupported`, because nothing about pooling is unsupported — a `macro` world with no `balance` macro cannot answer for ONE actor either.
`consumePooledHoldings` is not `consumePooledCosts`, because the costs are not pooled; the supply is.

They also reuse the already-declared `componentNotFound`, `unitNotFound`, `systemNotFound`, `invalidQuantity`, `creditNotConfigured`, `invalidCallSite` and `notElected`, and the shared `gmOnly`, `noActor` and `notReady`.
Each member answers with its OWN message key table, because a failed take must not report itself in the words of a failed read — and that rule bites hardest between exactly this pair, which is designed to be called one after the other.

## The Compatibility Promise

While `game.fabricate.api.COMPANION.schemaVersion` is unchanged, every member of the declared set keeps its name, keeps accepting the arguments documented for it, and keeps answering in the documented shape.
A member may gain an optional argument or an additional result field; it may not lose one, change the meaning of one, or begin throwing where it returned a result.
A new member may be added without a version change, because adding one cannot break a companion that does not call it.
**Rows in the published member set are appended and never interleaved**, so a member's declared position is stable.
That is a requirement rather than an observation: sites inside and outside this specification name a member by its position, and an interleaved row falsifies every one of them at once and silently.
Removing a member, renaming one, or narrowing what one accepts is a `schemaVersion` bump, announced in the release notes, with the previous member retained as a deprecated delegate for at least one minor release.
**Nothing outside the declared set is contract, however reachable it is.**
