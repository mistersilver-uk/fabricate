/**
 * The published component seam's Svelte runtime (issue 2426): Fabricate's own `mount`, `unmount`
 * and boundary host, with each manifest `path` bound to its component. `main.js` imports it for
 * the registration side effect, so the plain seam never imports Svelte.
 */
import { mount, unmount, untrack } from 'svelte';

import { publishedComponentSeam } from './publishedComponentSeam.js';
import Avatar from './svelte/components/Avatar.svelte';
import BandedBar from './svelte/components/BandedBar.svelte';
import FillBar from './svelte/components/FillBar.svelte';
import InfoStrip from './svelte/components/InfoStrip.svelte';
import Medallion from './svelte/components/Medallion.svelte';
import Meter from './svelte/components/Meter.svelte';
import StatBox from './svelte/components/StatBox.svelte';
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
});

export const publishedComponentRuntime = Object.freeze({
  host: PublishedComponentHost,
  mount: (host, options) => untrack(() => mount(host, options)),
  unmount: (instance) => {
    unmount(instance);
  },
});

// ratchet-exempt(lint): main.js imports this module for its registration, as appFactory's apps do.
publishedComponentSeam.register({ ...publishedComponentRuntime, components: COMPONENTS });
