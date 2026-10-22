/**
 * The published component seam, `game.fabricate.api.ui` (issue 2426): a companion mounts a
 * Fabricate primitive into an element it owns and gets back `{ update, destroy, slot, value }`,
 * draws its own content in a content slot, is told of a contained fault through `onFault` (issue
 * 2451), is told of a press through a callback prop, sets an ARIA attribute on a control through
 * an `aria` prop (issue 2452), reads and sets a bound value through a `value` prop (issue 2453),
 * hosts an entry's overlays through `overlayHost` (issue 2454), and loads a lazy entry and mounts
 * several at once through `mountMany` (issue 2455).
 * Plain JS, so the public API binds it without Svelte; the runtime adapter registers the host,
 * `mount`, `unmount`, `flush`, the empty `overlay` component and each lazy entry's loader.
 * The contract is `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
import { callbackFor, takeCallbacks } from './publishedComponentCallbacks.js';
import { createEntryLoading, lazyBindingFault } from './publishedComponentLoading.js';
import { PUBLISHED_COMPONENT_MANIFEST } from './publishedComponentManifest.js';
import { openOverlayChain, unmountReporting } from './publishedComponentOverlays.js';
import { PREFIX, SHIPPED_KINDS, copyProps, refuse } from './publishedComponentProps.js';
import {
  changeKeyOf,
  seedValues,
  takeValues,
  valueEntryFault,
} from './publishedComponentValues.js';

const FAULT_REPORT = 'Fabricate | Published component render failed:';
const HELD = 'target already holds a published component';
const INERT_HANDLE = Object.freeze({
  update: () => false,
  destroy: () => {},
  slot: () => null,
  value: () => {},
});

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

const OPTIONAL_CALLBACK = Object.freeze({ kind: 'callback', required: false });

// A value key is never required, and its synthesised `on<Key>Change` follows it directly.
function describeEntry(entry) {
  const props = {};
  for (const [key, spec] of Object.entries(entry.props)) {
    const described = { kind: spec.kind, required: spec.required === true };
    if (spec.requiredWhen !== undefined) described.requiredWhen = spec.requiredWhen;
    props[key] = Object.freeze(described);
    if (spec.kind === 'value') props[changeKeyOf(key)] = OPTIONAL_CALLBACK;
  }
  return Object.freeze({
    version: entry.version,
    props: Object.freeze(props),
    rest: entry.rest === true,
    root: entry.root,
    overlays: entry.overlays === true,
  });
}

// The kinds that may state `requiredWhen`: a `slot`, `aria` or `value` key is never required.
const CONDITIONAL_KINDS = new Set(['data', 'text', 'callback']);

/**
 * Whether a key's `requiredWhen` is sound: a string naming another `data` key of the entry that is
 * neither `required` nor `requiredWhen` itself, on a key of a conditional kind that states no
 * `required` (issue 2452).
 */
function isSoundGuard(entry, key, spec) {
  const name = spec.requiredWhen;
  const guard = typeof name === 'string' && Object.hasOwn(entry.props, name) && entry.props[name];
  return (
    Boolean(guard) &&
    name !== key &&
    guard.kind === 'data' &&
    guard.required !== true &&
    guard.requiredWhen === undefined &&
    CONDITIONAL_KINDS.has(spec.kind) &&
    spec.required === undefined
  );
}

function assertKnownEntry(entry) {
  for (const [key, spec] of Object.entries(entry.props)) {
    if (!Object.hasOwn(SHIPPED_KINDS, spec.kind)) {
      throw new Error(`${PREFIX}${entry.name} "${key}" has an unknown kind "${spec.kind}"`);
    }
    if (spec.requiredWhen !== undefined && !isSoundGuard(entry, key, spec)) {
      const other = String(spec.requiredWhen);
      throw new Error(`${PREFIX}${entry.name} "${key}" has an unknown requiredWhen "${other}"`);
    }
  }
  if (!Object.hasOwn(ROOTS, entry.root)) {
    throw new Error(`${PREFIX}${entry.name} has an unknown root "${entry.root}"`);
  }
  const fault = valueEntryFault(entry);
  if (fault) throw new Error(PREFIX + fault);
}

// The kinds the host builds something for: a snippet (`text`), a slot element (`slot`) or a
// delivering function (`callback`). A `data` or `aria` key needs none, because its copied value
// is already what the component takes; a `value` key reaches the host as its own host prop.
const HOST_DRAWN_KINDS = new Set(['text', 'slot', 'callback']);

/**
 * The entry's keys the host draws, as the frozen `{ <key>: <kind> }` it draws from. A `data` or
 * `aria` key is left out, so it reaches the component as passed.
 */
function contentKinds(entry) {
  const kinds = {};
  for (const [key, spec] of Object.entries(entry.props)) {
    if (HOST_DRAWN_KINDS.has(spec.kind)) kinds[key] = spec.kind;
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
  return {
    name: entry.name,
    target,
    live: true,
    instance: null,
    root: null,
    onFault,
    slots: new Map(),
    callbacks: new Map(),
    overlays: null,
  };
}

/** M18: an `overlayHost` other than `undefined` is an element of the target's document. */
function assertOverlayHost(overlayHost, target, isElement) {
  if (overlayHost === undefined) return;
  if (isElement(overlayHost) && overlayHost.ownerDocument === target.ownerDocument) return;
  throw refuse("overlayHost must be an element in the target's document");
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

/**
 * What the host receives beside its component; `values` holds each value key's value, `slots`
 * answers a requested key's element, `callbacks` a callback or value key's `{ arity, deliver }`,
 * and `flush` runs the runtime's flush, if it registered one, while the mount is live.
 */
function hostPropsFor({ entry, record, initial, values, onfault, report, flush }) {
  return {
    initial,
    values,
    onfault,
    kinds: contentKinds(entry),
    slots: (key) => record.slots.get(key) ?? null,
    callbacks: callbackFor(entry, record, report),
    flush: () => {
      if (record.live) flush?.();
    },
  };
}

function handleFor(entry, record, end) {
  return Object.freeze({
    update(props) {
      if (!record.live) return false;
      const next = copyProps(entry, props);
      takeCallbacks(entry, record.callbacks, next);
      const values = takeValues(entry, next);
      requestSlots(entry, record, next);
      record.instance.setProps(next, values);
      return true;
    },
    destroy: () => end(record),
    slot: (key) => (record.live ? (record.slots.get(key) ?? null) : null),
    value: (key) =>
      record.live && entry.props[key]?.kind === 'value' ? record.instance.getValue(key) : undefined,
  });
}

// An entry's overlay chain is registered before the runtime mounts it; defensive, because Svelte
// 5.56 runs an action at the next flush, after `mount` returns.
function openOverlays(entry, record, { overlayHost, runtime, report }) {
  if (entry.overlays !== true) return;
  const reportFailure = (error) => report(FAULT_REPORT, record.name, error);
  const { target } = record;
  record.overlays = openOverlayChain({
    target,
    option: overlayHost,
    runtime,
    report: reportFailure,
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
    unmountReporting((instance) => runtime().unmount(instance), record.instance, reportFailure);
  }

  // A faulted mount leaves its target empty at once, however the runtime's unmount ended.
  function unmountFaulted(record) {
    unmountQuietly(record);
    record.target.replaceChildren?.();
  }

  // A retired mount's nested mounts end first; its slot elements and any overlay container still
  // open leave after its own unmount.
  function close(record, unmount) {
    for (const nested of nestedIn(record, live)) end(nested);
    unmount(record);
    record.overlays?.close();
    detachSlots(record);
    record.callbacks.clear();
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

  function start(entry, target, initial, { component, onFault, overlayHost }) {
    const record = newRecord(entry, target, onFault);
    claims.set(target, record);
    live.add(record);
    openOverlays(entry, record, { overlayHost, runtime, report });
    requestSlots(entry, record, initial);
    takeCallbacks(entry, record.callbacks, initial);
    const values = seedValues(entry, takeValues(entry, initial));
    const { host, mount, flush } = runtime();
    const onfault = (error) => fault(record, error);
    const hosted = { entry, record, initial, values, onfault, report, flush };
    const props = { component, ...hostPropsFor(hosted) };
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

  // M5: a claim holds only while its root is still inside the target.
  function assertUnheld(target) {
    const held = claims.get(target);
    if (held?.root && target.contains(held.root)) throw refuse(HELD);
  }

  // M5, then M6 once a stale claim is destroyed.
  function claimTarget(target) {
    assertUnheld(target);
    const stale = claims.get(target);
    if (stale) end(stale);
    assertEmpty(target);
  }

  const owner = (target) => ownerOf(target, live);
  return { start, assertUnheld, claimTarget, owner, liveCount: () => live.size };
}

function assertEmpty(target) {
  if (target.firstChild) throw refuse('target must be empty');
}

/**
 * `mount` and `mountMany` over one seam's `entries`. `mountMany` judges the name, then that `items`
 * is an array (M21), then every item as `mount` judges its options, before it claims or renders
 * anything; a stale claim is ended only as its item renders, and a fault is that item's own.
 */
function createMounting({
  entries,
  loading,
  lifecycle,
  isRegistered,
  isReady,
  isElement,
  hasAncestor,
}) {
  function entryToMount(name) {
    if (!isRegistered()) throw new Error(`${PREFIX}not registered`);
    if (!isReady()) throw refuse('mount before ready');
    const entry = entries.get(name);
    if (!entry) throw refuse(`"${String(name)}" is not published`);
    // M19, directly after M3: a lazy entry is refused until `load` has resolved for it.
    if (!loading.isLoaded(entry)) throw refuse(`"${entry.name}" is not loaded`);
    return entry;
  }

  // M4, M16 and M18; a value that is not an object reads as no options.
  function readRequest(entry, options) {
    const { target, props = {}, onFault, overlayHost } = options ?? {};
    if (!isElement(target)) throw refuse('target must be an element');
    const root = ROOTS[entry.root];
    if (root && !underRoot(target, root.selector, hasAncestor, lifecycle.owner)) {
      throw refuse(`${entry.name} needs ${root.needs}`);
    }
    assertOverlayHost(overlayHost, target, isElement);
    const notify = typeof onFault === 'function' ? onFault : null;
    return { target, props, onFault: notify, overlayHost };
  }

  function render(entry, { target, onFault, overlayHost }, props) {
    const component = loading.componentOf(entry);
    return lifecycle.start(entry, target, props, { component, onFault, overlayHost });
  }

  function mount(name, options) {
    const entry = entryToMount(name);
    const request = readRequest(entry, options);
    lifecycle.claimTarget(request.target);
    return render(entry, request, copyProps(entry, request.props));
  }

  function mountMany(name, items) {
    const entry = entryToMount(name);
    if (!Array.isArray(items)) throw refuse('items must be an array');
    const targets = new Set();
    // The length is read once and a hole reads as an item with no target; no iterator is followed.
    const validated = Array.from({ length: items.length }, (_, index) => {
      const request = readRequest(entry, items[index]);
      if (targets.has(request.target)) throw refuse(HELD);
      targets.add(request.target);
      lifecycle.assertUnheld(request.target);
      assertEmpty(request.target);
      return { request, props: copyProps(entry, request.props) };
    });
    const handles = validated.map(({ request, props }) => {
      lifecycle.claimTarget(request.target);
      return render(entry, request, props);
    });
    return Object.freeze(handles);
  }

  return { mount, mountMany };
}

/**
 * One seam over `table` (the manifest by default). Passing `mount` registers the runtime, `flush`,
 * `overlay`, `loaders` and `reportLoadFailure` among it, at once, binding each eager entry's own
 * `component`; otherwise the adapter calls `register`, once. `loaders` maps a lazy entry's `path` to
 * a function resolving its component, and `reportLoadFailure(error)` takes a chunk-load failure.
 * `hasAncestor(target, selector)` decides an entry's required root, by `closest` unless injected.
 */
export function createPublishedComponents({
  table = PUBLISHED_COMPONENT_MANIFEST,
  host,
  mount,
  unmount,
  flush,
  overlay,
  loaders = {},
  reportLoadFailure,
  report = reportToConsole,
  isElement = isElementNode,
  hasAncestor = hasAncestorBySelector,
  isReady = isFabricateReady,
} = {}) {
  const entries = new Map(table.map((entry) => [entry.name, entry]));
  const descriptions = new Map(table.map((entry) => [entry.name, describeEntry(entry)]));
  let runtime = null;
  const lifecycle = createMountLifecycle({ runtime: () => runtime, report });
  const loading = createEntryLoading({ entries, runtime: () => runtime });
  const mounting = createMounting({
    entries,
    loading,
    lifecycle,
    isRegistered: () => runtime !== null,
    isReady,
    isElement,
    hasAncestor,
  });

  function register(adapter) {
    if (runtime) throw new Error(`${PREFIX}already registered`);
    const { components = {}, loaders: adapterLoaders = {} } = adapter;
    for (const entry of table) {
      assertKnownEntry(entry);
      const fault = lazyBindingFault(entry, components, adapterLoaders);
      if (fault) throw new Error(PREFIX + fault);
    }
    const { host: adapterHost, mount: adapterMount, unmount: adapterUnmount } = adapter;
    runtime = Object.freeze({
      components,
      loaders: adapterLoaders,
      reportLoadFailure: adapter.reportLoadFailure,
      host: adapterHost,
      mount: adapterMount,
      unmount: adapterUnmount,
      flush: adapter.flush,
      overlay: adapter.overlay,
    });
  }

  const publicApi = Object.freeze({
    schemaVersion: 1,
    components: Object.freeze(table.map((entry) => entry.name)),
    describe: (name) => descriptions.get(name) ?? null,
    mount: mounting.mount,
    load: loading.load,
    mountMany: mounting.mountMany,
  });

  if (mount) {
    const eager = table.filter((entry) => entry.lazy !== true);
    const components = Object.fromEntries(eager.map((entry) => [entry.path, entry.component]));
    register({ components, loaders, reportLoadFailure, host, mount, unmount, flush, overlay });
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
