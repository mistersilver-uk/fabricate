<!-- Svelte 5 runes mode -->
<!--
  One iterative scope's result sets, the recipe's or one step's: an ordered list checked top to
  bottom, each set naming itself, stating its Produced when lines and holding its items. The failure
  set is marked, and reorders and removes like any other.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `resultGroups` | the scope's groups | `[]` | the sets as drafted |
  | `instances` | `Recipe.iterative.counters` | `[]` | the Counter Instances a line's rules may name |
  | `iterative` | the iterative route model | — | reads `counters` and `library` |
  | `componentOptions` / `resultKinds` | the result card's | `[]` / `null` | forwarded to each set's items |
  | `isTerminalStep` | boolean | `true` | forwarded to each set's items |
  | `idPrefix` | string | `''` | namespaces the `data-recipe-section` marker |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Callbacks:
  - `onChange(nextGroups)` — the whole replacement array; `onOpenComponent` is the items' deep link.

  Invariants:
  - Every edit spreads the set it changes, so its id, role and results survive, and a set left with
    no line carries no `producedWhen` key.
  - Removing a set hands focus to the next set's remove, else the adder.
-->
<script>
  import { tick } from 'svelte';

  import Button from '../../../../components/Button.svelte';
  import Chip from '../../../../components/Chip.svelte';
  import Field from '../../../../components/Field.svelte';
  import Kicker from '../../../../components/Kicker.svelte';
  import SortableList from '../../../../components/SortableList.svelte';
  import { uniqueRowKeys } from '../../../../components/resultRows.js';
  import { arrayOrEmpty } from '../../../../../../utils/scalars.js';
  import RecipeResultGroupCard from '../RecipeResultGroupCard.svelte';
  import { addResultGroup } from '../recipeRoutingEdits.js';
  import { defaultSetName, setDisplayName } from '../setDrafts.js';
  import { actionOptions, instanceSources } from './iterativeStepConfig.js';
  import ProducedWhenLines from './ProducedWhenLines.svelte';

  let {
    resultGroups = [],
    instances = [],
    iterative,
    componentOptions = [],
    resultKinds = null,
    isTerminalStep = true,
    idPrefix = '',
    text = (_key, fallback) => fallback,
    onChange = () => {},
    onOpenComponent = () => {},
  } = $props();

  let root = $state(null);

  const groups = $derived(arrayOrEmpty(resultGroups));
  const keys = $derived(uniqueRowKeys(groups));
  const counterNames = $derived(iterative?.counters ?? []);
  const sources = $derived(instanceSources(instances, counterNames));
  const actions = $derived(
    actionOptions(iterative?.library ?? null, sources, '').map(({ id, label }) => ({ id, label }))
  );

  const nameOf = (group) => setDisplayName(group, groups.indexOf(group));
  const write = (index, next) => onChange(groups.map((group, at) => (at === index ? next : group)));

  /** The set with `lines` as its Produced when, and no key once none is left. */
  function withLines(group, lines) {
    const { producedWhen: _dropped, ...rest } = group;
    return lines.length > 0 ? { ...rest, producedWhen: lines } : rest;
  }

  function reorder(from, to) {
    const next = [...groups];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  async function remove(group) {
    const index = groups.indexOf(group);
    onChange(groups.filter((_, at) => at !== index));
    await tick();
    const removes = root?.querySelectorAll('[data-iterative-result-set-remove]') ?? [];
    (removes[index] ?? root?.querySelector('[data-recipe-add="result-set"]'))?.focus();
  }
</script>

<section
  class="manager-iterative-results"
  bind:this={root}
  data-recipe-section={`${idPrefix}results`}
  data-iterative-results
>
  <Kicker>{text('FABRICATE.Admin.Manager.Recipe.Iterative.ResultSets', 'Result sets')}</Kicker>
  {#if groups.length === 0}
    <p class="manager-muted" data-iterative-results-empty>
      {text(
        'FABRICATE.Admin.Manager.Recipe.Iterative.ResultSetsEmpty',
        'No result sets. This step produces nothing.'
      )}
    </p>
  {/if}
  <SortableList
    items={groups}
    itemKey={(_group, index) => keys[index]}
    itemLabel={nameOf}
    ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Iterative.ResultSets', 'Result sets')}
    reorderable
    alwaysOpen
    numbered
    removable
    onReorder={reorder}
    onRemove={remove}
    rowData={(group) => ({ 'data-iterative-result-set': group.id })}
    removeData={(group) => ({ 'data-iterative-result-set-remove': group.id })}
  >
    {#snippet row(group, index)}
      <div class="manager-iterative-result-set-row">
        <span class="manager-iterative-result-set-name">
          <Field as="label" size={30} face="serif">
            <input
              type="text"
              aria-label={text(
                'FABRICATE.Admin.Manager.Recipe.Iterative.ResultSetName',
                'Result set name'
              )}
              placeholder={defaultSetName(index)}
              value={group.name ?? ''}
              data-iterative-result-set-name={group.id}
              oninput={(event) => write(index, { ...group, name: event.currentTarget.value })}
            />
          </Field>
        </span>
        {#if group.role === 'failure'}
          <Chip density="row" tone="danger" data-iterative-failure-set
            >{text('FABRICATE.Admin.Manager.Recipe.Iterative.FailureSet', 'Failure set')}</Chip
          >
        {/if}
      </div>
    {/snippet}
    {#snippet body(group, index)}
      <div class="manager-iterative-result-set-body">
        <ProducedWhenLines
          lines={group.producedWhen ?? []}
          {sources}
          {counterNames}
          {actions}
          {text}
          onChange={(lines) => write(index, withLines(group, lines))}
        />
        <RecipeResultGroupCard
          {group}
          chromeless
          {componentOptions}
          surface="recipe"
          {resultKinds}
          {isTerminalStep}
          {onOpenComponent}
          onChange={(next) => write(index, next)}
        />
      </div>
    {/snippet}
    {#snippet footer()}
      <li class="manager-iterative-result-set-add">
        <Button
          role="dashed"
          fullWidth
          icon="fas fa-plus"
          data-recipe-add="result-set"
          onclick={() => onChange(addResultGroup(groups))}
          >{text('FABRICATE.Admin.Manager.Recipe.AddResultSet', 'Add result set')}</Button
        >
      </li>
    {/snippet}
  </SortableList>
</section>

<style>
  .manager-iterative-results,
  .manager-iterative-result-set-body {
    display: grid;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  .manager-iterative-result-set-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-iterative-result-set-name {
    display: grid;
    flex: 0 1 260px;
    min-width: 0;
  }

  .manager-iterative-result-set-add {
    list-style: none;
  }
</style>
