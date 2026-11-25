<!-- Svelte 5 runes mode -->
<!--
  The body of one open Counter row: its name, its GM-only description and its limits. Edits apply as
  they are made, so every control writes through `onUpdate(patch)` and there is no Save.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `counter` | `{ id, label, description?, limit, min?, max? }` | — | the persisted Counter |
  | `counters` | the library's Counters | `[]` | read for the name rule |
  | `systemName` | string | `''` | named by the duplicate-name sentence |
  | `text` | the shell's localizer | — | `(key, fallback)` |
  | `onUpdate(patch)` | function | no-op | writes `label`, `description`, `limit`, `min` or `max` |

  Invariants:
  - A name commits on change. An empty one, or one another Counter already holds, is shown as an
    error and not written, and the typed text stays so the GM can correct it.
  - A min above a max is written and shown as an error; it is never refused.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import SegmentedControl from '../../../components/SegmentedControl.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import { interpolate } from '../checks/checksCopy.js';

  import { counterBoundsError } from './iterativeCounterCopy.js';
  import { counterNameFault } from './iterativeLibraryModel.js';

  let {
    counter,
    counters = [],
    systemName = '',
    text = (_key, fallback) => fallback,
    onUpdate = () => {},
  } = $props();

  let typed = $state(null);

  const fault = $derived(counterNameFault(counters, counter.id, typed ?? counter.label));
  const shownName = $derived(typed ?? counter.label);
  const nameId = $derived(`iterative-counter-name-note-${counter.id}`);
  const limit = $derived(counter.limit ?? 'none');
  const boundsError = $derived(counterBoundsError(counter, text));
  const isGlobal = $derived(limit === 'global');
  const isPerRecipe = $derived(limit === 'perRecipe');
  const hasBounds = $derived(isGlobal || isPerRecipe);
  const minWord = $derived(
    isGlobal
      ? text('FABRICATE.Admin.Manager.Iterative.BoundMin', 'Min')
      : text('FABRICATE.Admin.Manager.Iterative.BoundDefaultMin', 'Default min')
  );
  const maxWord = $derived(
    isGlobal
      ? text('FABRICATE.Admin.Manager.Iterative.BoundMax', 'Max')
      : text('FABRICATE.Admin.Manager.Iterative.BoundDefaultMax', 'Default max')
  );

  const limitOptions = $derived([
    { value: 'none', label: text('FABRICATE.Admin.Manager.Iterative.LimitNone', 'No limit') },
    {
      value: 'perRecipe',
      label: text('FABRICATE.Admin.Manager.Iterative.LimitPerRecipe', 'Per recipe'),
    },
    { value: 'global', label: text('FABRICATE.Admin.Manager.Iterative.LimitGlobal', 'Global') },
  ]);

  const limitHint = $derived(
    {
      none: text('FABRICATE.Admin.Manager.Iterative.LimitHintNone', 'No min or max.'),
      perRecipe: text(
        'FABRICATE.Admin.Manager.Iterative.LimitHintPerRecipe',
        'Each recipe sets its own min and max, starting from these.'
      ),
      global: text(
        'FABRICATE.Admin.Manager.Iterative.LimitHintGlobal',
        'One min and max for every recipe.'
      ),
    }[limit] ?? ''
  );

  const faultText = $derived(
    fault === 'empty'
      ? text('FABRICATE.Admin.Manager.Iterative.NameEmpty', 'Give this counter a name.')
      : interpolate(
          text(
            'FABRICATE.Admin.Manager.Iterative.NameDuplicate',
            'Another counter in {system} is already called {label}. Names must be unique so GMs can tell them apart in pickers.'
          ),
          { system: systemName, label: shownName.trim() }
        )
  );

  function commitName(event) {
    const value = event.currentTarget.value;
    if (counterNameFault(counters, counter.id, value)) return;
    typed = null;
    if (value.trim() !== counter.label) onUpdate({ label: value });
  }
</script>

<div class="manager-iterative-counter-body" data-iterative-counter-body={counter.id}>
  <Field as="label" invalid={Boolean(fault)}>
    <span>{text('FABRICATE.Admin.Manager.Iterative.NameField', 'Name')}</span>
    <input
      type="text"
      data-iterative-counter-name={counter.id}
      value={shownName}
      aria-invalid={fault ? 'true' : undefined}
      aria-describedby={fault ? nameId : undefined}
      oninput={(event) => (typed = event.currentTarget.value)}
      onchange={commitName}
    />
  </Field>
  {#if fault}
    <p
      class="manager-iterative-counter-note is-danger"
      id={nameId}
      data-iterative-name-error={fault}
    >
      {faultText}
    </p>
  {/if}

  <Field as="label">
    <span
      >{text('FABRICATE.Admin.Manager.Iterative.DescriptionField', 'Description · GM only')}</span
    >
    <input
      type="text"
      data-iterative-counter-description={counter.id}
      value={counter.description ?? ''}
      onchange={(event) => onUpdate({ description: event.currentTarget.value })}
    />
  </Field>

  <Field as="div">
    <span>{text('FABRICATE.Admin.Manager.Iterative.LimitsField', 'Limits')}</span>
    <div class="manager-iterative-counter-limits">
      <SegmentedControl
        options={limitOptions}
        value={limit}
        groupName={`iterative-counter-limit-${counter.id}`}
        ariaLabel={interpolate(
          text('FABRICATE.Admin.Manager.Iterative.LimitsAria', '{name} limits'),
          { name: counter.label }
        )}
        optionDataAttr="data-iterative-limit-option"
        onChange={(next) => onUpdate({ limit: next })}
      />
      {#if hasBounds}
        {#each [{ key: 'min', word: minWord }, { key: 'max', word: maxWord }] as bound (bound.key)}
          {@const names = stepperLabels(`${counter.label} ${bound.word}`)}
          <div class="manager-iterative-counter-bound">
            <span class="manager-iterative-counter-bound-word">{bound.word}</span>
            <Stepper
              allowUnset
              value={counter[bound.key] ?? null}
              placeholder="—"
              ariaLabel={names.ariaLabel}
              decrementLabel={names.decrementLabel}
              incrementLabel={names.incrementLabel}
              inputProps={{ 'data-iterative-counter-bound': bound.key }}
              onChange={(next) => onUpdate({ [bound.key]: next })}
            />
            {#if isPerRecipe && typeof counter[bound.key] === 'number'}
              <IconButton
                role="ghost"
                size="24"
                icon="fas fa-xmark"
                data-iterative-counter-clear={bound.key}
                ariaLabel={interpolate(
                  text('FABRICATE.Admin.Manager.Iterative.BoundClear', 'No {bound} for {name}'),
                  { bound: bound.word.toLowerCase(), name: counter.label }
                )}
                onclick={() => onUpdate({ [bound.key]: null })}
              />
            {/if}
          </div>
        {/each}
      {/if}
    </div>
    {#if boundsError}
      <p class="manager-iterative-counter-note is-danger" data-iterative-bounds-error>
        {boundsError}
      </p>
    {/if}
    <p class="manager-iterative-counter-note">{limitHint}</p>
  </Field>
</div>

<style>
  .manager-iterative-counter-body {
    display: grid;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .manager-iterative-counter-limits {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .manager-iterative-counter-bound {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-iterative-counter-bound-word {
    color: var(--fab-text-secondary);
    font-size: 0.72rem;
    font-weight: 500;
  }

  .manager-iterative-counter-note {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
    line-height: 1.5;
    text-wrap: pretty;
  }

  .manager-iterative-counter-note.is-danger {
    color: var(--fab-danger-text);
  }
</style>
