/**
 * Lazy published entries (issue 2455): an entry stating `lazy: true` is bound to a loader, which
 * resolves its component, instead of a component, and `load` calls that loader once per seam. A
 * failed fetch keeps its rejection for the page session and is not retried; a chunk-load failure
 * is also handed to the runtime's `reportLoadFailure`.
 */
import { isChunkLoadFailure } from '../utils/deferredEntryNotice.js';

import { PREFIX, refuse } from './publishedComponentProps.js';

/** What registration refuses in `entry`'s `lazy` against the runtime's bindings, or `null`. */
export function lazyBindingFault(entry, components, loaders) {
  if (entry.lazy !== undefined && typeof entry.lazy !== 'boolean') {
    return `${entry.name} has an unknown lazy "${String(entry.lazy)}"`;
  }
  const loader = Object.hasOwn(loaders, entry.path) ? loaders[entry.path] : undefined;
  if (entry.lazy !== true) {
    return loader === undefined
      ? null
      : `${entry.name} is not lazy, so its runtime binds no loader`;
  }
  if (typeof loader === 'function' && !Object.hasOwn(components, entry.path)) return null;
  return `${entry.name} is lazy, so its runtime binds a loader and no component`;
}

/**
 * One seam's `load` and the lazy components it has fetched. `runtime()` reads the registered
 * runtime: its `loaders` by path, and the `reportLoadFailure` a chunk-load failure is handed to.
 * `load` resolves an eager name at once and a lazy name once its component is fetched. It rejects
 * with M3 for an unpublished name before any loader runs, with the loader's own error for a failed
 * fetch, and for a lazy name before the runtime registers. `isLoaded` is true for an eager entry,
 * and for a lazy one once fetched.
 */
export function createEntryLoading({ entries, runtime }) {
  const loaded = new Map();
  const attempts = new Map();

  function fetchOnce(entry) {
    if (!attempts.has(entry.path)) {
      const { loaders, reportLoadFailure } = runtime();
      const attempt = (async () => loaders[entry.path]())().then(
        (component) => {
          loaded.set(entry.path, component);
        },
        (error) => {
          try {
            if (isChunkLoadFailure(error)) reportLoadFailure?.(error);
          } catch {
            // The loader's error is the one `load` rejects with.
          }
          throw error;
        }
      );
      attempts.set(entry.path, attempt);
    }
    return attempts.get(entry.path);
  }

  // `async`, so every refusal is a rejection; M3 is judged for each name before a loader runs.
  async function load(names) {
    const named = Array.isArray(names) ? names : [names];
    for (const name of named) {
      if (!entries.has(name)) throw refuse(`"${String(name)}" is not published`);
    }
    const lazy = named.map((name) => entries.get(name)).filter((entry) => entry.lazy === true);
    if (lazy.length === 0) return;
    if (!runtime()) throw new Error(`${PREFIX}not registered`);
    await Promise.all(lazy.map(fetchOnce));
  }

  return {
    load,
    isLoaded: (entry) => entry.lazy !== true || loaded.has(entry.path),
    componentOf: (entry) =>
      entry.lazy === true ? loaded.get(entry.path) : runtime().components[entry.path],
  };
}
