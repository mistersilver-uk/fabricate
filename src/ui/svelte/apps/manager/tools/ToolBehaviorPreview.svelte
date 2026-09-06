<!-- Svelte 5 runes mode -->
<!--
  The Tool rules editor's RAIL. A caller of the shared `ScopedEntityPreview` shell (issue 1362)
  for its first two regions, plus three of its own through that shell's trailing snippet.

  == WHAT THE DESIGN PUTS HERE, AND WHAT SHIPPED (issue 1373) ==================================
  The design's rail is five regions: `HOW IT BEHAVES`, `EFFECTIVE RULES`, `HOW PLAYERS SEE IT`,
  `PREVIEW AS` and `REQUIRED FOR`. Three of those five were missing entirely, and the space they
  occupy was taken by a standing `HOW TOOLS WORK IN FABRICATE` explainer the design does not
  have — six paragraphs of documentation where the design shows the Tool.

  The three are here now, and the explainer is gone. The docs link it carried is not lost: the
  Tool page it pointed at is one click from the manual, and a permanent six-row essay is not what
  a GM editing one Tool's rules needs the widest column on the screen for.

  == THE IDENTITY CARD IS A THUMBNAIL, A NAME AND A SCOPE SENTENCE =============================
  It used to carry an On/Off pill and two chips as well, and the two chips restated the FIRST and
  FOURTH `EFFECTIVE RULES` rows immediately below them — the same breakage answer and the same
  bonus answer, twice, one line apart. The design draws none of the three. `statusChip` and
  `chips` are therefore not passed; the shell renders neither, and the enable state is stated
  once, by the control that changes it, on `Breakage`.

  == THE SCOPE SENTENCE IS THE HEADER'S ======================================================
  `Rules in <System> · identity comes from the world Tool` — the sentence that tells a GM what
  this screen may and may not change. It read `Linked game-world Item`, which is the WORLD
  editor's subtitle and describes the one thing this screen cannot touch.

  == IT IS NOW BOTH SCOPES' RAIL, AND THE DIFFERENCES ARE PROPS ===============================
  The world Tool entry drew a SECOND rail — a fork of this one that re-implemented the player
  tile, the broken-copy toggle, the prerequisite-gate line and the `Required for` rows, and lost
  every one of the four treatments in the copying. It composes this component instead (issue
  1373, maintainer parity round on `TOOL-PARITY-WORLD.md`).

  NOTHING HERE BRANCHES ON SCOPE. The three things world scope genuinely says differently arrive
  as OPT-IN props that default to exactly what the system editor already rendered:

   - `contextText` replaces the identity block's derived scope sentence. World scope's rail
     restates what the RECORD is (`Linked game-world Item`), because there is no system to name;
   - `requiredForEmptyText` replaces the derived empty hint for the same reason — `Nothing in
     {system} requires it yet` has no system to interpolate at world scope;
   - `requiredForPageSize` turns the `Required for` list into a PAGED window. World scope lists
     every recipe and gathering task in every system, which for a Tool a world really uses is
     dozens of rows in a 300px column; the design's rail overflow idiom is a pager, and the
     shipped `Pagination` in its inspector face is that pager. `0` — the default — renders the
     whole list exactly as the system editor does.

  `classPrefix` is the fourth, and it was found by LOOKING at the frame rather than at the markup:
  `manager-tool-preview` carries the STUDIO's grid placement (`grid-column: 3; grid-row: 2 / 4`)
  and its filled panel surface, so the world entry's two-track column put the rail in an implicit
  third column off the side of its own layout. See the prop's own note.

  `hookAttribute` is a prop for the reason `EditorTabs` carries its own: the two screens' rails
  are addressed by their own `data-*` names in the tests and in the View Lab case registry, and a
  shared component must not rename a caller's selector.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { evaluatePrerequisites } from '../../../../../systems/characterPrerequisites.js';
  import Chip from '../Chip.svelte';
  import EmptyState from '../EmptyState.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import Pagination from '../../../components/Pagination.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import ScopedEntityPreview from '../scoped/ScopedEntityPreview.svelte';
  import {
    projectToolBehaviorFacts,
    projectToolPlayerPreview,
    toolDisplayImage,
    toolDisplayName,
  } from './toolStudio.js';

  // Per-fact hooks the Tool Studio suite reads to assert ONE named rule's rendered value.
  // They belong on the row's <strong>, so they are handed to the shared row rather than
  // written into its markup, which every other consumer would then inherit as dead
  // attributes.
  const RULE_TITLE_HOOKS = {
    breakage: 'data-tool-preview-breakage',
    'on-break': 'data-tool-preview-on-break',
    prerequisites: 'data-tool-preview-prerequisites',
    bonus: 'data-tool-preview-bonus',
  };

  let {
    tool = null,
    authority = 'toolSpecific',
    managedItems = [],
    systemName = '',
    // The character roster the `PREVIEW AS` selector offers, and the resolver behind it. The
    // roster is `{uuid, name}` records the store already projects; the resolver answers ONE
    // actor's prepared roll data and is the only thing here that touches a Foundry document, so
    // it arrives as an injected function rather than an import.
    actorOptions = [],
    prerequisiteOptions = [],
    getActorRollData = async () => null,
    // What in THIS crafting system requires the Tool: recipes and gathering tasks, each with the
    // kind chip its row carries. Projected by the store, never counted here — this component has
    // no recipe corpus and no gathering config.
    requiredFor = [],
    // ── THE THREE OPT-IN SCOPE DIFFERENCES, AND THE HOOK NAME ─────────────────────────────
    // See the file header. Every default below is what the system Tool rules editor already
    // rendered, so a caller that passes none of them is unchanged.
    hookAttribute = 'data-tool-behavior-preview',
    // THE CLASS STEM, WHICH IS ALSO THE GRID PLACEMENT. `manager-tool-preview` — the default,
    // and the system Tool Studio's — carries `grid-column: 3; grid-row: 2 / 4`, a filled
    // `--fab-bg-2` surface and a left divider, because that is where and what the STUDIO's own
    // three-column grid needs its rail to be. Handing the same stem to the world entry, whose
    // column is a two-track `1fr 300px` grid, placed the rail in an implicit THIRD column off
    // the side of its own layout, and painted a panel the design does not draw there.
    //
    // The stem is already `ScopedEntityPreview`'s prop for exactly this reason; passing it on is
    // what lets one rail render in two layouts. Only the shell's five region classes follow it —
    // the three trailing regions keep their own `manager-tool-player-*`, `manager-tool-actor-*`
    // and `manager-tool-required-*` names in both, which is what makes their treatments shared.
    classPrefix = 'manager-tool-preview',
    contextText = '',
    requiredForEmptyText = '',
    requiredForPageSize = 0,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  function formattedText(key, data, fallback) {
    const template = localize(key);
    if (template && template !== key) return localize(key, data);
    return Object.entries(data).reduce(
      (copy, [name, value]) => copy.replace(`{${name}}`, String(value)),
      fallback
    );
  }

  const name = $derived(
    toolDisplayName(
      tool,
      managedItems,
      text('FABRICATE.Admin.Manager.Tools.Untitled', 'Untitled Tool')
    )
  );
  const image = $derived(toolDisplayImage(tool, managedItems));
  const scopeContext = $derived.by(() => {
    if (contextText) return contextText;
    return systemName
      ? formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.HeaderSystemScope',
          { system: systemName },
          'Rules in {system} · identity comes from the world Tool'
        )
      : text(
          'FABRICATE.Admin.Manager.Tools.Editor.HeaderSystemScopeUnnamed',
          'System rules · identity comes from the world Tool'
        );
  });
  const rules = $derived(projectToolBehaviorFacts(tool, authority, text, formattedText));
  // The per-fact title hook is attached HERE rather than inside the shared shell, so no other
  // consumer of that shell inherits four dead attributes.
  const previewRules = $derived(
    rules.map((rule) => ({ ...rule, titleAttr: RULE_TITLE_HOOKS[rule.id] || '' }))
  );

  // ── HOW PLAYERS SEE IT ────────────────────────────────────────────────────────────────────
  // `showBroken` is a PREVIEW state and nothing writes it. It is the one thing the effective
  // rules state in the abstract and never show: what the on-break action does to a copy in a
  // character's inventory.
  let showBroken = $state(false);
  const playerPreview = $derived(
    projectToolPlayerPreview(tool, authority, showBroken, managedItems, text, formattedText)
  );

  // ── PREVIEW AS ────────────────────────────────────────────────────────────────────────────
  let previewActorUuid = $state('');
  let previewRollData = $state(null);

  async function choosePreviewActor(uuid) {
    previewActorUuid = uuid;
    previewRollData = uuid ? ((await getActorRollData(uuid)) ?? null) : null;
  }

  const previewActorName = $derived(
    actorOptions.find((actor) => actor.uuid === previewActorUuid)?.name || ''
  );
  const selectedPrerequisites = $derived(
    tool?.prerequisites?.enabled
      ? prerequisiteOptions.filter((option) =>
          (tool?.prerequisites?.ids || []).includes(option?.id)
        )
      : []
  );
  // A PREVIEW MUST NOT LOG. `evaluatePrerequisite` warns on every roll-data path an actor does
  // not resolve, which is the normal case for a GM previewing a Tool against a token that has
  // never held it; the sink is silenced rather than left on `console.warn`.
  const previewOutcome = $derived(
    previewRollData
      ? evaluatePrerequisites(previewRollData, selectedPrerequisites, { warn: () => {} })
      : null
  );
  const previewBlocked = $derived(
    previewOutcome?.passed === false && tool?.prerequisites?.gateMode !== 'bonus'
  );
  const previewWithholdsBonus = $derived(
    previewOutcome?.passed === false && tool?.prerequisites?.gateMode === 'bonus'
  );
  const bonusExpression = $derived(String(tool?.bonus?.expression || '').trim());

  const prerequisiteNote = $derived.by(() => {
    if (selectedPrerequisites.length === 0) {
      return text(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewNoGate',
        'No prerequisites — any character may wield it.'
      );
    }
    if (!previewOutcome) {
      // THE KEY IS SELECTED, NOT JUST THE FALLBACK (issue 1373, round 6). This branched only its
      // fallback and passed the PLURAL key either way, so `lang/en.json`'s
      // `PreviewGateCountOne` - which has been there all along - was unreachable and one chosen
      // prerequisite read `1 prerequisites must be met.` in every world with a locale loaded.
      // The singular was correct only where no translation was, which is exactly the mounted
      // harness, and is why the frame found this before any test did.
      return formattedText(
        selectedPrerequisites.length === 1
          ? 'FABRICATE.Admin.Manager.Tools.Editor.PreviewGateCountOne'
          : 'FABRICATE.Admin.Manager.Tools.Editor.PreviewGateCount',
        { count: selectedPrerequisites.length },
        selectedPrerequisites.length === 1
          ? 'One prerequisite must be met.'
          : '{count} prerequisites must be met.'
      );
    }
    if (previewOutcome.passed) {
      return formattedText(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewGatePassed',
        { actor: previewActorName },
        '{actor} meets every prerequisite.'
      );
    }
    return formattedText(
      'FABRICATE.Admin.Manager.Tools.Editor.PreviewGateFailed',
      {
        actor: previewActorName,
        failures: previewOutcome.failures.map((failure) => failure.name).join(', '),
      },
      '{actor} does not meet: {failures}'
    );
  });

  const usabilityFact = $derived.by(() => {
    if (previewBlocked) {
      return {
        icon: 'fas fa-ban',
        title: text('FABRICATE.Admin.Manager.Tools.Editor.PreviewUnusable', 'Unusable here'),
      };
    }
    if (previewWithholdsBonus) {
      return {
        icon: 'fas fa-plus-minus',
        title: text(
          'FABRICATE.Admin.Manager.Tools.Editor.PreviewBonusWithheld',
          'Usable, but its check bonus is withheld'
        ),
      };
    }
    if (tool?.bonus?.enabled && bonusExpression) {
      return {
        icon: 'fas fa-circle-info',
        title: formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.PreviewUsableWithBonus',
          { expression: bonusExpression },
          'Usable, adding {expression}'
        ),
      };
    }
    return {
      icon: 'fas fa-circle-info',
      title: text(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewUsableNoBonus',
        'Usable, with no check bonus'
      ),
    };
  });

  // The kind chip a `Required for` row carries. Its own keys rather than the rail's nav labels:
  // a row names ONE recipe or ONE gathering task, so the chip is singular, and the nav's plural
  // section names would read as a count.
  const REQUIRED_FOR_KIND = {
    recipe: {
      icon: 'fas fa-scroll',
      key: 'FABRICATE.Admin.Manager.Tools.Editor.RequiredForRecipe',
      label: 'Recipe',
    },
    gathering: {
      icon: 'fas fa-seedling',
      key: 'FABRICATE.Admin.Manager.Tools.Editor.RequiredForGathering',
      label: 'Gathering',
    },
  };
  function kindOf(entry) {
    return REQUIRED_FOR_KIND[entry?.kind] || REQUIRED_FOR_KIND.recipe;
  }

  // ── THE `REQUIRED FOR` WINDOW ─────────────────────────────────────────────────────────────
  // A PAGER RATHER THAN A TRAILING SENTENCE. The world rail used to cap the list at five rows
  // and print `and 5 more` under it — a dead sentence that states there is more and offers no
  // way to reach it. The design's rail overflow idiom is a pager, and `Pagination` in its
  // inspector face (`showPageSize={false}`, `multiPageOnly`) is the one already drawn in the
  // catalogue's system roster one route away.
  //
  // The index is CLAMPED rather than reset by an effect: the list shrinks whenever a recipe
  // stops naming the Tool, and an out-of-range page would render an empty window under a
  // summary claiming rows.
  let requiredForPage = $state(0);
  const requiredForPaged = $derived(requiredForPageSize > 0);
  const requiredForPageCount = $derived(
    requiredForPaged ? Math.max(1, Math.ceil(requiredFor.length / requiredForPageSize)) : 1
  );
  const requiredForIndex = $derived(Math.min(requiredForPage, requiredForPageCount - 1));
  const requiredForShown = $derived(
    requiredForPaged
      ? requiredFor.slice(
          requiredForIndex * requiredForPageSize,
          (requiredForIndex + 1) * requiredForPageSize
        )
      : requiredFor
  );
  const requiredForEmptyHint = $derived.by(() => {
    if (requiredForEmptyText) return requiredForEmptyText;
    return systemName
      ? formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.RequiredForEmpty',
          { system: systemName },
          'Nothing in {system} requires it yet.'
        )
      : text(
          'FABRICATE.Admin.Manager.Tools.Editor.RequiredForEmptyUnnamed',
          'Nothing in this system requires it yet.'
        );
  });
</script>

<ScopedEntityPreview
  {classPrefix}
  {hookAttribute}
  ariaLabel={text('FABRICATE.Admin.Manager.Tools.Preview', 'Live behavior preview')}
  kicker={text('FABRICATE.Admin.Manager.Tools.Editor.PreviewKicker', 'How it behaves')}
  identity={{
    name,
    image,
    context: scopeContext,
    hookAttribute: 'data-tool-preview-identity',
  }}
  rulesKicker={text('FABRICATE.Admin.Manager.Tools.Editor.EffectiveRules', 'Effective rules')}
  rules={previewRules}
  ruleHookAttribute="data-tool-preview-rule"
  ruleTile
>
  <p class="manager-kicker">
    {text('FABRICATE.Admin.Manager.Tools.Editor.PlayersKicker', 'How players see it')}
  </p>
  <section class="manager-tool-player-card" data-tool-player-preview>
    <!--
      THE TILE SHOWS THE CONSEQUENCE (issue 1373, maintainer round 2). `projectToolPlayerPreview`
      answers WHICH picture an on-break action leaves in an inventory, and the three answers are
      genuinely different pictures rather than three captions on one:

       - `none` renders an EMPTY slot, because destroy-on-break leaves one. The `<img>` is not
         rendered at all rather than pointed at a transparent asset: an `<img>` with no usable
         source is a broken-image glyph in Foundry, which reads as a fault rather than as an
         absence, and there is no "nothing" image to invent (never invent a Foundry asset path).
       - `replacement` renders the chosen Component's art, which is what the copy BECOMES.
       - `tool` is the working copy and the marked-broken copy, unchanged.

      `data-tool-player-image` is the hook a case and the mounted suite read to tell the three
      apart, since an empty box and a missing region look identical to a selector on the tile.
    -->
    <div
      class="manager-tool-player-tile"
      class:is-broken={playerPreview.dimmed}
      class:is-empty={playerPreview.imageKind === 'none'}
      data-tool-player-image={playerPreview.imageKind}
    >
      {#if playerPreview.imageKind !== 'none'}
        <img src={playerPreview.image || image} alt="" />
      {/if}
      <span class="manager-tool-player-quantity" aria-hidden="true">×1</span>
    </div>
    <div class="manager-tool-player-copy">
      {#if playerPreview.pill}
        <StatusPill
          tone={playerPreview.pill.tone}
          icon={playerPreview.pill.icon}
          label={playerPreview.pill.label}
        />
      {/if}
      <div class="manager-tool-player-toggle">
        <span>{text('FABRICATE.Admin.Manager.Tools.Editor.ShowAsBroken', 'Show as broken')}</span>
        <!-- The `checkbox` host, which is the one this site hand-rolled: a real
             `<input type="checkbox">` laid over the track, so a pointer hit-test and
             `isChecked()` both land on a control the platform owns. `manager-tool-setting-toggle`
             and the input's own class are HOST STRUCTURE and the primitive emits both, so neither
             is restated here. `data-tool-player-broken` rides the rest spread onto the INPUT,
             which is the element `tool-studio-mounted.test.js` resolves and then sets `checked`
             on; it is spelled `=""` because a bare `data-*` on a COMPONENT tag is the boolean
             `true` rather than the empty string it is on an element. -->
        <StatusToggle
          as="checkbox"
          on={showBroken}
          ariaLabel={text('FABRICATE.Admin.Manager.Tools.Editor.ShowAsBroken', 'Show as broken')}
          data-tool-player-broken=""
          onChange={(checked) => (showBroken = checked)}
        />
      </div>
      <p data-tool-player-note>{playerPreview.note}</p>
    </div>
    <!-- THE CAPTION FOLLOWS THE TILE. In replace mode the picture is the replacement Component's,
         so a caption still reading the Tool's name would name the wrong thing under it. -->
    <p class="manager-tool-player-name" data-tool-player-name>
      {playerPreview.name || name}{playerPreview.nameSuffix}
    </p>
  </section>

  <p class="manager-kicker manager-tool-preview-kicker">
    <i class="fas fa-user" aria-hidden="true"></i>{text(
      'FABRICATE.Admin.Manager.Tools.Editor.PreviewAsKicker',
      'Preview as'
    )}
  </p>
  <section class="fab-stack" data-gap="2" data-tool-actor-preview>
    <select
      class="manager-tool-actor-select"
      data-tool-preview-actor
      aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.PreviewAsLabel', 'Preview as actor')}
      value={previewActorUuid}
      onchange={(event) => choosePreviewActor(event.currentTarget.value)}
    >
      <option value=""
        >{text('FABRICATE.Admin.Manager.Tools.Editor.PreviewNoActor', 'No actor')}</option
      >
      {#each actorOptions as actor (actor.uuid)}
        <option value={actor.uuid}>{actor.name}</option>
      {/each}
    </select>
    <EmptyState
      compact
      inline
      hint={prerequisiteNote}
      contextClass="manager-tool-actor-note"
      dataAttr="data-tool-preview-gate"
    />
    <!-- THE `rule` DENSITY, WHICH ALREADY EXISTED (issue 1373). `proto:3004` draws this well
         through `proto:6205`'s style string - `gap: 11px; padding: 12px 13px; border-radius:
         11px; background: var(--bg1)` over a `600 11.5px var(--sans)` line in `--text` - which
         is the variant `IconFactRow` shipped for the two Tool rails. The default row missed five
         of its six values, and the fill by a RUNG: the design recesses an inset below the aside
         holding it, and the default raises it. The list inspector one screen over already passes
         this, so the two rails stating one fact were drawing it two ways. -->
    <IconFactRow
      icon={usabilityFact.icon}
      title={usabilityFact.title}
      density="rule"
      dataAttr="data-tool-preview-usability"
    />
  </section>

  <p class="manager-kicker">
    {text('FABRICATE.Admin.Manager.Tools.Editor.RequiredForKicker', 'Required for')}
  </p>
  <section class="manager-tool-required-for fab-stack" data-gap="2" data-tool-required-for>
    {#if requiredFor.length === 0}
      <EmptyState
        compact
        inline
        hint={requiredForEmptyHint}
        dataAttr="data-tool-required-for-empty"
      />
    {:else}
      <!-- THE KEY CARRIES THE SYSTEM AND THE POSITION. At system scope a `(kind, id)` pair is
           unique; at WORLD scope the same recipe id can be reached through two crafting systems,
           and a duplicate key is a mount-time throw rather than a rendering fault. -->
      {#each requiredForShown as entry, index (`${entry.kind}:${entry.systemId ?? ''}:${entry.id}:${index}`)}
        <div class="manager-tool-required-row" data-tool-required-row={entry.id}>
          <i class={kindOf(entry).icon} aria-hidden="true"></i>
          <strong title={entry.name}>{entry.name}</strong>
          <Chip tone="neutral">{text(kindOf(entry).key, kindOf(entry).label)}</Chip>
        </div>
      {/each}
      {#if requiredForPaged}
        <!-- NO per-page selector: the rail is 300px wide and the window is fixed, exactly as
             `SystemRulesRoster`'s pager is. `multiPageOnly` keeps the bar off a list that fits. -->
        <Pagination
          multiPageOnly
          showPageSize={false}
          totalCount={requiredFor.length}
          pageIndex={requiredForIndex}
          pageSize={requiredForPageSize}
          onPageChange={(next) => (requiredForPage = next)}
        />
      {/if}
    {/if}
  </section>
</ScopedEntityPreview>

<style>
  /* THE EMPTY INVENTORY SLOT (issue 1373, maintainer round 2).

     Destroy-on-break leaves nothing behind, and the design's own note says the tile is "gone
     from the inventory entirely". A filled box with no art in it reads as a load failure, so the
     empty state takes the DASHED edge every other absence in this manager wears — the same
     treatment `EmptyState`'s ghost panel carries two regions below it — and drops the fill.

     WRITTEN HERE rather than in `styles/fabricate.css` because this template writes the element,
     so the rule carries this component's scoping hash and reaches it. The shipped
     `.manager-tool-player-tile` box (110px, radius, border, fill) is inherited and only the edge
     and the fill are overridden. */
  .manager-tool-player-tile.is-empty {
    border-style: dashed;
    border-color: var(--fab-border-strong);
    background: transparent;
  }

  /* THE GLYPH IS NOT PART OF THE WORD (issue 1373, maintainer round 2, E5). `manager-kicker`
     is a block with no `display: flex`, so an `<i>` immediately followed by the label ran the
     person glyph straight into the `P` of `PREVIEW AS` with no space at all. `proto:2436`
     states `margin-right: 6px` on that exact glyph, and `--fab-space-chip` IS 6px — the
     published dense optical unit for icon-and-label gaps — so this is the design's value
     through a token rather than a literal.

     A MARGIN ON THE GLYPH rather than `display: flex; gap` on the paragraph: the kicker is a
     shipped class used in thirty other places as a block, and turning one instance into a flex
     container changes how its own text wraps as well as where the glyph sits. */
  .manager-tool-preview-kicker > i {
    margin-right: var(--fab-space-chip);
  }

  /* `Pagination` renders its own `<section>`, so the sizing has to be stated from this side of
     the boundary — the same repair, for the same reason, that `SystemRulesRoster` makes for the
     inspector roster's pager. The shipped bar is built for the foot of a full-width list
     (`gap: --fab-space-3`, `padding: --fab-space-2 --fab-space-3`, a 96px minimum on the page
     label, `flex-wrap: wrap`); in a 300px rail that wraps the nav onto a second line below the
     summary, which is a pager that says there is more and hides the control that reaches it.

     `.manager-tool-required-for` IS written by this component, so it carries the scoping hash and
     the descendant is what has to be `:global` — `Pagination`'s markup never sees this file's
     hash. Written as a descendant rather than as a bare `:global`, so the reach is this rail's
     `Required for` region and not every pager in the manager. */
  .manager-tool-required-for > :global(.manager-pagination) {
    flex: 0 0 auto;
    flex-wrap: nowrap;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) 0 0;

    /* MARGIN, NOT PADDING, and the difference is load-bearing. This is the LAST element of the
       last region of a scrolling rail, so at the bottom of the scroll it sits flush against the
       panel edge — measured at a 0.64px overflow of its own container, which the View Lab
       reports as a clipped region and which a reader sees as a control touching the edge.
       Padding grows the element's own box and moves nothing; a margin is outside it. */
    margin-bottom: var(--fab-space-1);
    font-size: 0.62rem;
  }

  .manager-tool-required-for :global(.manager-pagination-page) {
    min-width: 0;
    white-space: nowrap;
  }

  .manager-tool-required-for :global(.manager-pagination-nav .manager-icon-button) {
    flex: 0 0 24px;
    width: 24px;
    height: 24px;
    min-height: 24px;
  }
</style>
