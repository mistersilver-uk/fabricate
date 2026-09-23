<!-- Svelte 5 runes mode -->
<!--
  The world Tags & Categories screen (issue 1392, epic 1357). NOT a scoped-entity layer: the
  World Vocabulary holds the vocabularies scoped entities draw FROM, so it has no roster, no
  world defaults and no membership rows, and its own `## World Vocabulary` spec section.
  Since issue 1915 the layout, the panel card and every cascade repair live in the shared
  `VocabularyShell` + `VocabularyShellPanel` pair, which the system screen renders too; this file
  is the route, its row decoration and its two write paths. `<main>` still renders exactly ONE
  element child, and this file declares no style at all — an unlayered scoped rule would beat the
  `@layer modules` route rule at any specificity, and the shell is where that contract is kept.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { partitionVocabularyPanels } from '../vocabularyShell.js';
  import VocabularyShell from '../VocabularyShell.svelte';
  import VocabularyShellPanel from '../VocabularyShellPanel.svelte';
  import {
    cascadeClause,
    panelRows,
    WORLD_VOCABULARY_PANELS,
    worldPanelProps,
  } from './worldVocabularyStudio.js';

  // `systems` is DECLARED and deliberately NOT READ; every number here is counted by the projection.
  let { vocabulary = null, actions = null, systems: _systems = [] } = $props();

  // THE ROUTE'S FOUR FACTS, as module constants rather than placeholder-shell attributes.
  // `manager-contract.test.js` cross-checks the title key against `viewTitle`'s own answer.
  // Declared for the route contract and rendered by nothing: `data-scoped-page` below must be a
  // literal for the route map's regexp.
  // eslint-disable-next-line no-unused-vars -- see above
  const PAGE_ID = 'world-vocabulary';
  // The route's own glyph, and the fallback a panel head takes when its vocabulary states none.
  const PAGE_ICON = 'fas fa-tags';
  const TITLE_KEY = 'FABRICATE.Admin.Manager.Scoped.VocabularyTitle';
  const TITLE_FALLBACK = 'Tags & Categories';

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const title = $derived(text(TITLE_KEY, TITLE_FALLBACK));
  const placements = partitionVocabularyPanels(WORLD_VOCABULARY_PANELS);

  // PANEL-OWNED, and a STATED EXCEPTION to the lifted browse state: this route has no library
  // search to collide with and its panels die with the route, so search and sort live here.
  let panelStates = $state(
    Object.fromEntries(
      WORLD_VOCABULARY_PANELS.map((panel) => [
        panel.kind,
        { searchTerm: '', sortKey: 'name', sortDirection: 'asc' },
      ])
    )
  );
  let statusMessage = $state('');

  function rowsOf(panel) {
    // The projection publishes the NUMBERS and the page states them, per row.
    return panelRows(vocabulary, panel).map((row) => {
      const cascade = cascadeClause(panel, row, text);
      return cascade ? { ...row, confirmTokens: { ...row.confirmTokens, cascade } } : row;
    });
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

  function propsFor(panel) {
    return worldPanelProps(panel, {
      rows: rowsOf(panel),
      text,
      routeIcon: PAGE_ICON,
      onAdd: addEntry,
      onRemove: removeEntry,
    });
  }
</script>

<!-- `data-scoped-page` is a LITERAL and not `{PAGE_ID}` (issue 1392): the route map reads it with
     a quoted-value regexp, and an interpolated form would drop this route out of the assertion. -->
<main class="manager-main" data-scoped-page="world-vocabulary" aria-label={title}>
  <VocabularyShell {statusMessage}>
    {#snippet grid()}
      {#each placements.grid as panel (panel.kind)}
        <VocabularyShellPanel {...propsFor(panel)} bind:browserState={panelStates[panel.kind]} />
      {/each}
    {/snippet}
    {#snippet full()}
      {#each placements.full as panel (panel.kind)}
        <VocabularyShellPanel {...propsFor(panel)} bind:browserState={panelStates[panel.kind]} />
      {/each}
    {/snippet}
  </VocabularyShell>
</main>
