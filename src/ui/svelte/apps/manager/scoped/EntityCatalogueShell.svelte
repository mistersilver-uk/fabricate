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
    selectAllLabel = '',
    onOpenSystemRules = null,
    selectedId = $bindable(''),
    onSelect = () => {},
    onOpenEntry = () => {},
    rowMeta = undefined,
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
      label: text('FABRICATE.Admin.Manager.Scoped.List.OpenEntry', 'Open'),
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
    {bulk}
    {inspectorKicker}
    {inspectorCaption}
    {inspectorFoot}
    {countUnit}
    {membershipFilter}
    {selectAllLabel}
    bind:selectedId
    {onSelect}
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
    THE WORLD DEFAULTS ARE CARDS THAT NAME THEIR VALUE, not a label-and-count run.

    Each card is `[glyph] {what this default IS} / {how many systems take it}`
    (`tmp/proto/essence-catalogue.png`). What shipped was `Effect source · 0 inheriting` with the
    value on a third line below, which inverts the reference's emphasis: the count is the footnote
    and the value is the fact. The inherit COUNT is still on the card and still hooked by
    `data-scoped-list-inherit-count`, so nothing that could read it before has lost it.
  -->
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
          <span class="manager-scoped-catalogue-card-note" data-scoped-list-inherit-note={section}>
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
    {armedToken}
    onArm={(token) => (armedToken = token)}
    onDisarm={() => (armedToken = '')}
    resetKey={selectedId}
  />

  {#if inspectorBody}{@render inspectorBody(entry, ctx)}{/if}
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
    /* NO FILL. The prototype draws every card in the content area on the pane's own surface and
       separates them with a 1px border alone (issue 1372); a fill here put a fifth grey on a
       screen that has one. */
    background: transparent;
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
