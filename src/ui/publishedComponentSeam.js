/**
 * The published component seam, `game.fabricate.api.ui` (issue 2426): a companion mounts a
 * Fabricate primitive into an element it owns and gets back `{ update, destroy, slot }`, draws its
 * own content in a content slot, and is told of a contained fault through `onFault` (issue 2451).
 * Plain JS, so the public API binds it without Svelte; the runtime adapter registers the host,
 * `mount` and `unmount`.
 * The contract is `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
import { PUBLISHED_COMPONENT_MANIFEST } from './publishedComponentManifest.js';
import { PREFIX, SHIPPED_KINDS, copyProps, refuse } from './publishedComponentProps.js';

const FAULT_REPORT = 'Fabricate | Published component render failed:';
const INERT_HANDLE = Object.freeze({ update: () => false, destroy: () => {}, slot: () => null });

/** Each required ancestor root: the selector `target` needs above it, and what M16 says it needs. */
const ROOTS = Object.freeze({
  any: null,
  fabricate: Object.freeze({ selector: '.fabricate', needs: 'a Fabricate window ancestor' }),
  manager: Object.freeze({ selector: '.fabricate-manager', needs: 'a Fabricate manager ancestor' }),
});

const isElementNode = (target) => target?.nodeType === 1;
const hasAncestorBySelector = (target, selector) => Boolean(target.closest?.(selector));
const isFabricateReady = () => globalThis.game?.fabricate?.ready === true;
const reportToConsole = (...args) => console.error(...args);

function describeEntry(entry) {
  const props = {};
  for (const [key, spec] of Object.entries(entry.props)) {
    props[key] = Object.freeze({ kind: spec.kind, required: spec.required === true });
  }
  return Object.freeze({
    version: entry.version,
    props: Object.freeze(props),
    rest: entry.rest === true,
    root: entry.root,
  });
}

function assertKnownEntry(entry) {
  for (const [key, spec] of Object.entries(entry.props)) {
    if (!Object.hasOwn(SHIPPED_KINDS, spec.kind)) {
      throw new Error(`${PREFIX}${entry.name} "${key}" has an unknown kind "${spec.kind}"`);
    }
  }
  if (!Object.hasOwn(ROOTS, entry.root)) {
    throw new Error(`${PREFIX}${entry.name} has an unknown root "${entry.root}"`);
  }
}

/** The entry's keys that are not `data`, as the frozen `{ <key>: <kind> }` the host draws from. */
function contentKinds(entry) {
  const kinds = {};
  for (const [key, spec] of Object.entries(entry.props)) {
    if (spec.kind !== 'data') kinds[key] = spec.kind;
  }
  return Object.freeze(kinds);
}

/**
 * Queues the mount's `onFault(fault)` on the platform microtask queue, after `first` in that same
 * callback, so it never runs inside `mount`, `update` or a Svelte flush. The callback is taken off
 * the record before queueing, so one mount is told once; a throw from it is reported.
 */
function queueFaultNotice(record, fault, report, first = null) {
  const notify = record.onFault;
  record.onFault = null;
  if (!notify && !first) return;
  queueMicrotask(() => {
    first?.();
    if (!notify) return;
    try {
      notify(fault);
    } catch (error) {
      report(FAULT_REPORT, record.name, error);
    }
  });
}

function newRecord(entry, target, onFault) {
  const slots = new Map();
  return { name: entry.name, target, live: true, instance: null, root: null, onFault, slots };
}

/** Gives each `slot` key holding `true` its element, once; the element is kept while live. */
function requestSlots(entry, record, props) {
  for (const [key, spec] of Object.entries(entry.props)) {
    if (spec.kind !== 'slot' || props[key] !== true || record.slots.has(key)) continue;
    const element = record.target.ownerDocument.createElement(spec.element ?? 'div');
    element.style.display = 'contents';
    record.slots.set(key, element);
  }
}

function detachSlots(record) {
  for (const element of record.slots.values()) element.remove();
  record.slots.clear();
}

/** Every other live mount whose target sits in one of `record`'s slot elements, or is one. */
function nestedIn(record, live) {
  const elements = [...record.slots.values()];
  return [...live].filter(
    (other) => other !== record && elements.some((element) => element.contains(other.target))
  );
}

/** The live mount one of whose slot elements contains `target`, or `null`. */
function ownerOf(target, live) {
  for (const record of live) {
    for (const element of record.slots.values()) if (element.contains(target)) return record;
  }
  return null;
}

/**
 * Whether `target` has the ancestor `selector` names (M16). A target inside a slot element that
 * is not attached is judged by the target of the mount owning that element, and so on up; a mount
 * met twice is a cycle, which has no such ancestor.
 */
function underRoot(target, selector, hasAncestor, owner) {
  const met = new Set();
  let judged = target;
  while (!hasAncestor(judged, selector)) {
    const record = owner(judged);
    if (!record || met.has(record)) return false;
    met.add(record);
    judged = record.target;
  }
  return true;
}

/** What the host receives beside its component; `slots` answers a requested key's element. */
function hostPropsFor(entry, record, initial, onfault) {
  return {
    initial,
    onfault,
    kinds: contentKinds(entry),
    slots: (key) => record.slots.get(key) ?? null,
  };
}

function handleFor(entry, record, end) {
  return Object.freeze({
    update(props) {
      if (!record.live) return false;
      const next = copyProps(entry, props);
      requestSlots(entry, record, next);
      record.instance.setProps(next);
      return true;
    },
    destroy: () => end(record),
    slot: (key) => (record.live ? (record.slots.get(key) ?? null) : null),
  });
}

/**
 * The claim and lifecycle of every mount on one seam: `runtime()` reads the registered runtime and
 * `report` receives each fault.
 */
function createMountLifecycle({ runtime, report }) {
  // A target's claim; `live` holds every mount not yet destroyed or faulted.
  const claims = new WeakMap();
  const live = new Set();

  function retire(record) {
    record.live = false;
    live.delete(record);
    if (claims.get(record.target) === record) claims.delete(record.target);
  }

  // A throw is reported, and so is a rejection: the handler goes straight onto what the runtime
  // returned, so a Promise settled inside the call reports before the fault notice queued after it.
  function unmountQuietly(record) {
    const reportFailure = (error) => report(FAULT_REPORT, record.name, error);
    try {
      const result = runtime().unmount(record.instance);
      if (typeof result?.then === 'function') result.then(undefined, reportFailure);
    } catch (error) {
      reportFailure(error);
    }
  }

  // A faulted mount leaves its target empty at once, however the runtime's unmount ended.
  function unmountFaulted(record) {
    unmountQuietly(record);
    record.target.replaceChildren?.();
  }

  // A retired mount's nested mounts end first, and its slot elements leave after its own unmount.
  function close(record, unmount) {
    for (const nested of nestedIn(record, live)) end(nested);
    unmount(record);
    detachSlots(record);
  }

  function end(record) {
    if (!record.live) return;
    retire(record);
    close(record, unmountQuietly);
  }

  // A fault inside the runtime call precedes its instance, so that unmount waits a microtask.
  // Defensive: Svelte 5.56 delivers no fault before its `mount` returns.
  function fault(record, error) {
    if (!record.live) return;
    retire(record);
    report(FAULT_REPORT, record.name, error);
    const unmountLate = () => close(record, () => record.instance && unmountFaulted(record));
    const deferred = record.instance ? null : unmountLate;
    if (!deferred) close(record, unmountFaulted);
    queueFaultNotice(record, error, report, deferred);
  }

  function start(entry, target, initial, onFault) {
    const record = newRecord(entry, target, onFault);
    claims.set(target, record);
    live.add(record);
    requestSlots(entry, record, initial);
    const { components, host, mount } = runtime();
    const onfault = (error) => fault(record, error);
    const component = components[entry.path];
    const props = { component, ...hostPropsFor(entry, record, initial, onfault) };
    try {
      record.instance = mount(host, { target, props });
    } catch (error) {
      retire(record);
      report(FAULT_REPORT, entry.name, error);
      close(record, () => target.replaceChildren?.());
      queueFaultNotice(record, error, report);
      return INERT_HANDLE;
    }
    if (!record.live) return INERT_HANDLE;
    record.root = target.lastChild;
    return handleFor(entry, record, end);
  }

  // A claim holds only while its root is still inside the target; a stale one is destroyed first.
  function claimTarget(target) {
    const held = claims.get(target);
    if (held && held.root && target.contains(held.root)) {
      throw refuse('target already holds a published component');
    }
    if (held) end(held);
    if (target.firstChild) throw refuse('target must be empty');
  }

  const owner = (target) => ownerOf(target, live);
  return { start, claimTarget, owner, liveCount: () => live.size };
}

/**
 * One seam over `table` (the manifest by default). Passing `mount` registers the runtime at once,
 * binding each entry's own `component`; otherwise the adapter calls `register`, once.
 * `hasAncestor(target, selector)` decides an entry's required root, by `closest` unless injected.
 */
export function createPublishedComponents({
  table = PUBLISHED_COMPONENT_MANIFEST,
  host,
  mount,
  unmount,
  report = reportToConsole,
  isElement = isElementNode,
  hasAncestor = hasAncestorBySelector,
  isReady = isFabricateReady,
} = {}) {
  const entries = new Map(table.map((entry) => [entry.name, entry]));
  const descriptions = new Map(table.map((entry) => [entry.name, describeEntry(entry)]));
  let runtime = null;
  const lifecycle = createMountLifecycle({ runtime: () => runtime, report });

  function mountPublished(name, options) {
    if (!runtime) throw new Error(`${PREFIX}not registered`);
    if (!isReady()) throw refuse('mount before ready');
    const entry = entries.get(name);
    if (!entry) throw refuse(`"${String(name)}" is not published`);
    const { target, props = {}, onFault } = options ?? {};
    if (!isElement(target)) throw refuse('target must be an element');
    const root = ROOTS[entry.root];
    if (root && !underRoot(target, root.selector, hasAncestor, lifecycle.owner)) {
      throw refuse(`${entry.name} needs ${root.needs}`);
    }
    lifecycle.claimTarget(target);
    const notify = typeof onFault === 'function' ? onFault : null;
    return lifecycle.start(entry, target, copyProps(entry, props), notify);
  }

  // `async`, so the M3 refusal is a rejection and never a synchronous throw. Every entry is eager
  // today, so there is no code to fetch; it needs neither a runtime nor `fabricate.ready`.
  async function loadPublished(names) {
    for (const name of Array.isArray(names) ? names : [names]) {
      if (!entries.has(name)) throw refuse(`"${String(name)}" is not published`);
    }
  }

  function register(adapter) {
    if (runtime) throw new Error(`${PREFIX}already registered`);
    for (const entry of table) assertKnownEntry(entry);
    const { components, host: adapterHost, mount: adapterMount, unmount: adapterUnmount } = adapter;
    runtime = Object.freeze({
      components,
      host: adapterHost,
      mount: adapterMount,
      unmount: adapterUnmount,
    });
  }

  const publicApi = Object.freeze({
    schemaVersion: 1,
    components: Object.freeze(table.map((entry) => entry.name)),
    describe: (name) => descriptions.get(name) ?? null,
    mount: mountPublished,
    load: loadPublished,
  });

  if (mount) {
    const components = Object.fromEntries(table.map((entry) => [entry.path, entry.component]));
    register({ components, host, mount, unmount });
  }

  return Object.freeze({
    publicApi,
    register,
    bindPublicApi(api) {
      api.ui = publicApi;
      return api;
    },
    liveMountCount: lifecycle.liveCount,
  });
}

// The page-session seam: `bindFabricateGlobal` binds this same `publicApi` at init and at ready.
export const publishedComponentSeam = createPublishedComponents();
