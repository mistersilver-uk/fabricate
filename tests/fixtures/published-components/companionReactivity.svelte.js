/** A companion's reactive contexts on Fabricate's runtime, for the `untrack` pins (issue 2426). */
export function runInsideDerived(fn) {
  const value = $derived(fn());
  return value;
}

/** Runs `fn` inside a companion `$effect`, flushed once, recording each run. */
export function runInsideEffect(fn, flush) {
  const runs = [];
  const dispose = $effect.root(() => {
    $effect(() => {
      runs.push(fn());
    });
  });
  flush();
  return { runs, dispose };
}
