/**
 * The published component seam's Svelte runtime (issue 2426): Fabricate's own `mount`, `unmount`
 * and boundary host, with each manifest `path` bound to its component. `main.js` imports it for
 * the registration side effect, so the plain seam never imports Svelte.
 */
import { mount, unmount, untrack } from 'svelte';

import { publishedComponentSeam } from './publishedComponentSeam.js';
import PublishedComponentHost from './svelte/published/PublishedComponentHost.svelte';

// Keyed by manifest `path`; `tests/published-component-manifest.test.js` holds the two equal.
const COMPONENTS = Object.freeze({});

export const publishedComponentRuntime = Object.freeze({
  host: PublishedComponentHost,
  mount: (host, options) => untrack(() => mount(host, options)),
  unmount: (instance) => {
    unmount(instance);
  },
});

// ratchet-exempt(lint): main.js imports this module for its registration, as appFactory's apps do.
publishedComponentSeam.register({ ...publishedComponentRuntime, components: COMPONENTS });
