<!-- Svelte 5 runes mode -->
<!--
  SalvageMisconfiguredBody is the GM-config state. Three distinct misconfigurations
  reach it, discriminated by `reason` (issue 764), NOT by a binary mode dispatch:

   - `routedNoFormula` / `progressiveNoFormula`: routed and progressive REQUIRE a check
     to produce an outcome (routed routes on the tier name; progressive spends the roll
     total as its budget), so the engine aborts such an attempt with
     `{ success: false, misconfigured: true }` and zero mutation.
   - `simpleMultiGroup`: a Simple-mode component with more than one success result group
     — invalid, since Simple awards exactly the first group. The GM fixes it in the
     component editor and the config self-heals on the next system save.

  Rendering the authored tiers or stages here would put a plausible contract under a
  footer that always fails — so this body says what is wrong instead, and the footer is
  disabled rather than inviting a doomed press.

  THE WHOLE BODY IS THE SHARED `Notice`, NON-BLOCKING (issue 1514). It was already exactly
  that shape — a warning-toned well holding a glyphed title over an explanatory line, with
  `role="status"` on the box — and a non-blocking notice is the only one of the two banner
  primitives that can keep the role, since `Callout` emits `role="note"` or nothing. The
  `screwdriver-wrench` glyph is passed rather than defaulted: the default warning mark is the
  alert triangle, and this state is a CONFIGURATION fault a GM fixes in the editor rather than
  a hazard the player is walking into.
-->
<script>
  import { localize } from '../../../../util/foundryBridge.js';
  import Notice from '../../../../components/Notice.svelte';

  // `reason` is the builder's discriminator; `mode` is retained as the back-compat
  // fallback for the routed/progressive no-formula cases.
  let { mode = 'routed', reason = null } = $props();

  const effectiveReason = $derived(
    reason ?? (mode === 'progressive' ? 'progressiveNoFormula' : 'routedNoFormula')
  );

  const ruleKey = $derived(
    effectiveReason === 'simpleMultiGroup'
      ? 'FABRICATE.App.Inventory.Salvage.MisconfiguredSimple'
      : effectiveReason === 'progressiveNoFormula'
        ? 'FABRICATE.App.Inventory.Salvage.MisconfiguredProgressive'
        : 'FABRICATE.App.Inventory.Salvage.MisconfiguredRouted'
  );
</script>

<Notice
  tone="warning"
  icon="fas fa-screwdriver-wrench"
  title={localize('FABRICATE.App.Inventory.Salvage.MisconfiguredTitle')}
  detail={localize(ruleKey)}
  dataAttr="data-inventory-salvage-body"
  dataValue="misconfigured"
/>
