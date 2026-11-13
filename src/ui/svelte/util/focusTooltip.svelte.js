import { onDestroy } from 'svelte';

/**
 * The keyboard-focus tooltip lifecycle `IconButton`, `Button` and `Stepper` share: written as
 * `data-tooltip-text`, opened through the `APP_TOOLTIPS` facade only under `:focus-visible`, and
 * closed on blur, press, Escape, a changed text, disabling and unmount. Call it during component
 * init. `current(key)` answers `{ text, off }` for one tipped control; `keys` lists every key, all
 * read each run so an update that renames or disables the open one closes it; `rest()` is the
 * element to close when none is open.
 */
export function createFocusTooltip(tooltips, { current, keys = [undefined], rest = () => {} }) {
  // The control whose focus tooltip is open, its key and text; no markup reads it.
  let shown = null;

  const close = (target = shown?.target ?? rest()) => {
    shown = null;
    if (target) tooltips?.hide(target);
  };

  function open(event, key) {
    const { text } = current(key);
    if (!text || !event.currentTarget.matches(':focus-visible')) return;
    shown = { target: event.currentTarget, key, text };
    tooltips?.show(shown.target, text);
  }

  $effect(() => {
    const reads = new Map(keys.map((key) => [key, current(key)]));
    const now = shown && reads.get(shown.key);
    if (now && (now.text !== shown.text || now.off)) close();
  });

  onDestroy(() => close());

  return { open, close };
}
