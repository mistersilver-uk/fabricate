/**
 * The published component seam, `game.fabricate.api.ui` (issue 2426): a companion mounts a
 * Fabricate primitive into an element it owns and gets back `{ update, destroy, slot, value }`.
 * It draws its own content in a content slot, is told of a contained fault through `onFault`
 * and of a press through a callback prop, sets an ARIA attribute on a control through an `aria`
 * prop, reads and sets a bound value through a `value` prop, and hosts an entry's overlays through
 * `overlayHost`. `load` fetches a lazy entry's code, and `mountMany` mounts one entry into
 * several targets in one checked call.
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
  ANY_FABRICATE_SELECTOR,
  FABRICATE_ROOT_SELECTOR,
  inShadowRoot,
  writeStandaloneRoot,
} from './publishedComponentStandaloneRoot.js';
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
  fabricate: Object.freeze({
    selector: FABRICATE_ROOT_SELECTOR,
    needs: 'a Fabricate window ancestor',
  }),
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
function isSoundGuard(entry, spec, key) {
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

/** Registration's refusal of a `standaloneRoot` that is not `true`, or not on the `'any'` root. */
function standaloneRootFault({ name, root, standaloneRoot }) {
  if (standaloneRoot === undefined) return null;
  if (standaloneRoot !== true) {
    return `${name} has an unknown standaloneRoot "${String(standaloneRoot)}"`;
  }
  return root === 'any' ? null : `${name} states standaloneRoot on the root "${root}"`;
}

/** Whether a key's `contains` is sound: on a `data` key, naming a `text` key (issue 2852). */
function isSoundContains(entry, spec) {
  const name = spec.contains;
  return (
    spec.kind === 'data' &&
    typeof name === 'string' &&
    Object.hasOwn(entry.props, name) &&
    entry.props[name].kind === 'text'
  );
}

/**
 * Whether a key's `itemContains` is sound: on a `data` key, a plain object pairing each item
 * member name with another member's name (issue 2856).
 */
function isSoundItemContains(entry, spec) {
  const pairs = spec.itemContains;
  const plain = pairs !== null && typeof pairs === 'object' && !Array.isArray(pairs);
  const entries = plain ? Object.entries(pairs) : [];
  return (
    spec.kind === 'data' &&
    entries.length > 0 &&
    entries.every(([member, other]) => typeof other === 'string' && other !== member)
  );
}

/** Each conditional member a prop may state, and the test that member must pass at registration. */
const MEMBER_SOUNDNESS = Object.freeze([
  ['requiredWhen', isSoundGuard],
  ['contains', isSoundContains],
  ['itemContains', isSoundItemContains],
]);

function assertKnownEntry(entry) {
  for (const [key, spec] of Object.entries(entry.props)) {
    if (!Object.hasOwn(SHIPPED_KINDS, spec.kind)) {
      throw new Error(`${PREFIX}${entry.name} "${key}" has an unknown kind "${spec.kind}"`);
    }
    for (const [member, isSound] of MEMBER_SOUNDNESS) {
      if (spec[member] === undefined || isSound(entry, spec, key)) continue;
      const value = spec[member];
      const other = typeof value === 'object' ? JSON.stringify(value) : String(value);
      throw new Error(`${PREFIX}${entry.name} "${key}" has an unknown ${member} "${other}"`);
    }
  }
  if (!Object.hasOwn(ROOTS, entry.root)) {
    throw new Error(`${PREFIX}${entry.name} has an unknown root "${entry.root}"`);
  }
  const fault = standaloneRootFault(entry) ?? valueEntryFault(entry);
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
    standaloneRoot: null,
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
 * Whether `target` has the ancestor `selector` names (M16), and the element that was judged. A
 * target inside a slot element that is not attached is judged by the element the mount owning that
 * element draws in, its standalone style root or else its target, and so on up; a mount met twice
 * is a cycle, which has no such ancestor.
 */
function rootJudgement(target, selector, hasAncestor, owner) {
  const met = new Set();
  let judged = target;
  while (!hasAncestor(judged, selector)) {
    const record = owner(judged);
    if (!record || met.has(record)) return { under: false, judged };
    met.add(record);
    judged = record.standaloneRoot ?? record.target;
  }
  return { under: true, judged };
}

/**
 * Whether `entry` is drawn under a standalone style root written in `target`: it states
 * `standaloneRoot` and no `.fabricate` is above `target`. M16 refuses it in a shadow root.
 */
function takesStandaloneRoot(entry, target, hasAncestor, owner) {
  if (entry.standaloneRoot !== true) return false;
  const { under, judged } = rootJudgement(target, ANY_FABRICATE_SELECTOR, hasAncestor, owner);
  if (under) return false;
  if (inShadowRoot(judged)) throw refuse(`${entry.name} cannot be drawn in a shadow root`);
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

  // A retired mount's nested mounts end first; its standalone style root, its slot elements and any
  // overlay container still open leave after its own unmount, the root by reference.
  function close(record, unmount) {
    for (const nested of nestedIn(record, live)) end(nested);
    unmount(record);
    record.standaloneRoot?.remove();
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

  function start(entry, target, initial, { component, onFault, overlayHost, standalone }) {
    const record = newRecord(entry, target, onFault);
    claims.set(target, record);
    live.add(record);
    if (standalone) record.standaloneRoot = writeStandaloneRoot(target);
    const drawnIn = record.standaloneRoot ?? target;
    openOverlays(entry, record, { overlayHost, runtime, report });
    requestSlots(entry, record, initial);
    takeCallbacks(entry, record.callbacks, initial);
    const values = seedValues(entry, takeValues(entry, initial));
    const { host, mount, flush } = runtime();
    const onfault = (error) => fault(record, error);
    const hosted = { entry, record, initial, values, onfault, report, flush };
    const props = { component, ...hostPropsFor(hosted) };
    try {
      record.instance = mount(host, { target: drawnIn, props });
    } catch (error) {
      retire(record);
      report(FAULT_REPORT, entry.name, error);
      close(record, () => target.replaceChildren?.());
      queueFaultNotice(record, error, report);
      return INERT_HANDLE;
    }
    if (!record.live) return INERT_HANDLE;
    record.root = drawnIn.lastChild;
    return handleFor(entry, record, end);
  }

  // M5: a claim holds only while its root is still inside the target. It ends nothing, so
  // `mountMany` can check every item with it before any claim is made.
  function assertUnheld(target) {
    const held = claims.get(target);
    if (held?.root && target.contains(held.root)) throw refuse(HELD);
  }

  // `mount`'s claim check: M5, then a stale claim is destroyed, then M6.
  function claimTarget(target) {
    assertUnheld(target);
    const stale = claims.get(target);
    if (stale) end(stale);
    assertEmpty(target);
  }

  const owner = (target) => ownerOf(target, live);
  return { start, assertUnheld, claimTarget, owner, liveCount: () => live.size };
}

// M6. It destroys no stale claim, so it refuses a target holding a node that claim left, where
// `claimTarget` destroys the claim first and may then pass.
function assertEmpty(target) {
  if (target.firstChild) throw refuse('target must be empty');
}

/** `mount` and `mountMany` over one seam's `entries`, sharing one name check and one options read. */
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

  // M4, M16 and M18; a value that is not an object reads as no options. It claims and renders
  // nothing, so `mountMany` can read every item before any is drawn.
  function readRequest(entry, options) {
    const { target, props = {}, onFault, overlayHost } = options ?? {};
    if (!isElement(target)) throw refuse('target must be an element');
    const root = ROOTS[entry.root];
    if (root && !rootJudgement(target, root.selector, hasAncestor, lifecycle.owner).under) {
      throw refuse(`${entry.name} needs ${root.needs}`);
    }
    const standalone = takesStandaloneRoot(entry, target, hasAncestor, lifecycle.owner);
    assertOverlayHost(overlayHost, target, isElement);
    const notify = typeof onFault === 'function' ? onFault : null;
    return { target, props, onFault: notify, overlayHost, standalone };
  }

  function render(entry, { target, onFault, overlayHost, standalone }, props) {
    const component = loading.componentOf(entry);
    return lifecycle.start(entry, target, props, { component, onFault, overlayHost, standalone });
  }

  function mount(name, options) {
    const entry = entryToMount(name);
    const request = readRequest(entry, options);
    lifecycle.claimTarget(request.target);
    return render(entry, request, copyProps(entry, request.props));
  }

  /**
   * Draws `name` into each item's target in order, or throws and draws nothing. The checks run in
   * this order and the first refusal is thrown unchanged: the name (M1, M2, M3, M19), `items` being
   * an array (M21), then each item as `mount` checks its options. That is its target, a repeat of an
   * earlier target (M5), M5 and M6 against the claims, then its `props`. The check is pure: it makes
   * no claim and ends no stale claim, and each item's props are copied there. `mount` differs in one
   * case: it ends a stale claim before M6, so a target holding a node that claim left is M6 here
   * where `mount` passes. A later target inside the detached slot of a stale mount an earlier item's
   * draw ends is drawn, where sequential `mount` calls refuse it (M16); where that stale mount was
   * drawn under a standalone style root, the target is judged under a root, so it is drawn with no
   * standalone style root and no `.fabricate` above it. A fault while an item renders is that
   * item's own: its handle is inert, only its own `onFault` is told, and the rest stay live.
   */
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
