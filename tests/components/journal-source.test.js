// Source-pin contract for the player Journal screen (Slice B), mirroring
// gathering-environments-source.test.js. These string assertions fail at test
// time when load-bearing wiring drifts: the shell branch + nav badge + shell
// refresh, the two-zone container-query grid, the status vocabulary, and the global
// CSS treatments. Keep names stable or update these in lockstep.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(relPath) {
  return readFileSync(resolve(__dirname, relPath), 'utf8');
}

const rootSource = read('../../src/ui/svelte/apps/FabricateAppRoot.svelte');
const viewSource = read('../../src/ui/svelte/apps/journal/JournalView.svelte');
const detailSource = read('../../src/ui/svelte/apps/journal/RunDetail.svelte');
const statusSource = read('../../src/ui/svelte/apps/journal/journalRunStatus.js');
const actionsSource = read('../../src/ui/svelte/apps/journal/ActionsPanel.svelte');
const builderSource = read('../../src/systems/RunJournalBuilder.js');
const cssSource = read('../../styles/fabricate.css');
const enLang = JSON.parse(read('../../lang/en.json'));

function resolveLangKey(key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), enLang);
}

describe('FabricateAppRoot Journal wiring', () => {
  it('renders JournalView on the journal tab (every tab now routes to a real view)', () => {
    assert.ok(rootSource.includes("import JournalView from './journal/JournalView.svelte'"), 'imports JournalView');
    // `tab.tabId`, not `tab.id`: a rail entry is addressed by its ROUTE KEY since issue 1198
    // and carries the bare tab id separately, so a Core branch reads the bare id.
    assert.ok(rootSource.includes("tab.tabId === 'journal'"), 'branches on the journal tab');
    assert.ok(rootSource.includes('<JournalView {services} />'), 'renders JournalView with services');
    assert.ok(!rootSource.includes('fabricate-app-placeholder'), 'the coming-soon placeholder is gone now the alchemy tab is implemented');
  });

  it('feeds an active-run count badge from the shared store navCount', () => {
    assert.ok(rootSource.includes('services?.journal?.navCount'), 'badge count comes from the store navCount getter');
    assert.ok(rootSource.includes('fabricate-app-nav-count'), 'badge element uses the namespaced class');
    assert.ok(rootSource.includes('{#if tab.count > 0}'), 'badge only renders for a positive count');
  });

  it('registers shell-level Journal refresh so the badge stays fresh while the tab is closed', () => {
    assert.ok(rootSource.includes('subscribeWorldTime'), 'shell subscribes to world-time changes');
    assert.ok(rootSource.includes('subscribeSceneChange'), 'shell subscribes to scene changes');
    assert.ok(rootSource.includes('services?.journal?.load?.(true)'), 'shell quietly re-loads on those events');
    assert.ok(rootSource.includes('!store.loadedOnce'), 'shell guards its one-time initial load via loadedOnce');
  });

  it('places the read-only shared world clock in the Journal top bar', () => {
    assert.ok(rootSource.includes("import WorldClockChip from '../components/WorldClockChip.svelte'"));
    assert.ok(rootSource.includes("activeTab === 'journal' && journalWorldClock"));
    assert.ok(rootSource.includes('<WorldClockChip'));
    assert.ok(rootSource.includes('worldTimeLabel('), 'uses the existing calendar formatter');
  });
});

describe('JournalView layout + effects', () => {
  it('uses the prototype two-zone layout and stacks Active, Finished, then Detail', () => {
    const narrowBreakpoint = '@container fabricate-journal (max-width: 960px)';

    assert.ok(viewSource.includes('grid-template-columns: minmax(310px, 0.72fr) minmax(0, 1.8fr)'), 'declares browse and detail tracks');
    assert.ok(viewSource.includes('container: fabricate-journal / inline-size;'), 'establishes the named size container');
    assert.ok(
      viewSource.includes(narrowBreakpoint),
      'uses the shared reachable 960px narrow breakpoint'
    );
    assert.ok(
      viewSource.slice(viewSource.indexOf(narrowBreakpoint)).includes('grid-template-columns: 1fr;'),
      'reflows to a single column at the narrow breakpoint'
    );
    assert.ok(viewSource.includes('.journal-browse-lists {\n      display: contents;'), 'list sections become consecutive stacked regions');
    assert.ok(viewSource.includes('.journal-detail-pane {\n      min-height: 220px;'), 'Detail remains reachable below both lists');
  });

  it('composes the required shared search, kind, status, and independent pager controls', () => {
    assert.ok(viewSource.includes('<div class="journal-search-field">'));
    assert.equal(
      viewSource.includes('<Field as="div" class="journal-search-field">'),
      false,
      'the search primitive is not nested in Field, whose descendant input rules override its chrome'
    );
    assert.ok(
      viewSource.includes('.journal-search-field {\n    display: grid;'),
      'the search caption and primitive use grid so the primitive flex basis cannot grow the header'
    );
    assert.ok(
      viewSource.includes(
        '.journal-search-field > :global(.journal-search-control) {\n    min-width: 0;'
      ),
      'the search primitive can fit the compact search/kind grid without overlapping the kind control'
    );
    assert.ok(viewSource.includes('<ManagerSearchField'));
    assert.ok(viewSource.includes('class="journal-search-control"'));
    assert.ok(viewSource.includes('size="38"'));
    assert.ok(viewSource.includes('<Field as="div" class="journal-kind-field">'));
    assert.ok(viewSource.includes('journal?.activePageItems'));
    assert.ok(viewSource.includes('onPageChange={(value) => journal?.setActivePage?.(value)}'));
    assert.ok(viewSource.includes('onPageChange={(value) => journal?.setHistoryPage?.(value)}'));
  });

  it('reads the shared store', () => {
    assert.ok(viewSource.includes('services?.journal'), 'reads the shared journal store');
  });

  it('reads only the authoritative gathering-yield projection', () => {
    assert.ok(detailSource.includes('run?.gatheringYield'));
    assert.equal(detailSource.includes('run?.yieldScale'), false);
    assert.equal(detailSource.includes('run?.dropRows'), false);
    assert.equal(detailSource.includes('run?.outcomeTiers'), false);
    assert.equal(detailSource.includes('run?.routedTiers'), false);
  });

  it('hosts the re-fetch effects (actor change, scene, world-time tick)', () => {
    assert.ok(viewSource.includes('subscribeSceneChange(() => journal?.load?.(true))'), 'scene-change quiet reload');
    assert.ok(viewSource.includes('subscribeWorldTime('), 'world-time subscription present');
    assert.ok(viewSource.includes('journal?.tickWorldTime?.()'), 'ticks world time so countdowns recompute');
    assert.ok(viewSource.includes('services?.actorBar?.selectedActorId'), 'tracks the selected actor');
  });
});

describe('Journal status vocabulary + actions', () => {
  it('mirrors the RuntimeStatePill vocabulary (ready=green play, waiting=warning hourglass)', () => {
    assert.ok(statusSource.includes('fa-circle-play'), 'ready uses the play icon');
    assert.ok(statusSource.includes('fa-hourglass-half'), 'waiting uses the hourglass icon');
    assert.ok(statusSource.includes('fa-circle-check'), 'succeeded uses the check icon');
    assert.ok(statusSource.includes('fa-circle-xmark'), 'failed uses the xmark icon');
    assert.ok(statusSource.includes("tone: 'success'"), 'ready/succeeded are the success tone');
    assert.ok(statusSource.includes("tone: 'neutral'"), 'cancelled/unknown are the neutral tone');
  });

  it('derives Trigger readiness from the time gate, never from run.status', () => {
    assert.ok(actionsSource.includes('availableAt <= now'), 'readiness is availableAt <= now');
    assert.equal(actionsSource.includes('run.status'), false, 'never reads run.status for readiness');
    assert.ok(actionsSource.includes("import RunActionBar from '../../components/RunActionBar.svelte'"));
    assert.ok(actionsSource.includes('<RunActionBar'));
  });
});

describe('Journal label mirrors resolve in lang/en.json (drift guard)', () => {
  it('every journalRunStatus labelKey resolves to a real localized string', () => {
    const keys = [...statusSource.matchAll(/labelKey:\s*'([^']+)'/g)].map((match) => match[1]);
    assert.ok(keys.length >= 6, 'extracted the status labelKeys from the presentation map');
    for (const key of new Set(keys)) {
      assert.equal(
        typeof resolveLangKey(key),
        'string',
        `journalRunStatus labelKey ${key} must resolve in lang/en.json`
      );
    }
  });

  it('every resolution-mode label key resolves to a real localized string', () => {
    const keys = [...builderSource.matchAll(/'(FABRICATE\.App\.Journal\.Mode\.[A-Za-z]+)'/g)].map(
      (match) => match[1]
    );
    assert.ok(keys.length >= 5, 'extracted the MODE_LABEL_KEYS values from the builder');
    for (const key of new Set(keys)) {
      assert.equal(
        typeof resolveLangKey(key),
        'string',
        `resolution-mode label ${key} must resolve in lang/en.json`
      );
    }
  });
});

describe('Journal global CSS treatments', () => {
  it('adds the player-scoped green primary button overriding Foundry button chrome', () => {
    assert.ok(cssSource.includes('.fabricate-app .fabricate-app-primary-button'), 'primary button rule present');
    assert.ok(
      cssSource.includes('background: var(--fab-success);'),
      'primary button uses the success token (no colour literal)'
    );
    assert.ok(cssSource.includes('height: auto;'), 'overrides Foundry button fixed height');
  });

  it('adds the namespaced nav-count badge with no colour literals', () => {
    assert.ok(cssSource.includes('.fabricate-app .fabricate-app-nav-count'), 'nav-count rule present');
    assert.ok(cssSource.includes('background: var(--fab-success);'), 'badge tokenized');
  });
});
