/**
 * The published component seam's `callback` kind (issue 2452): the functions one mount holds, and
 * what the host calls to reach them. Plain JS with no import, as the prop kinds are.
 * The contract is `openspec/specs/ui-extension-points/spec.md` § Published UI Components.
 */
const CALLBACK_REPORT = 'Fabricate | Published component callback failed:';
const noop = () => {};

/**
 * Moves each `callback` key's function out of `props`, a validated copy, into `callbacks`, leaving
 * `true` for the host; a key holding no function leaves neither.
 */
export function takeCallbacks(entry, callbacks, props) {
  for (const [key, spec] of Object.entries(entry.props)) {
    if (spec.kind !== 'callback') continue;
    if (typeof props[key] === 'function') {
      callbacks.set(key, props[key]);
      props[key] = true;
    } else {
      callbacks.delete(key);
      delete props[key];
    }
  }
}

/**
 * What the host's `callbacks(key)` answers: a frozen `{ arity, deliver }`, where `arity` is how
 * many leading arguments the entry forwards and `deliver(args)` calls the key's newest function.
 * `deliver` calls nothing once `record` is no longer live, and a throw, or the rejection of a
 * thenable the function returns, goes to `report` and no further, once per call.
 */
export function callbackFor(entry, record, report) {
  return (key) =>
    Object.freeze({
      arity: entry.props[key].args ?? 0,
      deliver(args) {
        const call = record.live ? record.callbacks.get(key) : undefined;
        if (!call) return;
        let reported = false;
        const reportOnce = (error) => {
          if (reported) return;
          reported = true;
          report(CALLBACK_REPORT, entry.name, key, error);
        };
        try {
          const result = call(...args);
          if (typeof result?.then === 'function') result.then(noop, reportOnce);
        } catch (error) {
          reportOnce(error);
        }
      },
    });
}
