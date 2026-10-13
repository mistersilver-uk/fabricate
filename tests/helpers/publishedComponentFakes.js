/**
 * The fake runtime the published component seam's plain suites drive it with (issue 2451): three
 * table entries, a DOM-shaped target, a recording runtime, and the refusal matcher.
 */
import assert from 'node:assert/strict';

import { createPublishedComponents } from '../../src/ui/publishedComponentSeam.js';

export const PREFIX = 'Fabricate | published components: ';
export const HOST = Object.freeze({ role: 'host' });
export const ZETA_COMPONENT = Object.freeze({ role: 'Zeta' });
export const ALPHA_COMPONENT = Object.freeze({ role: 'Alpha' });
export const TITLED_COMPONENT = Object.freeze({ role: 'Titled' });

// Entries out of alphabetical order, so `components` must keep table order.
export const ZETA = Object.freeze({
  name: 'Zeta',
  path: 'src/ui/svelte/components/Zeta.svelte',
  version: 3,
  props: { label: { kind: 'data', required: true }, items: { kind: 'data' } },
  rest: true,
  component: ZETA_COMPONENT,
});
export const ALPHA = Object.freeze({
  name: 'Alpha',
  path: 'src/ui/svelte/components/Alpha.svelte',
  version: 1,
  props: { value: { kind: 'data' } },
  rest: false,
  component: ALPHA_COMPONENT,
});
// A required and an optional `text` key beside a `data` one.
export const TITLED = Object.freeze({
  name: 'Titled',
  path: 'src/ui/svelte/components/Titled.svelte',
  version: 1,
  props: {
    title: { kind: 'text', required: true },
    note: { kind: 'text' },
    rank: { kind: 'data' },
  },
  rest: true,
  component: TITLED_COMPONENT,
});
export const TABLE = Object.freeze([ZETA, ALPHA, TITLED]);

const escape = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
export const exactly = (message) => new RegExp(`^${escape(message)}$`);

export function refusal(tail) {
  return (error) => {
    assert.ok(error instanceof TypeError, `a TypeError, not ${error?.constructor?.name}`);
    assert.match(error.message, exactly(PREFIX + tail));
    return true;
  };
}

/** A DOM-shaped target: `nodeType` 1, children, and `contains`. */
export class FakeTarget {
  nodeType = 1;
  childNodes = [];
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes.at(-1) ?? null;
  }
  contains(node) {
    return this.childNodes.includes(node);
  }
  replaceChildren() {
    this.childNodes.length = 0;
  }
}

/**
 * A recording runtime: `mount` appends a root and captures the host's fault callback, and `events`
 * logs each `unmount` beside whatever the test pushes. With both errors it faults, then throws.
 */
export function fakeRuntime({
  mountError = null,
  faultDuringMount = null,
  unmountError = null,
} = {}) {
  const mounts = [];
  const unmounts = [];
  const reports = [];
  const events = [];
  const runtime = {
    host: HOST,
    mount(host, { target, props }) {
      if (mountError) {
        target.childNodes.push({ role: 'partial' });
        if (faultDuringMount) props.onfault(faultDuringMount);
        throw mountError;
      }
      const instance = {
        target,
        root: { role: 'root' },
        updates: [],
        setProps(next) {
          instance.updates.push(next);
        },
      };
      target.childNodes.push(instance.root);
      mounts.push({ host, target, props, instance });
      if (faultDuringMount) props.onfault(faultDuringMount);
      return instance;
    },
    unmount(instance) {
      unmounts.push(instance);
      events.push('unmount');
      if (unmountError) throw unmountError;
      const at = instance.target.childNodes.indexOf(instance.root);
      if (at !== -1) instance.target.childNodes.splice(at, 1);
    },
    report: (...args) => {
      reports.push(args);
    },
  };
  return { runtime, mounts, unmounts, reports, events };
}

export function seamWith({ table = TABLE, isReady = () => true, ...runtimeOptions } = {}) {
  const fake = fakeRuntime(runtimeOptions);
  const seam = createPublishedComponents({ table, isReady, ...fake.runtime });
  return { ...fake, seam, ui: seam.publicApi };
}
