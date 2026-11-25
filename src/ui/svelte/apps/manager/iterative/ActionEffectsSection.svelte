<!-- Svelte 5 runes mode -->
<!--
  The Crafting Action editor's Effects card: what the action changes after its check, applied top to
  bottom in a reorderable list. Each effect opens in place to its description, when it applies and
  the counter change it makes; one is open at a time, and a collapsed effect with a fault draws it
  under its name.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `draft` | the staged action | — | read for `effects` and `check` |
  | `counters` / `actions` | `{ id, label }[]` | `[]` | the counters an effect changes, and the actions a rule may name |
  | `tiers` | `{ id, name }[]` | `[]` | the routed check's outcomes |
  | `context` | `{ counterIds, tierIds }` | — | what an effect's marks are judged against |
  | `faults` | `{ code, reason?, field }[]` | `[]` | the action-level marks; this card draws its `effects` one |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `edit(change)` | function | no-op | runs `change(draft)`, the only way this card writes |

  Invariants:
  - Removing an effect hands focus to the adder, because the removed row's controls are gone, and
    adding one focuses its name.
-->
<script>
  import { tick } from 'svelte';

  import Button from '../../../components/Button.svelte';
  import Chip from '../../../components/Chip.svelte';
  import Field from '../../../components/Field.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import SortableList from '../../../components/SortableList.svelte';
  import { interpolate } from '../checks/checksCopy.js';
  import { arrayOrEmpty } from '../../../../../utils/scalars.js';

  import EffectBody from './EffectBody.svelte';
  import FaultLine from './FaultLine.svelte';
  import { effectSummary } from './iterativeEffectCopy.js';
  import { effectFaults, listEntryFaults } from './iterativeFieldFaults.js';
  import { deriveIterativeId } from './iterativeLibraryModel.js';

  let {
    draft,
    counters = [],
    actions = [],
    tiers = [],
    context,
    faults = [],
    text = (_key, fallback) => fallback,
    edit = () => {},
  } = $props();

  let openId = $state('');
  let section = $state(null);

  const effects = $derived(arrayOrEmpty(draft.effects));
  const rolls = $derived(draft.check === 'roll');
  const entryFaults = $derived(listEntryFaults('effect', effects));
  const marks = $derived(faults.filter((fault) => fault.field === 'effects'));
  const faultsOf = (effect) =>
    effectFaults(effect, draft, entryFaults[effects.indexOf(effect)], context);
  const counterLabel = (effect) =>
    counters.find((counter) => counter.id === effect.target?.counterId)?.label ??
    effect.target?.counterId ??
    '';
  const nameOf = (effect) =>
    effect.name ||
    interpolate(text('FABRICATE.Admin.Manager.Iterative.EffectPlaceholder', 'Effect {number}'), {
      number: effects.indexOf(effect) + 1,
    });
  // A repeated id, which an import can carry, would repeat a keyed row.
  const keyOf = (effect, index) =>
    effects.findIndex((held) => held.id === effect.id) === index
      ? effect.id
      : `${effect.id}#${index}`;

  const changeEffect = (effect, change) =>
    edit((action) => {
      change(action.effects[effects.indexOf(effect)]);
    });

  const nameLabel = (effect) =>
    interpolate(text('FABRICATE.Admin.Manager.Iterative.EffectNameLabel', 'Effect {number} name'), {
      number: effects.indexOf(effect) + 1,
    });

  async function addEffect() {
    const id = deriveIterativeId(
      '',
      'effect',
      effects.map((effect) => effect.id)
    );
    edit((action) => {
      action.effects = [
        ...arrayOrEmpty(action.effects),
        {
          id,
          when: { combine: 'all' },
          target: { kind: 'counter', counterId: counters[0]?.id ?? '' },
          op: 'add',
          amount: '1',
        },
      ];
    });
    openId = id;
    await tick();
    section?.querySelector(`[data-iterative-effect-name="${id}"]`)?.focus();
  }

  async function removeEffect(effect) {
    const at = effects.indexOf(effect);
    edit((action) => {
      action.effects = action.effects.filter((_, index) => index !== at);
    });
    if (openId === effect.id) openId = '';
    await tick();
    section?.querySelector('[data-iterative-add-effect]')?.focus();
  }

  function reorder(from, to) {
    edit((action) => {
      const next = [...action.effects];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      action.effects = next;
    });
  }
</script>

<InspectorCard data-iterative-section="effects">
  {#snippet leading()}<Chip tone="neutral" mono>3</Chip>{/snippet}
  {#snippet title()}{text('FABRICATE.Admin.Manager.Iterative.SectionEffects', 'Effects')}{/snippet}
  {#snippet note()}{text(
      'FABRICATE.Admin.Manager.Iterative.SectionEffectsNote',
      'Applied after the check'
    )}{/snippet}
  <div class="manager-iterative-card-body" bind:this={section}>
    <p class="manager-iterative-note">
      {text(
        'FABRICATE.Admin.Manager.Iterative.EffectsLead',
        'Effects apply top to bottom. Drag the handle to reorder.'
      )}
    </p>
    {#if effects.length === 0}
      <p class="manager-iterative-note" data-iterative-effects-empty>
        {text(
          'FABRICATE.Admin.Manager.Iterative.EffectsEmpty',
          'No effects. Taking this action only spends its costs.'
        )}
      </p>
    {/if}
    <SortableList
      items={effects}
      itemLabel={nameOf}
      itemKey={keyOf}
      ariaLabel={text('FABRICATE.Admin.Manager.Iterative.SectionEffects', 'Effects')}
      numbered
      removable
      expandable
      reorderable
      bind:expandedId={openId}
      onReorder={reorder}
      onRemove={removeEffect}
      data-iterative-effect-list
      rowData={(effect) => ({ 'data-iterative-effect': effect.id })}
      removeData={(effect) => ({ 'data-iterative-effect-remove': effect.id })}
    >
      {#snippet row(effect)}
        <div class="manager-iterative-effect-row">
          <Field as="label" size={30}>
            <input
              type="text"
              data-iterative-effect-name={effect.id}
              aria-label={nameLabel(effect)}
              placeholder={nameOf(effect)}
              value={effect.name ?? ''}
              oninput={(event) =>
                changeEffect(effect, (entry) => {
                  if (event.currentTarget.value.trim() === '') delete entry.name;
                  else entry.name = event.currentTarget.value;
                })}
            />
          </Field>
          <span
            class="manager-iterative-effect-summary"
            title={effectSummary(effect, { counterLabel: counterLabel(effect) }, text)}
          >
            {effectSummary(effect, { counterLabel: counterLabel(effect) }, text)}
          </span>
          {#if openId !== effect.id}
            <FaultLine faults={faultsOf(effect)} {text} />
          {/if}
        </div>
      {/snippet}
      {#snippet body(effect)}
        <EffectBody
          {effect}
          {rolls}
          {counters}
          {actions}
          {tiers}
          {text}
          open={openId === effect.id}
          faults={faultsOf(effect)}
          change={(update) => changeEffect(effect, update)}
        />
      {/snippet}
      {#snippet footer()}
        <li class="manager-iterative-effect-add">
          <Button
            role="dashed"
            fullWidth
            icon="fas fa-plus"
            data-iterative-add-effect
            onclick={addEffect}
          >
            {text('FABRICATE.Admin.Manager.Iterative.AddEffect', 'Effect')}
          </Button>
        </li>
      {/snippet}
    </SortableList>
    <FaultLine faults={marks} {text} />
  </div>
</InspectorCard>

<style>
  .manager-iterative-effect-row {
    display: grid;
    gap: var(--fab-space-1);
    min-width: 0;
  }

  .manager-iterative-effect-summary {
    overflow: hidden;
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-iterative-effect-add {
    list-style: none;
  }
</style>
