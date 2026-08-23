# Companion API

## Purpose

Define the requirements for Fabricate's **outbound behavioural** contract: the capabilities Fabricate publishes so a companion module can settle work against an actor — grant the knowledge an activity teaches, ask what a cost comes to, and read what the actor already holds.

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

Every `stable` member takes an **`actorId`**, never an actor uuid, and resolves it through the facade's ownership gate.

Every `stable` member is **GM-gated on `isGM`**, refusing `gmOnly` otherwise, and refuses `notReady` before the module is ready rather than throwing.

The gate order is **GM → actor → readiness**, and the order is normative.
The readiness check throws, and a member that may not throw therefore tests readiness **after** the never-throwing refusals rather than before them.
A readiness-first preamble would make a pre-`ready` non-GM call throw where the shipped reset returns `gmOnly`.

The one authorization rule — caller is a GM, and the `actorId` resolves to an actor the caller may act as — exists **once**, as a shared preamble, and each member supplies its **own** refusal strings to it.
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
Reading is harmless; acting on the read from N clients is not, and a grant under N clients is N writes.
Fabricate cannot enforce this from inside a read, which is why the contract states it.

## The Compatibility Promise

While `game.fabricate.api.COMPANION.schemaVersion` is unchanged, every member of the declared set keeps its name, keeps accepting the arguments documented for it, and keeps answering in the documented shape.
A member may gain an optional argument or an additional result field; it may not lose one, change the meaning of one, or begin throwing where it returned a result.
A new member may be added without a version change, because adding one cannot break a companion that does not call it.
Removing a member, renaming one, or narrowing what one accepts is a `schemaVersion` bump, announced in the release notes, with the previous member retained as a deprecated delegate for at least one minor release.
**Nothing outside the declared set is contract, however reachable it is.**
