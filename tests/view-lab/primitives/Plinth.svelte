<!--
  A plinth: the production window subtree a specimen is mounted inside.

  ── WHY A SPECIMEN IS NOT MOUNTED IN A BARE ROOT ────────────────────────────────────────────────

  The obvious shape is one `div.fabricate.fabricate-manager` per specimen. Read against the
  harvested 14.365 chrome that loses four things, and gives no error doing so:

    - `foundry2.css:6997` — `.application { font-size: var(--font-size-14) }`, against
      `foundry2.css:13936`'s `body { font-size: var(--font-size-15) }`. A frameless plinth renders
      every unsized Fabricate text at 15px where production renders 14px. `styles/fabricate.css`
      names "Foundry's 14px `.application` base" by hand in five places, so this is a number the
      stylesheet is written against.
    - `foundry2.css:6986` — `.application { position: absolute }`. `.fabricate.fabricate-app`
      declares NO `position` of its own, so its entire status as a containing block comes from
      `.application`, and `src/ui/svelte/util/overlayHost.js` lists it as an overlay host BECAUSE it
      is positioned. A frameless app plinth reproduces the exact defect that module was written to
      fix, with byte-identical markup and no error.
    - `foundry2.css:351` — a ten-token custom-property block declared on `.application`
      (`--color-fieldset-border`, `--color-form-label`, `--color-data-background`, …).
      `RadioCardGroup` renders a `fieldset`, which `foundry2.css:5290` borders with one of them.
      `styles/fabricate.css` references none of the ten, so the loss is invisible to any
      Fabricate-side grep.
    - `styles/fabricate.css:1136` — the bare-heading reset is scoped
      `.fabricate :where(.window-content) h1…h6`, because core's `@layer elements` styles bare
      headings and core's own antidote is V1-only. Twelve manifest files render bare headings,
      `EmptyState` and `ManagerModal` among them. Without a `.window-content` the reset never
      matches and every one takes Foundry's heading font, size, colour and 2rem top margin.

  `fabricate fabricate-manager` on ONE element is also not a production pairing. Production is
  `.fabricate.crafting-system-manager` on the frame and `.fabricate-manager` on a root inside
  `.window-content` (`SvelteCraftingSystemManagerApp.svelte.js:138`), and the player window is
  `.fabricate.fabricate-app` around `.fabricate-app-shell`.

  ── THE THEME IS WRITTEN HERE, NOT BROADCAST ────────────────────────────────────────────────────

  `applyFabricateTheme()` writes the attribute to `document.documentElement` AND to every
  `.fabricate` in the document, so calling it would repaint the harness and every other plinth with
  whichever theme was set last — and the seven-wide comparison row would show seven copies of one
  theme. `styles/fabricate.css:161` declares each theme on `.fabricate[data-fabricate-theme="…"]`,
  on ANY element, so the attribute is written onto this frame and reaches nothing else.

  ── `overflow: clip` IS NOT OVERRIDDEN ──────────────────────────────────────────────────────────

  `.fabricate-manager` clips deliberately (issue 1286). Unclipping it here would show a popover
  extending past a boundary the product clips it at, which is worse than useless: it would make a
  clipping bug look fixed. HEIGHT is a control instead, with a stated minimum, so the clip is
  observable on purpose rather than by accident.
-->
<script>
  import Chip from '../../../src/ui/svelte/apps/manager/Chip.svelte';
  import {
    FABRICATE_THEME_ATTRIBUTE,
    FABRICATE_THEME_IDS,
    normalizeFabricateTheme,
  } from '../../../src/ui/theme.js';

  /** The smallest plinth that can show a popover opening downward from a trigger near the top. */
  const MIN_PLINTH_HEIGHT = 420;

  let {
    root = 'manager',
    theme = FABRICATE_THEME_IDS.FABRICATE,
    width = 0,
    height = MIN_PLINTH_HEIGHT,
    label = '',
    probe = false,
    children,
  } = $props();

  const frameClass = $derived(
    root === 'app'
      ? 'application fabricate fabricate-app'
      : 'application fabricate crafting-system-manager'
  );
  const rootClass = $derived(root === 'app' ? 'fabricate-app-shell' : 'fabricate-manager');
  const frameStyle = $derived(
    [width > 0 ? `width:${width}px` : '', `height:${Math.max(height, MIN_PLINTH_HEIGHT)}px`]
      .filter(Boolean)
      .join(';')
  );

  let frame = $state(null);
  let observed = $state(null);

  /**
   * The live pseudo-class readout.
   *
   * There is deliberately NO hover knob and NO focus knob. `:hover` is not settable from a prop at
   * all, and a `.focus()` call made from a mouse-clicked button does not match `:focus-visible` in
   * Chromium — so a "show focus" control would render nothing and read as a MISSING FOCUS RING, a
   * false negative in the one artifact meant to prove focus rings exist. Reporting what the
   * pointed-at or focused element currently matches is the honest version of the same question.
   */
  function describe(element) {
    if (!element) return null;
    const tag = element.tagName.toLowerCase();
    const first = element.classList?.[0];
    return {
      name: first ? `${tag}.${first}` : tag,
      hover: element.matches(':hover'),
      focusVisible: element.matches(':focus-visible'),
      disabled: element.matches(':disabled, [aria-disabled="true"]'),
    };
  }

  $effect(() => {
    // Captured into a local BEFORE the listeners are attached. Reading `frame` again from the
    // cleanup would re-read the state, so a re-created frame would have the listeners removed from
    // the NEW node and left attached to the old one.
    const node = probe ? frame : null;
    if (!node) return;

    // DEFERRED, AND THIS IS NOT DEFENSIVENESS — it is a defect this listener had and a real
    // browser found within a minute of it existing.
    //
    // Swapping the driven specimen removes the focused element from the document, and removing a
    // focused element dispatches `focusout` SYNCHRONOUSLY from inside Svelte's own teardown
    // (`remove_effect_dom` → `destroy_effect`). Writing `$state` from there is `state_unsafe_mutation`
    // and Svelte throws it as an uncaught page error — no visible symptom, no failing assertion, and
    // nothing on screen to connect it to a mouse that happened to be over the plinth.
    //
    // A microtask puts the write after teardown has finished, and the connectedness check drops the
    // report from a plinth that no longer exists rather than resurrecting a stale readout.
    const publish = (next) => {
      queueMicrotask(() => {
        if (node.isConnected) observed = next;
      });
    };
    const update = (event) => {
      publish(describe(event.target instanceof Element ? event.target : null));
    };
    const clear = () => {
      publish(null);
    };
    // Imperative listeners rather than markup event attributes: a `div` carrying pointer handlers
    // in markup trips Svelte's a11y rules, and `svelte.config.js`'s `onwarn` throws. Capture phase
    // so a child that stops propagation cannot silence the readout.
    node.addEventListener('pointerover', update, true);
    node.addEventListener('focusin', update, true);
    node.addEventListener('pointerleave', clear);
    node.addEventListener('focusout', clear, true);
    return () => {
      node.removeEventListener('pointerover', update, true);
      node.removeEventListener('focusin', update, true);
      node.removeEventListener('pointerleave', clear);
      node.removeEventListener('focusout', clear, true);
    };
  });
</script>

<div class="pl-plinth-cell">
  {#if label}
    <span><Chip mono>{label}</Chip></span>
  {/if}
  <div
    bind:this={frame}
    class={frameClass}
    style={frameStyle}
    data-primitive-lab-plinth={root}
    {...{ [FABRICATE_THEME_ATTRIBUTE]: normalizeFabricateTheme(theme) }}
  >
    <section class="window-content">
      <div class={rootClass}>{@render children?.()}</div>
    </section>
  </div>
  {#if probe}
    <div class="pl-row">
      <Chip mono>{observed ? observed.name : 'point at the specimen'}</Chip>
      {#if observed?.hover}<Chip tone="info" icon="fas fa-arrow-pointer">:hover</Chip>{/if}
      {#if observed?.focusVisible}<Chip tone="positive" icon="fas fa-crosshairs"
          >:focus-visible</Chip
        >{/if}
      {#if observed?.disabled}<Chip tone="warning" icon="fas fa-ban">:disabled</Chip>{/if}
    </div>
  {/if}
</div>
