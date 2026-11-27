/**
 * Mount the real manager nav rows in a side-rail layout, the active row at the position the URL
 * names, optionally as a group's active child, in a collapsed or stacked rail, and expose `__navReveal` so the suite can move the active row (issue 3030).
 */
import { mount } from 'svelte';

import NavRevealHost from './NavRevealHost.svelte';
import { props } from './state.svelte.js';

const params = new URLSearchParams(globalThis.location.search);
props.rows = Number(params.get('rows') ?? 30);
props.activeIndex = Number(params.get('active') ?? 0);
props.grouped = params.has('grouped');

const body = document.createElement('div');
body.className = `manager-body${params.has('collapsed') ? ' is-rail-collapsed' : ''}`;
// A stacked route lets the view's own rules lay the body out; a side rail pins its two columns.
body.style.cssText = params.has('stacked')
  ? 'height: 720px;'
  : 'height: 720px; grid-template-columns: 220px minmax(0, 1fr); grid-template-rows: 720px;';
const root = document.createElement('div');
root.className = 'fabricate fabricate-manager';
root.style.width = `${params.get('width') ?? 1000}px`;
root.dataset.fabricateTheme = 'dark';
root.dataset.managerView = params.get('view') ?? 'world-downtime';
root.append(body);
document.body.append(root);

mount(NavRevealHost, { target: body, props });
Object.assign(globalThis, {
  __navReveal: {
    setActive: (index) => {
      props.activeIndex = index;
    },
  },
});
document.documentElement.dataset.navRevealReady = 'true';
