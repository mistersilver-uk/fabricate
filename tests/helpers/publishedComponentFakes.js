/**
 * The fake runtime the published component seam's plain suites drive it with (issue 2451): three
 * table entries, a DOM-shaped node and its document, a recording runtime, and the refusal matcher.
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
  root: 'any',
  component: ZETA_COMPONENT,
});
export const ALPHA = Object.freeze({
  name: 'Alpha',
  path: 'src/ui/svelte/components/Alpha.svelte',
  version: 1,
  props: { value: { kind: 'data' } },
  rest: false,
  root: 'any',
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
  root: 'any',
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

/** A document whose `createElement` answers a `FakeTarget`; `events` logs each `remove()`. */
export function fakeDocument(events = []) {
  const document = {
    created: [],
    events,
    createElement(tag) {
      const node = new FakeTarget(tag, document);
      document.created.push(node);
      return node;
    },
  };
  return document;
}

/**
 * A DOM-shaped node: `nodeType` 1, a tag, a plain `style`, children that may be plain objects, a
 * deep and inclusive `contains`, and a `remove()` it counts. It has no `closest`.
 */
export class FakeTarget {
  nodeType = 1;
  childNodes = [];
  parentNode = null;
  style = {};
  removals = 0;
  constructor(localName = 'div', ownerDocument = fakeDocument()) {
    this.localName = localName;
    this.ownerDocument = ownerDocument;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes.at(-1) ?? null;
  }
  contains(node) {
    const holds = (child) => child === node || child.contains?.(node) === true;
    return node === this || this.childNodes.some(holds);
  }
  append(node) {
    detach(node);
    node.parentNode = this;
    this.childNodes.push(node);
  }
  remove() {
    this.removals += 1;
    this.ownerDocument.events.push('remove');
    detach(this);
  }
  replaceChildren() {
    this.childNodes.length = 0;
  }
}

function detach(node) {
  const siblings = node.parentNode?.childNodes ?? [];
  if (siblings.includes(node)) siblings.splice(siblings.indexOf(node), 1);
  node.parentNode = null;
}

/** What the host's `slots` answers for each `slot` key, read at the moment of the call. */
const slotsSeen = (props) =>
  Object.fromEntries(
    Object.keys(props.kinds)
      .filter((key) => props.kinds[key] === 'slot')
      .map((key) => [key, props.slots(key)])
  );

/**
 * A recording runtime: `mount` appends a root and captures the host's fault callback, and `events`
 * logs each `unmount` beside whatever the test pushes. With both errors it faults, then throws.
 * An instance keeps what `slots` answered inside `mount` and inside each `setProps`, and
 * `onUnmount(instance)` runs inside each `unmount`. With `unmountResult` an `unmount` leaves its
 * root in place and returns what that function answers.
 */
export function fakeRuntime({
  mountError = null,
  faultDuringMount = null,
  unmountError = null,
  onUnmount = null,
  unmountResult = null,
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
        slotsAtMount: slotsSeen(props),
        slotsAtUpdate: [],
        setProps(next) {
          instance.updates.push(next);
          instance.slotsAtUpdate.push(slotsSeen(props));
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
      onUnmount?.(instance);
      if (unmountError) throw unmountError;
      if (unmountResult) return unmountResult();
      const at = instance.target.childNodes.indexOf(instance.root);
      if (at !== -1) instance.target.childNodes.splice(at, 1);
      return undefined;
    },
    report: (...args) => {
      reports.push(args);
    },
  };
  return { runtime, mounts, unmounts, reports, events };
}

export function seamWith({
  table = TABLE,
  isReady = () => true,
  hasAncestor,
  ...runtimeOptions
} = {}) {
  const fake = fakeRuntime(runtimeOptions);
  const seam = createPublishedComponents({ table, isReady, hasAncestor, ...fake.runtime });
  return { ...fake, seam, ui: seam.publicApi };
}

export const FAULT_REPORT = 'Fabricate | Published component render failed:';

export const zetaProps = (overrides = {}) => ({
  label: 'Rank',
  items: [{ id: 'a' }],
  ...overrides,
});

/** Past every queued microtask, however many each one queues in turn. */
export const drained = () => new Promise((done) => setTimeout(done, 0));
