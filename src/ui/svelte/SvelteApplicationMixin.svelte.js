/**
 * SvelteApplicationMixin.svelte.js
 *
 * Production wrapper that wires Svelte 5 reactivity into the core mixin.
 *
 * The `.svelte.js` extension is REQUIRED — Vite + @sveltejs/vite-plugin-svelte
 * processes files with this extension through the Svelte compiler, which makes
 * the `$state` rune available in plain JS.  Plain `.js` files cannot use runes.
 *
 * For unit testing, import `createSvelteApplicationMixin` from
 * `SvelteApplicationMixinCore.js` directly — that file is standard JS and
 * works in Node without any compilation step.
 */
import { mount, unmount } from 'svelte';
import { createSvelteApplicationMixin } from './SvelteApplicationMixinCore.js';

/**
 * ReactivePropsBox wraps a plain object so that its top-level properties
 * are individually reactive via Svelte 5 $state rune semantics.
 *
 * We use a class with a $state field so the rune is used in a valid position
 * (class field initializer), satisfying the Svelte compiler's placement rules.
 */
class ReactivePropsBox {
  _data = $state({});

  constructor(initial) {
    Object.assign(this._data, initial);
  }
}

function createReactiveProps(initial) {
  const box = new ReactivePropsBox(initial);
  return box._data;
}

export default function SvelteApplicationMixin(Base) {
  return createSvelteApplicationMixin(Base, {
    createReactiveProps,
    mountFn: mount,
    unmountFn: unmount
  });
}
