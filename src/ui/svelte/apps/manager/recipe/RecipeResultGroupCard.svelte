<!-- Svelte 5 runes mode -->
<!--
  One result set in `SetCard`, its routing line `RouteSources` on a routed recipe, each item a
  `PickerRow` naming a component, a currency or a taught recipe, with a fixed or rolled amount,
  drawn through the result-side `ChoiceGroup`, which also draws a choice group's box; or on a
  progressive set, `ProgressiveStageList`'s stages.
  Emitted as a shallow-updated copy through `onChange(nextGroup)`. On a recipe every item it
  creates carries an id and its kind's empty subject (`KindAdder`), and focus moves to its
  name field; on a gathering task it names the picked component. An empty group or an unnamed item
  is gated at the save path (`Recipe.validate`), not here, and on a non-terminal step an empty group
  is a finished state rather than a draft (issue 1907).

  Invariants:
  - Rows, flat and staged, are keyed by `resultRowKeys`: an id's first occurrence by the id, a
    duplicate or id-less row by a unique stand-in, because a row's Fixed | Rolled state is per
    instance. Deleting the first of two rows sharing an id hands its instance to the survivor —
    pinned by `tests/components/recipe-result-card-mounted.test.js`.
  - A row's amount error is the save path's own floor, `quantityFormulaErrors` (`resultRows.js`).
-->
<script>
  import { localizeOr } from '../../../util/localizeOr.js';
  import { isChoiceGroup } from '../../../../../utils/choiceGroupShape.js';
  import ChoiceGroup from '../../../components/ChoiceGroup.svelte';
  import { emptyResult, fromValue } from '../../../components/pickerRowKinds.js';
  import { newDraftId as newId } from '../../../util/draftId.js';
  import { createPendingFocus } from '../../../util/pendingFocus.js';
  import {
    componentCatalogue,
    resultRowKeys,
    withAddedResult,
  } from '../../../components/resultRows.js';
  import KindAdder from '../../../components/KindAdder.svelte';
  import RouteSources from '../../../components/RouteSources.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import SetCard from '../../../components/SetCard.svelte';
  import ProgressiveStageList from '../ProgressiveStageList.svelte';
  import {
    complicationMacroNames,
    complicationTriggerLabels,
  } from '../complicationVocabularies.js';
  import { defaultSetName } from './setDrafts.js';

  let {
    group = {},
    chromeless = false,
    componentOptions = [],
    // `'recipe'` draws the `Result` adder over `resultKinds` (`recipeResultKinds(…)`), appending an
    // empty row; any other surface, a gathering task's, picks a component and raises a fixed row
    // already producing it. Only a recipe's flat rows are reward rows.
    surface = 'gathering',
    resultKinds = null,
    // `'ingredientSet'` or `'check'` draws `RouteSources` from the section's routing rows:
    // `sources`, `candidates` and `assigned` in its shapes, `sharedCount` the sources reaching
    // this set, `unreachable` whether none does, `assignNote` atop Assign's panel, and
    // `onRoute(id, add)` an Assign choice or a chip's removal. Any other provider names the set.
    routingProvider = null,
    sources = [],
    candidates = [],
    assigned = [],
    sharedCount = 0,
    unreachable = false,
    assignNote = '',
    onRoute = () => {},
    // The routed check's tier state, read by the empty hint: whether it has ANY tier, and whether
    // its failure-result policy permits results on a failed check, which the failure set's note reads.
    outcomeTiersDefined = false,
    failureResultsAllowed = false,
    // The set's index in its scope, naming an unnamed set "Set N"; `null` off a recipe.
    setIndex = null,
    // The two-slot editor (`SetCard`'s reserved form): `staticLabel` is the slot's fixed name and
    // `reservedRole` its role, `'success'` or `'failure'`, which states how the slot is produced.
    staticLabel = '',
    reservedRole = '',
    // Progressive systems award the group's results in ORDER — the award loop spends the check
    // budget down the list — so each row grows a reorder affordance. Other modes render as-is.
    progressive = false,
    // Whether this card's scope is the recipe, or the terminal step of a multi-step recipe. Only
    // a terminal scope must produce, so an empty group elsewhere is authored intent (issue 1907).
    isTerminalStep = true,
    onChange = () => {},
    onRemove = () => {},
    // Deep link from a progressive row's read-only difficulty badge to the component editor.
    onOpenComponent = () => {},
    // The system's script macros and check triggers, which a stage's complication sentence names.
    macroOptions = [],
    complicationTriggerOptions = [],
  } = $props();

  const macroNames = $derived(complicationMacroNames(macroOptions));
  const triggerLabels = $derived(complicationTriggerLabels(complicationTriggerOptions));

  // THE CONTROL HALF of the validation row action. An unrouted-result-set warning is about THIS
  // set's routing, so the card is the destination and `recipeReadiness.js` addresses it as
  // `result-group-<id>` — the same literal on both sides, held together behaviourally by the pair
  // of gates that file's header names. An id-less draft group gets no address.
  const validationTarget = $derived(group?.id ? `result-group-${group.id}` : undefined);

  const results = $derived(Array.isArray(group?.results) ? group.results : []);
  const rowKeys = $derived(resultRowKeys(results));

  // A splice emits the reordered group; the drag and keyboard halves are the list's (issue 1512).
  function reorderItem(from, to) {
    if (from === to || from < 0 || to < 0 || from >= results.length || to >= results.length) return;
    const next = results.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...group, results: next });
  }

  // Both halves of reorder are the list's now (issue 1512), and so are the read-the-name-first
  // rule this file established, the focus move and the polite live region.
  const componentOf = (item) =>
    (componentOptions || []).find((option) => option.id === item?.componentId);

  function componentNameFor(item) {
    return (
      componentOf(item)?.name ||
      localizeOr('FABRICATE.Admin.Manager.Recipe.UnnamedResult', 'this result')
    );
  }

  const routed = $derived(routingProvider === 'check' || routingProvider === 'ingredientSet');
  const cardTone = $derived.by(() => {
    if (reservedRole === 'failure') return 'danger';
    if (reservedRole === 'success') return 'success';
    return routed && unreachable ? 'warning' : '';
  });
  const removeAction = $derived([
    {
      id: 'remove',
      label: localizeOr('FABRICATE.Admin.Manager.Recipe.RemoveResultSet', 'Remove result set'),
      icon: 'fas fa-trash',
      danger: true,
      data: { 'data-recipe-remove': 'result-set' },
    },
  ]);
  const implicitLine = $derived.by(() => {
    if (reservedRole === 'failure') {
      return localizeOr(
        'FABRICATE.Admin.Manager.Recipe.RoutingImplicitFailure',
        'a failed check — no assignment'
      );
    }
    if (reservedRole !== 'success') return '';
    return localizeOr(
      'FABRICATE.Admin.Manager.Recipe.RoutingImplicitSuccess',
      'a passed check — no assignment'
    );
  });

  const recipeSurface = $derived(surface === 'recipe');
  const offer = $derived(
    recipeSurface && resultKinds
      ? resultKinds
      : { kinds: ['component'], readonlyKinds: [], catalogue: componentCatalogue(componentOptions) }
  );
  const kinds = $derived(progressive ? ['component'] : offer.kinds);
  const componentPickerOptions = $derived(
    (componentOptions || []).map(({ id, name, img }) => ({ id, label: name, img }))
  );

  // A stage's delete names its component, as a flat row's remove does.
  const removeNameFor = (item) =>
    localizeOr('FABRICATE.Admin.Manager.Recipe.RemoveNamed', 'Remove {name}', {
      name: componentNameFor(item),
    });

  // Spread the existing group so its id and name, which routing references, survive.
  function setName(name) {
    onChange({ ...group, name });
  }
  const namePlaceholder = $derived(
    setIndex == null
      ? localizeOr('FABRICATE.Admin.Manager.Recipe.ResultSetNamePlaceholder', 'Result set name')
      : defaultSetName(setIndex)
  );

  let root = $state(null);
  // The control focus moves to once the row at `at` renders: `at` -1 is the set's adder.
  const pendingFocus = createPendingFocus({ keepUntilHeld: true });
  const FIRST_CONTROL = 'button:not([disabled]), input:not([disabled])';
  const ROWS = '[data-recipe-result-item], [data-recipe-result-group]';

  // An unwrapped group remounts as its last alternative under that alternative's id, taking the
  // focused remove with it, so focus moves to the survivor's `or…`.
  function updateItem(index, nextItem) {
    if (isChoiceGroup(results[index]) && !isChoiceGroup(nextItem)) {
      pendingFocus.arm({ at: index, selector: '.manager-recipe-or-trigger' });
    }
    onChange({ ...group, results: results.map((item, i) => (i === index ? nextItem : item)) });
  }

  // A removed row's focus moves to the row taking its place, else the one before, else the adder.
  function removeItem(index) {
    const at = Math.min(index, results.length - 2);
    pendingFocus.arm({ at, selector: at < 0 ? '[data-recipe-add]' : FIRST_CONTROL });
    onChange({ ...group, results: results.filter((_, i) => i !== index) });
  }

  const addAResult = $derived(
    localizeOr('FABRICATE.Admin.Manager.Recipe.AddAResult', 'Add a result')
  );
  const openComponentHint = $derived(
    localizeOr(
      'FABRICATE.Admin.Manager.Recipe.OpenComponentDifficulty',
      'Edit difficulty and complications on the component'
    )
  );
  const stageLabel = $derived(
    localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultStage', 'Add result stage')
  );

  // Always appends, the row naming its own subject: a recipe set never bumps a quantity, and a
  // progressive award loop ignores `quantity`, so repeating a component asks for more of it.
  function addItem(kind) {
    const added = progressive ? { id: newId(), componentId: null } : emptyResult(kind, newId());
    pendingFocus.arm({ at: results.length, selector: '[data-recipe-option-search]' });
    onChange({ ...group, results: [...results, added] });
  }

  // The card holds the pending focus because the control that asked for it may not survive the
  // edit: a progressive set's first stage moves the adder into the list's footer, a new instance.
  // `results` and `root` are read first so the effect tracks every edit.
  $effect(() => {
    const [count, host] = [results.length, root];
    pendingFocus.settle(
      ({ at }) => host && count > at,
      ({ at, selector }) =>
        (at < 0 ? root : root?.querySelectorAll(ROWS)[at])?.querySelector(selector)?.focus()
    );
  });

  // THE THREE-WAY EMPTY HINT, a guard chain rather than nested ternaries, and its ORDER is the
  // point: "there are no tiers" must be answered before "none can be offered", or a system with
  // no outcome tiers at all would be told to change a policy.
  const emptyHint = $derived.by(() => {
    if (routingProvider !== 'check') return '';
    if (!outcomeTiersDefined) {
      return localizeOr(
        'FABRICATE.Admin.Manager.Recipe.RoutingNoOutcomeTiers',
        'Define outcome tiers in the routed crafting check first.'
      );
    }
    if (!failureResultsAllowed) {
      return localizeOr(
        'FABRICATE.Admin.Manager.Recipe.RoutingNoSuccessOutcomeTiersPolicy',
        'Every outcome tier on this check is a failure, and this system produces nothing on a failed check. Mark a tier as a Success, or let failed checks produce a result on the crafting check’s On failure section.'
      );
    }
    return localizeOr(
      'FABRICATE.Admin.Manager.Recipe.RoutingNoSuccessOutcomeTiers',
      'No outcome tier is marked as a Success. Mark one as Success in the crafting check to route a result set to it.'
    );
  });
</script>

<SetCard
  bind:element={root}
  variant={chromeless ? 'bare' : staticLabel ? 'reserved' : 'default'}
  tone={cardTone}
  kicker={localizeOr('FABRICATE.Common.SetCard.Kicker.ResultSet', 'Result set')}
  name={staticLabel || group?.name || ''}
  {namePlaceholder}
  nameProps={staticLabel
    ? { 'data-recipe-result-set-static-label': '' }
    : { 'data-recipe-result-set-field': 'name' }}
  onRename={setName}
  actions={removeAction}
  onAction={(id) => {
    if (id === 'remove') onRemove();
  }}
  sources={routed || reservedRole ? routeLine : undefined}
  note={sharedCount > 1 ? sharedNote : reservedRole === 'failure' ? failureNote : undefined}
  adder={!progressive || results.length === 0 ? adderSlot : undefined}
  children={reservedRole === 'failure' && results.length === 0 ? undefined : body}
  data-recipe-set
  data-recipe-result-set-id={group?.id || ''}
  data-recipe-set-role={reservedRole || undefined}
  data-validation-target={validationTarget}
  tabindex="-1"
  data-keyboard-focus="true"
/>

<!-- An empty failure set is optional rather than a gap, so it draws no body at all. -->
{#snippet body()}
  {#if results.length === 0 && !isTerminalStep}
    <p class="manager-muted" data-recipe-result-empty>
      {localizeOr(
        'FABRICATE.Admin.Manager.Recipe.ResultSetEmptyIntermediatePanel',
        'Nothing produced on this step — it only advances the craft.'
      )}
    </p>
  {:else if results.length === 0}
    <!-- Danger-bordered dashed panel: an outcome that produces nothing is a gap. -->
    <div class="manager-recipe-result-empty" data-recipe-result-empty>
      <p class="manager-muted">
        {localizeOr(
          'FABRICATE.Admin.Manager.Recipe.ResultSetEmptyPanel',
          'Nothing produced on this outcome.'
        )}
      </p>
    </div>
  {:else if progressive}
    <!-- Progressive is the shared ordered stage list (issues 1512, 2511). `removeData` keeps
         `data-recipe-remove="result-item"`, the hook the mounted suites and the smoke harness
         address a stage's delete by. -->
    <ProgressiveStageList
      items={results}
      itemKey={(_item, index) => rowKeys[index]}
      {componentOptions}
      activity="crafting"
      {kinds}
      catalogue={offer.catalogue}
      recipeItemHook
      rowData={() => ({ 'data-recipe-result-row': '' })}
      removeData={(item) => ({
        'data-recipe-remove': 'result-item',
        ariaLabel: removeNameFor(item),
        title: removeNameFor(item),
      })}
      difficultyDataAttr="data-recipe-result-difficulty"
      editDataAttr="data-recipe-result-edit"
      itemLabel={componentNameFor}
      dcLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.DifficultyShort', 'DC')}
      dcUnsetLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.DifficultyUnset', 'No difficulty')}
      editLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.EditDifficulty', 'Edit')}
      editTitle={openComponentHint}
      editAriaLabel={(item) => `${openComponentHint} — ${componentOf(item)?.name}`}
      {macroNames}
      {triggerLabels}
      adderClass="fabricate-set-card-adder"
      onItemChange={(item, index, value) => updateItem(index, fromValue(item, value))}
      onReorder={(from, to) => reorderItem(from, to)}
      onRemove={(item) => removeItem(results.indexOf(item))}
      adder={resultAdder}
      {onOpenComponent}
    />
  {:else}
    <div class="manager-recipe-ingredient-set-groups">
      {#each results as item, index (rowKeys[index])}
        <ChoiceGroup
          side="result"
          group={item}
          {offer}
          reward={recipeSurface}
          onChange={(next) => updateItem(index, next)}
          onRemove={() => removeItem(index)}
        />
      {/each}
    </div>
  {/if}
{/snippet}

<!-- The adder follows the empty message (issue 1512): a footer of a list that is not rendered
     cannot render, so at zero results and on every non-progressive set it is the card's adder. -->
{#snippet adderSlot()}{@render resultAdder()}{/snippet}

{#snippet routeLine()}
  <RouteSources
    {sources}
    {candidates}
    {assigned}
    implicitLabel={implicitLine}
    unreachable={routed && unreachable}
    emptyLabel={emptyHint}
    assignLabel={localizeOr('FABRICATE.Common.RouteSources.AssignTo', 'Assign to {name}', {
      name: group?.name || namePlaceholder,
    })}
    {assignNote}
    onAssign={(id) => onRoute(id, true)}
    onRemove={(id) => onRoute(id, false)}
  />
{/snippet}

{#snippet sharedNote()}
  {#if routingProvider === 'check'}
    {localizeOr(
      'FABRICATE.Admin.Manager.Recipe.RoutingSharedOutcomeTiers',
      '{count} outcome tiers route here, so editing these results changes what each of them awards.',
      { count: sharedCount }
    )}
  {:else}
    {localizeOr(
      'FABRICATE.Admin.Manager.Recipe.RoutingSharedIngredientSets',
      '{count} ingredient sets route here, so editing these results changes what each of them awards.',
      { count: sharedCount }
    )}
  {/if}
{/snippet}

{#snippet failureNote()}
  {#if failureResultsAllowed}
    <span data-recipe-failure-set-note="optional"
      >{localizeOr(
        'FABRICATE.Admin.Manager.Recipe.FailureSetOptionalNote',
        'Optional. Leave it empty and a failed check produces nothing.'
      )}</span
    >
  {:else}
    <span data-recipe-failure-set-note="policy"
      >{localizeOr(
        'FABRICATE.Admin.Manager.Recipe.FailureSetPolicyNote',
        'This system produces nothing on a failed check, so this set awards nothing.'
      )}</span
    >
  {/if}
{/snippet}

{#snippet resultAdder()}
  {#if recipeSurface}
    <KindAdder
      {kinds}
      label={progressive
        ? stageLabel
        : localizeOr('FABRICATE.Admin.Manager.Recipe.ResultAdder', 'Result')}
      ariaLabel={progressive ? stageLabel : addAResult}
      heading={addAResult}
      hook="result"
      triggerHook="result-item"
      menuClass="manager-recipe-or-menu manager-recipe-result-menu"
      onAdd={addItem}
    />
  {:else}
    <SearchablePopover
      options={componentPickerOptions}
      pickerClass="manager-recipe-component-picker manager-recipe-add-component"
      triggerButton={{ role: 'dashed' }}
      triggerClass="manager-recipe-add-component-trigger manager-recipe-add-result"
      triggerIcon="fas fa-plus"
      triggerLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultItem', 'Add item')}
      ariaLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultItem', 'Add item')}
      triggerAddMarker="result-item"
      panelLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
      searchPlaceholder={localizeOr(
        'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
        'Search components...'
      )}
      searchLabel={localizeOr(
        'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
        'Search components...'
      )}
      emptyHint={localizeOr(
        'FABRICATE.Admin.Manager.Recipe.NoComponentsDefined',
        'No components defined'
      )}
      showChevron={false}
      onSelect={(id) => onChange({ ...group, results: withAddedResult(results, id, newId()) })}
    />
  {/if}
{/snippet}
