<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import {
    toolBreakageSummary,
    toolDisplayImage,
    toolDisplayName,
    toolOnBreakSummary,
    toolSourceUuid,
  } from './toolStudio.js';

  let { tool = null, authority = 'toolSpecific', managedItems = [], activeTab = 'overview' } = $props();
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
  function localizedBreakage(currentTool, currentAuthority) {
    const summary = toolBreakageSummary(currentTool, currentAuthority);
    if (summary === 'immune') {
      return text('FABRICATE.Admin.Manager.Tools.BreakageSummaryImmune', 'Never breaks');
    }
    if (summary === 'breakable') {
      return text('FABRICATE.Admin.Manager.Tools.BreakageSummaryBreakable', 'Breakable');
    }
    if (summary === 'breakageChance') {
      return formattedText(
        'FABRICATE.Admin.Manager.Tools.BreakageSummaryChance',
        { percent: currentTool?.breakage?.breakageChance ?? 0 },
        '{percent}% break chance'
      );
    }
    if (summary === 'diceExpression') {
      return formattedText(
        'FABRICATE.Admin.Manager.Tools.BreakageSummaryDice',
        { threshold: currentTool?.breakage?.threshold ?? '' },
        'Dice < {threshold}'
      );
    }
    if (currentTool?.breakage?.maxUses == null) {
      return text('FABRICATE.Admin.Manager.Tools.BreakageSummaryUnlimited', 'Unlimited uses');
    }
    return formattedText(
      'FABRICATE.Admin.Manager.Tools.BreakageSummaryLimited',
      { count: currentTool.breakage.maxUses },
      '{count} uses'
    );
  }
  function localizedOnBreak(currentTool, isImmune) {
    if (isImmune) {
      return text(
        'FABRICATE.Admin.Manager.Tools.Editor.OnBreakNotApplicable',
        'Not applicable while this Tool cannot break'
      );
    }
    const summary = toolOnBreakSummary(currentTool);
    const labels = {
      destroy: ['OnBreakDestroy', 'Destroy the item'],
      flagBroken: ['OnBreakFlag', 'Mark as broken'],
      replaceWith: ['OnBreakReplace', 'Replace with item'],
    };
    const [key, fallback] = labels[summary] || labels.destroy;
    return text(`FABRICATE.Admin.Manager.Tools.${key}`, fallback);
  }
  const name = $derived(toolDisplayName(tool, managedItems, text('FABRICATE.Admin.Manager.Tools.Untitled', 'Untitled Tool')));
  const image = $derived(toolDisplayImage(tool, managedItems));
  const sourceContext = $derived(
    toolSourceUuid(tool) || tool?.componentId
      ? text('FABRICATE.Admin.Manager.Tools.Editor.HeaderLinked', 'Linked game-world Item')
      : text('FABRICATE.Admin.Manager.Tools.Editor.HeaderUnlinked', 'Unlinked Tool')
  );
  const immune = $derived(authority === 'checkDriven' && tool?.checkBreakable === false);
  const breakageLabel = $derived(localizedBreakage(tool, authority));
  const onBreakLabel = $derived(localizedOnBreak(tool, immune));
  const prerequisiteLabel = $derived(
    tool?.prerequisites?.enabled
      ? formattedText(
          tool.prerequisites.ids?.length === 1
            ? 'FABRICATE.Admin.Manager.Tools.Editor.PrerequisiteOne'
            : 'FABRICATE.Admin.Manager.Tools.Editor.PrerequisiteCount',
          { count: tool.prerequisites.ids?.length || 0 },
          tool.prerequisites.ids?.length === 1 ? '1 prerequisite' : '{count} prerequisites'
        )
      : text('FABRICATE.Admin.Manager.StatusOff', 'Off')
  );
  const bonusValue = $derived(
    tool?.bonus?.enabled
      ? tool.bonus.expression ||
          text('FABRICATE.Admin.Manager.Tools.Editor.StatusIncomplete', 'Incomplete')
      : text('FABRICATE.Admin.Manager.StatusOff', 'Off')
  );
  const bonusLabel = $derived(
    tool?.bonus?.enabled
      ? formattedText(
          'FABRICATE.Admin.Manager.Tools.Editor.PreviewBonusValue',
          { expression: bonusValue },
          'Adds {expression}'
        )
      : text('FABRICATE.Admin.Manager.StatusOff', 'Off')
  );
  const rules = $derived([
    {
      id: 'breakage',
      icon: authority === 'checkDriven' ? 'fas fa-dice-d20' : 'fas fa-hourglass-half',
      title: breakageLabel,
      subtitle: authority === 'checkDriven'
        ? text('FABRICATE.Admin.Manager.Tools.Editor.PreviewCheckDriven', 'Check-driven · follows the crafting roll')
        : text('FABRICATE.Admin.Manager.Tools.Editor.PreviewToolSpecific', 'Tool-specific · tracked per copy'),
    },
    {
      id: 'on-break',
      icon: immune ? 'fas fa-shield' : 'fas fa-heart-crack',
      title: formattedText(
        'FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreakValue',
        { action: onBreakLabel.toLocaleLowerCase() },
        'On break: {action}'
      ),
      subtitle: immune
        ? text('FABRICATE.Admin.Manager.Tools.Editor.PreviewInactive', 'Inactive while this Tool is immune')
        : text('FABRICATE.Admin.Manager.Tools.Editor.PreviewOnBreak', 'Runs immediately after breakage'),
    },
    {
      id: 'prerequisites',
      icon: 'fas fa-user-shield',
      title: prerequisiteLabel,
      subtitle: tool?.prerequisites?.enabled
        ? text('FABRICATE.Admin.Manager.Tools.Editor.PreviewPrerequisites', 'A character must satisfy every selected prerequisite')
        : text('FABRICATE.Admin.Manager.Tools.Editor.PreviewNoPrerequisites', 'Any character may use it'),
    },
    {
      id: 'bonus',
      icon: 'fas fa-plus-minus',
      title: bonusLabel,
      subtitle: tool?.bonus?.enabled
        ? text('FABRICATE.Admin.Manager.Tools.Editor.PreviewBonus', 'Added to the crafting check')
        : text('FABRICATE.Admin.Manager.Tools.Editor.PreviewNoBonus', 'Adds nothing to the crafting check'),
    },
  ]);
</script>

<aside class="manager-tool-preview" data-tool-behavior-preview aria-label={text('FABRICATE.Admin.Manager.Tools.Preview', 'Live behavior preview')}>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.PreviewKicker', 'How it behaves')}</p>
  <div class="manager-tool-preview-identity" data-tool-preview-identity>
    <img src={image} alt="" />
    <div>
      <h3 title={name}>{name}</h3>
      <p>{sourceContext}</p>
    </div>
    <span class={`manager-chip ${tool?.enabled === false ? 'is-neutral' : 'is-positive'}`}>
      <i class={tool?.enabled === false ? 'fas fa-circle-pause' : 'fas fa-circle-check'} aria-hidden="true"></i>
      {tool?.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
    </span>
    <div class="manager-tool-preview-chips">
      <span class="manager-chip is-neutral"><i class="fas fa-heart-crack" aria-hidden="true"></i>{breakageLabel}</span>
      <span class="manager-chip is-neutral"><i class="fas fa-plus-minus" aria-hidden="true"></i>{bonusValue}</span>
    </div>
  </div>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.EffectiveRules', 'Effective rules')}</p>
  <ul class="manager-tool-preview-rules">
    {#each rules as rule (rule.id)}
      <li data-tool-preview-rule={rule.id}>
        <i class={rule.icon} aria-hidden="true"></i>
        <div>
          <strong
            data-tool-preview-breakage={rule.id === 'breakage' ? '' : undefined}
            data-tool-preview-on-break={rule.id === 'on-break' ? '' : undefined}
            data-tool-preview-prerequisites={rule.id === 'prerequisites' ? '' : undefined}
            data-tool-preview-bonus={rule.id === 'bonus' ? '' : undefined}
          >{rule.title}</strong>
          <small>{rule.subtitle}</small>
        </div>
      </li>
    {/each}
  </ul>
  {#if activeTab === 'validation'}
    <aside class="manager-tool-preview-live" data-tool-preview-live-update><i class="fas fa-circle-check" aria-hidden="true"></i><span>{text('FABRICATE.Admin.Manager.Tools.Editor.LiveUpdate', 'This preview updates live as you change the controls on the left.')}</span></aside>
  {/if}
</aside>
