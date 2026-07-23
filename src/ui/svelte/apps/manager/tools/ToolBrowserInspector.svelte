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
    prerequisiteOptions = [],
    authority = 'toolSpecific',
    onEdit = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const row = $derived(tool ? projectToolRow(tool, managedItems, authority) : null);

  function breakageValue() {
    const key = toolBreakageSummary(tool, authority);
    if (key === 'immune') return text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune');
    if (key === 'breakable') return text('FABRICATE.Admin.Manager.Tools.SummaryCheckDriven', 'Roll to break');
    if (key === 'breakageChance') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryChanceValue', '{count}% break')
        .replace('{count}', String(tool?.breakage?.breakageChance ?? 0));
    }
    if (key === 'diceExpression') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryDiceValue', '{formula} roll')
        .replace('{formula}', String(tool?.breakage?.formula || '—'));
    }
    const maxUses = Number(tool?.breakage?.maxUses);
    if (Number.isInteger(maxUses) && maxUses > 0) {
      return text('FABRICATE.Admin.Manager.Tools.SummaryUseCount', '{count} uses')
        .replace('{count}', String(maxUses));
    }
    return text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses');
  }

  function onBreakValue() {
    const key = toolOnBreakSummary(tool);
    return {
      destroy: text('FABRICATE.Admin.Manager.Tools.InspectorDestroy', 'Destroy'),
      flagBroken: text('FABRICATE.Admin.Manager.Tools.InspectorFlagBroken', 'Mark broken'),
      replaceWith: text('FABRICATE.Admin.Manager.Tools.InspectorReplace', 'Replace'),
    }[key];
  }

  function validationContext() {
    if (row.validation.errorCount === 1) {
      return text('FABRICATE.Admin.Manager.Tools.ValidationIssue', '1 issue');
    }
    return text('FABRICATE.Admin.Manager.Tools.ValidationIssues', '{count} issues').replace(
      '{count}',
      row.validation.errorCount
    );
  }

  function prerequisiteLabel(id) {
    const option = prerequisiteOptions.find((entry) => String(entry.id) === String(id));
    return option?.name || option?.label || id;
  }

  function prerequisiteSummary() {
    const ids = Array.isArray(tool?.prerequisites?.ids) ? tool.prerequisites.ids : [];
    if (tool?.prerequisites?.enabled !== true) {
      return {
        heading: text('FABRICATE.Admin.Manager.Tools.PrerequisitesOff', 'Prerequisites off'),
        detail: text('FABRICATE.Admin.Manager.Tools.InspectorAnyCharacter', 'Any character may use it'),
      };
    }
    const count = ids.length;
    return {
      heading: text(
        count === 1
          ? 'FABRICATE.Admin.Manager.Tools.InspectorPrerequisiteOne'
          : 'FABRICATE.Admin.Manager.Tools.InspectorPrerequisiteCount',
        count === 1 ? '1 prerequisite' : '{count} prerequisites'
      ).replace('{count}', String(count)),
      detail: ids.map(prerequisiteLabel).join(', ') || text(
        'FABRICATE.Admin.Manager.Tools.InspectorPrerequisiteMissing',
        'No prerequisite selected'
      ),
    };
  }

  function bonusSummary() {
    if (tool?.bonus?.enabled !== true) {
      return {
        heading: text('FABRICATE.Admin.Manager.Tools.BonusOff', 'Bonus off'),
        detail: text('FABRICATE.Admin.Manager.Tools.InspectorNoBonus', 'Adds nothing to the check'),
      };
    }
    return {
      heading: text('FABRICATE.Admin.Manager.Tools.InspectorBonusHeading', 'Adds to the check'),
      detail: String(tool?.bonus?.expression || '—'),
    };
  }
</script>

{#if row}
  <section class="manager-inspector-card manager-tool-browser-inspector" data-tool-browser-inspector>
    <div class="manager-tool-inspector-hero">
      <img src={row.img} alt="" />
      <div>
        <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.InspectorKicker', 'Tool page')}</p>
        <h2 title={row.name}>{row.name}</h2>
        <span class={`manager-chip ${row.enabled ? 'is-positive' : 'is-neutral'}`}>
          <i class={row.enabled ? 'fas fa-circle-check' : 'fas fa-circle-pause'} aria-hidden="true"></i>
          {row.enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}
        </span>
        {#if !row.validation.valid}
          <span class="manager-chip is-danger" data-tool-validation-status="needs-attention">
            <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
            {text('FABRICATE.Admin.Manager.Tools.ValidationNeedsAttention', 'Needs attention')}
          </span>
        {/if}
      </div>
    </div>
    <p class="manager-muted" data-tool-inspector-description>{row.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</p>
    {#if !row.validation.valid}
      <p class="manager-muted is-danger" data-tool-inspector-validation>
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        {validationContext()}
      </p>
    {/if}
    <div class="manager-tool-inspector-facts">
      <div><strong data-tool-inspector-breakage>{breakageValue()}</strong><span>{text('FABRICATE.Admin.Manager.Tools.Breakage', 'Breakage')}</span></div>
      <div><strong data-tool-inspector-on-break>{onBreakValue()}</strong><span>{text('FABRICATE.Admin.Manager.Tools.OnBreak', 'On break')}</span></div>
    </div>
    <p class="manager-kicker manager-tool-inspector-section-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Prerequisites', 'Requirements')}</p>
    <div class="manager-tool-inspector-details">
      <div data-tool-inspector-prerequisites>
        <i class="fas fa-user-shield" aria-hidden="true"></i>
        <span><strong>{prerequisiteSummary().heading}</strong><small>{prerequisiteSummary().detail}</small></span>
      </div>
      <div data-tool-inspector-bonus>
        <i class="fas fa-plus-minus" aria-hidden="true"></i>
        <span><strong>{bonusSummary().heading}</strong><small>{bonusSummary().detail}</small></span>
      </div>
    </div>
    <button type="button" class="manager-button manager-tool-inspector-edit" data-tool-inspector-edit onclick={() => onEdit(tool.id)}>
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
