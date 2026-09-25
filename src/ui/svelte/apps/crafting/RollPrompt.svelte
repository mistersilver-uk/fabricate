<!-- DialogV2 owns the frame and footer; this component owns its mounted form body. -->
<script>
  import { untrack } from 'svelte';
  import Field from '../../components/Field.svelte';
  import Chip from '../../components/Chip.svelte';
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';

  let { data } = $props();
  let selectedIds = $state(untrack(() => [...data.choicePlan.defaultSelectedIds]));
  const multiPick = $derived(data.choicePlan.maxPicks > 1);

  function selectCheckbox(id, checked) {
    if (checked && selectedIds.length >= data.choicePlan.maxPicks) return;
    selectedIds = checked ? [...selectedIds, id] : selectedIds.filter((entry) => entry !== id);
  }

  function modifierLabel(modifier) {
    return modifier?.label || data.labels.unnamedModifier;
  }

  function modifierValue(modifier) {
    if (typeof modifier?.display === 'string' && modifier.display) return modifier.display;
    const value = Number(modifier?.value);
    if (!Number.isFinite(value)) return '0';
    return value >= 0 ? `+${value}` : String(value);
  }

  function needText(need) {
    if (need?.kind === 'dc') return data.labels.dcValue.replace('{dc}', String(need.dc));
    return need?.kind === 'noSingleTarget' ? data.labels.noSingleTarget : data.labels.noCheck;
  }
</script>

<div class="fabricate-roll-prompt" data-roll-prompt-state={data.state || data.kind}>
  <div class="prompt-heading">
    <h2>{data.title}</h2>
    {#if data.subtitle}<p>{data.subtitle}</p>{/if}
  </div>

  <div class="prompt-body">
    {#if data.kind === 'single'}
      {#if data.formula || data.dc !== null}
        <div class="formula-row">
          <span class="die-glyph" aria-hidden="true"><i class="fa-solid fa-dice"></i></span>
          <div class="formula-content">
            {#if data.formula}<code>{data.formula}</code>{/if}
            {#if data.dc !== null}
              <Chip tone="info" density="row" mono>{data.labels.dcValue.replace('{dc}', String(data.dc))} · {data.comparison === 'exceed' ? data.labels.exceed : data.labels.meet}</Chip>
            {/if}
          </div>
        </div>
      {/if}
    {:else if data.subjects.length}
      <div class="bulk-list">
        <p class="eyebrow">{data.labels.bulkRows}</p>
        {#each data.subjects as subject, index (index)}
          <div class="bulk-row">
            <span>{subject.name || data.labels.unnamedSubject}</span>
            <span>{needText(subject.need)}</span>
          </div>
        {/each}
      </div>
      <p class="help">{data.labels.bulkNote}</p>
    {/if}

    {#if data.choicePlan.options.length}
      <fieldset class="fabricate-roll-prompt__modifiers">
        <legend class="eyebrow">{data.labels.modifierChoice}{#if multiPick} · {data.labels.pickUpTo.replace('{count}', String(data.choicePlan.maxPicks))}{/if}</legend>
        <div class="modifier-chips">
          {#each data.choicePlan.options as modifier (modifier.id)}
            {#if multiPick}
              <label class="modifier-choice" class:is-chosen={selectedIds.includes(modifier.id)} class:is-disabled={!selectedIds.includes(modifier.id) && selectedIds.length >= data.choicePlan.maxPicks}>
                <SelectionCheckbox wrapper="contents" name="craftingModifier" value={modifier.id} checked={selectedIds.includes(modifier.id)} disabled={!selectedIds.includes(modifier.id) && selectedIds.length >= data.choicePlan.maxPicks} ariaLabel={modifierLabel(modifier)} onChange={(checked) => selectCheckbox(modifier.id, checked)} />
                <i class={modifier.icon || 'fa-solid fa-dice-d20'} aria-hidden="true"></i>
                <span>{modifierLabel(modifier)}</span><span>{modifierValue(modifier)}</span>
              </label>
            {:else}
              <label class="modifier-choice" class:is-chosen={selectedIds.includes(modifier.id)}>
                <input type="radio" name="craftingModifier" value={modifier.id} checked={selectedIds.includes(modifier.id)} onchange={() => selectedIds = [modifier.id]} />
                <i class={modifier.icon || 'fa-solid fa-dice-d20'} aria-hidden="true"></i>
                <span>{modifierLabel(modifier)}</span><span>{modifierValue(modifier)}</span>
              </label>
            {/if}
          {/each}
        </div>
      </fieldset>
    {:else if data.selectedModifiers?.length}
      <section class="static-modifiers" aria-label={data.labels.modifiers}>
        <p class="eyebrow">{data.labels.modifiers}</p>
        <div class="modifier-chips">
          {#each data.selectedModifiers as modifier, index (index)}
            <Chip tone="accent" emphasis="outlined" density="row" icon={modifier.icon || 'fa-solid fa-dice-d20'}>{modifierLabel(modifier)} {modifierValue(modifier)}</Chip>
          {/each}
        </div>
        <p class="help">{data.labels.eachAdds}</p>
      </section>
    {/if}

    <div class="bonus-group">
      <Field as="label" class="bonus-field">
        <span class="eyebrow">{data.labels.bonus}</span>
        <input type="text" name="situationalBonus" placeholder={data.labels.bonusPlaceholder} autocomplete="off" />
      </Field>
      <p class="help">{data.labels.bonusHelp}</p>
    </div>

    <Field as="label" class="mode-field">
      <span class="eyebrow">{data.labels.rollMode}</span>
      <!-- native select: DialogV2 form.elements requires a named native select. -->
      <select name="rollMode" value={data.defaultRollMode}>
        {#each data.rollModes as mode (mode.value)}
          <option value={mode.value}>{mode.label}</option>
        {/each}
      </select>
    </Field>
  </div>
</div>

<style>
  .fabricate-roll-prompt { color: var(--fab-text); background: var(--fab-bg-1); font: inherit; }
  .prompt-heading { padding: 12px 14px; border-bottom: 1px solid var(--fab-border); background: var(--fab-bg-2); }
  .prompt-heading h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .prompt-heading p { margin: 3px 0 0; color: var(--fab-text-subtle); font-size: 10.5px; font-weight: 500; }
  .prompt-body { display: grid; gap: 14px; padding: 14px 16px; }
  .formula-row { display: flex; align-items: flex-start; gap: 12px; }
  .die-glyph { display: grid; place-items: center; width: 44px; height: 44px; flex: none; border: 1px solid var(--fab-border-strong); border-radius: 9px; background: var(--fab-bg-2); color: var(--fab-accent-text); font-size: 17px; }
  .formula-content { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; min-width: 0; }
  .formula-content code { color: var(--fab-text); font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
  .eyebrow { margin: 0 0 6px; color: var(--fab-text-subtle); font-size: 8.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .help { margin: 0; color: var(--fab-text-muted); font-size: 10.5px; font-weight: 400; line-height: 1.4; }
  .bulk-list { overflow: hidden; border: 1px solid var(--fab-border); border-radius: 6px; }
  .bulk-list .eyebrow { padding: 8px 10px 2px; }
  .bulk-row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 10px; border-top: 1px solid var(--fab-border); font-size: 12px; }
  .bulk-row span:last-child { color: var(--fab-text-muted); white-space: nowrap; }
  .fabricate-roll-prompt__modifiers { min-width: 0; margin: 0; padding: 0; border: 0; }
  .modifier-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .modifier-choice { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 5px 9px; border: 1px solid var(--fab-border-strong); border-radius: 999px; background: var(--fab-bg-2); color: var(--fab-text); font-size: 11px; cursor: pointer; }
  .modifier-choice.is-chosen { border-color: var(--fab-accent-border); background: var(--fab-accent-soft); }
  .modifier-choice.is-disabled { opacity: .5; cursor: not-allowed; }
  .modifier-choice input[type='radio'] { margin: 0; accent-color: var(--fab-accent); }
  .modifier-choice i { color: var(--fab-accent-text); }
  .modifier-choice span:last-child { font-weight: 700; }
  .bonus-group, .bonus-field, .mode-field { display: grid; gap: 4px; }
  .fabricate-roll-prompt :global(.bonus-field input), .fabricate-roll-prompt :global(.mode-field select) { width: 100%; box-sizing: border-box; height: 30px; min-height: 30px; padding: 0 10px; border: 1px solid var(--fab-border); border-radius: 7px; background: var(--fab-bg-2); color: var(--fab-text); font: inherit; }
  .fabricate-roll-prompt :global(.bonus-field input::placeholder) { color: var(--fab-text-subtle); }
</style>
