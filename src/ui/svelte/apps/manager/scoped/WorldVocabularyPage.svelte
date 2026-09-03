<!-- Svelte 5 runes mode -->
<!--
  The world Tags & Categories screen (issue 1392, epic 1357, PR 7a).

  It is NOT a scoped-entity layer: the World Vocabulary holds the vocabularies the scoped
  entities draw FROM, so it has no roster, no world defaults and no membership rows, and its own
  spec section (`## World Vocabulary` in `data-models`) rather than a share of theirs.

  ── THE LAYOUT IS 2-UP PLUS A FULL-WIDTH BAND, AND THE SHAPE IS FORCED ──────────────────────
  The reference draws a two-column grid holding recipe categories and component categories, with
  the component-tag panel as a SIBLING of that grid at full width (`proto:3042`-`3137`), because
  the tag panel's own row list is a wrapping card grid while the two category panels render one
  narrow column each.

  Fabricate cannot draw three columns even if it wanted to. `VocabularyPanel`'s row list is
  `repeat(auto-fill, minmax(340px, 1fr))` (`styles/fabricate.css:8972`), and this route's
  `.manager-main` keeps `overflow-x: hidden`, so a column narrower than that track CLIPS with no
  scrollbar rather than scrolling. At the capture case's 1280px width the main column is about
  1028px inside its inset: two columns give about 506px each and clear the track comfortably;
  three give about 300px inside a card and clip the last 40px of every row - which is exactly
  `.manager-vocabulary-row > .manager-icon-button`, the DELETE control, in full. The View Lab
  case asserts that mechanically with three per-panel `expectContained` entries.

  The grid collapses to one column at the manager's own shipped 1120px rung, because two columns
  need roughly 1012px of container. The rung is reused rather than invented: the sheet already
  restacks `.manager-body` there and this route's own `.manager-body` rule outranks it, so this
  route does not stack on its own and the collapse has to be stated here.

  ── WHAT THIS PAGE OWNS AND WHAT THE PRIMITIVE OWNS ─────────────────────────────────────────
  The page draws each panel's HEAD (icon, title, subline) and its SORT control; the primitive
  draws the add form, the search field, the entry count, the rows and the empty states. The head
  states no entry count: the primitive already publishes one in its own search row, and drawing
  the reference's header count beside it would state one number twice per panel.

  The sort pair sits inside a `<ManagerToolbar class="manager-scoped-list-toolbar">` rather than
  as a bare row, and that is mechanical rather than cosmetic: a `<select>` styled only from this
  file's scoped block compiles to `select.svelte-<hash>` at (0,1,1) and LOSES to Foundry core's
  own element rule - a failure `styles/fabricate.css:9950` records verbatim, where the control
  came out 14px and full width and wrapped the row into three lines. Reusing the shipped host
  takes the global rules already written for it with no edit to that sheet.

  The control DUPLICATES `EntityListInspectorFrame.svelte`'s sort trio by an explicit decision:
  that frame is the composed shell of the three merged entity catalogues, and converting it is
  out of this PR's narrowed scope. The shipped `Scoped.List.Sort*` keys are reused and no sort
  key is minted; extracting a shared `SortControl.svelte` with two callers is a named follow-up.

  ── ONE CHILD OF `<main>`, AND NONE OF THE ROUTE RULE'S PROPERTIES ──────────────────────────
  `[data-manager-view="world-vocabulary"] .manager-main` declares `display: grid`,
  `grid-template-rows: minmax(0, 1fr)`, `min-height`, `min-width`, `overflow-y` and `padding`.
  This block declares NONE of them: an unlayered scoped rule beats that layered sheet rule at any
  specificity, so a redeclared property would silently replace it. And `<main>` renders exactly
  ONE element child, because a second top-level child would get an implicit `auto` row and let
  the explicit row collapse to zero.

  Props: `vocabulary` (the published `worldScope.vocabulary` state), `actions` (the world
  vocabulary action family) and `systems` (the crafting-system roster). `systems` is accepted and
  deliberately not read: every number this screen states is COUNTED by the projection over the
  whole world, so the roster is an input to that count rather than to this page.
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

  // `systems` is DECLARED and deliberately NOT READ, renamed to an underscored local so the
  // lint rule can see that the omission is intentional. Every number this screen states is
  // COUNTED by `projectWorldVocabulary` over the whole world, so the roster is an input to that
  // count rather than to this page; declaring it keeps the shipped call site's three props
  // visible here rather than silently absorbed.
  let { vocabulary = null, actions = null, systems: _systems = [] } = $props();

  // THE ROUTE'S FOUR FACTS, as module constants rather than as attributes on a shared
  // placeholder shell, which is the spelling a REPLACED page uses (issue 1372).
  // `tests/components/manager-contract.test.js` reads the constant FIRST and the attribute only
  // as a fallback, and cross-checks the title key against the one `viewTitle` resolves for this
  // route in the manager root - so a page titled after its sibling reds here rather than being
  // published as a frame. `PAGE_ICON` is the rail leaf's glyph.
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

  /**
   * The primitive's own hint paragraph, DELIBERATELY EMPTY on this screen.
   *
   * On the tabbed system-scope screen it is the only sentence explaining the vocabulary. Here
   * each panel draws a head with a SUBLINE that says the same thing, so rendering both states
   * one idea twice per panel — and pushes the full-width tag band 46px further down a frame that
   * has to hold three panels rather than one.
   */
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

  // PER PANEL, because three panels are mounted at once and each sorts independently. A single
  // shared pair would reorder all three from one control.
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
    // The projection publishes the NUMBERS; the copy that states them is the page's. Each row
    // carries its own already-substituted cascade clause, so a deletion that rewrites nothing
    // says so instead of stating two zeroes. See `cascadeClause`.
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

  // THE PAGE REPORTS THE OUTCOME, and the action family deliberately does not. Foundry already
  // posts its own error for a server-refused world-setting write, so a second notice there would
  // double-notify; what the family cannot say from inside a pure write path is that the GM's
  // deletion did not happen, which is what this line is for.
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
      <!-- A `<span>` rather than a `<label>`, matching the shipped sibling: it names TWO
           controls and a `<label>` may point at only one. Its id is PER KIND, because three
           copies of the frame's hardcoded `scoped-list-sort-label` would send all three
           `aria-labelledby` references to the first one. -->
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
      <!-- The direction is a TOGGLE that states its current position, not a second select.
           `aria-pressed` carries the same fact to a screen reader, and the visible word is what
           makes the state readable without the glyph. -->
      <button
        type="button"
        class="wvocab-direction"
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

<!-- `data-scoped-page` is a LITERAL and not `{PAGE_ID}` (issue 1392): the route map in
     `tests/manager-scoped-prop-contract.test.js` reads it with a quoted-value regexp, and an
     interpolated form would drop this route out of a seven-route assertion. -->
<main class="manager-main" data-scoped-page="world-vocabulary" aria-label={title}>
  <div class="wvocab" data-scoped-vocabulary={PAGE_ID}>
    <!-- ALWAYS RENDERED, EMPTY UNTIL IT HAS SOMETHING TO SAY. `role="alert"` rather than
         `status`: a deletion the GM asked for and did not get is an interruption, not a
         progress note. -->
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
  /* THE ONE CHILD OF `<main>`. It declares no `padding`, no `overflow` and no `grid-template-*`:
     those belong to the route rule in `styles/fabricate.css`, and a scoped block here is
     unlayered, so restating one would silently replace it. */
  .wvocab {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    min-width: 0;
    min-height: 0;
  }

  /* THE 2-UP CATEGORY GRID. Two columns of about 506px at the case's 1280px width, which clears
     `.manager-vocabulary-list`'s 340px card track by a wide margin. */
  .wvocab-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--fab-space-4);
    min-width: 0;
  }

  /* THE COLLAPSE, AT THE MANAGER'S OWN SHIPPED RUNG. `.fabricate-manager` registers the
     `fabricate-manager` container, so this needs no sheet edit. Below it two panel columns can
     no longer both clear the primitive's row track, and a clipped delete button is the failure. */
  @container fabricate-manager (max-width: 1120px) {
    .wvocab-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* THE PANEL WEARS THE CARD, and it is the PANEL rather than the add form inside it.
     `styles/fabricate.css`'s `.manager-vocabulary-form` paints a card too, but that rule belongs
     to the primitive's ADD FORM; with nothing on the panel the screen rendered a bordered add
     card floating on the bare pane, which is the inverse of the reference's own nesting.

     The rungs, stated rather than measured into literals: the reference's panel fill is this
     theme's `--fab-bg-1` exactly under the one-rung ramp shift the manager applies, the edge is
     the shared `--fab-border` hairline, and the radius is the vocabulary family's own 11px
     (`.manager-vocabulary-form` and `.manager-vocabulary-card` both sit there) rather than the
     reference's 12. */
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

  /* ── THE TWO CONTROL-ROW REPAIRS, BOTH `:global`, BOTH SCOPED TO THIS ROUTE ──────────────
     `<ManagerToolbar class="manager-scoped-list-toolbar">` puts the class on a COMPONENT tag, so
     Svelte stamps this component's hash on nothing that carries it and a plain scoped rule would
     be emitted matching nothing. Both are chained onto `.manager-toolbar`, the class the
     primitive writes itself, so each sits at the same (0,3,0) the route attribute plus that pair
     gives — never a bare `:global(.manager-scoped-list-toolbar)`, which would be (0,1,0) and
     would start losing ties it has no business winning. Neither reaches another screen: the
     route attribute is on this page's own `<main>`. */

  /* THE SELECT WIDTH, AND WHY IT CANNOT BE LEFT TO THE SHEET. Foundry core sizes every
     `<select>` to `width: 100%`, and the global `.fabricate-manager .manager-scoped-list-toolbar
     select` block sets no width at all. The only shipped repair lives in
     `EntityListInspectorFrame.svelte`'s scoped block, which is injected only once that component
     renders — and this route never renders it. Measured: the sort select opened at 481px on a
     cold open of this screen (1002px on the full-width tag panel), wrapping the control row onto
     three lines, and "fixed" itself to 62px for the rest of the session as soon as the GM
     visited a world entity catalogue first. A screen whose layout depends on which route was
     opened before it is not a layout. */
  :global(
    [data-scoped-page='world-vocabulary'] .manager-toolbar.manager-scoped-list-toolbar select
  ) {
    flex: 0 1 auto;
    width: auto;
    min-width: 0;
  }

  /* THE ADD FORM RUNS FLUSH INSIDE THE PANEL, because the PANEL is the card now.
     `.manager-vocabulary-form` draws its own card — a `--fab-bg-3` fill two ramp rungs above the
     panel's `--fab-bg-1`, a hairline and an 11px radius — which is right on the tabbed
     system-scope screen, where the form floats on the bare pane. Inside a card it is a card in a
     card, brighter than the panel it sits in and brighter than the rows below it, which sit on a
     3% overlay. The reference runs the row flush and gives only the FIELD any chrome
     (`proto:3049`). Flattening it also reclaims 52px above the tag band.

     The hint paragraph the primitive draws above it is emptied at the call site rather than
     hidden here; this only stops the now-empty element earning the panel's gap. */
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
     colour. The reference paints the panel `--bg2` and every control inside it `--bg1`
     (`proto:3043` against `:3057`-`:3060`); those map to `--fab-bg-1` and `--fab-bg-0` under the
     manager's one-rung shift. Left alone, the select, the search field and the add field all
     inherit the shipped control rung — `--fab-bg-1` — which is the PANEL's own fill, so a
     designed two-tone relationship collapses to one tone and the controls stop reading as
     inset. The direction toggle takes the same rung in its own rule below. */
  :global([data-scoped-page='world-vocabulary'] .wvocab-panel select),
  :global([data-scoped-page='world-vocabulary'] .wvocab-panel .manager-search input),
  :global([data-scoped-page='world-vocabulary'] .wvocab-panel .manager-vocabulary-form input) {
    background: var(--fab-bg-0);
  }

  /* THE BAND IS FLATTENED. `.manager-toolbar` paints an `--fab-overlay-light-03` fill and a
     full-bleed bottom hairline, which inside a panel card reads as a lit raised strip the
     reference does not draw (`proto:3054` runs the control row flush, with no fill and no
     divider). Issue 1373 already flattened the same band on `world-tools`, `world-essences` and
     the system essence browser; this states it for one more route. The overlay is REMOVED rather
     than replaced, so the panel's own fill shows through and no theme's ramp is frozen in. */
  :global([data-scoped-page='world-vocabulary'] .manager-toolbar.manager-scoped-list-toolbar) {
    padding: 0;
    border-bottom: 0;
    background: transparent;
  }

  /* The head the primitive does not draw: on the shipped tabbed screen the tab label names the
     panel, and this screen has no tabs. */
  .wvocab-head {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  /* The same 34px leading tile the vocabulary rows carry, so the head and its rows share one
     left edge. */
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
    /* THE ACCENT ROLE, not muted ink. The reference gives each panel head's glyph the accent
       (`proto:3045`, `:3075`), and `--fab-accent` is that value. The tag head's own distinct hue
       is a different question and stays with the change that draws the tag pill. */
    color: var(--fab-accent);
  }

  .wvocab-head-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* `SORT BY`, the tracked micro-label before the key select. Its metrics match the shipped
     sibling's so the two screens read as one control vocabulary. */
  .wvocab-sort-label {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 0.58rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* The direction toggle. Its metrics are re-authored here rather than inherited, because a
     scoped rule cannot cross a component boundary and a bare `<button>` otherwise falls under
     Foundry's own host button rule, which centres content and pins a fixed height. The numbers
     are the shipped pair's: 34px tall, `--fab-space-2` inline padding, 9px radius, on the
     control rung the selects beside it sit on. */
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
    /* One rung BELOW the panel, matching the select and the two fields beside it — see the
       control-rung rule above. The shipped pair's `--fab-bg-1` is the control rung on a screen
       whose pane is `--fab-bg-0`; inside a `--fab-bg-1` panel it is the panel's own fill. */
    background: var(--fab-bg-0);
    color: var(--fab-text);
    font-size: var(--fab-recipe-control-font);
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  /* The failure line for a deletion that did not land. It is rendered at MOUNT and filled
     later, never created together with its text: a live region inserted into the document at the
     same moment as its content is not reliably announced, because the assistive technology has
     nothing to observe a change against. */
  .wvocab-status {
    margin: 0;
    color: var(--fab-danger-text);
    font-size: 0.72rem;
  }

  /* An empty region is a zero-height flex item that still earns the column's gap, so the gap is
     cancelled rather than the element hidden — `display: none` would take the region out of the
     accessibility tree and undo the whole point of rendering it early. */
  .wvocab-status:empty {
    /* `:empty` cancels the column GAP; the element itself still generates a line box at this
       font size, so the height is zeroed too. Not `display: none`, which would take the region
       out of the accessibility tree and undo the reason it is rendered early at all. */
    height: 0;
    overflow: hidden;
    margin-block-end: calc(-1 * var(--fab-space-4));
  }
</style>
