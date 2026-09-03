# Release and Distribution Specification

## Purpose

Fabricate ships to three audiences with different entitlements: closed testers, paying patrons, and the public.
This capability specifies how a build reaches each audience, in what order, and what must be true before it does.
Two of those audiences are private, and privacy here is a property of the artefacts and the version numbers, not of a login.

## Scope

In scope: distribution channels and their ordering; who may obtain which artefact; version authority; promotion between stages; hotfixing the current public version; the contract with the Foundry package registry.
Out of scope: what the module does; the CI checks a change must pass; the branch and workflow mechanics that implement this specification.

## Terminology

- **stage** — a point in the promotion order: beta, then early access, then public.
- **channel** — the distribution line serving one stage, with its own manifest and artefacts.
- **target** — one publishable manifest-and-archive pair, each baking its own URLs.
- **sources target** — a channel's own manifest and archive, at a stable, derivable path.
It is what the tooling reads; on a private channel nothing installs from it and it is not anonymously readable.
- **tester group** — a named cohort within a channel, served the same build through an unguessable URL.
- **cohort** — the clients installed from one target.
- **channel head** — the version a channel's `latest` manifest currently advertises.
- **prerelease line** — the branch that produces prerelease versions, and those versions.
- **prerelease channel** — the channel serving the prerelease line.
- **release line** — the branch that produces stable versions, and those versions.
- **hotfix line** — a line cut from a published public version, producing patch versions of it only.
- **hotfix channel** — the channel serving a hotfix line.
It has no tester group and no retained cohort: it exists so a hotfix can be published, guarded, and promoted.
- **release artefact** — the repository release carrying a stable version's archive.
- **prerelease promotion** — moving a tested commit onto the release line, minting a new stable version.
- **release promotion** — moving an already-minted stable version to the next stage, minting nothing.
- **forward-port** — merging the release line back into the prerelease line, so the prerelease line's next version is numbered above the released one.
- **stable version** — a version with no prerelease identifier.
- **build profile** — which variant of the module a build produced, such as the community build.
It identifies the bytes, as distinct from the cohort that receives them.
- **build provenance** — the recorded identity of the build an artefact came from: its version, its source commit, and its build profile.
- **change provenance** — evidence that a commit reaching the release or prerelease line is attributable to a specific reviewed change, as distinct from **build provenance**, which is the recorded identity of a build.
- **resolution** — the content chosen where the two lines a forward-port combines cannot be combined automatically.

A release artefact exists, and is not publicly obtainable, from the moment its version is minted.
It becomes publicly obtainable only at release promotion.

## Requirements

### Requirement: Channel topology and promotion order

Fabricate distributes through three ordered channels: `beta`, then `early-access`, then `public`.
A hotfix line publishes to a channel of its own, which stands outside that order.
`beta` and `early-access` are private: they have no publicly obtainable artefact of any kind.
Promotion happens in two distinct forms, and they MUST NOT be conflated: a prerelease promotion moves a tested commit onto the release line and mints a new stable version from it, while a release promotion moves an already-minted stable version to the next stage, minting nothing and creating no tag.
A stable version MUST be built from a commit the `beta` channel already carried, unless it is a hotfix.
A stable version MUST NOT be published to `public` unless the channel it was promoted from already advertises that exact version, and MUST NOT be published to the registry unless `public` already advertises it.
A hotfix cut from a hotfix line is the one exception to the ordering: it does not traverse the private stages, but is published from that line's own channel to `public`.
That carve-out is safe only because the promotion verifies, per target, that every private channel already advertises a version Foundry considers newer than the hotfix; if one does not, the promotion fails before the registry publication.
A hotfix cut from the release line — possible only when that line already equals the public version — traverses `early-access` like any other stable version.

#### Scenario: promoting a tested commit into the release line

- **WHEN** a tested commit on the prerelease line is promoted
- **THEN** a new stable version is minted from it
- **AND** that version is published to `early-access`, and to no other channel

#### Scenario: promoting a stable version to the public

- **WHEN** a stable version is promoted to `public`
- **THEN** the channel it was promoted from already advertises that exact version, no new version is minted, and no tag is created, and the registry is written only after `public` advertises it

### Requirement: Hotfix isolation

It MUST be possible to ship a fix to the current public version without shipping any unreleased feature work.
The route depends on what is soaking, and both routes satisfy that obligation.
When a version carrying features is soaking, the hotfix MUST be built from a hotfix line cut from the public version's tag, and MUST carry nothing beyond the fix and the commits already public, because promoting the soak would ship those features.
When the soaking version is a patch, it carries only fixes and performance changes by construction, so it is promoted first and a further hotfix is cut on top if one is still needed; what reaches `public` this way contains no unreleased feature work.
A hotfix line MUST NOT be used against a soaking patch, because the version it would compute already exists on a different commit and has already been distributed; the attempt MUST be refused before any tag is minted.
A hotfix line MUST accept fixes only; a change that would raise the minor or major version MUST fail rather than be released from it.
A hotfix MUST NOT be published to any channel whose head is a version Foundry considers newer than it, because that would move the head backwards.
A hotfix MUST NOT raise the module's declared minimum Foundry version, because Foundry refuses to install a package whose minimum exceeds the running core version, stranding exactly the users the hotfix is for.
A hotfix MUST be brought back into the release line and then the prerelease line, so neither loses the fix and both remain numbered above it.
That bring-back into the release line MUST itself be a reviewed change, because the forward-port that carries it onward has no other evidence of its change provenance and will otherwise refuse it.
The release line and the prerelease line MUST NOT be merged into a hotfix line.

#### Scenario: hotfixing while a version carrying features is soaking

- **WHEN** a fix must reach the current public version while a newer minor or major version is soaking in `early-access`
- **THEN** the hotfix is built from the public version, not the release line, and none of the soaking version's unpublished features go with it
- **AND** it is not published to `early-access`, whose head is already newer than it
- **AND** it is brought back into the release line, so the soaking version carries the fix when it is promoted

#### Scenario: hotfixing while a patch is soaking

- **WHEN** a fix must reach the current public version while a patch version is soaking
- **THEN** the soaking patch is promoted first (it carries no unreleased feature), and no hotfix line is cut, because the version it would compute already exists

#### Scenario: a hotfix that would raise the declared minimum Foundry version

- **WHEN** a hotfix is promoted whose declared minimum Foundry version is one Foundry considers newer than the current public release's
- **THEN** the promotion fails before the release is made public, naming the raised minimum and the current public version it exceeds
- **AND** the comparison is Foundry's own over core generation values, never a semantic-version comparison and never against the module version
- **AND** the remedy named is to ship the fix without raising the minimum, so no client the hotfix targets is stranded

### Requirement: Version scheme

Prerelease identifiers MUST preserve the property that a stable version does not supersede its own prereleases under Foundry's comparison, so that publishing a stable version never offers an update to a private prerelease cohort.
The scheme MUST NOT be changed without re-deriving that argument: under a scheme where the stable version compares as newer, every private tester would be offered an update to the public channel, which is a silent, irreversible defection.
The prerelease counter MUST be its own dot-separated numeric part; a fused counter would be compared as text, ordering the tenth build below the seventh, and the channel would silently stop offering updates at the tenth build.
The scheme does not by itself guarantee that a channel keeps offering updates within itself, because the comparison is part-by-part; the monotonic-heads requirement is what catches that.

#### Scenario: publishing a stable version while a private cohort is on a prerelease of it

- **WHEN** a stable version is published while private clients are installed on prereleases of that same version
- **THEN** Foundry does not offer those clients the stable version as an update

### Requirement: Channel isolation

Each channel is an independent distribution line, and ordering between channels is not meaningful and MUST NOT be relied on.
A client installed from one channel MUST NOT be able to move to another channel in place; changing channel is an uninstall and a reinstall from the other channel's manifest URL.
A private channel's targets MUST be reachable only with credentials, in the case of its sources target, or through an unguessable URL derived from a per-channel secret, in the case of a tester target.
A derivable path is not a private one: a private channel's sources target MUST NOT be anonymously readable, because that path is computable from published configuration.
Each private channel MUST derive its tester URLs from its own secret.
A publish MUST NOT write any target belonging to a channel it was not asked to publish.
A channel that declares tester targets but has no secret configured MUST fail the publish rather than write a guessable path.
A cohort's URL is immutable once distributed: rotating a channel's secret is a cohort migration, never hygiene.
Publishing MUST NOT remove a target it has already published for a tester group.
A target superseded by rotation keeps serving its last pre-rotation manifest, so no update is ever offered to its cohort and no error is surfaced — the cohort silently stops receiving updates rather than failing.
Secret rotation MUST NOT be relied on as a lockout, because every artefact published to a superseded target stays reachable to anyone holding its URL.
A manifest a cohort holds MUST remain readable to that cohort: privacy is enforced on the archive and on URL secrecy, never by making a distributed manifest unreachable, because an unreachable manifest is not a lockout but an offer to defect to the public registry.

#### Scenario: an anonymous request for a private channel's artefacts

- **WHEN** a private channel's sources manifest or archive is requested without credentials
- **THEN** the request is refused

#### Scenario: publishing to one channel

- **WHEN** a publish is asked for one channel
- **THEN** it writes that channel's targets
- **AND** it writes no target belonging to any other channel

#### Scenario: changing channel

- **WHEN** a user installed from one channel wants to be on another
- **THEN** the only supported route is to uninstall and reinstall from the other channel's manifest URL

### Requirement: Monotonic channel heads

A target's `latest` manifest MUST NOT be moved to a version Foundry would consider older than the version it currently advertises, unless an explicit downgrade override is passed.
Ordering MUST be evaluated with Foundry's own comparison and not with semantic versioning, because the property protected is that an installed client is never force-downgraded, and Foundry decides that.
A semantic-version comparison MAY be computed alongside for reporting, and a disagreement MUST be recorded as a warning, but it MUST NOT gate a publish.
An absent manifest MUST be handled explicitly and MUST NOT be passed to that comparison, which treats a missing operand as older than everything; a storage error MUST NOT be treated as an absent manifest.
The check MUST be evaluated per target and MUST run before any object is written.
The downgrade override MUST NOT be used to resolve an ordering stall within a channel: it stops that cohort receiving any further update, and the next version that does compare as newer will offer the whole cohort a manifest rewrite out of the private channel.
The supported remedy for a stall is to raise the version far enough that Foundry compares it as newer, and that raised version MUST keep the prerelease identifier of the channel it is published to.
A stall can only arise on a channel carrying prereleases, so a remedy that drops the prerelease identifier would level that channel's head with the public release and hand the whole cohort to the registry on the next public version — the refusal's own remedy MUST NOT name a bare stable version.

#### Scenario: a publish would move a head backwards

- **WHEN** a publish would move a target's manifest to a version Foundry considers older than the one it advertises
- **THEN** the publish fails, no object is written, and the failure names the remedy: a higher version, not a downgrade override

#### Scenario: a version pair Foundry orders unintuitively

- **WHEN** a publish would move a head from a prerelease of one patch to a prerelease of a higher patch that Foundry compares as older
- **THEN** the publish fails loudly rather than leaving the channel silently unable to offer updates

### Requirement: Registry lead prohibition

A channel Fabricate publishes MUST NOT advertise a version Foundry would consider older than the version published to the Foundry package registry, and a channel or tester manifest URL MUST NOT return 404 while the module is listed on the registry.
Either condition lets Foundry offer to permanently rewrite the client's on-disk manifest URL to the registry's; for a client installed from a private channel, accepting is a silent, irreversible defection out of it.
For a client installed from a version-pinned artefact predating this specification, that same offer is Foundry's intended mechanism, and is how it rejoins the public line.
This prohibition MUST be enforced against every private target of a channel, not only its channel manifest, because the offer is decided against the manifest URL the client actually baked.
Enforcement MUST be a verification performed by the promotion, never an assumption about what the heads must be, because a version's tag is minted before its channel is published and a failed publish leaves a stale head.
It protects the cohorts a channel retains, so it binds `beta`, `early-access`, `public`, and every tester target of theirs.
A hotfix channel retains no cohort: once a later stable version supersedes the hotfix, that channel's head being older than the registry is the intended end state, and anything installed from it is meant to rejoin the public line.
Its manifest MUST nevertheless be left in place, so that the tooling and credentialed readers still resolve it; the 404 prohibition binds the channels that do retain cohorts.

#### Scenario: a hotfix outruns a private channel

- **WHEN** a hotfix would be published to the registry while Foundry would consider it newer than the head of any private target
- **THEN** the promotion fails before the registry publication, because the hotfix cannot be published to that channel without moving its head backwards
- **AND** the failure names the remedy: advance the lagging channel first

#### Scenario: promoting a version its source channel has not received

- **WHEN** promotion to `public` is attempted for a version that any private target of its source channel does not advertise
- **THEN** the promotion fails before anything is published

#### Scenario: a cohort-retaining private target has no published head

- **WHEN** promotion to `public` is attempted while a cohort-retaining private target of `beta` or `early-access` that the source channel does not cover returns 404 for its manifest URL
- **THEN** the promotion fails before the registry publication, because a retained cohort whose manifest 404s while the module is listed on the registry is offered a rewrite out of its private channel
- **AND** the failure names the remedy: publish that channel's head before re-running the promotion
- **AND** a target of the source channel is exempt here, because the promotion's source-advertises verification already refuses an absent head on it

#### Scenario: the lagging private head belongs to the prerelease channel

- **WHEN** a promotion refuses because the prerelease channel's head is a version Foundry considers older than the version being promoted
- **THEN** the failure names bringing the release line back into the prerelease line as the remedy whenever the prerelease line is itself numbered below that version

### Requirement: Prerelease line precedence

The prerelease line MUST always be positioned so that the next version it mints is numbered above every stable version already published to a channel that retains a cohort.
A prerelease channel head that is a prerelease of such a stable version satisfies this, because Foundry does not consider a stable version newer than its own prereleases; a head belonging to an older version does not.
Deferring the forward-port that keeps this true is not a delay but a deadlock: while the prerelease line is numbered below a published stable version, every version that line mints is numbered below it too, so the prerelease channel's head can never overtake the published version, and the registry lead prohibition refuses the very promotion that would have performed the forward-port.
The remedy for a prerelease line that has fallen below a published stable version MUST be available without making any version publicly obtainable, because the refusal that reports the condition is itself what blocks the promotion, and it MUST remain available when the two lines cannot be combined automatically, which is precisely the state in which the line is stuck and no route around the deadlock exists.

#### Scenario: the prerelease line has fallen below a published stable version

- **WHEN** the prerelease line is numbered below a stable version already published to a channel
- **THEN** it can be brought back above that version without promoting any version to `public`
- **AND** every version the prerelease line mints afterwards is numbered above every published stable version

### Requirement: Self-contained distribution targets

Each target MUST be self-contained: its own versioned archive, whose in-archive manifest bakes that target's own manifest and download URLs, and a `latest` manifest carrying that same manifest URL.
Targets MUST NOT share an archive, because Foundry follows the manifest URL baked into the installed archive rather than the URL the user pasted, so a target shipping another target's manifest URL silently re-points every client that installed from it.
The release artefact's in-archive manifest URL MUST be the repository's latest-release manifest URL: it MUST NOT be a channel's, and it MUST NOT be version-pinned, because a version-pinned URL puts every public client through a manifest-rewrite prompt on every update.
That prompt is not a defection for a public client — it is Foundry's intended mechanism — but it is a needless confirmation that a latest-release URL avoids.
The manifest URL published to the registry is a different artefact: it MUST be version-pinned, MUST be constructed from the version, and MUST NOT be copied from the archive's manifest field.

#### Scenario: a version's release artefact

- **WHEN** a release artefact carries a version's archive
- **THEN** the in-archive manifest URL is the repository's latest-release URL, never a channel's and never version-pinned, while the download URL and the URL sent to the registry are version-pinned

#### Scenario: publishing a version to a channel

- **WHEN** a version is published to a channel with one or more tester groups
- **THEN** one archive is produced per target
- **AND** each target's `latest` manifest advertises that target's own manifest and download URLs

### Requirement: Registry compatibility record

The compatibility record published to the Foundry package registry MUST declare a non-empty minimum and verified core version, and MUST omit the maximum entirely when no known incompatibility exists.
It is a client-affecting artefact and not a storefront label: a set integer maximum renders the module unavailable — neither loading nor installing — on the next Foundry generation.

#### Scenario: publishing a release to the registry

- **WHEN** a release is published to the registry
- **THEN** the minimum and verified core versions are present and non-empty
- **AND** a maximum is present only when a known-broken Foundry version exists

### Requirement: Version authority and promotion mechanics

The release automation MUST be the sole authority for version numbers; a version MUST NOT be created, renamed, or copied by hand.
The release automation releases the commit that is checked out, so a prerelease promotion MUST be a real merge or fast-forward of that commit onto the release line — never a squash, and never a tag copy — and the stable version MUST be recomputed from the Conventional Commits on that line, because squashing collapses the Conventional Commit types the computation reads.
A release promotion MUST NOT create or move a git tag; it changes only release metadata and channel publication.
A stable version minted on the release line MUST be forward-ported into the prerelease line once that version has been published to its channel, and MUST NOT be forward-ported before that publication is confirmed, because a version no channel carries is not one the prerelease line needs to be numbered above.
A release promotion of a version built on the release line MUST confirm that the forward-port has happened, and MUST perform it if it has not, before any prerelease channel is written.
The forward-port obligation binds the release line only, never a hotfix line.
A forward-port that has already happened MUST be a no-op rather than a repetition, so that it can be invoked more than once without conflicting.
A forward-port whose two lines cannot be combined automatically MUST remain completable; what completing it requires is stated in **Forward-port conflict resolution**.
A forward-port MUST NOT assume the release line is content-identical to the prerelease line; what it must instead establish is stated in **Forward-port content provenance**.
A release artefact MUST be created only from a pre-existing, pushed tag and MUST be pinned to that tag's commit; a release creation allowed to create a missing tag will create it from the default branch's head rather than the tested commit.
The notes published with a version's release artefact MUST be the notes generated for that version when its branch built it, together with the notes of any version that was minted and published to a channel but superseded before it was ever made public — without which the public record silently omits every change a superseded version carried.

#### Scenario: promoting a tested prerelease into the release line

- **WHEN** a tested prerelease commit is promoted into the release line
- **THEN** that commit is merged, or fast-forwarded, onto the release line without squashing
- **AND** the stable version is recomputed from the commits since the last stable version
- **AND** once that stable version is published to its channel, the release line is forward-ported into the prerelease line

#### Scenario: a stable version whose channel publication did not succeed

- **WHEN** the release line mints a stable version but the publish to its channel does not succeed
- **THEN** the release line is not forward-ported into the prerelease line, and the failed publication is reported

#### Scenario: a version is superseded before it is made public

- **WHEN** a stable version is minted and published to a channel, but a later version reaches `public` before it does
- **THEN** the later version's public notes include the superseded version's notes

### Requirement: Release line change provenance

Every change to the release line MUST be reviewed before it lands there.
A change MUST NOT reach the release line by a direct, unreviewed write, and that MUST be prevented at the point of writing rather than detected afterwards, because the release line is the source the forward-port carries onto the prerelease line through an automated write that bypasses review.
A prerelease promotion MAY advance the release line without a per-change review of its own, but only where what it carries has ALREADY been reviewed on the prerelease line, and only where it verifies that before writing.

#### Scenario: an unreviewed change is written directly to the release line

- **WHEN** a change is written to the release line without having been reviewed
- **THEN** the write is refused at the point it is attempted, rather than detected later by the forward-port
- **AND** the remedy named is to propose the same change for review against the release line

#### Scenario: automation advances the release line with already-reviewed content

- **WHEN** the prerelease promotion advances the release line with a commit already carried by the prerelease line
- **THEN** it is permitted without a further review, because it verifies that ancestry before writing

### Requirement: Forward-port content provenance

When a forward-port would carry file content onto the prerelease line, it MUST establish mechanically that every commit it carries is attributable to a change reviewed **against the release line**, as **Release line change provenance** requires, and MUST NOT accept an operator's assertion that this is so.
A change reviewed against a different line MUST NOT be treated as accounted for merely because that review took place and was merged.
A merge commit that introduces no content beyond what its parents already carry satisfies this without a review of its own; a merge commit that introduces content present in no parent does not.
Whether a merge introduced content of its own MUST be established by reproducing the merge from its parents and comparing the result with what the merge recorded, never inferred from which files the merge touched, because a clean automatic merge and a merge carrying invented content touch exactly the same files.
A forward-port that cannot establish change provenance MUST refuse, and MUST NOT treat an absence of evidence as an absence of unreviewed content.
A refusal MUST name the commits it could not account for.
An override MAY exist, but it MUST NOT be the routine path, and a forward-port whose content IS accounted for MUST proceed without one.
A forward-port completed from a supplied resolution is subject to this requirement unchanged: a resolution accounts for the conflict and for nothing else, and MUST NOT be treated as an override of this requirement or of any refusal it produces.

#### Scenario: a forward-port carrying content authored through review

- **WHEN** every commit it carries is attributable to a change reviewed against the release line
- **THEN** it proceeds without an override and without a manual confirmation

#### Scenario: a forward-port carrying content of unestablished change provenance

- **WHEN** it would carry a commit it cannot attribute to a change reviewed against the release line
- **THEN** it fails, naming that commit, and does not offer the reader's own confirmation as the ordinary remedy

#### Scenario: the forward-port's own merge introduces content

- **WHEN** the merge it performs introduces content present in none of its parents
- **THEN** it fails, because that content has been reviewed nowhere

#### Scenario: change provenance cannot be established

- **WHEN** the evidence it needs is unavailable or incomplete
- **THEN** it refuses and reports the state as unverifiable, rather than proceeding
- **AND** the override does not apply to it, and is not offered as its remedy, because there is no established refusal to vouch for

### Requirement: Forward-port conflict resolution

A forward-port whose two lines cannot be combined automatically MUST report that state as a conflict distinct from a failure, and MUST name the content that could not be combined.
It MUST be completable from a supplied resolution, and completing it MUST NOT require any person to write to the prerelease line, because the record of both lines' ancestry that keeps the prerelease line numbered above the released version is a write only the automation may make.
A supplied resolution MUST be checked against both lines before it is recorded, and MUST NOT be accepted on the supplier's assertion that it is correct.
A resolution MUST be pinned to the exact state of both lines it was produced against, and MUST be refused rather than reapplied if either line has moved, because a resolution applied to a state it did not resolve can silently discard content the other line has since gained.
A resolution MUST NOT alter anything the two lines could be combined on automatically; it is confined to what could not be.
A resolution MUST NOT introduce content present in neither line, and MUST NOT leave behind the marks of a difference that was never resolved.
The outcome a resolution is expected to produce MUST be stated before it is applied and established afterwards, and a resolution whose stated outcome does not hold MUST be refused.
A stated outcome that is not one of the outcomes this can establish MUST itself be a refusal, because a statement nothing recognises is a statement nothing checks.
A resolution that is absent, unreadable, or not present in this repository MUST be refused, and that state MUST be reported as unverifiable rather than as a refusal, so that no override applies to it.
A forward-port completed from a resolution MUST satisfy every other obligation of a forward-port in full, and the resolution MUST NOT relax any of them.

What these checks establish is bounded, and the bound MUST be stated wherever this capability is described rather than left to be discovered.
They establish that a resolution reached no further than the conflict, introduced no content neither line carries, left no unresolved difference behind, and produced the outcome it declared.
They do NOT establish that a resolution kept what the release line was bringing back: a resolution that silently drops it passes every one of them, and the completed forward-port then records that line's ancestry, so the loss is never reported again.
They detect content duplicated from what both lines already carry only where the stated outcome is that the prerelease line's content is unchanged.
A resolution MUST therefore be reviewable as a proposed change against the prerelease line before it is applied, because that review is the only place either omission can be seen.

#### Scenario: a forward-port whose lines cannot be combined automatically

- **WHEN** a forward-port's two lines conflict and no resolution has been supplied
- **THEN** it reports a conflict rather than a generic failure, names the content that could not be combined, and nothing is written to the prerelease line

#### Scenario: completing a forward-port from a supplied resolution

- **WHEN** a resolution is supplied for the exact state of both lines it was produced against, and every check of it holds
- **THEN** the forward-port is completed and recorded carrying both lines' ancestry, without any person writing to the prerelease line
- **AND** the change provenance of everything it carries is established exactly as it is for any other forward-port

#### Scenario: a resolution produced against a line that has since moved

- **WHEN** either line has moved since the resolution was produced
- **THEN** the resolution is refused rather than reapplied, and the failure names producing a new one against the current state as the remedy

#### Scenario: a resolution that reaches beyond the conflict

- **WHEN** a resolution alters content the two lines could be combined on automatically, or introduces content present in neither line
- **THEN** it is refused, because that content has been reviewed nowhere

#### Scenario: a resolution whose stated outcome does not hold

- **WHEN** a resolution is stated to leave the prerelease line's content unchanged and the completed forward-port would change it
- **THEN** it is refused, naming the difference

#### Scenario: a resolution whose stated outcome is not one that can be established

- **WHEN** the outcome stated for a resolution is not one of those this can establish
- **THEN** it is refused, rather than applied with that statement left unchecked

#### Scenario: a resolution offered as an override

- **WHEN** a forward-port completed from a resolution would carry content it cannot attribute to a change reviewed against the release line
- **THEN** it fails on that account regardless of the resolution, which accounts only for the conflict

### Requirement: Promotion-gated public availability

A version MUST NOT be publicly obtainable until it is promoted, and a prerelease has no release artefact and no registry record at all.
A stable version's release artefact MUST NOT be publicly obtainable, listed as latest, or downloadable anonymously until that version is promoted to `public`; this applies to a hotfix exactly as to a version built on the release line.
Before promotion, a stable version's artefacts exist only on the channel it was published to, and that channel's targets are not anonymously obtainable.
Within a promotion, every step that can fail MUST precede the step that cannot be undone: making a release artefact public is irreversible, so it happens only after the promoted version's channel targets have been published and read back, after the artefact's own contents have been confirmed to exist, and after the registry payload has been built and validated.
Registry publication follows it.

#### Scenario: the prerelease line builds a version

- **WHEN** the prerelease line builds a version
- **THEN** its tag exists and its `beta` channel targets are published, and no release artefact is created for it

#### Scenario: the release line or a hotfix line builds a stable version

- **WHEN** the release line or a hotfix line builds a stable version
- **THEN** its tag exists and its own channel's targets are published
- **AND** its release artefact exists but is not publicly obtainable
- **AND** the repository's latest-release manifest URL still resolves to the previous public version, and the registry is untouched

#### Scenario: a promotion fails part-way

- **WHEN** any step of a promotion fails before the release artefact is made public
- **THEN** the registry is untouched, the version is still not publicly obtainable, and the promotion can be re-run

### Requirement: Published artefact immutability

A version's published artefacts are immutable: they are served with an immutable cache policy, and clients already on that version never re-fetch them.
Re-publishing a version a target already advertises MUST therefore be permitted only when the artefact being written came from the same build as the artefact already published.
Re-publishing the same version from a different build MUST fail, because the two cohorts would then run different bytes under one version string and no client would ever learn of the change.
Sameness of build MUST be established by recorded build provenance, not by comparing bytes: the published archive is not byte-reproducible across builds of the same source tree.
An artefact whose provenance is absent or unknown MUST be treated as being of an unidentified build, and MUST NOT satisfy the sameness test.
An override that permits replacing a published version's artefacts MAY exist, but it MUST NOT be the routine remedy for a failed publish.

#### Scenario: a same-version republish from a different build

- **WHEN** a publish would replace an already-published version's artefacts with artefacts from a different build
- **THEN** the publish fails, even though the version is unchanged

#### Scenario: an artefact of unidentified provenance

- **WHEN** a publish would replace an already-published artefact whose build cannot be identified
- **THEN** the publish fails rather than assuming the builds match

### Requirement: Publish completeness

A publish either establishes every one of its targets at the published version, or it fails.
Every manifest a publish writes MUST be read back and MUST be confirmed to advertise the published version.
A publish that has written some targets and not others MUST be resumable: re-running it from the same build MUST complete the remaining targets without an override, and MUST NOT rewrite the artefacts it already published from that build.
Concurrent publishes to one channel MUST NOT interleave, and a manifest write MUST fail rather than overwrite a head that changed after it was read.

#### Scenario: a partially-completed publish reports its outcome

- **WHEN** a publish writes some targets and then fails
- **THEN** the run fails rather than reporting success

#### Scenario: resuming a partially-completed publish

- **WHEN** a publish previously failed after writing some targets but not others
- **THEN** re-running it from the same build completes the remaining targets without an override
- **AND** it does not rewrite the artefacts it already published from that build

#### Scenario: a head that moved while the publish was building

- **WHEN** a publish would write a manifest whose head has changed since the publish read it
- **THEN** the write fails rather than overwriting the newer head

### Requirement: One build per publish

A publish MUST produce every one of its targets from a single build.
A tester group is a cohort of the same build as its channel, distinguished only by an unguessable URL.
Shipping different bytes to a cohort is a build-profile concern and MUST NOT be expressed as a tester group unless the one-build-per-publish invariant is first lifted.
A publish whose targets do not all share one build profile MUST fail before any object is written.

#### Scenario: a publish whose targets disagree

- **WHEN** a publish's targets do not all share one build profile
- **THEN** the publish fails and no object is written
