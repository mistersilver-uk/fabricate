<!-- Svelte 5 runes mode -->
<!--
  THE WORLD SCOPED-ENTRY EDITOR'S HEADER ACTION PAIR (issue 1372, epic 1357).

  `design-system/spec.md`'s EDITOR recipe orders "the action pair with back before save", and the
  prototype draws it right-aligned on the title line of every entry editor: `← Back`, then
  `Save essence` (`essEntry.png`). The essence entry ships it first and the tool entry takes it
  next, so it is ONE component rather than two copies of the same pair — two screens of one
  archetype rendering their action pair from two places is the recipe drift that spec sentence
  exists to prevent.

  ── IT LIVES IN THE SHELL'S HEADER BAND, WHICH IS WHY IT IS A COMPONENT AT ALL ─────────────────
  `.manager-header` is a SIBLING of `.manager-main`, so an entry page structurally cannot render
  into it — the same reason the three-crumb breadcrumb and the entity-named heading beside it are
  the shell's. This component is rendered by `CraftingSystemManagerRoot.svelte` inside the
  existing `.manager-header-actions` div and adds no region of its own.

  ── SAVE IS `is-primary`, NOT THE PROTOTYPE'S PEACH ────────────────────────────────────────────
  The maintainer's standing ruling on this epic: Fabricate's shipped button-role semantics win
  over the prototype's palette where the two disagree. `+ New essence` on the catalogue beside
  this screen already ships `role="primary"` against the same peach mock, so a Save painted peach
  here would be the one primary verb in the manager that is not the primary colour.

  ── SAVE IS DISABLED WHEN THERE IS NOTHING TO FLUSH ────────────────────────────────────────────
  A Save that always looked available would say nothing about whether the GM's last edit had
  landed, which is the one question an explicit-save screen exists to answer. `saveDisabled` is
  the caller's dirty flag; `saving` disables it too, so a slow write cannot be double-submitted.

  Props:
   - onBack / onSave: the two verbs. Back is routed through the shell's own route-exit gate by the
     caller, so an unsaved edit prompts on Back exactly as it does on the rail and the breadcrumb.
   - backLabel / saveLabel: pre-localized by the caller, because the Save names the RECORD
     (`Save essence`, `Save tool`) and a noun-free label cannot carry article agreement — the same
     rule `ui-integration/spec.md` states for the scoped list shells' generic chrome copy.
   - backAttribute / saveAttribute: the per-site `data-*` hook names, carried as props exactly as
     `EditorTabs` carries its own, because the two sites' hooks are per-screen selectors that the
     tests and the capture registry name and this component must not rename.
   - danger: an OPTIONAL snippet rendered BETWEEN back and save. Absent by default, so the
     essence entry renders exactly the pair it always did.

  ── WHY A SNIPPET AND NOT SIX MORE PROPS ──────────────────────────────────────────────────────
  The design's world Tool entry draws `← Back to tools · Delete · Save tool` (`tool-entry.png`),
  and Delete is not a third `ManagerButton`: it is the shipped two-step `ArmedDangerButton`,
  which carries an arm token, two labels, two consequence sentences and three callbacks. Typing
  all nine onto this component would make it the union of its callers and would put a Tool's
  delete vocabulary inside a shell shared by every scoped entry editor. The caller renders its
  own control into the slot; this component owns only the ORDER, which is the recipe's rule.
-->
<script>
  import ManagerButton from '../../../components/ManagerButton.svelte';

  let {
    onBack = () => {},
    onSave = () => {},
    backLabel = '',
    saveLabel = '',
    saveDisabled = false,
    saving = false,
    backAttribute = 'data-scoped-entry-back-action',
    saveAttribute = 'data-scoped-entry-save-action',
    danger = undefined,
  } = $props();

  // A computed attribute name cannot be written as a literal in markup, so each hook is spread as
  // a one-key object. The VALUE is the empty string, which renders as a bare `data-*` attribute —
  // the same form the shell wrote by hand before this pair was extracted.
  const backHook = $derived({ [backAttribute]: '' });
  const saveHook = $derived({ [saveAttribute]: '' });
</script>

<ManagerButton {...backHook} onclick={() => onBack()}>
  <i class="fas fa-arrow-left" aria-hidden="true"></i>
  <span>{backLabel}</span>
</ManagerButton>
{#if danger}{@render danger()}{/if}
<ManagerButton
  role="primary"
  {...saveHook}
  disabled={saveDisabled || saving === true}
  onclick={() => onSave()}
>
  <i class="fas fa-floppy-disk" aria-hidden="true"></i>
  <span>{saveLabel}</span>
</ManagerButton>
