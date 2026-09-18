<!--
  The Tool rules editor's RAIL: a caller of the shared `ScopedEntityPreview` shell for its first two
  regions, plus three of its own through that shell's trailing snippet. THE IDENTITY CARD IS A
  THUMBNAIL, A NAME AND A SCOPE SENTENCE — it carried an On/Off pill and two chips restating the
  first and fourth `EFFECTIVE RULES` rows one line below them, so `statusChip` and `chips` are not
  passed and the enable state is stated once, by the control that changes it.

  IT IS NOW BOTH SCOPES' RAIL, AND THE DIFFERENCES ARE PROPS: the world Tool entry drew a SECOND
  rail that re-implemented the player tile, the broken-copy toggle, the gate line and the
  `Required for` rows, losing every treatment in the copying. NOTHING HERE BRANCHES ON SCOPE —
  `contextText` and `requiredForEmptyText` have no system to name at world scope, and
  `requiredForPageSize` turns `Required for` into a PAGED window for a scope that lists every
  recipe and gathering task in every system. `classPrefix` is the fourth, found by LOOKING at the
  frame rather than the markup, and `hookAttribute` is a prop for the reason `EditorTabs` carries
  its own: a shared component must not rename a caller's selector.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { statusChipTone } from '../../../util/statusChipTone.js';
  import { evaluatePrerequisites } from '../../../../../systems/characterPrerequisites.js';
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import Pagination from '../../../components/Pagination.svelte';
  import StatusToggle from '../../../components/StatusToggle.svelte';
  import ScopedEntityPreview from '../scoped/ScopedEntityPreview.svelte';
  import {
    projectToolBehaviorFacts,
    projectToolPlayerPreview,
    toolDisplayImage,
    toolDisplayName,
  } from './toolStudio.js';

  // Per-fact hooks the Tool Studio suite reads to assert ONE named rule's value. Handed to the
  // shared row rather than written into its markup, which every consumer would inherit dead.
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
    // The `PREVIEW AS` roster and the resolver behind it. The resolver is the only thing here
    // touching a Foundry document, so it arrives injected rather than imported.
    actorOptions = [],
    prerequisiteOptions = [],
    getActorRollData = async () => null,
    // What in THIS system requires the Tool, projected by the store and never counted here: this
    // component has no recipe corpus and no gathering config.
    requiredFor = [],
    // THE THREE OPT-IN SCOPE DIFFERENCES, AND THE HOOK NAME — see the header. Every default is
    // what the system editor already rendered, so a caller passing none is unchanged.
    hookAttribute = 'data-tool-behavior-preview',
    // THE CLASS STEM, WHICH IS ALSO THE GRID PLACEMENT: the default carries the STUDIO's own
    // three-column placement and filled surface, so handing the same stem to the world entry's
    // two-track grid put the rail in an implicit THIRD column off the side of its layout. Only the
    // shell's five region classes follow the stem — the three trailing regions keep their own
    // names in both, which is what makes their treatments shared.
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
  // Attached HERE rather than in the shared shell, so no other consumer inherits dead attributes.
  const previewRules = $derived(
    rules.map((rule) => ({ ...rule, titleAttr: RULE_TITLE_HOOKS[rule.id] || '' }))
  );

  // `showBroken` is a PREVIEW state and nothing writes it: the one thing the effective rules state
  // in the abstract and never show.
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
  // A PREVIEW MUST NOT LOG: `evaluatePrerequisite` warns on every unresolved roll-data path, which
  // is the normal case for a preview against a token that never held the Tool.
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
      // THE KEY IS SELECTED, NOT JUST THE FALLBACK: branching only the fallback passed the PLURAL
      // key either way, so the `…One` sibling was unreachable and one prerequisite read
      // "1 prerequisites" in every world with a locale loaded — correct only in the harness.
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

  // The kind chip a `Required for` row carries, on its own keys rather than the rail's nav labels:
  // a row names ONE record, and the nav's plural section names would read as a count.
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

  // A PAGER RATHER THAN A TRAILING SENTENCE: `and 5 more` states there is more and offers no way
  // to reach it. `Pagination` in its inspector face is the one already drawn in the catalogue's
  // system roster one route away. The index is CLAMPED rather than reset by an effect, because the
  // list shrinks whenever a recipe stops naming the Tool.
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
    <!-- THE TILE SHOWS THE CONSEQUENCE: `projectToolPlayerPreview` answers WHICH picture an
         on-break action leaves, and the three are genuinely different. `none` renders an EMPTY
         slot with no `<img>` rather than a transparent asset, which would be a broken-image glyph
         reading as a fault; `replacement` renders the chosen Component's art; `tool` is unchanged.
         `data-tool-player-image` tells the three apart, since an empty box and a missing region
         look identical to a selector on the tile. -->
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
        <Chip tone={statusChipTone(playerPreview.pill.tone)} icon={playerPreview.pill.icon}
          >{playerPreview.pill.label}</Chip
        >
      {/if}
      <div class="manager-tool-player-toggle">
        <span>{text('FABRICATE.Admin.Manager.Tools.Editor.ShowAsBroken', 'Show as broken')}</span>
        <!-- The `checkbox` host this site hand-rolled: a real `<input type="checkbox">` over the
             track, so a pointer hit-test and `isChecked()` both land on a platform control.
             `manager-tool-setting-toggle` and the input's class are HOST STRUCTURE the primitive
             emits. `data-tool-player-broken` rides the rest spread onto the INPUT, spelled `=""`
             because a bare `data-*` on a COMPONENT tag is the boolean `true`. -->
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
    <!-- THE `rule` DENSITY, WHICH ALREADY EXISTED: the variant `IconFactRow` shipped for the two
         Tool rails. The default row missed five of its six values, and the fill by a RUNG — the
         design recesses an inset below the aside holding it and the default raises it — so the two
         rails stating one fact were drawing it two ways. -->
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
      <!-- THE KEY CARRIES THE SYSTEM AND THE POSITION: at WORLD scope the same recipe id can be
           reached through two systems, and a duplicate key is a mount-time throw. -->
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
  /* THE EMPTY INVENTORY SLOT. A filled box with no art reads as a load failure, so the empty
     state takes the DASHED edge every other absence in this manager wears and drops the fill.
     WRITTEN HERE because this template writes the element, so the rule carries its scoping hash;
     the shipped tile box is inherited and only the edge and the fill are overridden. */
  .manager-tool-player-tile.is-empty {
    border-style: dashed;
    border-color: var(--fab-border-strong);
    background: transparent;
  }

  /* THE GLYPH IS NOT PART OF THE WORD: `manager-kicker` is a block with no `display: flex`, so an
     `<i>` immediately followed by the label ran straight into it. `--fab-space-chip` is the
     published dense optical unit for icon-and-label gaps, so this is the design's value through a
     token. A MARGIN ON THE GLYPH rather than `display: flex; gap` on the paragraph, because the
     kicker is a shipped block class and making one instance a flex container changes its wrap. */
  .manager-tool-preview-kicker > i {
    margin-right: var(--fab-space-chip);
  }

  /* `Pagination` renders its own `<section>`, so the sizing is stated from this side of the
     boundary — the same repair `SystemRulesRoster` makes for the inspector roster's pager. The
     shipped bar is built for the foot of a full-width list, and in a 300px rail it wraps the nav
     onto a second line: a pager that says there is more and hides the control that reaches it.
     The region class carries the scoping hash, so the DESCENDANT is what must be `:global`,
     written that way so the reach is this rail rather than every pager in the manager. */
  .manager-tool-required-for > :global(.manager-pagination) {
    flex: 0 0 auto;
    flex-wrap: nowrap;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) 0 0;

    /* MARGIN, NOT PADDING, and the difference is load-bearing: this is the LAST element of the
       last region of a scrolling rail, measured at a 0.64px overflow of its own container.
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
