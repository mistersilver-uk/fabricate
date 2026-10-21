/**
 * The published component seam's `callback` kind (issue 2452): the functions one mount holds, a
 * value key's synthesised `on<Key>Change` among them (issue 2453), and what the host calls to
 * reach them. Plain JS with no Svelte import, as the prop kinds are.
 * The contract is `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
import { changeKeyOf, changeKeys } from './publishedComponentValues.js';

const CALLBACK_REPORT = 'Fabricate | Published component callback failed:';
const noop = () => {};

/** Holds `key`'s function in `callbacks`, or forgets it, and leaves `true` in `props` only if `drawn`. */
function hold(callbacks, props, key, drawn) {
  const held = typeof props[key] === 'function';
  if (held) callbacks.set(key, props[key]);
  else callbacks.delete(key);
  if (held && drawn) props[key] = true;
  else delete props[key];
}

/**
 * Moves each `callback` key's function out of `props`, a validated copy, into `callbacks`, leaving
 * `true` for the host; a key holding no function leaves neither. A change key leaves nothing, as
 * the host never draws one.
 */
export function takeCallbacks(entry, callbacks, props) {
  for (const [key, spec] of Object.entries(entry.props)) {
    if (spec.kind === 'callback') hold(callbacks, props, key, true);
  }
  for (const key of Object.keys(changeKeys(entry))) hold(callbacks, props, key, false);
}

/**
 * What the host's `callbacks(key)` answers: a frozen `{ arity, deliver }`, where `arity` is how
 * many leading arguments the entry forwards and `deliver(args)` calls the key's newest function;
 * for a value key, its `on<Key>Change` with `(next, previous)`, beside the key's `initial`, which
 * the host records for a component's write of `undefined`. `deliver` calls nothing once
 * `record` is no longer live, and a throw, or the rejection of a thenable the function returns,
 * goes to `report` and no further, once per call.
 */
export function callbackFor(entry, record, report) {
  return (key) => {
    const valued = entry.props[key].kind === 'value';
    const held = valued ? changeKeyOf(key) : key;
    return Object.freeze({
      ...(valued && { initial: entry.props[key].initial }),
      arity: valued ? 2 : (entry.props[key].args ?? 0),
      deliver(args) {
        const call = record.live ? record.callbacks.get(held) : undefined;
        if (!call) return;
        let reported = false;
        const reportOnce = (error) => {
          if (reported) return;
          reported = true;
          report(CALLBACK_REPORT, entry.name, held, error);
        };
        try {
          const result = call(...args);
          if (typeof result?.then === 'function') result.then(noop, reportOnce);
        } catch (error) {
          reportOnce(error);
        }
      },
    });
  };
}
