<!--
  The interactive check prompt, single or bulk, in the shared `ManagerModal` chrome: one header, a
  scrolling body and a footer of Disadvantage / Roll / Advantage, or one Roll.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `data` | the view `rollPrompt.js` prepares | none | Localized labels, roll modes, the choice plan and either the single formula or the bulk subject rows. |
  | `onSubmit(answer)` | function | no-op | Called once with the raw form answer; `rollPrompt.js` translates it. |
  | `onDismiss()` | function | no-op | Called once when Escape or the close control dismisses the prompt. |

  Invariants:
  - Roll is the form's only submit button, so Enter from any field rolls normally; Disadvantage and
    Advantage are `type="button"` — pinned by `tests/components/roll-prompt-mounted.test.js`.
-->
<script>
  import { untrack } from 'svelte';
  import Chip from '../../components/Chip.svelte';
  import Field from '../../components/Field.svelte';
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';
  import ManagerModal from '../manager/ManagerModal.svelte';

  let { data, onSubmit = () => {}, onDismiss = () => {} } = $props();
  let selectedIds = $state(untrack(() => [...data.choicePlan.defaultSelectedIds]));
  let settled = false;
  const multiPick = $derived(data.choicePlan.maxPicks > 1);
  const atCap = $derived(selectedIds.length >= data.choicePlan.maxPicks);
  const pickCap = $derived(fill(data.labels.pickUpTo, 'count', data.choicePlan.maxPicks));

  function fill(template, token, value) {
    return template.replace(`{${token}}`, () => String(value));
  }

  function selectCheckbox(id, checked) {
    if (checked && atCap) return;
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
    if (need?.kind === 'dc') return fill(data.labels.dcValue, 'dc', need.dc);
    return need?.kind === 'noSingleTarget' ? data.labels.noSingleTarget : data.labels.noCheck;
  }

  function answer(form, advantage) {
    if (settled || !form) return;
    settled = true;
    const checked = form.querySelectorAll('input[name="craftingModifier"]:checked');
    onSubmit({
      confirmed: true,
      bonus: form.elements.namedItem('situationalBonus')?.value ?? '',
      rollMode: form.elements.namedItem('rollMode')?.value,
      advantage,
      chosenModifierIds: [...checked].map((input) => input.value),
    });
  }

  function dismiss() {
    if (settled) return;
    settled = true;
    onDismiss();
  }
</script>

<ManagerModal
  open
  title={data.title}
  subtitle={data.subtitle}
  closeLabel={data.labels.close}
  width="500px"
  rootAttributes={{ 'data-roll-prompt': data.kind }}
  closeOnOutsideClick={false}
  trapFocus
  initialFocus="input[name='situationalBonus']"
  footerLayout="equal"
  serifTitle
  onClose={dismiss}
  onSubmit={(event) => answer(event.target, 'normal')}
>
  {#snippet body()}
    <div class="fabricate-roll-prompt">
      {#if data.kind === 'single'}
        {#if data.formula || data.dc !== null}
          <div class="formula-row">
            <span class="die-glyph" aria-hidden="true"><i class="fa-solid fa-dice"></i></span>
            <div class="formula-content">
              {#if data.formula}<span class="formula">{data.formula}</span>{/if}
              {#if data.dc !== null}
                <Chip tone="info" density="tag-run" icon="fa-solid fa-bullseye"
                  >{fill(data.labels.dcValue, 'dc', data.dc)} · {data.comparison === 'exceed'
                    ? data.labels.exceed
                    : data.labels.meet}</Chip
                >
              {/if}
            </div>
          </div>
        {/if}
      {:else}
        <section class="bulk-group">
          <p class="eyebrow">{data.labels.bulkRows}</p>
          {#if data.subjects.length}
            <div class="bulk-list">
              {#each data.subjects as subject, index (index)}
                <div class="bulk-row">
                  <span class="bulk-name">{subject.name || data.labels.unnamedSubject}</span>
                  <span class="bulk-need">{needText(subject.need)}</span>
                </div>
              {/each}
            </div>
          {/if}
          <p class="help bulk-note">{data.labels.bulkNote}</p>
        </section>
      {/if}

      {#if data.choicePlan.options.length}
        <fieldset class="modifier-group">
          <legend class="eyebrow"
            >{data.labels.modifierChoice}{#if multiPick}{` · ${pickCap}`}{/if}</legend
          >
          <div class="modifier-chips">
            {#each data.choicePlan.options as modifier (modifier.id)}
              {@const chosen = selectedIds.includes(modifier.id)}
              <label
                class="modifier-choice"
                class:is-chosen={chosen}
                class:is-disabled={multiPick && !chosen && atCap}
              >
                {#if multiPick}
                  <SelectionCheckbox
                    size="sm"
                    wrapper="contents"
                    name="craftingModifier"
                    value={modifier.id}
                    checked={chosen}
                    disabled={!chosen && atCap}
                    ariaLabel={`${modifierLabel(modifier)} ${modifierValue(modifier)}`}
                    onChange={(checked) => selectCheckbox(modifier.id, checked)}
                  />
                {:else}
                  <input
                    type="radio"
                    name="craftingModifier"
                    value={modifier.id}
                    checked={chosen}
                    onchange={() => (selectedIds = [modifier.id])}
                  />
                {/if}
                <i class={modifier.icon || 'fa-solid fa-dice-d20'} aria-hidden="true"></i>
                <span>{modifierLabel(modifier)}</span><span class="modifier-value"
                  >{modifierValue(modifier)}</span
                >
              </label>
            {/each}
          </div>
        </fieldset>
      {:else if data.selectedModifiers?.length}
        <section class="static-modifiers" aria-label={data.labels.modifiers}>
          <p class="eyebrow">{data.labels.modifiers}</p>
          <div class="modifier-chips">
            {#each data.selectedModifiers as modifier, index (index)}
              <Chip tone="accent" density="tag-run" icon={modifier.icon || 'fa-solid fa-dice-d20'}
                >{modifierLabel(modifier)} {modifierValue(modifier)}</Chip
              >
            {/each}
          </div>
          <p class="help">{data.labels.eachAdds}</p>
        </section>
      {/if}

      <div class="bonus-group">
        <Field as="label" class="prompt-field bonus-field">
          <span class="eyebrow field-caption">{data.labels.bonus}</span>
          <input
            type="text"
            name="situationalBonus"
            placeholder={data.labels.bonusPlaceholder}
            autocomplete="off"
          />
        </Field>
        <p class="help">{data.labels.bonusHelp}</p>
      </div>

      <Field as="label" class="prompt-field mode-field">
        <span class="eyebrow field-caption">{data.labels.rollMode}</span>
        <span class="mode-control">
          <!-- native select: the roll mode is a named form field whose popup stays native. -->
          <select name="rollMode" value={data.defaultRollMode}>
            {#each data.rollModes as mode (mode.value)}
              <option value={mode.value}>{mode.label}</option>
            {/each}
          </select>
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </span>
      </Field>
    </div>
  {/snippet}

  {#snippet footer()}
    {#if data.allowAdvantage === true}
      <button
        type="button"
        class="prompt-action"
        data-action="disadvantage"
        onclick={(event) => answer(event.currentTarget.form, 'disadvantage')}
        ><span>{data.labels.disadvantage}</span><small class="action-note"
          >{data.labels.worse}</small
        ></button
      >
      <button type="submit" class="prompt-action is-primary" data-action="normal"
        ><span>{data.labels.roll}</span></button
      >
      <button
        type="button"
        class="prompt-action"
        data-action="advantage"
        onclick={(event) => answer(event.currentTarget.form, 'advantage')}
        ><span>{data.labels.advantage}</span><small class="action-note">{data.labels.better}</small
        ></button
      >
    {:else}
      <button type="submit" class="prompt-action is-primary" data-action="roll"
        ><span>{data.labels.roll}</span></button
      >
    {/if}
  {/snippet}
</ManagerModal>

<style>
  .fabricate-roll-prompt {
    display: grid;
    align-content: start;
    flex: 1 1 auto;
    gap: calc(var(--fab-space-3) + var(--fab-space-2xs));
    min-height: 0;
    overflow-y: auto;
    color: var(--fab-text);
  }
  .formula-row {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-3);
  }
  .die-glyph {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex: none;
    border: 1px solid var(--fab-border-strong);
    border-radius: 9px;
    background: var(--fab-bg-2);
    color: var(--fab-accent);
    font-size: 17px;
  }
  .formula-content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--fab-space-2);
    min-width: 0;
  }
  .formula {
    color: var(--fab-text);
    font-family: var(--fab-font-mono);
    font-size: 14px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .eyebrow {
    margin: 0 0 var(--fab-space-chip);
    padding: 0;
    color: var(--fab-text-subtle);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .field-caption {
    margin: 0;
  }
  .help {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 10.5px;
    font-weight: 400;
    line-height: 1.5;
  }
  .bulk-list {
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
  }
  .bulk-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: calc(var(--fab-space-2) + var(--fab-space-2xs));
    min-height: 30px;
    box-sizing: border-box;
    padding: 0 calc(var(--fab-space-2) + var(--fab-space-2xs));
    background: var(--fab-bg-2);
  }
  .bulk-row + .bulk-row {
    border-top: 1px solid var(--fab-border);
  }
  .bulk-name {
    min-width: 0;
    color: var(--fab-text-secondary);
    font-size: 11.5px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .bulk-need {
    flex: none;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 10.5px;
    font-weight: 500;
    white-space: nowrap;
  }
  .bulk-list + .bulk-note {
    margin-top: var(--fab-space-chip);
  }
  .modifier-group {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .modifier-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
  }
  .modifier-choice {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-chip);
    max-width: 100%;
    box-sizing: border-box;
    padding: var(--fab-space-2xs) calc(var(--fab-space-2) + 1px);
    border: 1px solid var(--fab-border-strong);
    border-radius: 999px;
    background: var(--fab-bg-2);
    color: var(--fab-text);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .modifier-choice.is-chosen {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }
  .modifier-choice:has(input:focus-visible) {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
  .modifier-choice.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .modifier-choice input[type='radio'] {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 1.5px solid var(--fab-border);
    border-radius: 50%;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
  }
  .modifier-choice input[type='radio']::before,
  .modifier-choice input[type='radio']::after {
    display: none;
  }
  .modifier-choice input[type='radio']:checked {
    border-color: var(--fab-accent);
    box-shadow:
      inset 0 0 0 3px var(--fab-bg-1),
      inset 0 0 0 16px var(--fab-accent);
  }
  .modifier-choice i {
    color: var(--fab-accent-text);
  }
  .modifier-value {
    font-weight: 700;
  }
  .static-modifiers .help {
    margin-top: var(--fab-space-chip);
  }
  .bonus-group {
    display: grid;
    gap: var(--fab-space-chip);
  }
  .fabricate-roll-prompt :global(.fabricate-field.prompt-field) {
    gap: var(--fab-space-chip);
  }
  .fabricate-roll-prompt :global(.fabricate-field.manager-field.bonus-field input[type='text']),
  .fabricate-roll-prompt :global(.fabricate-field.manager-field.mode-field select) {
    width: 100%;
    box-sizing: border-box;
    height: 30px;
    min-height: 30px;
    padding: 0 calc(var(--fab-space-2) + var(--fab-space-2xs));
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-2);
    color: var(--fab-text);
  }
  .fabricate-roll-prompt :global(.fabricate-field.manager-field.bonus-field input[type='text']),
  .fabricate-roll-prompt :global(.bonus-field input::placeholder) {
    font-family: var(--fab-font-mono);
    font-size: 12px;
    font-weight: 500;
  }
  .fabricate-roll-prompt :global(.bonus-field input::placeholder) {
    color: var(--fab-text-subtle);
  }
  .mode-control {
    position: relative;
    display: block;
  }
  .fabricate-roll-prompt :global(.fabricate-field.manager-field.mode-field select) {
    padding-right: calc(var(--fab-space-6) + var(--fab-space-2));
    appearance: none;
    -webkit-appearance: none;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
  }
  .mode-control i {
    position: absolute;
    top: 50%;
    right: var(--fab-space-3);
    transform: translateY(-50%);
    color: var(--fab-text-subtle);
    font-size: 10px;
    pointer-events: none;
  }
  .prompt-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2xs);
    box-sizing: border-box;
    height: 44px;
    min-height: 44px;
    margin: 0;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border-strong);
    border-radius: 11px;
    appearance: none;
    -webkit-appearance: none;
    background: var(--fab-bg-1);
    color: var(--fab-text-secondary);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.2;
    cursor: pointer;
  }
  .prompt-action:hover {
    border-color: var(--fab-accent-border);
    color: var(--fab-text);
  }
  .prompt-action.is-primary {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }
  .action-note {
    display: block;
    color: var(--fab-text-muted);
    font-size: 9.5px;
    font-weight: 500;
  }
</style>
