<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE document drop target: a dashed empty prompt that becomes a linked card
  once the caller resolves a document, with optional copy-uuid and unlink actions.

  ── THE THIRTEEN `kind ===` BRANCHES ARE GONE (2026-09-07, issue 1509) ──────────
  Issue 1372 generalised the UNLINK hook to `unlinkAttr` for the reason
  `essence-studio-fidelity.test.js` bans by name — a primitive that grows a branch per caller is
  a union of its callers — and then declined to convert the branches already shipped, "because
  converting a shipped site changes ids at a site this change has no reason to touch". That
  objection is discharged rather than contradicted: issue 1509 edits every one of these call
  sites anyway, to root this family at `fabricate-link-field`, so the conversion costs nothing it
  was declining to spend. The thirteen tests — seven on the root, one on the hint, two on the
  copy action and three on the unlink action — are now ONE `hookAttrs` bag, in the shape
  `EditorValidationSurface` already ships, keyed by the CLOSED region set `root`, `hint`, `copy`,
  `unlink`. `item-drop-zone-source-contract.test.js` reads those names out of this file's own
  `hooksFor('…')` calls and refuses a call site naming anything else, because a bag keyed by name
  is otherwise SILENT about a name it does not recognise: `hookAttrs={{ rooot: … }}` spreads
  nothing and renders exactly like a site that passed no hook at all.

  `unlinkAttr` STAYS, and is not folded into the bag. It names ONE attribute rather than supplying
  a set, three callers pass it, and a caller passing both gets both — the world tool entry's
  source card is the shipped instance, carrying `data-tool-source-unlink` from its bag and
  `data-world-tool-entry-source-unlink` from this prop.

  ONE OF THE THIRTEEN WAS A STYLING HOOK RATHER THAN A TEST HOOK, and it is why a bag that
  normalised its values to booleans would have been wrong twice over. `styles/fabricate.css`
  declares `.fabricate-manager [data-tool-create-card] { flex: 0 0 auto; width: 100% }`, so
  dropping or renaming that attribute narrows the Tools catalogue's create prompt VISIBLY. It is
  also application-rooted and outside the `manager-item-drop-zone*` family, which is what leaves
  `fabricate-link-field` HOST-DEPENDENT for that one caller: a named residue owned by issue 1507,
  and a named exclusion from this primitive's host-independence set. The second half of the same
  trap is `data-tool-source-layout`, whose value is the STRING `'compact'` and not `true`.

  ONE MEASURED RENDERED RESIDUE, from the mechanism rather than from the bag. An element carrying a
  SPREAD is one whose class the compiler cannot know at build time, so it stamps this component's
  scope hash on it defensively — which means the hint `<small>` now renders `class="svelte-…"`
  where it previously carried no `class` attribute at all. The compiled CSS is byte-identical
  before and after (three rules, none of which names `small`), so the token matches nothing in the
  scoped block and nothing in the global sheet, and no pixel moves. The root and both actions are
  unaffected: the root already carried a class, and the two actions are `IconButton` COMPONENT
  tags whose rest spread lands inside that primitive. The same mechanism is why
  `data-manager-item-drop-zone` is written `=""` here rather than bare — a bare attribute on an
  element that has grown a spread arrives as boolean `true` and renders `="true"`, which is the
  defect `editor-validation-surface-source-contract.test.js` records its own surface hitting.

  WHY A CALLER WANTS ONE: the system-scope essence editor LOCKS a section's value card read-only
  while the section is inherited, and the whole observable consequence of that lock is that this
  control is ABSENT. Without a hook on it, the absence assertion runs against a selector nothing
  renders and passes on a tree where the lock was never built.

  ── WHAT IT ACCEPTS (issue 1036) ────────────────────────────────────────────────
  `documentType` (default `'Item'`) is the Foundry DOCUMENT NAME the payload must carry, so
  the same primitive serves an Item card and a Macro card rather than growing a second
  drop-zone component per document type.

  The uuid guard reads `resolveDropUuid(data)` rather than `data.uuid`. A COMPENDIUM drag
  emits `{ pack, id }` and NO `uuid`, and this zone's own guard was therefore STRICTER than
  its own consumers, every one of which already calls `resolveDropUuid` in its `onDrop`:
  the zone rejected a compendium drop before the consumer that would have accepted it ever
  saw it. That is the common case for a module-shipped document, not an edge one.

  `onDrop` still receives the RAW drag data, which is the shipped contract — a consumer
  resolves it itself and several read `pack`/`id` for provenance.

  ── STATE ───────────────────────────────────────────────────────────────────────
  `state` paints the linked card: `'linked'` (default) or `'missing'` for a link whose
  document no longer resolves. A broken link is otherwise indistinguishable from a working
  one, which is the failure the essence browser's needs-attention filter exists to surface.

  `subline` is a SECOND sub-line under `hint`, for a card that carries both a uuid and a
  description. It renders only when supplied, so every existing call site is unchanged.

  ── `compact`: A PROMPT, NEVER A SUMMARY (issue 1371, maintainer parity round 4) ─
  The default form resolves a document and then DESCRIBES it — art, name, address, hint and an
  action cluster. The reference has two zones that must never do that: the world Component
  entry's identity card carries a small trailing "drop to replace" target beside a component it
  is already showing in full, and its Source identity card carries the same target under a uuid
  it has just printed. In both places the default form draws the linked item a second time, in
  the same card, at a smaller size.

  `compact` is therefore not a density knob: it SUPPRESSES the identity block and the actions
  outright and renders exactly a glyph over a title over a note, whatever `item` holds. The
  caller keeps `item` for the drop guard and for `state`, and says what the zone is FOR in
  `title` / `hint` rather than having the primitive restate what it is already looking at.

  Two callers, which is the extend-before-add bar in `design-system/spec.md:25-69`.
-->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import { resolveDropUuid } from '../../util/dropUtils.js';
  import IconButton from '../../components/IconButton.svelte';

  let {
    item = null,
    title = '',
    hint = '',
    // THE RESOLVED DOCUMENT'S OWN ADDRESS, rendered as a mono line directly under the name
    // (issue 1372, maintainer parity round 7). It is NOT a sub-line and does not displace one:
    // the reference draws a linked value as name, then address, then a one-line summary, and the
    // shipped rule that a sub-line "never restates the raw uuid" is about the SUMMARY slot, which
    // still instructs. Empty by default, so every shipped call site renders byte-identically.
    uuid = '',
    subline = '',
    emptyIcon = 'fas fa-download',
    // PROMPT-ONLY. See the note above: this is not a density variant, it is a different claim
    // about what the zone is for. `false` by default, so every shipped caller is byte-identical.
    compact = false,
    // WHAT THE ZONE IS FOR, as a per-site id on `data-item-drop-zone`. It is NO LONGER a branch
    // selector: every attribute it used to switch on is now a caller's own `hookAttrs` entry.
    kind = '',
    documentType = 'Item',
    state = 'linked',
    disabled = false,
    copyLabel = '',
    unlinkLabel = '',
    unlinkAttr = '',
    // THE TEST AND STYLING HOOKS, one bag over a CLOSED region set — `root`, `hint`, `copy`,
    // `unlink` — each an object of attribute name to value, spread onto that region. `{}` for an
    // absent region, so a caller naming none renders byte-identically to one that passed no bag.
    //
    // A CALLER'S BAG IS NOT NECESSARILY STATIC, and the recipe-item overview is the shipped proof:
    // its `data-recipe-item-link` and `data-recipe-item-dropzone` are two faces of ONE state and
    // were conditioned on `item` rather than on the caller's id, so that site derives its bag from
    // its own link state. A static object there would render both attributes or neither.
    hookAttrs = {},
    onDrop = () => {},
    onCopy = null,
    onUnlink = null,
  } = $props();

  const isMissing = $derived(Boolean(item) && state === 'missing');
  // `{}` when unnamed, so the spread adds nothing and every shipped consumer's rendered output
  // is byte-identical.
  const unlinkAttrs = $derived(unlinkAttr ? { [unlinkAttr]: true } : {});
  /**
   * One region's hooks, or `{}`.
   *
   * `EditorValidationSurface`'s own `hooksFor` verbatim, so the two bags in this repository read
   * the same way and one source-contract shape guards both.
   *
   * @param {'root'|'hint'|'copy'|'unlink'} region One of the closed region set.
   * @returns {Record<string, unknown>} The attributes to spread onto that region.
   */
  const hooksFor = (region) => hookAttrs?.[region] ?? {};

  function handleDrop(data) {
    if (data?.type !== documentType) return;
    // `resolveDropUuid` covers BOTH shipped drag shapes — `{ uuid }` from the world
    // sidebar and `{ pack, id }` from a compendium. The guard only decides whether the
    // payload names a document at all; `onDrop` still receives the raw data.
    const uuid = resolveDropUuid(data);
    if (typeof uuid !== 'string' || !uuid.trim()) return;
    onDrop(data);
  }
</script>

<div
  class="fabricate-link-field manager-item-drop-zone"
  class:is-compact={compact}
  class:is-linked={Boolean(item) && !compact}
  class:is-missing={isMissing}
  class:is-disabled={disabled}
  data-manager-item-drop-zone=""
  data-item-drop-zone={kind || undefined}
  data-item-drop-state={isMissing ? 'missing' : undefined}
  {...hooksFor('root')}
  use:dragDrop={{ onDrop: handleDrop, activeClass: 'is-drop-active', disabled }}
>
  <span class="manager-item-drop-zone-icon" aria-hidden="true">
    <!-- THE GLYPH, NOT THE ART, in the compact form: the art is the identity the card beside
         this zone is already showing, and repeating it at 13px is the duplication that made the
         default form wrong for these two sites. -->
    {#if item?.img && !compact}<img src={item.img} alt="" />{:else}<i class={emptyIcon}></i>{/if}
  </span>
  <span class="manager-item-drop-zone-copy">
    <strong>{compact ? title : item?.name || title}</strong>
    {#if uuid && !compact}<code class="manager-item-drop-zone-uuid" data-item-drop-zone-uuid
        >{uuid}</code
      >{/if}
    {#if hint}<small {...hooksFor('hint')}>{hint}</small>{/if}
    {#if subline}<small data-item-drop-zone-subline>{subline}</small>{/if}
  </span>
  {#if item && !compact && (onCopy || onUnlink)}
    <span class="manager-item-drop-zone-actions">
      {#if onCopy}
        <IconButton
          ariaLabel={copyLabel}
          title={copyLabel}
          {...hooksFor('copy')}
          onclick={() => onCopy(item)}
        >
          <i class="fas fa-copy" aria-hidden="true"></i>
        </IconButton>
      {/if}
      {#if onUnlink}
        <IconButton
          class="is-danger"
          ariaLabel={unlinkLabel}
          title={unlinkLabel}
          {...hooksFor('unlink')}
          {...unlinkAttrs}
          onclick={onUnlink}
        >
          <i class="fas fa-link-slash" aria-hidden="true"></i>
        </IconButton>
      {/if}
    </span>
  {/if}
</div>

<style>
  /* The MISSING treatment (issue 1036). The primitive had no such state: a link whose
     document has been deleted rendered exactly like a working one, so the only way to find
     one was to click it. Edge and foreground only, so it composes with whatever geometry
     the global sheet gives a given `kind` rather than restating it.

     Scoped rather than global on purpose: a global-sheet edit matches the broad
     `theme-or-global-ui` screenshot recipe and would demand a wide frame set for a
     one-state addition.

     "Written at two classes so it beats the base rule it overrides" was the recorded reason and
     it is FALSE (2026-09-07, issue 1509). `styles/fabricate.css` is loaded into `layer(modules)`
     and a Svelte scoped block is injected UNLAYERED (`svelte.config.js:11` is `css: 'injected'`),
     so an unlayered declaration beats a layered one at ANY specificity and this rule would win
     written at one class. The two classes are KEPT because changing the class count is a change
     and this commit ships none it has not measured; the rule it overrides is now
     `.fabricate-link-field.manager-item-drop-zone`, at the same (0,2,0) it always had. The
     repository's computed-CSS harness (`tests/helpers/scoped-component-css.js`) models injection
     order and specificity and no layers at all, so it cannot see this either; that blind spot is
     issue 1507's. */
  .manager-item-drop-zone.is-missing {
    border-color: var(--fab-danger-border);
    color: var(--fab-danger-text);
  }

  .manager-item-drop-zone.is-missing strong {
    color: var(--fab-danger-text);
  }

  /* THE ADDRESS LINE. Mono, because it is an identifier a GM copies and compares character by
     character rather than reads, and one that a proportional face makes ambiguous between `l`,
     `1` and `I`. Sized under the sub-line so it never competes with the name above it, and
     allowed to break so a long compendium address cannot widen the card past its column. */
  .manager-item-drop-zone-uuid {
    display: block;
    font-family: var(--fab-font-mono);
    font-size: 0.68rem;
    color: var(--fab-text-subtle);
    overflow-wrap: anywhere;
  }
</style>
