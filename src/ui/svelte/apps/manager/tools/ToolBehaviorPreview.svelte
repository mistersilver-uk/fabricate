<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { toolBreakageSummary, toolDisplayName, toolOnBreakSummary } from './toolStudio.js';

  let { tool = null, authority = 'toolSpecific', managedItems = [] } = $props();
  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }
  const name = $derived(toolDisplayName(tool, managedItems, text('FABRICATE.Admin.Manager.Tools.Untitled', 'Untitled Tool')));
  const immune = $derived(authority === 'checkDriven' && tool?.checkBreakable === false);
</script>

<aside class="manager-tool-preview" data-tool-behavior-preview aria-label={text('FABRICATE.Admin.Manager.Tools.Preview', 'Live behavior preview')}>
  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.EffectiveRules', 'Effective rules')}</p>
  <h3>{name}</h3>
  <span class={`manager-chip ${tool?.enabled === false ? 'is-neutral' : 'is-positive'}`}>
    <i class={tool?.enabled === false ? 'fas fa-circle-pause' : 'fas fa-circle-check'} aria-hidden="true"></i>
    {tool?.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
  </span>
  <dl class="manager-tool-preview-rules">
    <div><dt>{text('FABRICATE.Admin.Manager.Tools.Breakage', 'Breakage')}</dt><dd data-tool-preview-breakage>{immune ? 'Immune' : toolBreakageSummary(tool, authority)}</dd></div>
    <div><dt>{text('FABRICATE.Admin.Manager.Tools.OnBreak', 'On break')}</dt><dd data-tool-preview-on-break>{immune ? 'Disabled' : toolOnBreakSummary(tool)}</dd></div>
    <div><dt>{text('FABRICATE.Admin.Manager.Tools.Editor.Prerequisites', 'Prerequisites')}</dt><dd>{tool?.prerequisites?.enabled ? `${tool.prerequisites.ids?.length || 0} required` : 'Off'}</dd></div>
    <div><dt>{text('FABRICATE.Admin.Manager.Tools.Editor.Bonus', 'Bonus')}</dt><dd>{tool?.bonus?.enabled ? tool.bonus.expression || 'Incomplete' : 'Off'}</dd></div>
  </dl>
</aside>
