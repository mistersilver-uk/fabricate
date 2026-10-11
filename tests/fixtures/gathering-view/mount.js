/**
 * Mount the real gathering view, whose listing resolves `?count=` environments (7 by default, one
 * more than its smallest page), in the shared player-window host, `?width=` wide.
 */
import { mount } from 'svelte';

import en from '../../../lang/en.json';
import GatheringView from '../../../src/ui/svelte/apps/gathering/GatheringView.svelte';
import { playerViewHost } from '../player-view-host.js';
import { installFixtureI18n } from '../select-fixture-shared.js';

installFixtureI18n(en);

const count = Number(new URLSearchParams(location.search).get('count') ?? 7);
const environments = Array.from({ length: count }, (_, i) => ({
  id: `env-${i}`,
  name: `Environment ${i}`,
  img: '',
  description: 'A gently rolling field.',
  locked: false,
  selectionMode: 'targeted',
  revealPolicy: 'never',
  risk: 'safe',
  attemptable: true,
  discoveredTaskCount: 0,
  composedTaskCount: 1,
  biomeTags: [],
  tasks: [
    {
      id: `task-${i}`,
      name: 'Gather Iron',
      description: 'Dig for ore.',
      img: '',
      attemptable: true,
      blockedReasons: [],
      successChance: 0.5,
    },
  ],
  discoveredTasks: [],
  events: [],
}));
const services = {
  listGatheringForActor: () =>
    Promise.resolve({ visible: true, selectedActorId: 'Actor.actor-1', environments }),
};

mount(GatheringView, { target: playerViewHost(), props: { services } });
