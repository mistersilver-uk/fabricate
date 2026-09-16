<!-- Svelte 5 runes mode -->
<!--
  The WORLD-SCOPE catalogue shell (issue 1380, epic 1357): one component behind the Component,
  Essence and Tool catalogues, entity-agnostic across all three.

  It composes `EntityListInspectorFrame` and adds exactly what world scope owns:

   - an INSPECTOR COLUMN, because all seven world scoped routes are released to full width and
     the shell's shared 300px aside is suppressed on every one of them. Nothing else will draw
     one, so this shell does — at the same 300px, so a GM sees one inspector width across scopes;
   - the PER-SECTION INHERIT COUNTS, labelled through `scopedSectionLabel` so the five section
     names are read from ONE list rather than restated per screen. A ONE-SECTION entity renders
     its count inline with no group chrome: a header and a divider around a single number costs
     more vertical space than the number and says nothing it does not;
   - the PER-SYSTEM MEMBERSHIP ROWS, each carrying the shipped `MembershipActions` cluster. Those
     rows come from `entry.systems` — the projection's JOIN — and never from the `systems` prop,
     which is a narrowed `{id, name}` roster and cannot answer `member`, `inherited` or `enabled`.

  ── WHAT IS ENTITY-AGNOSTIC, AND WHAT THE LANE SUPPLIES ───────────────────────────────────────
  The boundary sits INSIDE the row and INSIDE the inspector. An identity cell means the same
  thing in all three catalogues and a badge run does not, so the frame owns the medallion, name
  and description and the lane owns the meta run through `rowMeta`. Likewise the inspector's
  identity header is the frame's and its body is `inspectorBody`.

  ── EVERY ENTITY-SHAPE DIFFERENCE IS A DESCRIPTOR ANSWER ──────────────────────────────────────
  `scope.sections`, `scope.enableable`, `scope.sourceLinked` and `scope.hasColorToken` are read
  from the projection. Nothing here tests `scope.entityType`, because the three types differ in
  THREE ways — source link, `img` versus `icon`, and `colorToken` — and a call-site test would
  have to know all three and stay right as a fourth appears.

  ── THE NAME MAY NOT START WITH `World` ───────────────────────────────────────────────────────
  `tests/components/manager-contract.test.js` filters this directory on that prefix and asserts
  exactly seven placeholder pages, so a `World…` name here would make the count eight.

  IT ALSO CARRIES NEITHER ROUTE-HOOK ATTRIBUTE, and the two names are deliberately not written out
  even in this comment. `tests/manager-scoped-prop-contract.test.js` builds its route→page map by
  matching those attribute NAMES literally against every file in this directory, comment text
  included, and a shell wearing one would claim a route a page already owns. The hook this shell
  does carry arrives as `hookValue` and lands on `data-scoped-list`, which is a third name nothing
  routes on.

  Props:
   - scope: the entity type's `worldScope` projection.
   - actions: that entity type's write family from `worldScopeActions` — `addToSystem`,
     `removeFromSystem`, and `setEnabled` only when `scope.enableable`. `copyMembership` is
     deliberately NOT called; see `copyable` below.
   - systems: the crafting-system roster, for names only.
   - hookValue: the `data-scoped-list` value; the page still owns `<main>` and the route hook.
   - title / subtitle / icon / emptyTitle / emptyHint: pre-localized, from the lane.
   - filters / sorts / searchOf: the lane's extra list configuration.
   - sectionNotes: `{[section]: string}` — the one-line summary of what each world default
     resolves to. Without it a count reads "Category · 3" and never says WHAT three systems are
     inheriting, and a row-count criterion passes green over every note empty.
   - sectionTitles: `{[section]: string}` — the card TITLE for each world-default section, which
     is the value the default resolves to stated as a phrase (`Effects from Ember Brand`), not the
     section's own name. The prototype's cards title themselves after their VALUE and put the
     inherit arithmetic underneath; a card titled `Effect source` states which row it is and
     nothing about what a GM would be changing.
   - sectionIcons: `{[section]: string}` — the leading glyph per card, from the lane's own
     vocabulary, so a wand means effects on this screen exactly as it does in the row.
   - extraCards: `{id, icon, title, note}[]` — cards the SECTIONS do not produce. An essence's
     enabled roll-up is one: it is a per-membership flag rather than a world default, so it has no
     section and no inherit count, and the prototype still draws it in the same stack.
   - inspectorKicker / inspectorCaption / inspectorFoot / countUnit / membershipFilter /
     selectAllLabel: threaded straight to the frame; see its own prop notes. `inspectorCaption`
     is the one that had to be ADDED after the fact: the essence catalogue passed it, this shell
     did not declare it, and a snippet a shell does not forward is dropped in SILENCE — the frame
     rendered its own name-only fallback and the caption looked merely unfinished rather than
     unwired.
   - rowTrailing / rowSecondLine / describeEntry / nameEntry / listLead / openEntryLabel /
     systemRowAction: the row, list and inspector parity switches, each opt-in and each
     defaulting to what shipped. See the frame's prop notes, and `SystemRulesRoster`'s own note
     for `systemRowAction`. `listLead` is what puts a lane's create-from-drop zone at the head of
     the list where the design draws it, instead of in a band above the toolbar.
   - columnLead / restingTitle / restingHint: threaded straight to the frame; see its prop notes.
     `columnLead` renders a scope-wide card above the toolbar INSIDE the list column, which is the
     only placement that leaves the inspector running the whole route's height.
   - onOpenSystemRules(entityId, systemId): the inspector system row's `Rules ↗` deep link, into
     that system's own rules for this entity. `null` — the default — falls the row back to the
     membership cluster, so a lane whose shell has nowhere to route to still gets a usable row.
     See the row itself for why a MEMBER row prefers the link.
   - selectedId: the inspected row, BINDABLE and threaded straight through to the frame, which
     writes it on every row click. An owner that binds can never hold a different value from the
     list, which is what lets a refused navigation restore the selection it declined to leave.
     The state an owner binds must be INITIALISED — an uninitialised `$state()` throws
     `props_invalid_value` on mount; see the frame's own note.
   - onSelect(entityId): called after the write, for an owner that reacts without binding.
   - autoSelectFirst: inspect the first shown row on open when nothing is selected. Opt-in, off
     by default; see the frame's prop note.
   - onOpenEntry(entityId): the row's pen, into that entity's world entry editor.
   - rowMeta / inspectorBody / bulk: the lane's three snippets.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EntityListInspectorFrame from './EntityListInspectorFrame.svelte';
  import SystemRulesRoster from './SystemRulesRoster.svelte';
  import { scopedSectionLabel } from './scopedStudio.js';

  let {
    scope = null,
    actions = null,
    systems = [],
    hookValue = '',
    title = '',
    subtitle = '',
    icon = 'fas fa-cubes-stacked',
    filters = [],
    sorts = [],
    searchOf = undefined,
    searchPlaceholder = '',
    sectionNotes = {},
    sectionTitles = {},
    sectionIcons = {},
    extraCards = [],
    inspectorKicker = '',
    inspectorCaption = undefined,
    inspectorFoot = undefined,
    countUnit = '',
    membershipFilter = true,
    // Threaded straight to the frame; see its own prop note. OPT-IN, defaulting to the single
    // toolbar row every catalogue renders today.
    splitToolbar = false,
    // Threaded straight to the frame; see its own prop notes. Both are OPT-IN and default to
    // exactly what the essence and tool catalogues render today: `toolbarLeadSize` is the control
    // rung the LEAD toolbar row takes (`''` = the shipped 34px, `'38'` = the ladder's next rung,
    // which is what `proto:577`-`578` draws), and `rowMedallion` is the `{variant, size, glyph}`
    // descriptor for the tile at the head of a row (`null` = the shipped 40px artwork tile).
    toolbarLeadSize = '',
    rowMedallion = null,
    // Threaded straight to the frame and on to `BulkSelectionToolbar`; see the frame's own prop
    // note. `'results'` is the shipped band, so the essence and tool catalogues are unchanged.
    selectAllScope = 'results',
    selectAllLabel = '',
    onOpenSystemRules = null,
    // The list's lifted view-state (issue 1438), passed straight through to the frame. It is
    // OWNED by the manager root: opening an entry unmounts this shell along with the frame,
    // so a slot held here would be destroyed by the very trip it exists to survive.
    browserState = $bindable(null),
    selectedId = $bindable(''),
    onSelect = () => {},
    // WHETHER THE FIRST SHOWN ROW IS INSPECTED ON OPEN (issue 1371 r13-cat, maintainer ruling
    // M14). Threaded straight to the frame; see its own prop note for what it yields to. OPT-IN
    // and OFF by default, so the essence and tool catalogues open on the resting inspector they
    // always did; the world Component catalogue is the lane that turns it on.
    autoSelectFirst = false,
    // WHETHER THE LIST COLUMN RUNS EDGE TO EDGE IN ITS PANE (issue 1371 r16-cat, maintainer
    // ruling M21). Threaded straight to the frame; see its own prop note. OPT-IN and OFF by
    // default, so the essence and tool catalogues keep the pane inset they always carried; the
    // world Component catalogue is the lane that turns it on.
    flushColumn = false,
    // WHETHER THE BULK PANEL'S DOCK REACHES THE INSPECTOR COLUMN'S EDGES (issue 1371 r16-cat,
    // maintainer ruling M24). Threaded straight to the frame; see its own prop note. OPT-IN and
    // OFF by default, so the tool catalogue's bulk panel keeps the column it shipped in.
    flushBulkDock = false,
    onOpenEntry = () => {},
    rowMeta = undefined,
    // Threaded straight to the frame; see its own prop notes. All three are OPT-IN and default to
    // exactly what the component and essence catalogues render today.
    rowTrailing = undefined,
    rowSecondLine = 'description',
    // Threaded straight to the frame; see its own prop notes. Both are OPT-IN: a lane that draws
    // its own source pill on the NAME LINE turns the frame's trailing badge off, so one row never
    // carries two answers to "does this record name a source Item".
    rowNameTrailing = undefined,
    rowSourceBadge = true,
    describeEntry = undefined,
    // Threaded straight to the frame; see its own prop notes. Both are OPT-IN and default to
    // exactly what the component and essence catalogues render today.
    nameEntry = undefined,
    listLead = undefined,
    // Threaded straight to the frame; see its own prop notes. `columnLead` is what puts a
    // scope-wide card ABOVE the toolbar and INSIDE the list column, which is where the design
    // draws the world Tool catalogue's breakage card — a page that renders such a card as a
    // sibling of this shell spans it across the inspector's track too, and starts the inspector
    // a card's height below the app header (issue 1373, maintainer feedback round 2).
    columnLead = undefined,
    // The resting inspector's copy. Both default to what shipped, so only a lane that names its
    // noun changes.
    restingTitle = '',
    restingHint = '',
    // The ROW ACTION the list offers per entity. The shipped icon button stays the default; a
    // lane that NAMES the verb gets the design's bordered `Edit <noun>` button instead, which is
    // also what our own system rules list already draws.
    openEntryLabel = '',
    // WHETHER THAT NAMED VERB IS DRAWN AS A LABELLED BUTTON. It shipped derived from
    // `openEntryLabel` alone, which made the two questions one: a lane could not name the action
    // for its `title` and its accessible name — which the reference DOES, `Open catalogue entry`
    // on a 28px pen (`proto:609`) — without also getting a 104px labelled control. `null` keeps
    // the derivation, so the world Tool catalogue and both rules lists are unchanged.
    openEntryLabelled = null,
    // WHAT AN INSPECTOR SYSTEM ROW OFFERS. `manage` is the shipped pair - a `Rules` link for a
    // member and the membership cluster for a non-member. `navigate` is the design's tool
    // catalogue: EVERY row is a link, and the verb that creates a system's record lives on the
    // system's own screen rather than on the world catalogue. Passed through to
    // `SystemRulesRoster`, which owns the row since that panel was extracted.
    systemRowAction = 'manage',
    // WHETHER THE INSPECTOR DRAWS THE `World defaults` CARD STACK (issue 1371, parity round 4).
    //
    // `true` by default, so the essence and tool catalogues are untouched. The COMPONENT
    // catalogue opts out because its reference inspector has no such card: it draws a source
    // inset and a `Global tags` inset, and the defaults stack is a differently-shaped card that
    // was standing in for the second of them. A subject-only card fails the structural parity
    // pass by design — `visual-parity/README.md`, "a card is a claim about the shape of the
    // screen" — so it is withheld rather than reshaped, and the lane that owns the reference for
    // the other two families keeps the card it draws.
    showWorldDefaults = true,
    // WHERE THE LANE'S OWN INSPECTOR BLOCKS SIT relative to the two the shell owns: `'trail'`
    // (the shipped default) or `'lead'`. See the snippet's own note.
    inspectorBodyPlacement = 'trail',
    // WHAT THE INSPECTOR'S SYSTEM ROSTER SAYS WHEN NO SYSTEM HAS THE ENTITY (issue 1371). Threaded
    // straight to `SystemRulesRoster`; see its own prop note for why the branch is opt-in rather
    // than derived. Empty by default, so the essence and tool catalogues render the roster they
    // always did, and only a lane that names a sentence gets one.
    rosterEmptyNote = '',
    // THE ROSTER'S TWO SURFACE DECISIONS (issue 1371 r9-cat, reviewer finding 7). Threaded
    // straight to `SystemRulesRoster`, which states both as opt-in props for exactly this:
    // `rosterRecessed` drops the card one ramp rung to `--fab-bg-0`, and `rosterSearchWell` lifts
    // its search field back up to a `--fab-bg-1` box with a hairline and the rows' 7px corner, so
    // a recessed card reads as a container holding two kinds of thing rather than as a flat pane.
    //
    // The shell has to carry them because a page composes THIS component and never the roster:
    // the panel is rendered inside `catalogueInspector`, which is this file's snippet. Both
    // default to OFF, so the essence and tool catalogues render the card they always did — the
    // reference for this pair is the world Component catalogue's inspector and no other.
    rosterRecessed = false,
    rosterSearchWell = false,
    inspectorBody = undefined,
    bulk = undefined,
    emptyTitle = '',
    emptyHint = '',
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  let armedToken = $state('');

  const sections = $derived(Array.isArray(scope?.sections) ? scope.sections : []);
  // The DENOMINATOR of the system-rules count. `systems` is the crafting-system roster the frame
  // narrows to `{id, name}`; the entry's own `systems` array is the JOIN and has one row per
  // roster entry, so either would answer — this one because it is what the prototype's `/ 24`
  // counts, the world's systems, whether or not this essence has been joined to them.
  const rosterSize = $derived(Array.isArray(systems) ? systems.length : 0);
  const rowActions = $derived([
    {
      id: 'open-entry',
      icon: 'fas fa-pen',
      // A LANE THAT NAMES THE VERB GETS THE LABELLED BUTTON. The design's row action reads
      // `Edit tool`, and a bare pen states neither the verb nor the noun; the shipped `Open`
      // icon button stays the default so no other catalogue's row moves.
      labelled: openEntryLabelled === null ? Boolean(openEntryLabel) : openEntryLabelled === true,
      label: openEntryLabel || text('FABRICATE.Admin.Manager.Scoped.List.OpenEntry', 'Open'),
      run: (entry) => onOpenEntry(entry.id),
    },
  ]);

  /**
   * COPY-FROM IS SUPPRESSED IN THIS SHELL, AND THAT IS A DECISION RATHER THAN AN OMISSION.
   *
   * `copyMembership(entityId, fromSystemId, toSystemIds)` needs a SOURCE and a list of
   * DESTINATIONS. What a per-system row here knows is its own id, and — because
   * `MembershipActions` renders Copy only inside its `member` branch — that id is the
   * DESTINATION, the system that already has the entity. The source is whichever OTHER system
   * the GM meant, and nothing on this screen asks them.
   *
   * The label is `Copy from…`, with the ellipsis that promises a chooser, and this shell has
   * none. Offering the button anyway means one of two failures: a call missing its third
   * argument, which `copyMembership` refuses before it writes anything and reports nothing — a
   * button that silently does nothing on every click forever — or a guess at the source, which
   * writes the wrong system's overrides onto a record and is worse.
   *
   * SO THE AFFORDANCE IS NOT RENDERED, and the chooser is 6a-ii's — the lane that owns this
   * screen's inspector body, where a source picker belongs. `tests/components/
   * scoped-shell-prop-contract.test.js` bans a two-argument `copyMembership` call from this
   * directory, so the lane that adds the picker cannot re-introduce the silent form.
   *
   * `SystemRulesRoster` states the same refusal as a literal `copyable={false}`, which is why no
   * function is threaded to it.
   */
</script>

<div class="manager-scoped-catalogue" data-scoped-list={hookValue}>
  <EntityListInspectorFrame
    {scope}
    {systems}
    {title}
    {subtitle}
    {icon}
    {emptyTitle}
    {emptyHint}
    {filters}
    {sorts}
    {searchOf}
    {searchPlaceholder}
    {rowActions}
    {rowMeta}
    {rowTrailing}
    {rowSecondLine}
    {rowNameTrailing}
    {rowSourceBadge}
    {describeEntry}
    {nameEntry}
    {listLead}
    {columnLead}
    {restingTitle}
    {restingHint}
    {bulk}
    {inspectorKicker}
    {inspectorCaption}
    {inspectorFoot}
    {countUnit}
    {membershipFilter}
    {splitToolbar}
    {toolbarLeadSize}
    {rowMedallion}
    {selectAllScope}
    {selectAllLabel}
    bind:browserState
    bind:selectedId
    {onSelect}
    {autoSelectFirst}
    {flushColumn}
    {flushBulkDock}
    bind:armedToken
    inspectorBody={catalogueInspector}
  />
</div>

<!--
  The catalogue's inspector body WRAPS the lane's, rather than the frame taking a third snippet
  slot. That keeps the frame's contract literal — the inspector region renders when and only when
  an `inspectorBody` is supplied — while still letting a lane add its own panel below the two
  regions this shell owns.
-->
{#snippet catalogueInspector(entry, ctx)}
  {@const counts = entry?.inheritCounts ?? {}}

  <!--
    THE LANE'S OWN BLOCKS COME FIRST WHEN IT SAYS SO (issue 1371, parity round 4).

    The shell used to render its two regions and then the lane's, unconditionally — which is right
    for a lane whose panel is an ADDITION below them, and wrong for one whose blocks the reference
    draws ABOVE the system roster. The world Component catalogue is the second: its inspector reads
    identity, then the source address, then the world vocabulary, then which systems have rules,
    and rendering the roster first inverted the whole column.

    `inspectorBodyPlacement` names which, and defaults to what shipped, so the essence and tool
    catalogues are byte-identical. It is a placement rather than a reordering of the shell's own
    regions, because the two regions the shell owns keep their order relative to each other.
  -->
  {#if inspectorBody && inspectorBodyPlacement === 'lead'}
    {@render inspectorBody(entry, ctx)}
  {/if}

  <!--
    THE WORLD DEFAULTS ARE CARDS THAT NAME THEIR VALUE, not a label-and-count run.

    Each card is `[glyph] {what this default IS} / {how many systems take it}`
    (`tmp/proto/essence-catalogue.png`). What shipped was `Effect source · 0 inheriting` with the
    value on a third line below, which inverts the reference's emphasis: the count is the footnote
    and the value is the fact. The inherit COUNT is still on the card and still hooked by
    `data-scoped-list-inherit-count`, so nothing that could read it before has lost it.
  -->
  {#if showWorldDefaults}
    <section class="manager-scoped-catalogue-section" data-scoped-list-defaults>
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.Scoped.List.DefaultsHead', 'World defaults')}
      </p>
      {#each sections as section (section)}
        <div class="manager-scoped-catalogue-card" data-scoped-list-inherit-count={section}>
          <span class="manager-scoped-catalogue-card-icon" aria-hidden="true">
            <i class={sectionIcons?.[section] || 'fas fa-sliders'}></i>
          </span>
          <span class="manager-scoped-catalogue-card-copy">
            <span class="manager-scoped-catalogue-card-title">
              {sectionTitles?.[section] || scopedSectionLabel(section, text)}
            </span>
            <span
              class="manager-scoped-catalogue-card-note"
              data-scoped-list-inherit-note={section}
            >
              {sectionNotes?.[section] ||
                format('FABRICATE.Admin.Manager.Scoped.List.InheritCount', '{count} inheriting', {
                  count: Number(counts[section]) || 0,
                })}
            </span>
          </span>
        </div>
      {/each}
      {#each extraCards as card (card.id)}
        <div class="manager-scoped-catalogue-card" data-scoped-list-extra-card={card.id}>
          <span class="manager-scoped-catalogue-card-icon" aria-hidden="true">
            <i class={card.icon || 'fas fa-sliders'}></i>
          </span>
          <span class="manager-scoped-catalogue-card-copy">
            <span class="manager-scoped-catalogue-card-title">{card.title}</span>
            {#if card.note}
              <span class="manager-scoped-catalogue-card-note">{card.note}</span>
            {/if}
          </span>
        </div>
      {/each}
    </section>
  {/if}

  <!--
    THE SYSTEM LIST IS `SystemRulesRoster`, COMPOSED RATHER THAN INLINED (issue 1372, maintainer
    parity round 8). The reference draws the identical panel on the system Essence Rules
    inspector, which had none; extracting it is what let that screen have this one rather than a
    second copy of it. Every prop below is a fact this shell holds and the panel does not.
  -->
  <SystemRulesRoster
    rows={Array.isArray(entry?.systems) ? entry.systems : []}
    memberCount={Number(entry?.membershipCount) || 0}
    {rosterSize}
    entityId={entry?.id ?? ''}
    entityName={entry?.entity?.name ?? entry?.id ?? ''}
    entityType={scope?.entityType ?? 'component'}
    enableable={scope?.enableable === true}
    {actions}
    {onOpenSystemRules}
    {systemRowAction}
    {rosterEmptyNote}
    recessed={rosterRecessed}
    searchWell={rosterSearchWell}
    {armedToken}
    onArm={(token) => (armedToken = token)}
    onDisarm={() => (armedToken = '')}
    resetKey={selectedId}
  />

  {#if inspectorBody && inspectorBodyPlacement !== 'lead'}
    {@render inspectorBody(entry, ctx)}
  {/if}
{/snippet}

<style>
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. The only rules that leave this file are the ones for markup this component
     does not own — the composed toolbar's row — which live in `styles/fabricate.css`. */
  .manager-scoped-catalogue {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  /* THE PANEL'S VERTICAL BUDGET IS THE WHOLE REASON THIS IS TIGHT.

     A 900px window gives the inspector about 660px, and the prototype fits an identity block,
     three world-default cards, a section head, a search field, FIVE system rows and a pager into
     it with the primary action pinned below (`essences.png`). At the manager's default
     `--fab-space-2` rhythm that stack is roughly 680px and the pager falls below the fold — the
     one control that says there are more systems than the five on screen. Every gap below is
     therefore stated rather than inherited. */
  .manager-scoped-catalogue-section {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* ONE WORLD DEFAULT, AS A CARD. Glyph, then a title that names the VALUE over a note that
     states the arithmetic — the prototype's `Effects from Ember Brand` / `7 of 13 systems inherit
     it` (`essences.png`). */
  .manager-scoped-catalogue-card {
    display: flex;
    gap: var(--fab-space-2);
    align-items: flex-start;
    padding: 6px var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    /* THE RECESS HAS SOMEWHERE TO GO, BECAUSE THIS IS NOT IN THE PANE (issue 1373).

       The note here read "no fill: the design draws every card in the CONTENT AREA on the pane's
       own surface", and that argument is sound for a card in the content area and simply does not
       apply to this one - these three sit in the INSPECTOR ASIDE, which `proto:2003` paints
       `--bg2` (`--fab-bg-1` here, and what the aside actually declares). `proto:2014` then
       recesses each world-default row to `--bg1`, which is this theme's `--fab-bg-0`: the ramps
       are shifted one rung against each other, so the design's inset colour is our pane colour
       and there is a rung below the aside to reach for.

       Transparent left the card the same value as the aside behind it, so a screen the design
       builds out of two surfaces was drawn with one and a hairline. */
    background: var(--fab-bg-0);
    min-width: 0;
  }

  .manager-scoped-catalogue-card-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    /* The ONE lighter surface inside a card, and it is the prototype's: a glyph tile is a
       CONTROL-sized inset, so it takes the same rung the search field and the selects do. */
    background: var(--fab-bg-1);
    color: var(--fab-accent);
    font-size: 0.72rem;
  }

  .manager-scoped-catalogue-card-copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .manager-scoped-catalogue-card-title {
    color: var(--fab-text);
    font-size: 0.72rem;
    font-weight: 700;
    overflow-wrap: break-word;
  }

  .manager-scoped-catalogue-card-note {
    color: var(--fab-text-muted);
    font-size: 0.62rem;
    line-height: 1.35;
    overflow-wrap: break-word;
  }
</style>
