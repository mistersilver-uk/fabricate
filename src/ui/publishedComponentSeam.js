/**
 * The published component seam, `game.fabricate.api.ui` (issue 2426): a companion mounts a
 * Fabricate primitive into an element it owns and gets back `{ update, destroy }`. Plain JS, so the
 * public API binds it without Svelte; the runtime adapter registers the host, `mount` and `unmount`.
 * The contract is `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
import { PUBLISHED_COMPONENT_MANIFEST } from './publishedComponentManifest.js';

const PREFIX = 'Fabricate | published components: ';
const FAULT_REPORT = 'Fabricate | Published component render failed:';
const DATA_ATTRIBUTE = /^data-[a-z0-9-]+$/;
const ATTRIBUTE_TYPES = new Set(['string', 'number', 'boolean']);
const INERT_HANDLE = Object.freeze({ update: () => false, destroy: () => {} });

const refuse = (message) => new TypeError(PREFIX + message);
const isElementNode = (target) => target?.nodeType === 1;
const isFabricateReady = () => globalThis.game?.fabricate?.ready === true;
const reportToConsole = (...args) => console.error(...args);

// One step from a null prototype, so a null-prototype or cross-realm plain object passes.
function hasPlainPrototype(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/** A deep copy of one prop value, refusing functions (M10), non-data (M11) and cycles (M12). */
function copyData(value, key, ancestors) {
  if (typeof value === 'function') throw refuse('functions are phase 2 (issue 2427)');
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw refuse(`"${key}" holds a cycle`);
  const isArray = Array.isArray(value);
  if (!isArray && !hasPlainPrototype(value)) throw refuse(`"${key}" must be data`);
  ancestors.add(value);
  const copy = isArray ? value.map((item) => copyData(item, key, ancestors)) : {};
  if (!isArray) {
    for (const [name, item] of Object.entries(value)) {
      const field = copyData(item, key, ancestors);
      Object.defineProperty(copy, name, { value: field, enumerable: true, writable: true });
    }
  }
  ancestors.delete(value);
  return copy;
}

/** The validated copy one mount or update renders: M7, M8, M10-M13, then M9. */
function copyProps(entry, props) {
  if (!hasPlainPrototype(props)) throw refuse('props must be a plain object');
  const copy = {};
  for (const [key, raw] of Object.entries(props)) {
    const published = Object.hasOwn(entry.props, key);
    if (!published && !entry.rest) throw refuse(`"${key}" is not a prop of ${entry.name}`);
    const value = copyData(raw, key, new Set());
    if (!published && !(DATA_ATTRIBUTE.test(key) && ATTRIBUTE_TYPES.has(typeof value))) {
      throw refuse(`"${key}" is not a data attribute`);
    }
    Object.defineProperty(copy, key, { value, enumerable: true, writable: true });
  }
  for (const [key, spec] of Object.entries(entry.props)) {
    if (spec.required === true && (copy[key] === undefined || copy[key] === '')) {
      throw refuse(`${entry.name} requires a non-empty "${key}"`);
    }
  }
  return copy;
}

function describeEntry(entry) {
  const props = {};
  for (const [key, spec] of Object.entries(entry.props)) {
    props[key] = Object.freeze({ kind: spec.kind, required: spec.required === true });
  }
  return Object.freeze({
    version: entry.version,
    props: Object.freeze(props),
    rest: entry.rest === true,
  });
}

function assertDataKinds(entry) {
  for (const [key, spec] of Object.entries(entry.props)) {
    if (spec.kind !== 'data') {
      throw new Error(
        `${PREFIX}${entry.name} "${key}" is a ${spec.kind} prop; only data props ship before issue 2427`
      );
    }
  }
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

  function unmountQuietly(record) {
    try {
      runtime().unmount(record.instance);
    } catch (error) {
      report(FAULT_REPORT, record.name, error);
    }
  }

  function end(record) {
    if (!record.live) return;
    retire(record);
    unmountQuietly(record);
  }

  // A fault inside the runtime call precedes its instance, so that unmount waits a microtask.
  // Defensive: Svelte 5.56 delivers no fault before its `mount` returns.
  function fault(record, error) {
    if (!record.live) return;
    retire(record);
    report(FAULT_REPORT, record.name, error);
    if (record.instance) unmountQuietly(record);
    else queueMicrotask(() => record.instance && unmountQuietly(record));
  }

  function handleFor(entry, record) {
    return Object.freeze({
      update(props) {
        if (!record.live) return false;
        record.instance.setProps(copyProps(entry, props));
        return true;
      },
      destroy: () => end(record),
    });
  }

  function start(entry, target, initial) {
    const record = { name: entry.name, target, live: true, instance: null, root: null };
    claims.set(target, record);
    live.add(record);
    const { components, host, mount } = runtime();
    const props = { component: components[entry.path], initial, onfault: (e) => fault(record, e) };
    try {
      record.instance = mount(host, { target, props });
    } catch (error) {
      retire(record);
      report(FAULT_REPORT, entry.name, error);
      target.replaceChildren?.();
      return INERT_HANDLE;
    }
    if (!record.live) return INERT_HANDLE;
    record.root = target.lastChild;
    return handleFor(entry, record);
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

  return { start, claimTarget, liveCount: () => live.size };
}

/**
 * One seam over `table` (the manifest by default). Passing `mount` registers the runtime at once,
 * binding each entry's own `component`; otherwise the adapter calls `register`, once.
 */
export function createPublishedComponents({
  table = PUBLISHED_COMPONENT_MANIFEST,
  host,
  mount,
  unmount,
  report = reportToConsole,
  isElement = isElementNode,
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
    const { target, props = {} } = options ?? {};
    if (!isElement(target)) throw refuse('target must be an element');
    lifecycle.claimTarget(target);
    return lifecycle.start(entry, target, copyProps(entry, props));
  }

  function register(adapter) {
    if (runtime) throw new Error(`${PREFIX}already registered`);
    for (const entry of table) assertDataKinds(entry);
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
