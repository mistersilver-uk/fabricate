/**
 * Mount the real journal view in the shared player-window host, `?width=` by `?height=`, with
 * `?active=` and `?finished=` runs (six each by default) paged four at a time, Active showing
 * page `?activePage=` (the first by default).
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import JournalView from '../../../src/ui/svelte/apps/journal/JournalView.svelte';
import { makeCraftingRun, makeSucceededRun } from '../../helpers/journal-fixtures.js';
import { playerViewHost } from '../player-view-host.js';
import { installFixtureI18n } from '../select-fixture-shared.js';

installFixtureI18n(en);

const params = new URLSearchParams(location.search);
const runs = (count, make, prefix) =>
  Array.from({ length: count }, (_, index) => {
    const id = `${prefix}-${index}`;
    return make({ id, key: id, names: { title: `Run ${prefix} ${index}`, subtitle: 'Alchemy' } });
  });
const active = runs(Number(params.get('active') ?? 6), makeCraftingRun, 'active');
const finished = runs(Number(params.get('finished') ?? 6), makeSucceededRun, 'finished');
const PAGE = 4;
const activePage = Number(params.get('activePage') ?? 0);
const journal = {
  listing: { selectedActorId: 'Actor.actor-1', activeRuns: active, history: finished },
  worldTime: 0,
  activePage,
  activePageItems: active.slice(activePage * PAGE, (activePage + 1) * PAGE),
  activeCount: active.length,
  activeCounts: { all: active.length, ready: 0, inProgress: active.length, paused: 0 },
  activePageSize: PAGE,
  historyPageItems: finished.slice(0, PAGE),
  historyCount: finished.length,
  historyPageSize: PAGE,
  load() {},
  setActivePageSize(size) {
    const { dataset } = document.documentElement;
    dataset.activePageSizes = [dataset.activePageSizes, size].filter(Boolean).join(',');
  },
};

mount(JournalView, {
  target: playerViewHost(),
  props: {
    services: {
      journal,
      getWorldTimeComponents: () => ({ secondsPerDay: 86_400 }),
    },
  },
});

document.documentElement.dataset.journalViewReady = 'true';
