<!-- Svelte 5 runes mode -->
<!--
  One panel of the shared vocabulary shell (issue 1915): the head the primitive does not draw, the
  sort toolbar, and `VocabularyPanel` beneath them. Both Tags & Categories screens render this.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `kind` | `recipeCategories` \| `componentCategories` \| `componentTags` | `''` | the SCREEN's vocabulary id, unique among the three mounted panels |
  | `icon` | Font Awesome class | `''` | the head tile's glyph |
  | `title` | string | `''` | already localized by the caller's presentation model |
  | `subline` | string | `''` | says what the retired panel hint used to say |
  | `sortToolbarLabel` | string | `''` | the toolbar's accessible name, already substituted |
  | `sortLabelId` | string | `''` | unique per panel; three copies of one id collapse every reference |
  | `rows` | array | `[]` | UNSORTED; this component sorts by the lifted sort state |
  | `browserState` | bindable object | `null` | both shipped callers bind one, so search and sort survive the route trip |

  Rest spread:
  - `{...rest}` lands on `VocabularyPanel`, written BEFORE `rows`, `hint` and `browserState`, so
    those three stay this component's own. The per-row `silentlyDeletable` and `confirmTokens`
    advertising props reach the primitive through it.

  Invariants:
  - No `aria-label` on the section: the inner `VocabularyPanel` section is the landmark, and a
    second one would name the same region twice.
  - `hint` is always empty, because the head carries a SUBLINE saying what the hint would say.
  - The five `:global` repairs stay chained onto `.manager-toolbar`: the class sits on a COMPONENT
    tag, and a bare (0,1,0) would win ties it has no business in.
  - Pinned by `tests/components/world-vocabulary-control-row-cascade.test.js` and
    `tests/manager-browser-view-state-contract.test.js`.
-->
<script>
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';
  import { createVocabularyBrowserState } from '../../../model/managerBrowserViewState.js';
  import { localize } from '../../util/foundryBridge.js';
  import VocabularyPanel from './VocabularyPanel.svelte';
  import { sortVocabularyRows, toggledDirection, VOCABULARY_SORT_KEYS } from './vocabularyShell.js';

  let {
    kind = '',
    icon = '',
    title = '',
    subline = '',
    sortToolbarLabel = '',
    sortLabelId = '',
    rows = [],
    browserState = $bindable(null),
    ...rest
  } = $props();

  let ownBrowserState = $state(createVocabularyBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const sortKey = $derived(String(ui.sortKey || 'name'));
  const sortDirection = $derived(ui.sortDirection === 'desc' ? 'desc' : 'asc');
  const sortedRows = $derived(sortVocabularyRows(rows, sortKey, sortDirection));
  const sortKeyOptions = $derived(
    VOCABULARY_SORT_KEYS.map((option) => ({
      id: option.id,
      label: text(option.key, option.fallback),
    }))
  );
</script>

<section class="manager-vocabulary-shell-panel" data-vocabulary-panel={kind}>
  <header class="manager-vocabulary-shell-head">
    <span class="manager-vocabulary-shell-head-icon" aria-hidden="true"><i class={icon}></i></span>
    <div class="manager-vocabulary-shell-head-text">
      <h3 class="manager-checks-card-title">{title}</h3>
      <p class="manager-subtitle">{subline}</p>
    </div>
  </header>

  <ManagerToolbar class="manager-scoped-list-toolbar" ariaLabel={sortToolbarLabel}>
    <!-- A `<span>` rather than a `<label>`: it names TWO controls, and a `<label>` may point at
         one. Its id is PER PANEL, since three copies of one id would collapse the references. -->
    <span class="manager-vocabulary-shell-sort-label" id={sortLabelId}>
      {text('FABRICATE.Admin.Manager.Scoped.List.SortByLabel', 'Sort by')}
    </span>
    <select
      value={sortKey}
      data-vocabulary-sort={kind}
      aria-labelledby={sortLabelId}
      onchange={(event) => (ui.sortKey = event.currentTarget.value)}
    >
      {#each sortKeyOptions as option (option.id)}
        <option value={option.id}>{option.label}</option>
      {/each}
    </select>
    <!-- The direction is a TOGGLE that states its position. `data-keyboard-focus="true"` is not
         decoration: `KeyboardManager#hasFocus` reads `!!focused.form` for a BUTTON and neither
         route renders a `<form>` around it, so without it Space pauses the game behind the
         manager. It stays a bare `<button>` rather than a `ManagerButton` for that reason. -->
    <button
      type="button"
      class="manager-vocabulary-shell-direction"
      data-keyboard-focus="true"
      data-vocabulary-direction={sortDirection}
      aria-pressed={sortDirection === 'asc'}
      title={text('FABRICATE.Admin.Manager.Scoped.List.SortDirection', 'Reverse the sort order')}
      onclick={() => (ui.sortDirection = toggledDirection(sortDirection))}
    >
      {#if sortDirection === 'asc'}
        <i class="fas fa-arrow-down-a-z" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Scoped.List.SortAsc', 'Asc')}</span>
      {:else}
        <i class="fas fa-arrow-up-a-z" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Scoped.List.SortDesc', 'Desc')}</span>
      {/if}
    </button>
  </ManagerToolbar>

  <VocabularyPanel {...rest} rows={sortedRows} hint="" bind:browserState />
</section>

<style>
  /* THE PANEL WEARS THE CARD, not the add form inside it: with nothing on the panel the screen
     drew a bordered add card floating on a bare pane. */
  .manager-vocabulary-shell-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-1);
  }

  /* THE FIVE CONTROL-ROW REPAIRS, all `:global` and the toolbar pair chained onto
     `.manager-toolbar`: the class sits on a COMPONENT tag, and a bare (0,1,0) would win ties it
     has no business in. */

  /* THE SELECT WIDTH, AND WHY IT CANNOT BE LEFT TO THE SHEET: core sizes every `<select>` to
     `width: 100%`, and the only shipped repair is in a component neither route renders.
     Measured at 481px on a cold open and 62px once a GM had visited a catalogue first. */
  :global(.manager-vocabulary-shell-panel .manager-toolbar.manager-scoped-list-toolbar select) {
    flex: 0 1 auto;
    width: auto;
    min-width: 0;
  }

  /* THE ADD FORM RUNS FLUSH, because the PANEL is the card now; its own fill sits two rungs above
     the panel's, so inside one it is a card in a card brighter than the rows below it. */
  :global(.manager-vocabulary-shell-panel .manager-vocabulary-form) {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  :global(.manager-vocabulary-shell-panel .manager-vocabulary-desc:empty) {
    display: none;
  }

  /* EVERY CONTROL SITS ONE RAMP RUNG BELOW THE PANEL, which is a relationship rather than a
     colour: left alone they inherit the control rung, which is the PANEL's own fill. */
  :global(.manager-vocabulary-shell-panel select),
  :global(.manager-vocabulary-shell-panel .manager-search input),
  :global(.manager-vocabulary-shell-panel .manager-vocabulary-form input) {
    background: var(--fab-bg-0);
  }

  /* THE BAND IS FLATTENED: `.manager-toolbar`'s fill and bottom hairline read inside a panel card
     as a lit raised strip the reference does not draw. REMOVED rather than replaced. */
  :global(.manager-vocabulary-shell-panel .manager-toolbar.manager-scoped-list-toolbar) {
    padding: 0;
    border-bottom: 0;
    background: transparent;
  }

  /* The head the primitive does not draw: the retired tabbed screen had a tab label, this has none. */
  .manager-vocabulary-shell-head {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  /* The same 34px leading tile the rows carry, so head and rows share one left edge. */
  .manager-vocabulary-shell-head-icon {
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

  .manager-vocabulary-shell-head-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* `SORT BY`, with the shipped sibling's metrics so both screens read as one control vocabulary. */
  .manager-vocabulary-shell-sort-label {
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
  .manager-vocabulary-shell-direction {
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
</style>
