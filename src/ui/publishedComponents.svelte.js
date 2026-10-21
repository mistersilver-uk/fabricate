/**
 * The published component seam's Svelte runtime (issue 2426): Fabricate's own `mount`, `unmount`,
 * boundary host, the `flush` a value key's resync runs (issue 2453) and the empty component an
 * overlay container mounts (issue 2454), with each manifest `path` bound to its component.
 * `main.js` imports it for
 * the registration side effect, so the plain seam never imports Svelte.
 */
import { flushSync, mount, unmount, untrack } from 'svelte';

import { publishedComponentSeam } from './publishedComponentSeam.js';
import Avatar from './svelte/components/Avatar.svelte';
import BandedBar from './svelte/components/BandedBar.svelte';
import Button from './svelte/components/Button.svelte';
import Chip from './svelte/components/Chip.svelte';
import EmptyState from './svelte/components/EmptyState.svelte';
import FillBar from './svelte/components/FillBar.svelte';
import InfoStrip from './svelte/components/InfoStrip.svelte';
import InspectorCard from './svelte/components/InspectorCard.svelte';
import Kicker from './svelte/components/Kicker.svelte';
import Medallion from './svelte/components/Medallion.svelte';
import Meter from './svelte/components/Meter.svelte';
import Notice from './svelte/components/Notice.svelte';
import Rail from './svelte/components/Rail.svelte';
import SearchField from './svelte/components/SearchField.svelte';
import StatBox from './svelte/components/StatBox.svelte';
import StatusToggle from './svelte/components/StatusToggle.svelte';
import Stepper from './svelte/components/Stepper.svelte';
import TierTrack from './svelte/components/TierTrack.svelte';
import PublishedComponentHost from './svelte/published/PublishedComponentHost.svelte';

// Keyed by manifest `path`; `published-components-mounted.test.js` holds the two equal.
export const COMPONENTS = Object.freeze({
  'src/ui/svelte/components/TierTrack.svelte': TierTrack,
  'src/ui/svelte/components/Avatar.svelte': Avatar,
  'src/ui/svelte/components/Medallion.svelte': Medallion,
  'src/ui/svelte/components/FillBar.svelte': FillBar,
  'src/ui/svelte/components/Meter.svelte': Meter,
  'src/ui/svelte/components/BandedBar.svelte': BandedBar,
  'src/ui/svelte/components/StatBox.svelte': StatBox,
  'src/ui/svelte/components/InfoStrip.svelte': InfoStrip,
  'src/ui/svelte/components/Kicker.svelte': Kicker,
  'src/ui/svelte/components/Chip.svelte': Chip,
  'src/ui/svelte/components/Rail.svelte': Rail,
  'src/ui/svelte/components/InspectorCard.svelte': InspectorCard,
  'src/ui/svelte/components/EmptyState.svelte': EmptyState,
  'src/ui/svelte/components/Notice.svelte': Notice,
  'src/ui/svelte/components/Button.svelte': Button,
  'src/ui/svelte/components/StatusToggle.svelte': StatusToggle,
  'src/ui/svelte/components/Stepper.svelte': Stepper,
  'src/ui/svelte/components/SearchField.svelte': SearchField,
});

// A Svelte 5 component is a function, and this one draws nothing: an overlay container is mounted
// with it only so Svelte's delegated listeners sit on the container, in whatever document it is.
const EmptyOverlay = () => {};

export const publishedComponentRuntime = Object.freeze({
  host: PublishedComponentHost,
  overlay: EmptyOverlay,
  mount: (host, options) => untrack(() => mount(host, options)),
  // Svelte's own Promise, never an `async` wrapper or `{ outro: true }`: the seam reports its
  // rejection, and either would move that report after `onFault` or let the throw escape.
  unmount: (instance) => unmount(instance),
  flush: () => flushSync(),
});

// ratchet-exempt(lint): main.js imports this module for its registration, as appFactory's apps do.
publishedComponentSeam.register({ ...publishedComponentRuntime, components: COMPONENTS });
