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
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { evaluatePrerequisites } from '../../../../../systems/characterPrerequisites.js';
  import Chip from '../Chip.svelte';
  import EmptyState from '../EmptyState.svelte';
  import IconFactRow from '../IconFactRow.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
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
  const scopeContext = $derived(
    systemName
      ? formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.HeaderSystemScope',
          { system: systemName },
          'Rules in {system} · identity comes from the world Tool'
        )
      : text(
          'FABRICATE.Admin.Manager.Tools.Editor.HeaderSystemScopeUnnamed',
          'System rules · identity comes from the world Tool'
        )
  );
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
      return formattedText(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewGateCount',
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
</script>

<ScopedEntityPreview
  classPrefix="manager-tool-preview"
  hookAttribute="data-tool-behavior-preview"
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
>
  <p class="manager-kicker">
    {text('FABRICATE.Admin.Manager.Tools.Editor.PlayersKicker', 'How players see it')}
  </p>
  <section class="manager-tool-player-card" data-tool-player-preview>
    <div class="manager-tool-player-tile" class:is-broken={playerPreview.dimmed}>
      <img src={image} alt="" />
      <span class="manager-tool-player-quantity" aria-hidden="true">×1</span>
    </div>
    <div class="manager-tool-player-copy">
      <StatusPill
        tone={playerPreview.pill.tone}
        icon={playerPreview.pill.icon}
        label={playerPreview.pill.label}
      />
      <div class="manager-tool-player-toggle">
        <span>{text('FABRICATE.Admin.Manager.Tools.Editor.ShowAsBroken', 'Show as broken')}</span>
        <label
          class="manager-status-toggle manager-tool-setting-toggle"
          class:is-on={showBroken}
          class:is-off={!showBroken}
        >
          <input
            class="manager-tool-setting-toggle-input"
            type="checkbox"
            data-tool-player-broken
            aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.ShowAsBroken', 'Show as broken')}
            checked={showBroken}
            onchange={(event) => (showBroken = event.currentTarget.checked)}
          />
          <span class="manager-status-toggle-track" aria-hidden="true"
            ><span class="manager-status-toggle-knob"></span></span
          >
        </label>
      </div>
      <p data-tool-player-note>{playerPreview.note}</p>
    </div>
    <p class="manager-tool-player-name" data-tool-player-name>{name}{playerPreview.nameSuffix}</p>
  </section>

  <p class="manager-kicker">
    <i class="fas fa-user" aria-hidden="true"></i>{text(
      'FABRICATE.Admin.Manager.Tools.Editor.PreviewAsKicker',
      'Preview as'
    )}
  </p>
  <section class="manager-tool-actor-preview" data-tool-actor-preview>
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
    <IconFactRow
      icon={usabilityFact.icon}
      title={usabilityFact.title}
      dataAttr="data-tool-preview-usability"
    />
  </section>

  <p class="manager-kicker">
    {text('FABRICATE.Admin.Manager.Tools.Editor.RequiredForKicker', 'Required for')}
  </p>
  <section class="manager-tool-required-for" data-tool-required-for>
    {#if requiredFor.length === 0}
      <EmptyState
        compact
        inline
        hint={systemName
          ? formattedText(
              'FABRICATE.Admin.Manager.Tools.Editor.RequiredForEmpty',
              { system: systemName },
              'Nothing in {system} requires it yet.'
            )
          : text(
              'FABRICATE.Admin.Manager.Tools.Editor.RequiredForEmptyUnnamed',
              'Nothing in this system requires it yet.'
            )}
        dataAttr="data-tool-required-for-empty"
      />
    {:else}
      {#each requiredFor as entry (`${entry.kind}:${entry.id}`)}
        <div class="manager-tool-required-row" data-tool-required-row={entry.id}>
          <i class={kindOf(entry).icon} aria-hidden="true"></i>
          <strong title={entry.name}>{entry.name}</strong>
          <Chip tone="neutral">{text(kindOf(entry).key, kindOf(entry).label)}</Chip>
        </div>
      {/each}
    {/if}
  </section>
</ScopedEntityPreview>
