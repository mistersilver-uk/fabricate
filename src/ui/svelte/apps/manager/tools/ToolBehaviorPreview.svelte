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

  let { tool = null, authority = 'toolSpecific', managedItems = [] } = $props();
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
      '{count} max uses'
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
      destroy: ['OnBreakDestroy', 'Destroy item'],
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
          'FABRICATE.Admin.Manager.Tools.Editor.PrerequisiteCount',
          { count: tool.prerequisites.ids?.length || 0 },
          '{count} required'
        )
      : text('FABRICATE.Admin.Manager.StatusOff', 'Off')
  );
  const bonusLabel = $derived(
    tool?.bonus?.enabled
      ? tool.bonus.expression ||
          text('FABRICATE.Admin.Manager.Tools.Editor.StatusIncomplete', 'Incomplete')
      : text('FABRICATE.Admin.Manager.StatusOff', 'Off')
  );
</script>

<aside class="manager-tool-preview" data-tool-behavior-preview aria-label={text('FABRICATE.Admin.Manager.Tools.Preview', 'Live behavior preview')}>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Preview', 'Live behavior preview')}</p>
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
  </div>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.EffectiveRules', 'Effective rules')}</p>
  <dl class="manager-tool-preview-rules">
    <div><dt>{text('FABRICATE.Admin.Manager.Tools.Breakage', 'Breakage')}</dt><dd data-tool-preview-breakage>{breakageLabel}</dd></div>
    <div><dt>{text('FABRICATE.Admin.Manager.Tools.OnBreak', 'On break')}</dt><dd data-tool-preview-on-break>{onBreakLabel}</dd></div>
    <div><dt>{text('FABRICATE.Admin.Manager.Tools.Editor.Prerequisites', 'Prerequisites')}</dt><dd data-tool-preview-prerequisites>{prerequisiteLabel}</dd></div>
    <div><dt>{text('FABRICATE.Admin.Manager.Tools.Editor.Bonus', 'Bonus')}</dt><dd data-tool-preview-bonus>{bonusLabel}</dd></div>
  </dl>
</aside>
