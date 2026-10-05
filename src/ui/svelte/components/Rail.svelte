<!--
  ONE SECTION of a right-hand inspector column (`<Rail>`, `library.html`): a bare column at
  `--fab-space-2`, never the column itself, the nav rail's block or the player app rail.
  Props: `label` (the kicker, already localized, which then names the section as a `group`),
  `class` (an EXTRA class, appended to `fab-rail`) and `children` (the body). Unlabelled it is an
  unnamed `<section>`, never a `region`. The rest spread lands on the root after the naming.
  RECORDED DEBT: the kicker keeps the subtle ink (`--fab-text-subtle`, the 3.69:1 / 3.50:1 contrast
  debt `Kicker.svelte` records) so no converted frame moves. Its convergence belongs to issue 1523, the
  epic's sweep: move the label to `<Kicker>`'s muted ink, retire the library specimen's inline
  override and delete both inspector caller rules (the tool and recipe-item `.fab-rail-label` ones).
-->
<script>
  let { label = '', class: extraClass = '', children = undefined, ...rest } = $props();

  const uid = $props.id();
  const labelId = `${uid}-label`;
</script>

<section
  class={['fab-rail', extraClass]}
  role={label ? 'group' : undefined}
  aria-labelledby={label ? labelId : undefined}
  {...rest}
>
  {#if label}<p class="fab-rail-label" id={labelId}>{label}</p>{/if}
  {@render children?.()}
</section>

<style>
  .fab-rail {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The manager's eyebrow at the exemplar inspector's own figures (`.manager-kicker`), so no
     converted section moves; `Kicker`'s muted ink would. */
  .fab-rail-label {
    margin: 0 0 var(--fab-space-2xs);
    color: var(--fab-text-subtle);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }
</style>
