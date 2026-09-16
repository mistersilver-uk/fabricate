<!-- Svelte 5 runes mode -->
<!--
  The world Tags & Categories screen (issue 1392, epic 1357). NOT a scoped-entity layer: the
  World Vocabulary holds the vocabularies scoped entities draw FROM, so it has no roster, no
  world defaults and no membership rows, and its own `## World Vocabulary` spec section.
  THE LAYOUT IS 2-UP PLUS A FULL-WIDTH BAND, AND THE SHAPE IS FORCED: `VocabularyPanel`'s row
  list is `repeat(auto-fill, minmax(340px, 1fr))` and `.manager-main` keeps `overflow-x: hidden`,
  so a third column would CLIP the delete control with no scrollbar. The sort pair sits inside a
  `<ManagerToolbar>` rather than a bare row, because a `<select>` styled only from this file's
  scoped block compiles to (0,1,1) and LOSES to Foundry core's own element rule. `<main>` renders
  exactly ONE element child, and this block declares NONE of the route rule's properties, since
  an unlayered scoped rule beats that layered sheet rule at any specificity.
-->
<script>
  import ManagerToolbar from '../../../components/ManagerToolbar.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import VocabularyPanel from '../VocabularyPanel.svelte';
  import {
    cascadeClause,
    describeVocabularyInput,
    inputNormalizer,
    panelKey,
    panelRows,
    sortVocabularyRows,
    WORLD_VOCABULARY_PANELS,
    WORLD_VOCABULARY_SORT_KEYS,
  } from './worldVocabularyStudio.js';

  // `systems` is DECLARED and deliberately NOT READ; every number here is counted by the projection.
  let { vocabulary = null, actions = null, systems: _systems = [] } = $props();

  // THE ROUTE'S FOUR FACTS, as module constants rather than placeholder-shell attributes.
  // `manager-contract.test.js` cross-checks the title key against `viewTitle`'s own answer.
  const PAGE_ID = 'world-vocabulary';
  const PAGE_ICON = 'fas fa-tags';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.VocabularyTitle';
  const TITLE_FALLBACK = 'Tags & Categories';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /** One panel's localized string. */
  function panelText(panel, field, fallback) {
    return text(panelKey(panel, field), fallback);
  }

  /** Deliberately EMPTY: each panel head carries a SUBLINE saying what the hint would say. */
  const NO_PANEL_HINT = '';

  const title = $derived(text(TITLE_KEY, TITLE_FALLBACK));
  const gridPanels = $derived(WORLD_VOCABULARY_PANELS.filter((panel) => panel.column === 'grid'));
  const bandPanels = $derived(WORLD_VOCABULARY_PANELS.filter((panel) => panel.column === 'full'));
  const sortKeyOptions = $derived(
    WORLD_VOCABULARY_SORT_KEYS.map((option) => ({
      id: option.id,
      label: text(option.key, option.fallback),
    }))
  );

  // PER PANEL, because three panels are mounted at once and each sorts independently.
  let sorts = $state(
    Object.fromEntries(
      WORLD_VOCABULARY_PANELS.map((panel) => [panel.kind, { key: 'name', direction: 'asc' }])
    )
  );
  let statusMessage = $state('');

  function sortOf(panel) {
    return sorts[panel.kind] ?? { key: 'name', direction: 'asc' };
  }

  function setSortKey(panel, key) {
    sorts = { ...sorts, [panel.kind]: { ...sortOf(panel), key } };
  }

  function toggleDirection(panel) {
    const current = sortOf(panel);
    sorts = {
      ...sorts,
      [panel.kind]: { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' },
    };
  }

  function rowsOf(panel) {
    // The projection publishes the NUMBERS and the page states them, per row.
    return panelRows(vocabulary, panel).map((row) => {
      const cascade = cascadeClause(panel, row, text);
      return cascade ? { ...row, confirmTokens: { ...row.confirmTokens, cascade } } : row;
    });
  }

  function sortedRowsOf(panel) {
    const sort = sortOf(panel);
    return sortVocabularyRows(rowsOf(panel), sort.key, sort.direction);
  }

  async function addEntry(panel, value) {
    statusMessage = '';
    return (await actions?.addEntry?.(panel.kind, value)) === true;
  }

  // THE PAGE REPORTS THE OUTCOME and the action family deliberately does not: Foundry already
  // posts its own error, but cannot say from inside a write path that the deletion did not land.
  async function removeEntry(panel, row) {
    statusMessage = '';
    const removed = await actions?.removeEntry?.(panel.kind, row?.id);
    if (removed !== true) {
      statusMessage = text(
        'FABRICATE.Admin.Manager.Scoped.WorldVocabulary.RemoveFailed',
        'Nothing was removed. Check that you can change world settings and try again.'
      );
    }
  }
</script>

{#snippet vocabularyPanel(panel)}
  <section class="wvocab-panel" data-wvocab-panel={panel.kind}>
    <header class="wvocab-head">
      <span class="wvocab-head-icon" aria-hidden="true"
        ><i class={panel.icon || PAGE_ICON}></i></span
      >
      <div class="wvocab-head-text">
        <h3 class="manager-checks-card-title">{panelText(panel, 'Title', '')}</h3>
        <p class="manager-subtitle">{panelText(panel, 'Subline', '')}</p>
      </div>
    </header>

    <ManagerToolbar
      class="manager-scoped-list-toolbar"
      ariaLabel={text(
        'FABRICATE.Admin.Manager.Scoped.WorldVocabulary.SortToolbar',
        'Sort {vocabulary}'
      ).replace('{vocabulary}', panelText(panel, 'Title', ''))}
    >
      <!-- A `<span>` rather than a `<label>`: it names TWO controls, and a `<label>` may point at
           one. Its id is PER KIND, since three copies of one id would collapse the references. -->
      <span class="wvocab-sort-label" id={panel.sortLabelId}>
        {text('FABRICATE.Admin.Manager.Scoped.List.SortByLabel', 'Sort by')}
      </span>
      <select
        value={sortOf(panel).key}
        data-wvocab-sort={panel.kind}
        aria-labelledby={panel.sortLabelId}
        onchange={(event) => setSortKey(panel, event.currentTarget.value)}
      >
        {#each sortKeyOptions as option (option.id)}
          <option value={option.id}>{option.label}</option>
        {/each}
      </select>
      <!-- The direction is a TOGGLE that states its position. `data-keyboard-focus="true"` is not
           decoration: `KeyboardManager#hasFocus` reads `!!focused.form` for a BUTTON and this
           route renders no `<form>`, so without it Space pauses the game behind the manager. -->
      <button
        type="button"
        class="wvocab-direction"
        data-keyboard-focus="true"
        data-wvocab-direction={sortOf(panel).direction}
        aria-pressed={sortOf(panel).direction === 'asc'}
        title={text('FABRICATE.Admin.Manager.Scoped.List.SortDirection', 'Reverse the sort order')}
        onclick={() => toggleDirection(panel)}
      >
        {#if sortOf(panel).direction === 'asc'}
          <i class="fas fa-arrow-down-a-z" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Scoped.List.SortAsc', 'Asc')}</span>
        {:else}
          <i class="fas fa-arrow-up-a-z" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Scoped.List.SortDesc', 'Desc')}</span>
        {/if}
      </button>
    </ManagerToolbar>

    <VocabularyPanel
      label={panelText(panel, 'Title', '')}
      hint={NO_PANEL_HINT}
      inputId={panel.inputId}
      inputLabel={panelText(panel, 'InputLabel', '')}
      inputPlaceholder={panelText(panel, 'Placeholder', '')}
      addLabel={panelText(panel, 'AddLabel', '')}
      rowAttr={panel.rowAttr}
      rows={sortedRowsOf(panel)}
      lockedRow={null}
      emptyTitle={panelText(panel, 'EmptyTitle', '')}
      emptyHint={panelText(panel, 'EmptyHint', '')}
      emptyIcon={panel.emptyIcon}
      searchPlaceholder={panelText(panel, 'SearchPlaceholder', '')}
      searchLabel={panelText(panel, 'SearchLabel', '')}
      searchMissTitle={panelText(panel, 'SearchMiss', 'No matches for "{query}".')}
      removeLabel={panelText(panel, 'RemoveLabel', '')}
      removeNamedLabel={panelText(panel, 'RemoveNamedLabel', '{name}')}
      removeConfirmHint={panelText(panel, 'RemoveConfirm', '')}
      confirmRemoveLabel={text(
        'FABRICATE.Admin.Manager.TagsCategories.ConfirmRemove',
        'Delete anyway'
      )}
      cancelRemoveLabel={text('FABRICATE.Admin.Manager.Cancel', 'Cancel')}
      describeInput={describeVocabularyInput(panel, rowsOf(panel), text)}
      normalize={inputNormalizer(panel.kind)}
      successFeedback={() => panelText(panel, 'AddedFeedback', '')}
      addFailedFeedback={panelText(panel, 'AddFailedFeedback', '')}
      showIcon={false}
      decorativeIcon={panel.decorativeIcon}
      onAdd={(value) => addEntry(panel, value)}
      onRemove={(row) => removeEntry(panel, row)}
    />
  </section>
{/snippet}

<!-- `data-scoped-page` is a LITERAL and not `{PAGE_ID}` (issue 1392): the route map reads it with
     a quoted-value regexp, and an interpolated form would drop this route out of the assertion. -->
<main class="manager-main" data-scoped-page="world-vocabulary" aria-label={title}>
  <div class="wvocab" data-scoped-vocabulary={PAGE_ID}>
    <!-- ALWAYS RENDERED, EMPTY UNTIL IT HAS SOMETHING TO SAY. `role="alert"` rather than
         `status`: a deletion the GM asked for and did not get is an interruption. -->
    <p class="wvocab-status" role="alert" aria-live="assertive" data-wvocab-status>
      {statusMessage}
    </p>
    <div class="wvocab-grid">
      {#each gridPanels as panel (panel.kind)}
        {@render vocabularyPanel(panel)}
      {/each}
    </div>
    {#each bandPanels as panel (panel.kind)}
      {@render vocabularyPanel(panel)}
    {/each}
  </div>
</main>

<style>
  /* THE ONE CHILD OF `<main>`. It declares no `padding`, `overflow` or `grid-template-*`: those
     belong to the route rule, and an unlayered scoped block here would silently replace one. */
  .wvocab {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    min-width: 0;
    min-height: 0;
  }

  /* THE 2-UP CATEGORY GRID: two columns of about 506px at 1280px, clearing the 340px card track. */
  .wvocab-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--fab-space-4);
    min-width: 0;
  }

  /* THE COLLAPSE, AT THE MANAGER'S OWN SHIPPED RUNG; below it a clipped delete button is the failure. */
  @container fabricate-manager (max-width: 1120px) {
    .wvocab-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* THE PANEL WEARS THE CARD, not the add form inside it: with nothing on the panel the screen
     drew a bordered add card floating on a bare pane. */
  .wvocab-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-1);
  }

  /* THE TWO CONTROL-ROW REPAIRS, BOTH `:global` and both chained onto `.manager-toolbar`: the
     class sits on a COMPONENT tag, and a bare (0,1,0) would win ties it has no business in. */

  /* THE SELECT WIDTH, AND WHY IT CANNOT BE LEFT TO THE SHEET: core sizes every `<select>` to
     `width: 100%`, and the only shipped repair is in a component this route never renders.
     Measured at 481px on a cold open and 62px once a GM had visited a catalogue first. */
  :global(
    [data-scoped-page='world-vocabulary'] .manager-toolbar.manager-scoped-list-toolbar select
  ) {
    flex: 0 1 auto;
    width: auto;
    min-width: 0;
  }

  /* THE ADD FORM RUNS FLUSH, because the PANEL is the card now; its own fill sits two rungs above
     the panel's, so inside one it is a card in a card brighter than the rows below it. */
  :global([data-scoped-page='world-vocabulary'] .wvocab-panel .manager-vocabulary-form) {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  :global([data-scoped-page='world-vocabulary'] .wvocab-panel .manager-vocabulary-desc:empty) {
    display: none;
  }

  /* EVERY CONTROL SITS ONE RAMP RUNG BELOW THE PANEL, which is a relationship rather than a
     colour: left alone they inherit the control rung, which is the PANEL's own fill. */
  :global([data-scoped-page='world-vocabulary'] .wvocab-panel select),
  :global([data-scoped-page='world-vocabulary'] .wvocab-panel .manager-search input),
  :global([data-scoped-page='world-vocabulary'] .wvocab-panel .manager-vocabulary-form input) {
    background: var(--fab-bg-0);
  }

  /* THE BAND IS FLATTENED: `.manager-toolbar`'s fill and bottom hairline read inside a panel card
     as a lit raised strip the reference does not draw. REMOVED rather than replaced. */
  :global([data-scoped-page='world-vocabulary'] .manager-toolbar.manager-scoped-list-toolbar) {
    padding: 0;
    border-bottom: 0;
    background: transparent;
  }

  /* The head the primitive does not draw: the shipped tabbed screen has a tab label, this has none. */
  .wvocab-head {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  /* The same 34px leading tile the rows carry, so head and rows share one left edge. */
  .wvocab-head-icon {
    display: inline-flex;
    flex: 0 0 34px;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-3);
    /* THE ACCENT ROLE, not muted ink: the reference gives each panel head's glyph the accent. */
    color: var(--fab-accent);
  }

  .wvocab-head-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* `SORT BY`, with the shipped sibling's metrics so both screens read as one control vocabulary. */
  .wvocab-sort-label {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 0.58rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* The direction toggle. Its metrics are re-authored rather than inherited, because a scoped rule
     cannot cross a component boundary and a bare `<button>` falls under Foundry's host rule. */
  .wvocab-direction {
    display: inline-flex;
    flex: 0 0 auto;
    gap: var(--fab-space-chip);
    align-items: center;
    justify-content: center;
    width: auto;
    height: 34px;
    min-height: 34px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    /* One rung BELOW the panel, matching the select and both fields — see the control-rung rule. */
    background: var(--fab-bg-0);
    color: var(--fab-text);
    /* THE CONTROL TYPE SCALE AS A LITERAL: the property carrying it is declared on
       `.fabricate-manager` and is AREA-scoped, which a component's scoped block cannot assume. */
    font-size: 0.72rem;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  /* The failure line for a deletion that did not land, rendered at MOUNT and filled later: a live
     region inserted with its content is not reliably announced. */
  .wvocab-status {
    margin: 0;
    color: var(--fab-danger-text);
    font-size: 0.72rem;
  }

  /* An empty region still earns the column's gap, so the gap is cancelled rather than the element
     hidden — `display: none` would take it out of the accessibility tree. */
  .wvocab-status:empty {
    /* AN EMPTY LIVE REGION MUST COST NOTHING, and three declarations are needed: `:empty` cancels
       the GAP, `height: 0` collapses the line box, and `min-height: 0` opts out of core's own
       `p:empty { min-height: 1rem }`, which clamps the USED height upwards. Measured at 16px. */
    height: 0;
    min-height: 0;
    overflow: hidden;
    margin-block-end: calc(-1 * var(--fab-space-4));
  }
</style>
