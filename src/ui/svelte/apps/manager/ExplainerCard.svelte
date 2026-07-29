<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE "how this surface works" explainer card: a glyph-led uppercase card
  title, a list of glyph-led guidance rows (each an optional bold lead-in plus prose), and
  an optional trailing row of docs links. Use it for the standing explanation a side panel
  offers about the screen it accompanies.

  It exists because the same explanation was built three ways (issue 881). The Tool Studio
  preview rendered `.manager-tool-how-it-works` — its own bordered card, its own 0.625rem
  sans heading, and a glyph-led list at 0.6875rem/1.5 — while the Tags & Categories
  inspector rendered the same meaning twice more, as a disc-bulleted `.manager-evidence-list`
  at 0.82rem ("How recipe categories work") and as a bare `.manager-muted` paragraph
  ("Reference-safe by default"). One meaning, three heading scales, three body scales.

  The card SHELL is not re-derived here: the root element wears the manager's existing
  `.manager-inspector-card` contract (padding, border, radius, fill, stack gap) and the
  title wears `.manager-card-title` (serif, weight, colour, uppercase). That is the point
  of the extraction — heading scale, weight, colour and padding stop being restated per
  surface. This block owns only what is specific to an explainer: the title's glyph
  alignment, the guidance rows, and the docs link.

  The rest of its CSS lives in this scoped `<style>`, not `styles/fabricate.css`, so
  `VIEW_RECIPES` in `scripts/ui-pr-screenshot-evidence.mjs` maps a change here to the views
  that actually render it instead of matching the broad `theme-or-global-ui` recipe.

  The list is a `<ul>`, not the `<ol>` the Tool Studio used: these are a SET of independent
  facts about a surface, not a numbered procedure. The numbered first-run procedure is a
  different thing and keeps its own `.manager-setup-card` / `.manager-setup-list`.

  Props:
   - icon: Font Awesome classes for the title glyph (omit for a glyph-less title).
   - title: the card title. Rendered through `.manager-card-title`.
   - items: the guidance rows, `[{ icon, lead, text }]`. `icon` is the row glyph (omit to
     release the glyph column), `lead` is the optional bold lead-in, `text` is the prose.
   - links: the optional trailing ghost docs links, `[{ href, label, icon }]`. A link needs
     BOTH an `href` and a `label` to render, because a labelled link with no target is worse
     than none, and `icon` defaults to the outbound-arrow glyph. This is a LIST rather than
     the single `docsHref`/`docsLabel` pair it replaces because the Checks rail offers two
     ways out of the same card — its own docs page and the Quickstart — and a primitive that
     capped the card at one link is exactly the incompatibility that keeps a hand-rolled
     card alive beside it (issue 883).
   - dataAttr / dataValue: an optional test/screenshot hook, e.g.
     `dataAttr="data-tool-how-it-works"`.

  A component wearing `.manager-*` classes belongs under `apps/manager/` (not the
  import-free `components/` leaf directory), which is why it lives here.
-->
<script>
  const DEFAULT_LINK_ICON = 'fas fa-arrow-up-right-from-square';

  let { icon = '', title = '', items = [], links = [], dataAttr = '', dataValue = '' } = $props();

  // Spread so the hook is genuinely absent when unset, rather than an empty attribute a
  // selector would still match.
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
  const rows = $derived(Array.isArray(items) ? items : []);
  const docsLinks = $derived(
    (Array.isArray(links) ? links : []).filter((link) => link?.href && link?.label)
  );
</script>

<section class="manager-inspector-card manager-explainer-card" {...hookAttributes}>
  <h3 class="manager-card-title manager-explainer-card-title">
    {#if icon}
      <i class={icon} aria-hidden="true"></i>
    {/if}
    <span>{title}</span>
  </h3>
  <ul class="manager-explainer-card-list">
    {#each rows as row, index (row.text || index)}
      <li class:is-glyphless={!row.icon}>
        {#if row.icon}
          <i class={row.icon} aria-hidden="true"></i>
        {/if}
        <!--
          The separator is the expression `{' '}`, not a literal space: a literal one is the
          last token inside the `{#if}` and Svelte trims block-trailing whitespace, so the
          lead-in ran straight into the prose ("Made from a game-world Item.Drag any Item…").
          Structural assertions cannot see it — it was caught in a screenshot (issue 881).

          The `eslint-disable-next-line` below suppresses the mustache, and it must stay
          glued to this close tag: a markup comment on its own line here adds a second
          whitespace text node between glyph and prose.

          `prettier-ignore` preserves the LINE ANCHOR of the directive above; it is not a
          rendering guard (issue 923). The render is safe either way — `{' '}` is an
          expression, and both forms compile to the same template. What breaks is the
          suppression: Prettier always splits a `<span>` containing an `{#if}` across three
          lines, whatever the width, which moves the mustache to the second line after an
          `eslint-disable-next-line` that is anchored to the first. The directive then
          suppresses nothing and the violation resurfaces as an unsuppressed error.
          The fence must be the LAST comment before the element or Prettier ignores it.

          The fence is the local fix, not the guard for the class: `linterOptions:
          { reportUnusedDisableDirectives: 'error' }` on the `.svelte` block in
          `eslint.config.js` is what makes a directive that has drifted off its violation
          fail `lint:svelte` instead of rotting quietly.
        --><!-- eslint-disable-next-line svelte/no-useless-mustaches --><!-- prettier-ignore -->
        <span>{#if row.lead}<strong>{row.lead}</strong>{' '}{/if}{row.text}</span>
      </li>
    {/each}
  </ul>
  <!--
    `.manager-setup-links` is the manager's existing contract for a wrapping row of card
    links — `display: flex; flex-wrap: wrap` on the row and `flex: 1 1 112px` on each
    button. It is reused here rather than re-derived in the scoped block below: a single
    link still stretches to the card width exactly as it did when this was one anchor with
    `justify-self: stretch`, and two share the row and wrap when the rail is narrow. The
    `manager-explainer-card-docs` class carries no styling; it is the hook the Tool Studio
    mounted suite selects the link by.
  -->
  {#if docsLinks.length > 0}
    <div class="manager-setup-links">
      {#each docsLinks as link (link.href)}
        <a
          class="manager-button is-ghost manager-explainer-card-docs"
          href={link.href}
          target="_blank"
          rel="noreferrer"
        >
          <i class={link.icon || DEFAULT_LINK_ICON} aria-hidden="true"></i>
          <span>{link.label}</span>
        </a>
      {/each}
    </div>
  {/if}
</section>

<style>
  /* Theme-root tokens ONLY. This component is area-agnostic, so it must not reference
     `--fab-mv2-*` or any other alias declared on `.fabricate-manager` (styles/fabricate.css
     declares those inside that area block). Outside the manager — `.fabricate-app`,
     `.fabricate-admin`, `.fabricate-interactables-manager` — such a property is not in
     scope, the declaration becomes invalid at computed-value time and the colour silently
     falls back to inheritance. Nothing fails; it just looks wrong, and the trigger is
     exactly the reuse this primitive exists to enable. Every token below is declared in
     `:root` or in all seven `.fabricate[data-fabricate-theme="…"]` blocks, which every
     Fabricate surface carries. */

  /* The title's SCALE, WEIGHT, COLOUR and FAMILY come from `.manager-card-title` in the
     global sheet — the manager's one card-title contract. This rule adds only the glyph
     alignment, so the explainer stops being a fourth heading treatment. */
  .manager-explainer-card-title {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-explainer-card-title > span {
    min-width: 0;
    overflow-wrap: break-word;
  }

  .manager-explainer-card-list {
    display: grid;
    gap: 11px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-explainer-card-list > li {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: start;
    gap: var(--fab-space-2);
    color: var(--fab-text-muted);
    font-size: 0.6875rem;
    line-height: 1.5;
  }

  /* A glyph-less row releases the column instead of holding 20px of empty space. */
  .manager-explainer-card-list > li.is-glyphless {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Nudged to the prose's first-line baseline rather than the row box top, so the glyph
     reads as part of the sentence at every wrap length. */
  .manager-explainer-card-list > li > i {
    margin-top: 0.2em;
    color: var(--fab-accent);
    text-align: center;
  }

  .manager-explainer-card-list > li > span {
    min-width: 0;
    overflow-wrap: break-word;
  }

  /* No rule for the docs links. Their row is `.manager-setup-links`, whose flex/wrap/gap
     and per-button `flex: 1 1 112px` already live in the global sheet as the manager's one
     card-link-row contract; restating either here would be the second declaration this
     pass exists to remove. The button's own geometry stays global too, because it has to
     beat Foundry's host button rules. */
</style>
