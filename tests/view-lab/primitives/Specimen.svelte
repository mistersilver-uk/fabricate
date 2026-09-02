<!--
  One mounted primitive, isolated so that a broken one cannot take the page with it.

  Two different failures have to be caught and they are caught in two different places:

    - the IMPORT can reject, when a catalogue row names a path no component is served at. That is
      an ordinary promise rejection and is handled where the import is made.
    - the RENDER can throw, when a component is handed props it cannot survive — a `json` knob
      holding an option list with the wrong shape is the everyday case. Only `<svelte:boundary>`
      catches that, and without one a single bad row blanks the whole document, which on a page of
      fifty-seven specimens is indistinguishable from the harness being broken.

  Both settle the same way, because the page's readiness signal must not care which happened: a
  specimen is settled when it has either mounted or reported why it could not.
-->
<script>
  import ManagerButton from '../../../src/ui/svelte/components/ManagerButton.svelte';

  import { loadComponent } from './importers.js';

  let { instanceId, path, props = {}, onSettle = () => {} } = $props();

  let Component = $state(null);
  let failure = $state('');

  /**
   * Report the outcome, always out of band.
   *
   * The boundary calls `onerror` DURING render, and the parent's handler writes to state the same
   * render pass reads — which Svelte 5 rejects as an unsafe mutation. Deferring makes both call
   * sites identical and neither of them a special case.
   */
  function settle(ok, message) {
    queueMicrotask(() => onSettle({ instanceId, path, ok, message }));
  }

  $effect(() => {
    const target = path;
    let live = true;
    loadComponent(target).then(
      (loaded) => {
        if (!live) return;
        Component = loaded;
        settle(true, '');
      },
      (cause) => {
        if (!live) return;
        failure = String(cause?.message ?? cause);
        settle(false, failure);
      }
    );
    return () => {
      live = false;
    };
  });
</script>

{#if failure}
  <!--
    SURFACE 2 of 4: a transient error. `<Notice>` is UNBUILT; `Callout` is the shipped neighbour
    and is the rule that is always true and stays put, which this is the opposite of.
  -->
  <div class="pl-notice" data-pl-surface="Notice" role="alert">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <span>{path} — {failure}</span>
  </div>
{:else if Component}
  <svelte:boundary onerror={(error) => settle(false, String(error?.message ?? error))}>
    {#snippet failed(error, reset)}
      <!-- SURFACE 2 of 4 again; same surface, same missing member. -->
      <div class="pl-notice" data-pl-surface="Notice" role="alert">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <span class="pl-grow">{path} threw while rendering — {String(error?.message ?? error)}</span
        >
        <ManagerButton role="ghost" onclick={reset}>Retry</ManagerButton>
      </div>
    {/snippet}
    <Component {...props} />
  </svelte:boundary>
{/if}
