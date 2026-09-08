<!-- Svelte 5 runes mode -->
<!--
  PlayerViewState — the ONE not-yet-ready chrome the five player views draw (issue 1514).

  Crafting, Alchemy, Gathering, Journal and Inventory each hand-rolled the same centred fill for
  their loading, error, no-actor and empty branches. Extract each `.<prefix>-view-state {` block,
  replace the prefix, and all five hashed identically: `display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:12px; height:100%; color:var(--fab-text-muted);
  background:var(--fab-surface)` plus `i { font-size: 32px }` and `p { margin: 0; font-size: 14px }`.
  Five copies of one rule set is the shape `openspec/specs/design-system/spec.md` exists to stop, so
  they are one composition here and the per-view blocks are deleted.

  ── THE BRANCH SET IS DATA, NOT A SHAPE THIS FILE KNOWS ─────────────────────────────────────────
  The set differs per view and the difference is real: Crafting and Inventory can be actorless AND
  empty, Alchemy can be actorless but never empty, Gathering and Journal have no no-actor branch of
  their own — Journal spells its actorless branch `empty`. A composition that hard-coded four
  branches would force every view onto the widest one's vocabulary and invent states two of them
  cannot reach, so the caller passes the branches it can reach, in priority order, and this file
  renders the FIRST whose `when` is true. When none is, the ready content renders instead.

  ── THE HOOK NAME AND VALUE ARE FORWARDED VERBATIM ──────────────────────────────────────────────
  Each branch carries its own `hook`/`value` pair and neither is normalised. The attribute NAME
  differs per view (`data-crafting-state`, `data-alchemy-state`, `data-gathering-state`,
  `data-journal-state`, `data-inventory-state`) and at least one VALUE is a lie about its own
  branch: `JournalView` renders `data-journal-state="empty"` for a no-actor state. Both are data.
  The readers are ~14 Playwright locators in `scripts/foundry-test-run.mjs` and five mounted suites,
  and a Playwright locator whose hook has gone HANGS the phase rather than failing it — so the
  attribute is written from the branch exactly as the caller spelled it, never derived from `kind`.

  Written as a spread so an unset hook is genuinely absent rather than an empty attribute a
  presence selector would still match, and so the VALUE reaches the DOM as written. `EmptyState`
  coerces a bare hook to `data-x="true"` via `dataValue || true`; this one does not, because it
  carries the box these hooks have always sat on and an exact-value reader must see what it saw
  before.

  ── THE ERROR BRANCH IS A `Notice`, AND THE ROUTING RULE IS WHY ─────────────────────────────────
  It was a `Callout` and that was the wrong primitive by the library's own rule
  (`library.html:1058`): a callout is DOCUMENTATION — always true, stays put — and a notice is
  STATE, something that just happened. "Couldn't load your inventory." is state. So is the
  companion fault strip in `FabricateAppRoot.svelte`, which this same change routes to `Notice`
  for the same reason; routing the two the same way is the point of having the rule.

  It also closes a gap the callout could not: a load failure appears without a focus change, and
  a non-blocking `Notice` carries `role="status"` with `aria-live="polite"`, where `Callout`
  emits `role="note"` or — with neither title nor actions, which is how this branch called it —
  nothing at all. `blocking` is deliberately NOT passed: it would take `role="alert"` and drop
  the live region, and one failed view is not an interruption.

  ── THIS FILE OWNS THE WRAPPER, AND THE FILL WITH IT ────────────────────────────────────────────
  The five blocks are `height: 100%` centred fills. `EmptyState`'s panel is padding-driven and
  declares no height, and its documented escape for a container that must fill is `contextClass`,
  "whose rules live in the global sheet" (`EmptyState.svelte:53-55`) — which would put
  `styles/fabricate.css` on this change's path, and the measurement that the player app's thumbs,
  tiles and tracks are ALL in component-scoped blocks is what lets this work branch off `main` at
  all. So the fill is declared here, in this file's own scoped block, and the primitives are nested
  inside it.

  ── WHY THIS IS BANKED RATHER THAN REGISTERED ───────────────────────────────────────────────────
  It clears the two-caller membership bar five times over and is still not a primitive:
  `spec.md:43` says "a candidate that decomposes entirely into existing members is a COMPOSITION
  and MUST NOT enter the set", and this decomposes into `EmptyState` and `Notice` plus one line of
  chrome. It cannot take a `notAPrimitive` row either — `tests/design-system-primitives.test.js`
  caps a recorded non-member at one caller. So it takes an `unregisteredSharedComponents` row in
  `tests/components/design-system-known-debt.json`, which is the register's answer for a
  screen-region composition rather than a gap in it.

  THAT ANSWER IS PATH-CONDITIONAL. The banked route holds only while this file lives OUTSIDE
  `src/ui/svelte/components/` and inside `src/ui/svelte/`. The same file under `components/` would
  be inside the primitive directory, would demand a MANIFEST row and a `library.html` specimen
  instead, and would falsify the paragraph above. It stays under `apps/`, which is also where its
  callers are.

  Props:
   - branches: the states this view can reach, in priority order. Each is
     `{ when, kind, hook, value, icon, message }`; `kind` is `'loading' | 'error' | 'empty'` and
     selects the treatment, `hook`/`value` are the test and screenshot hook, `icon` is Font Awesome
     classes and `message` is the already-localized sentence.
   - children: the ready content, rendered when no branch matches. A snippet rather than a wrapper
     element, so adopting this composition adds no node to the populated tree and the caller's own
     scoped rules keep reaching their markup.
-->
<script>
  import EmptyState from './manager/EmptyState.svelte';
  import Notice from '../components/Notice.svelte';

  let { branches = [], children = undefined } = $props();

  const branch = $derived(branches.find((candidate) => candidate.when) ?? null);

  // Spread so the hook is genuinely absent when unset, and so the value arrives verbatim.
  const hookAttributes = $derived(branch?.hook ? { [branch.hook]: branch.value } : {});
</script>

{#if branch}
  <!-- `aria-busy` on the view ROOT, because while a view is loading this element IS the view: a
       spinner with no busy state and no accessible name is indistinguishable from an empty screen
       to a screen reader. The visible `<p>` beside the glyph is the label that says what is
       loading, and the glyph is hidden from the accessibility tree so the sentence is the only
       thing announced. -->
  <div
    class="fab-view-state"
    aria-busy={branch.kind === 'loading' ? 'true' : undefined}
    {...hookAttributes}
  >
    {#if branch.kind === 'loading'}
      <i class={branch.icon} aria-hidden="true"></i>
      <p>{branch.message}</p>
    {:else if branch.kind === 'error'}
      <!-- `Notice`, NOT `Callout` (issue 1514). The routing rule at `library.html:1058` is
           meaning first: a CALLOUT is documentation, always true and stays put; a NOTICE is
           STATE — it just happened. A view that failed to load is state, and it is the same
           reading `FabricateAppRoot` already applies to the companion fault strip two files
           over. The `role="status"` and `aria-live="polite"` a non-blocking notice carries are
           what a load failure appearing without a focus change wants, and the callout this
           replaces carried no role at all. -->
      <Notice tone="danger" icon={branch.icon} title={branch.message} />
    {:else}
      <EmptyState icon={branch.icon} title={branch.message} />
    {/if}
  </div>
{:else}
  {@render children?.()}
{/if}

<style>
  /* The fill the five deleted blocks declared, byte for byte, with the one 12px literal taken to
     the published spacing token it already equalled — `--fab-space-3` is 12px, so nothing moves
     and five `spacing-known-literals` rows are paid down rather than re-banked under a new path. */
  .fab-view-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-3);
    height: 100%;
    color: var(--fab-text-muted);
    background: var(--fab-surface);
  }

  /* The loading line only. Both selectors are scoped to markup authored in THIS file, so neither
     reaches inside `EmptyState` or `Notice` — each of those keeps its own type, which is the
     point of nesting a primitive rather than re-styling one from its host. */
  .fab-view-state i {
    font-size: 32px;
  }

  .fab-view-state p {
    margin: 0;
    font-size: 14px;
  }
</style>
