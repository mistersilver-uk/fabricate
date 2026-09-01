<!-- Svelte 5 runes mode -->
<!--
  The world Tools Catalogue (issue 1373, epic 1357).

  IT COMPOSES `EntityCatalogueShell` AND BUILDS NO SECOND LIST. The list, its filters, its
  sort, its bulk selection and its inspector column are all the shell's; what this file owns
  is the tool-shaped configuration around them - the search text, the breakage sort, the row
  badges, the seeded-section panel - and the one control that is not part of any list.

  == THE WORLD BREAKAGE DEFAULT SITS ABOVE THE SHELL, NOT INSIDE IT ========================
  It is neither a row nor an entity: it is one value for every Tool in the world, and this is
  the ONLY surface at world scope that authors it. The shell takes no scope-level header
  snippet, so the card is a SIBLING of the shell inside this page's own `<main>` - a card and
  a list, not a second catalogue composition, and it defines no list, filter or inspector
  structure of its own.

  == THE TWO-TRACK LAYOUT IS REDECLARED, BECAUSE THE SPAN HAD NOTHING TO SPAN ==============
  An earlier revision spanned rows instead of redeclaring, on the premise that
  `styles/fabricate.css` gives every `.manager-main` `grid-template-rows: auto auto 1fr`.
  That is true of the shared rule and FALSE of this view: `styles/fabricate.css:9588-9601`
  overrides every world-scope view to `grid-template-rows: minmax(0, 1fr)` — ONE track. Against
  one track the card took the `1fr`, the list opened an implicit second row that claimed the
  height, the `1fr` resolved to 0px, and the card rendered its own head, segments and note
  outside an 18px box. The View Lab caught it as
  `[data-world-tool-break-segment=toolSpecific] is clipped or extends outside
  [data-world-tool-break-mode]`.

  The old note was right that redeclaring from an all-class scoped selector is a specificity
  TIE resolved on injection order. Adding the element selector settles it on specificity
  instead: `main.manager-main[data-scoped-page]` is (0,3,1) against the shipped rule's (0,3,0),
  so it wins wherever it is injected.

  == AND THE OVERRIDE COUNT IS CONDITIONAL, WHICH IS A REPORTED GAP RATHER THAN A CHOICE ===
  The prototype's card states `{n} systems override it`, counting systems whose OWN authored
  token differs from the world's. That needs each crafting system's `toolBreakage` block, and
  the roster this page receives is `$viewState.systems` - a hand-built allowlist in
  `adminStore.js` that does not carry it, in a file `### GM World Scoped Entity Routes`
  requirement 7 closes to this lane. Reading an absent field answers `0` for every world,
  which reads as "nothing overrides it" and is a WRONG number rather than a missing one. So
  `breakModeOverridesKnown` gates the line: when the roster cannot answer, the card states
  nothing there rather than guessing.

  == THE THIRD SECTION HAS NO INHERIT COUNT, AND THE INSPECTOR SAYS SO ====================
  The shell renders one inherit count per `scope.sections`, which is `['breakage', 'onBreak']`.
  `repairRequirements` is deliberately absent from that list - it is SEEDED once when a tool
  joins a system and then diverges - so a shell iterating the counts drops it silently. It is
  restored through `extraCards`, the shell's own slot for a card the SECTION LOOP cannot
  produce, and it states the seed rule rather than a count: a count would claim a live parent
  the resolver does not honour.

  == THE WORLD DEFAULTS ARE THE SHELL'S CARDS, NOT A SECOND PANEL UNDER THEM ==============
  They were this page's own `inspectorBody` snippet, headed `World defaults` and drawn below
  everything the shell renders. The shell states those facts itself now - a glyph, the value
  the default resolves to, and the line that qualifies it, one card per section - so the
  snippet had become a second `World defaults` heading in one panel, and it overflowed the
  inspector besides. `sectionIcons`, `sectionTitles`, `sectionNotes` and `extraCards` are the
  seam that replaces it, so one meaning is drawn once and every scoped catalogue draws it the
  same way.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Chip from '../Chip.svelte';
  import InspectorActionButton from '../InspectorActionButton.svelte';
  import ItemDropZone from '../ItemDropZone.svelte';
  import { toolBreakageSummary, toolOnBreakSummary } from '../tools/toolStudio.js';
  import EntityCatalogueShell from './EntityCatalogueShell.svelte';
  import {
    breakModeOverrideCount,
    breakModeOverridesKnown,
    worldBreakModeOptions,
    worldToolSearchText,
    worldToolSorts,
  } from './worldToolStudio.js';

  let {
    scope = null,
    actions = null,
    systems = [],
    onOpenEntry = () => {},
    onOpenSystemRules = null,
    // CREATE A WORLD TOOL FROM A DROPPED ITEM. The zone is on THIS screen because a Tool is a
    // world record: it exists once, every system adopts the same one, and the system Tool
    // Rules list — which is where the zone used to live — can only ever author RULES for a
    // record the world already holds.
    //
    // The resolution is the SHELL's, not this page's. Turning a dropped payload into
    // `{name, img, description, originItemUuid}` needs `services.resolveToolSource`, which
    // reads a Foundry global; `worldScopeActions` deliberately reads none, and a page cannot
    // reach the services bag. So the page raises the raw drag data and the root resolves,
    // creates and navigates.
    onCreateFromItemDrop = () => {},
  } = $props();

  // INITIALISED, and that is not optional: `EntityCatalogueShell` declares `selectedId` as a
  // bindable prop, and Svelte 5 THROWS `props_invalid_value` when a bindable prop has a setter
  // and the incoming value is `undefined`. `$state()` with no initialiser kills the mount.
  let selectedId = $state('');

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

  /**
   * One world default read as a TOOL-SHAPED record, for the shipped summary helpers.
   *
   * The world default's sections carry the same field names an in-system record does -
   * `breakage.mode`, `onBreak.mode` - because they are the values a membership record
   * inherits verbatim. `checkBreakable` is a TOP-LEVEL tool field rather than part of the
   * `breakage` section, so it is read from the world default's own top level.
   *
   * @param {object|null} entry
   * @returns {{breakage: object|null, onBreak: object|null, checkBreakable: boolean}}
   */
  function worldDefaultTool(entry) {
    const defaults = entry?.defaults ?? {};
    return {
      breakage: defaults.breakage ?? null,
      onBreak: defaults.onBreak ?? null,
      checkBreakable: defaults.checkBreakable !== false,
    };
  }

  /**
   * The breakage badge one row wears.
   *
   * CALLED WITH THE WORLD'S OWN RESOLVED AUTHORITY, because a world catalogue row has no
   * system: what it can truthfully state is what the world default means under the world's
   * break mode. `toolBreakageSummary` is the shipped derivation and is not restated here.
   *
   * @param {object|null} entry
   * @returns {string}
   */
  function breakageLabel(entry) {
    const tool = worldDefaultTool(entry);
    const kind = toolBreakageSummary(tool, worldAuthority || 'toolSpecific');
    if (kind === 'immune') return text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune');
    if (kind === 'breakable') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryCheckDriven', 'Roll to break');
    }
    if (kind === 'breakageChance') {
      return format('FABRICATE.Admin.Manager.Tools.SummaryChanceValue', '{count}% break', {
        count: tool.breakage?.breakageChance ?? 0,
      });
    }
    if (kind === 'diceExpression') {
      return format('FABRICATE.Admin.Manager.Tools.SummaryDiceValue', '{formula} roll', {
        formula: tool.breakage?.formula || '-',
      });
    }
    const maxUses = Number(tool.breakage?.maxUses);
    if (Number.isInteger(maxUses) && maxUses > 0) {
      return format('FABRICATE.Admin.Manager.Tools.SummaryUseCount', '{count} uses', {
        count: maxUses,
      });
    }
    return text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses');
  }

  /**
   * The on-break badge one row wears.
   *
   * @param {object|null} entry
   * @returns {string}
   */
  function onBreakLabel(entry) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroys', 'Destroys'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakMarksBroken', 'Marks broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplaces', 'Replaces'),
    }[toolOnBreakSummary(worldDefaultTool(entry))];
  }

  /**
   * How many repair groups one tool's world default seeds.
   *
   * @param {object|null} entry
   * @returns {number}
   */
  function repairGroupCount(entry) {
    const groups = entry?.defaults?.repairRequirements;
    return Array.isArray(groups) ? groups.length : 0;
  }

  /**
   * How many crafting systems actually HAVE this Tool.
   *
   * Read off the projection's own JOIN and filtered on `member`, never `entry.systems.length`:
   * that array carries one row per system in the world, member or not, so its length is the
   * SYSTEM COUNT and would state the same number on every row.
   *
   * @param {object|null} entry
   * @returns {number}
   */
  function memberCount(entry) {
    const rows = Array.isArray(entry?.systems) ? entry.systems : [];
    return rows.filter((row) => row?.member === true).length;
  }

  /**
   * What one tool's world default DOES when it breaks, in words rather than as a badge.
   *
   * @param {object|null} entry
   * @returns {string}
   */
  function onBreakActionLabel(entry) {
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroy', 'Destroy the item'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakFlag', 'Mark as broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplace', 'Replace with component'),
    }[toolOnBreakSummary(worldDefaultTool(entry))];
  }

  const worldAuthority = $derived(scope?.toolBreakage?.authority ?? '');
  // The world break mode with the shipped fallback applied, which is what every read of it
  // here needs: a world that has authored nothing is tool-specific, not modeless.
  const worldCheckDriven = $derived((worldAuthority || 'toolSpecific') === 'checkDriven');
  const breakModeOptions = $derived(worldBreakModeOptions(worldAuthority, text));
  const overridesKnown = $derived(breakModeOverridesKnown(systems));
  const overrideCount = $derived(breakModeOverrideCount(systems, worldAuthority));

  // Read by `manager-contract.test.js`'s SWAP DETECTOR against the title `viewTitle` renders
  // for this route. A page that still DELEGATES its body states these four as attributes on
  // the shared placeholder; a page with its own body states them as module constants, and
  // this is one of those. See the twin block in `WorldEssenceCataloguePage.svelte`.
  const PAGE_ID = 'world-tools';
  const PAGE_ICON = 'fas fa-screwdriver-wrench';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle';
  const TITLE_FALLBACK = 'Tools Catalogue';

  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const selectedEntry = $derived(entries.find((entry) => entry.id === selectedId) ?? null);

  const sorts = $derived(worldToolSorts(text, breakageLabel));

  // ── THE WORLD-DEFAULT CARDS, THROUGH THE SHELL RATHER THAN BESIDE IT ───────────────────
  // The card TITLE names the value and the NOTE qualifies it, which is the shell’s own
  // emphasis: a card titled `Breakage` says which row it is and nothing about what a GM would
  // be changing by opening it. The inherit count is still hooked by
  // `data-scoped-list-inherit-count`, so nothing that could read it before has lost it.
  //
  // The BREAKAGE GLYPH follows the world break mode, because that mode decides whether this
  // section is consulted at all: a die when the crafting roll decides it, an hourglass when
  // the Tool tracks its own.
  const sectionIcons = $derived({
    breakage: worldCheckDriven ? 'fas fa-dice-d20' : 'fas fa-hourglass-half',
    onBreak: 'fas fa-heart-crack',
  });

  const sectionTitles = $derived(
    selectedEntry
      ? {
          breakage: breakageLabel(selectedEntry),
          onBreak: format(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreakValue',
            'On break: {action}',
            { action: onBreakActionLabel(selectedEntry).toLocaleLowerCase() }
          ),
        }
      : {}
  );

  // The note says what the rule DOES rather than restating the arithmetic above it, which is
  // the prototype's own emphasis on these cards (`PROTO-tools-catalogue.png`).
  const sectionNotes = $derived(
    selectedEntry
      ? {
          breakage: worldCheckDriven
            ? text(
                'FABRICATE.Admin.Manager.Tools.Editor.PreviewCheckDriven',
                'Check-driven \u00b7 follows the crafting roll'
              )
            : text(
                'FABRICATE.Admin.Manager.Tools.Editor.PreviewToolSpecific',
                'Tool-specific \u00b7 tracked per copy'
              ),
          onBreak: text(
            'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreak',
            'Runs immediately after breakage'
          ),
        }
      : {}
  );

  // THE SEED IS THE CARD THE SECTION LOOP CANNOT PRODUCE. `repairRequirements` carries no
  // inherit count by design, so it is not in `scope.sections` and the loop never reaches it;
  // the shell draws it in the same stack through `extraCards`, which exists for exactly this.
  const extraCards = $derived(
    selectedEntry
      ? [
          {
            id: 'repair',
            icon: 'fas fa-screwdriver-wrench',
            title: format(
              repairGroupCount(selectedEntry) === 1
                ? 'FABRICATE.Admin.Manager.Tools.RepairGroupOne'
                : 'FABRICATE.Admin.Manager.Tools.RepairGroupCount',
              repairGroupCount(selectedEntry) === 1 ? '{count} group' : '{count} groups',
              { count: repairGroupCount(selectedEntry) }
            ),
            note: text(
              'FABRICATE.Admin.Manager.Tools.RepairSeedPreview',
              'Copied once when a system adopts this Tool'
            ),
          },
        ]
      : []
  );

  const catalogueTitle = $derived(text(TITLE_KEY, TITLE_FALLBACK));
</script>

<main class="manager-main" data-scoped-page="world-tools" aria-label={catalogueTitle}>
  <!--
    THE SCOPE BAND: the world break mode and the creation surface, side by side.

    == WHY THEY SHARE A ROW, WHICH IS NOT WHERE THE DESIGN DRAWS THE ZONE ====================
    The design opens the LIST with the dashed zone, immediately under the toolbar.
    `EntityListInspectorFrame` takes no before-rows snippet and both shared shells are closed to
    this lane, so the zone can only be a sibling of the shell - and stacked ABOVE it as its own
    band it costs the column 86px, which is measured rather than guessed: the View Lab reported
    `[data-world-tool-defaults] is clipped or extends outside [data-scoped-list-inspector]` on
    the first render of the stacked version, because the shell's inspector floors its roster at
    120px and pins its lane panel at `flex: 0 0 auto`, so the panel a GM reads the world
    defaults in was pushed below the fold.

    Sharing the row with a card that is already taller than the zone costs the column NOTHING,
    which is what keeps the inspector intact. Both are page-level statements rather than list
    rows, so the band reads as one: what breakage means for every Tool, and how a new Tool is
    made. Moving the zone INTO the list is a shell prop, not a page change, and belongs to
    whichever lane next opens those two files.
  -->
  <div class="manager-world-tool-scope-band">
    <section
      class="manager-inspector-card manager-world-tool-break-card"
      data-world-tool-break-mode
    >
      <div class="manager-world-tool-break-head">
        <i class="fas fa-sliders" aria-hidden="true"></i>
        <span class="manager-world-tool-break-title"
          >{text(
            'FABRICATE.Admin.Manager.Tools.WorldAuthorityTitle',
            'World breakage default'
          )}</span
        >
        {#if overridesKnown}
          <span class="manager-world-tool-break-count" data-world-tool-break-overrides>
            {format(
              overrideCount === 1
                ? 'FABRICATE.Admin.Manager.Tools.WorldAuthorityOverrideOne'
                : 'FABRICATE.Admin.Manager.Tools.WorldAuthorityOverrideCount',
              overrideCount === 1 ? '{count} system overrides it' : '{count} systems override it',
              { count: overrideCount }
            )}
          </span>
        {/if}
      </div>
      <div
        class="manager-world-tool-break-segments"
        role="radiogroup"
        aria-label={text(
          'FABRICATE.Admin.Manager.Tools.WorldAuthorityTitle',
          'World breakage default'
        )}
      >
        {#each breakModeOptions as option (option.value)}
          <label class:is-selected={option.selected} data-world-tool-break-segment={option.value}>
            <input
              type="radio"
              name="world-tool-breakage-authority"
              value={option.value}
              checked={option.selected}
              onchange={() => actions?.setWorldToolBreakage?.(option.value)}
            />
            <span class="manager-world-tool-break-option">
              <i class={option.icon} aria-hidden="true"></i>
              <span>{option.label}</span>
            </span>
          </label>
        {/each}
      </div>
      <!-- WHAT THE SELECTED MODE MEANS, not a sentence naming the segment already highlighted
         two lines above it. The old copy read `Every crafting system uses Tool-specific unless
         it overrides the break mode in its own Tool Rules`, which restates the control and the
         override count on either side of it and says nothing about the rule itself. -->
      <p class="manager-muted manager-world-tool-break-note">
        {(worldAuthority || 'toolSpecific') === 'checkDriven'
          ? text(
              'FABRICATE.Admin.Manager.Tools.WorldAuthorityNoteCheckDriven',
              'The active check decides breakage \u00b7 world default for every system'
            )
          : text(
              'FABRICATE.Admin.Manager.Tools.WorldAuthorityNoteToolSpecific',
              'Each Tool tracks its own breakage \u00b7 world default for every system'
            )}
      </p>
    </section>

    <ItemDropZone
      kind="tool-create"
      title={text(
        'FABRICATE.Admin.Manager.Tools.CreateDropTitle',
        'Drag an Item here to make it a Tool'
      )}
      hint={text(
        'FABRICATE.Admin.Manager.Tools.CreateDropHint',
        'Drop an Item from the Items directory or a compendium.'
      )}
      onDrop={onCreateFromItemDrop}
    />
  </div>

  <div class="manager-world-tool-catalogue-body">
    <EntityCatalogueShell
      {scope}
      {actions}
      {systems}
      hookValue={PAGE_ID}
      title={catalogueTitle}
      subtitle={text(
        'FABRICATE.Admin.Manager.Scoped.ToolCatalogueSubtitle',
        'One Tool per game-world Item, shared by every system.'
      )}
      icon={PAGE_ICON}
      emptyTitle={text('FABRICATE.Admin.Manager.Tools.EmptyTitle', 'No Tools yet')}
      emptyHint={text(
        'FABRICATE.Admin.Manager.Scoped.ToolCatalogueEmptyHint',
        'Tools lifted to world scope appear here, each shared by every crafting system that adopts it.'
      )}
      {sorts}
      searchOf={worldToolSearchText}
      {sectionIcons}
      {sectionTitles}
      {sectionNotes}
      {extraCards}
      inspectorKicker={text('FABRICATE.Admin.Manager.Scoped.Tool.InspectorKicker', 'Tool page')}
      countUnit={text('FABRICATE.Admin.Manager.Scoped.Tool.CountUnit', 'tools')}
      selectAllLabel={text('FABRICATE.Admin.Manager.Scoped.Tool.SelectAllShort', 'All')}
      searchPlaceholder={text(
        'FABRICATE.Admin.Manager.Scoped.Tool.SearchPlaceholder',
        'Search tools…'
      )}
      inspectorFoot={toolInspectorFoot}
      bind:selectedId
      onSelect={(entityId) => (selectedId = entityId)}
      {onOpenEntry}
      {onOpenSystemRules}
      {rowMeta}
    />
  </div>
</main>

<!--
  THE INSPECTOR'S ONE PRIMARY ACTION, PINNED TO ITS FOOT.

  The reference pins a full-width `Edit tool` under the panel's scroll region
  (`PROTO-tools-catalogue.png`), which is what makes the panel a place a GM ACTS from rather
  than only reads. The frame owns the pinning; this snippet owns the verb, which is the split
  the essence catalogue beside it already makes with the same primitive.
-->
{#snippet toolInspectorFoot(entry)}
  <InspectorActionButton
    tone="primary"
    icon="fas fa-arrow-up-right-from-square"
    label={text('FABRICATE.Admin.Manager.Scoped.Tool.OpenEntry', 'Edit tool')}
    data-scoped-tool-open-entry
    onClick={() => onOpenEntry(entry.id)}
  />
{/snippet}

{#snippet rowMeta(entry)}
  <span class="manager-world-tool-row-badges" data-world-tool-row-badges={entry.id}>
    <Chip tone="neutral" data-world-tool-row-breakage>{breakageLabel(entry)}</Chip>
    <Chip tone="neutral" data-world-tool-row-onbreak>{onBreakLabel(entry)}</Chip>
    <!-- HOW MANY SYSTEMS HAVE IT, as plain text rather than a third chip. The two chips
         beside it are what the Tool DOES; this is how far it reaches, which is a different
         kind of fact, and the design sets it as a muted count for that reason. -->
    <span class="manager-world-tool-row-reach" data-world-tool-row-systems={entry.id}>
      {format(
        memberCount(entry) === 1
          ? 'FABRICATE.Admin.Manager.Scoped.List.SystemCountOne'
          : 'FABRICATE.Admin.Manager.Scoped.List.SystemCount',
        memberCount(entry) === 1 ? '{count} system' : '{count} systems',
        { count: memberCount(entry) }
      )}
    </span>
    <!--
      THE WORLD MASTER SWITCH, which is a DIFFERENT control from the per-system toggle the
      inspector's membership rows carry. This one is the world record's own: off here means the
      Tool is off in every crafting system that has it, whatever each of them says, because
      `resolveScopedDefinition` ANDs the two flags and world off wins.

      It is the compact pill the system Tool Rules row already wears, so a GM sees one shape for
      "this Tool is on" across the two scopes. `.manager-tools-enabled-toggle` is a shipped
      global-sheet class rather than one authored here.
    -->
    {#if scope?.worldEnableable}
      <button
        type="button"
        class={`manager-tools-enabled-toggle ${entry.worldEnabled === false ? '' : 'is-on'}`}
        data-world-tool-row-enabled={entry.id}
        aria-pressed={entry.worldEnabled !== false}
        aria-label={format(
          entry.worldEnabled === false
            ? 'FABRICATE.Admin.Manager.Tools.WorldEnableAria'
            : 'FABRICATE.Admin.Manager.Tools.WorldDisableAria',
          entry.worldEnabled === false
            ? 'Enable {name} for every crafting system'
            : 'Disable {name} for every crafting system',
          { name: entry.entity?.name || entry.id }
        )}
        onclick={() => actions?.setWorldEnabled?.(entry.id, entry.worldEnabled === false)}
      >
        <span aria-hidden="true"><span></span></span>
      </button>
    {/if}
  </span>
{/snippet}

<style>
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. `styles/fabricate.css` is closed to this lane, so every rule this page
     needs is authored here - which is also the right home, because nothing else renders this
     markup. `.manager-main`, `.manager-inspector-card` and `.manager-muted` are shipped and
     reused rather than restated. */

  /* THE TEMPLATE THIS PAGE ACTUALLY NEEDS. See the header: the world-scope override at
     `styles/fabricate.css:9592` gives this view ONE `minmax(0, 1fr)` track, so the card and the
     list cannot both be placed by spanning. The element selector carries this past the shipped
     rule on specificity rather than on injection order. */
  main.manager-main[data-scoped-page='world-tools'] {
    grid-template-rows: auto minmax(0, 1fr);
  }

  /* Two page-level statements on ONE row, so the creation surface costs the list column no
     height at all; see the band's own note. It WRAPS under a narrow pane rather than crushing
     either half, and the zone takes the smaller basis because the card carries three lines. */
  .manager-world-tool-scope-band {
    display: flex;
    flex-wrap: wrap;
    grid-row: 1;
    align-items: stretch;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-world-tool-scope-band > :global(.manager-item-drop-zone) {
    flex: 1 1 18rem;
    width: auto;
    min-width: 0;
  }

  .manager-world-tool-break-card {
    display: flex;
    flex: 2 1 26rem;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
  }

  .manager-world-tool-catalogue-body {
    display: grid;
    grid-row: 2 / -1;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  .manager-world-tool-break-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-world-tool-break-head i {
    color: var(--fab-accent);
    font-size: 0.7rem;
  }

  .manager-world-tool-break-title {
    color: var(--fab-text);
    font-size: 0.75rem;
    font-weight: 600;
    overflow-wrap: break-word;
  }

  /* PUSHED to the trailing edge rather than absolutely positioned, so a long localized count
     wraps under the title instead of overlapping it. */
  .manager-world-tool-break-count {
    margin-left: auto;
    color: var(--fab-text-muted);
    font-size: 0.6rem;
    font-weight: 600;
    text-align: right;
  }

  /* The shipped segmented-control treatment, matched to `.manager-tools-authority-segments`
     so a GM sees one break-mode control across the two scopes. */
  /* WRAPS rather than shrinking, as a floor under a narrow card — but this is NOT what the
     capture gate was reporting. An earlier note here read the failure as segments shrinking
     below their content width. Measured, the card was 18px tall and the segment sat 36px
     BELOW its bottom edge, on a 1026px-wide card carrying two short labels: the overflow was
     vertical, from the 0px grid row the header now explains, and wrapping alone left the case
     failing with the identical message. The world control has TWO segments, never three —
     `worldToolStudio.js` states why — so `Inherit · …` is not among its labels.

     The labels keep `flex: 1 1 0` and `min-width: 0` so the two segments stay equal width,
     which is the parity with `.manager-tools-authority-segments` the note above commits to. */
  /* ── NO FILL, AND THAT IS MEASURED ──────────────────────────────────────────────────────
     The design's whole content area is one flat surface, and a region reads as a region
     because of its 1px border rather than because it is tinted. Sampled pixel by pixel out
     of the design's own catalogue frame, its segmented track paints the PANE colour inside a
     card one rung lighter, with a plain border doing the separation.

     `--fab-overlay-dark-08` was painting a surface the design does not have, and painting it
     faintly: sampled against our own frame it moved the track about eight units away from
     its card, where the design has a full ramp rung. So the fill goes and the border stays.

     That border names `--fab-border` directly, since the legacy alias it used to be written
     with was collapsed into that token (issue 1399). */
  .manager-world-tool-break-segments {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    gap: var(--fab-space-2xs);
    padding: 3px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    min-width: 0;
  }

  .manager-world-tool-break-segments label {
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 6px var(--fab-space-2);
    border-radius: 7px;
    cursor: pointer;
  }

  .manager-world-tool-break-segments label.is-selected {
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }

  .manager-world-tool-break-segments input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .manager-world-tool-break-option {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .manager-world-tool-break-note {
    margin: 0;
    font-size: 0.62rem;
  }

  .manager-world-tool-row-badges {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* A muted count rather than a chip: the two chips beside it name what the Tool does, and a
     third pill would read as a third property of the Tool instead of its reach. */
  .manager-world-tool-row-reach {
    color: var(--fab-text-muted);
    font-size: 0.6rem;
    font-weight: 600;
    white-space: nowrap;
  }
</style>
