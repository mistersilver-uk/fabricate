<!--
  The gathering task's Stamina cost card (issue 1522), rendered only where the system has stamina
  on: the cost per attempt and its per-actor modifiers over the d100 character modifier library.
  Writes `staminaCost` and the whole `staminaCostModifiers` list through `onUpdateTask`.
-->
<script>
  import Button from '../../../components/Button.svelte';
  import Field from '../../../components/Field.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import Select from '../../../components/Select.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import {
    staminaModifierOptions,
    STAMINA_MODIFIER_OPERATORS,
  } from '../gatheringTaskSelectOptions.js';
  import GatheringTaskCard from './GatheringTaskCard.svelte';

  let { text, task, characterModifierLibrary = [], onUpdateTask = () => {} } = $props();

  const modifierSelectOptions = $derived(staminaModifierOptions(characterModifierLibrary || []));
  const staminaCostValue = $derived(Number(task?.staminaCost ?? 0));
  const staminaCostModifiers = $derived(
    Array.isArray(task?.staminaCostModifiers) ? task.staminaCostModifiers : []
  );

  function updateStaminaCost(value) {
    const next = Number(value);
    onUpdateTask({ staminaCost: Number.isFinite(next) && next > 0 ? Math.floor(next) : 0 });
  }
  function addStaminaCostModifier() {
    const first = (characterModifierLibrary || [])[0];
    if (!first) return;
    onUpdateTask({
      staminaCostModifiers: [
        ...staminaCostModifiers,
        {
          id: `scm-${first.id}-${staminaCostModifiers.length + 1}`,
          modifierId: first.id,
          operator: '-',
          min: null,
          max: null,
          expressionOverride: '',
        },
      ],
    });
  }
  function updateStaminaCostModifier(index, patch) {
    onUpdateTask({
      staminaCostModifiers: staminaCostModifiers.map((ref, i) =>
        i === index ? { ...ref, ...patch } : ref
      ),
    });
  }
  function removeStaminaCostModifier(index) {
    onUpdateTask({ staminaCostModifiers: staminaCostModifiers.filter((_, i) => i !== index) });
  }
</script>

<GatheringTaskCard
  class="manager-task-stamina-card"
  title={text('FABRICATE.Admin.Manager.Economy.TaskStaminaTitle', 'Stamina cost')}
  hint={text(
    'FABRICATE.Admin.Manager.Economy.TaskStaminaHint',
    'Stamina spent per attempt when this system has stamina enabled.'
  )}
  data-gathering-task-stamina
>
  <div class="manager-task-stamina-row">
    <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. -->
    <Field as="div" class="manager-task-stamina-cost-field">
      <span>{text('FABRICATE.Admin.Manager.Economy.TaskStaminaCost', 'Cost per attempt')}</span>
      <!-- ratchet-exempt(design-system): the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from GatheringTaskEditView -->
      <Stepper
        value={staminaCostValue}
        min={0}
        step={1}
        fill
        {...stepperLabels(
          text('FABRICATE.Admin.Manager.Economy.TaskStaminaCost', 'Cost per attempt')
        )}
        inputProps={{ 'data-gathering-task-stamina-cost': '' }}
        onChange={(next) => updateStaminaCost(next)}
      />
    </Field>

    <Field as="div" class="manager-task-stamina-modifiers">
      <span
        title={text(
          'FABRICATE.Admin.Manager.Economy.TaskStaminaModifiersHint',
          'Adjust the cost for an actor (e.g. a strong character mines for less).'
        )}
        >{text(
          'FABRICATE.Admin.Manager.Economy.TaskStaminaModifiers',
          'Per-actor cost modifiers'
        )}</span
      >
      <div class="manager-task-stamina-modifier-list">
        {#each staminaCostModifiers as ref, index (ref.id)}
          <div class="manager-task-stamina-modifier-row" data-gathering-stamina-modifier={ref.id}>
            <!-- Both keep their own `aria-label`: the row renders no caption, and the mounted suites
                 address these two hookless triggers by it (issue 1510). -->
            <Select
              size="inline"
              minWidth={200}
              value={ref.modifierId}
              options={modifierSelectOptions}
              ariaLabel={text(
                'FABRICATE.Admin.Manager.Economy.TaskStaminaModifiers',
                'Per-actor cost modifiers'
              )}
              onChange={(next) => updateStaminaCostModifier(index, { modifierId: next })}
            />
            <Select
              size="inline"
              value={ref.operator}
              options={STAMINA_MODIFIER_OPERATORS}
              showTick={false}
              ariaLabel={text(
                'FABRICATE.Admin.Manager.Economy.TaskStaminaModifierOperator',
                'Operator'
              )}
              onChange={(next) => updateStaminaCostModifier(index, { operator: next })}
            />
            <!-- ratchet-exempt(design-system): the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from GatheringTaskEditView -->
            <Stepper
              value={ref.min}
              allowUnset
              step={1}
              fill
              placeholder={text(
                'FABRICATE.Admin.Manager.Economy.TaskStaminaModifierMinPlaceholder',
                'min'
              )}
              {...stepperLabels(
                text('FABRICATE.Admin.Manager.Economy.TaskStaminaModifierMin', 'Minimum')
              )}
              onChange={(next) => updateStaminaCostModifier(index, { min: next })}
            />
            <!-- ratchet-exempt(design-system): the spread is `stepperLabels`, the Stepper names the shared derivation requires, moved from GatheringTaskEditView -->
            <Stepper
              value={ref.max}
              allowUnset
              step={1}
              fill
              placeholder={text(
                'FABRICATE.Admin.Manager.Economy.TaskStaminaModifierMaxPlaceholder',
                'max'
              )}
              {...stepperLabels(
                text('FABRICATE.Admin.Manager.Economy.TaskStaminaModifierMax', 'Maximum')
              )}
              onChange={(next) => updateStaminaCostModifier(index, { max: next })}
            />
            <IconButton
              class="is-danger"
              ariaLabel={text('FABRICATE.Admin.Manager.Economy.RemoveModifier', 'Remove')}
              onclick={() => removeStaminaCostModifier(index)}
              ><i class="fas fa-times" aria-hidden="true"></i></IconButton
            >
          </div>
        {/each}
        <!-- Dashed and NOT `fullWidth` (issue 1118): a full-width dashed control under the grid rows
             would read as a fourth row rather than as the slot that adds one. -->
        <Button
          role="dashed"
          disabled={(characterModifierLibrary || []).length === 0}
          onclick={addStaminaCostModifier}
          data-gathering-add-stamina-modifier
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Economy.AddModifier', 'Add modifier')}</span>
        </Button>
      </div>
    </Field>
  </div>
</GatheringTaskCard>

<style>
  /* Cost beside the per-actor modifiers, captions top-aligned so the cost input and the first
     modifier row share a line. A grid, so the global `input { width: 100% }` cannot wrap them. */
  .manager-task-stamina-row {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: var(--fab-space-3);
    align-items: start;
  }

  /* `:global(...)` chained with `.fabricate-field`: the class sits on a `<Field>`, and the compound
     restores the (0,2,0) the scoped form had. */
  :global(.fabricate-field.manager-task-stamina-cost-field) {
    width: 100%;
  }

  /* The WHOLE selector is global: Svelte scopes the last compound of a rule opening on `:global()`
     with a bare hash, which would lift it from (0,2,1) to (0,3,1). */
  :global(.fabricate-field.manager-task-stamina-cost-field > span) {
    white-space: nowrap;
  }

  :global(.fabricate-field.manager-task-stamina-modifiers) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-task-stamina-modifier-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-task-stamina-modifier-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px 102px 102px auto;
    gap: var(--fab-space-2);
    align-items: center;
  }
</style>
