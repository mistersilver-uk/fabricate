<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import {
    projectToolRow,
    toolBreakageSummary,
    toolOnBreakSummary,
  } from './toolStudio.js';

  let {
    tool = null,
    managedItems = [],
    authority = 'toolSpecific',
    onEdit = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const row = $derived(tool ? projectToolRow(tool, managedItems, authority) : null);

  function breakageLabel() {
    const key = toolBreakageSummary(tool, authority);
    return {
      immune: text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune'),
      breakable: text('FABRICATE.Admin.Manager.Tools.SummaryBreakable', 'Breakable'),
      breakageChance: text('FABRICATE.Admin.Manager.Tools.SummaryChance', 'Break chance'),
      diceExpression: text('FABRICATE.Admin.Manager.Tools.SummaryDice', 'Dice expression'),
      limitedUses: text('FABRICATE.Admin.Manager.Tools.SummaryUses', 'Limited uses'),
    }[key];
  }

  function onBreakLabel() {
    const key = toolOnBreakSummary(tool);
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.OnBreakDestroy', 'Destroy item'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.OnBreakFlag', 'Mark as broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.OnBreakReplace', 'Replace with item'),
    }[key];
  }
</script>

{#if row}
  <section class="manager-inspector-card manager-tool-browser-inspector" data-tool-browser-inspector>
    <div class="manager-tool-inspector-hero">
      <img src={row.img} alt="" />
      <div>
        <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.SelectedKicker', 'Selected Tool')}</p>
        <h2>{row.name}</h2>
        <span class={`manager-chip ${row.enabled ? 'is-positive' : 'is-neutral'}`}>
          {row.enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}
        </span>
      </div>
    </div>
    <p class="manager-muted">{row.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</p>
    <div class="manager-tool-inspector-facts">
      <div><span>{text('FABRICATE.Admin.Manager.Tools.Breakage', 'Breakage')}</span><strong>{breakageLabel()}</strong></div>
      <div><span>{text('FABRICATE.Admin.Manager.Tools.OnBreak', 'On break')}</span><strong>{onBreakLabel()}</strong></div>
    </div>
    <ul class="manager-tool-inspector-mini-list">
      <li>
        <i class="fas fa-list-check" aria-hidden="true"></i>
        <span>{tool?.prerequisites?.enabled
          ? text('FABRICATE.Admin.Manager.Tools.PrerequisitesOn', 'Prerequisites on')
          : text('FABRICATE.Admin.Manager.Tools.PrerequisitesOff', 'Prerequisites off')}</span>
      </li>
      <li>
        <i class="fas fa-plus-minus" aria-hidden="true"></i>
        <span>{tool?.bonus?.enabled
          ? text('FABRICATE.Admin.Manager.Tools.BonusOn', 'Bonus on')
          : text('FABRICATE.Admin.Manager.Tools.BonusOff', 'Bonus off')}</span>
      </li>
    </ul>
    <button type="button" class="manager-button is-primary" data-tool-inspector-edit onclick={() => onEdit(tool.id)}>
      <i class="fas fa-pen" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Tools.Edit', 'Edit Tool')}</span>
    </button>
  </section>
{:else}
  <section class="manager-inspector-card manager-tool-browser-inspector is-empty" data-tool-browser-inspector-empty>
    <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
    <h3>{text('FABRICATE.Admin.Manager.Tools.SelectTitle', 'Select a Tool')}</h3>
    <p>{text('FABRICATE.Admin.Manager.Tools.SelectHint', 'Choose a Tool to inspect its behavior.')}</p>
  </section>
{/if}
