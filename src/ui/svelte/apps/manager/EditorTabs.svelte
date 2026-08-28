<!-- Svelte 5 runes mode -->
<!--
  THE manager's editor tab strip (issue 1362, epic 1357).

  A PROMOTION, not a ninth strip. `environment/EnvironmentEditorTabs` and
  `system/SystemEditorTabs` already shared byte-identical badge logic, keyboard handling
  and markup, and `recipe-item/RecipeItemEditorTabs` carries the same props with three
  additions; `checks/ChecksEditorTabs` and `downtime/WorldDowntimeTabs` already prove that
  a caller-supplied tab list is a shipped pattern here. All three of those first strips
  are callers of this component now, and the six scoped-entity editors PRs 6a-c and 7 add
  consume it rather than authoring a tenth copy.

  ── THE DOM CONTRACT IS A PROP, because the three sites do not share one ────────────────

  A naive extraction of "tabs, activeTab, badges, onSelect" silently drops three
  externally-consumed contracts, each read by something outside this component:

   - the HOOK ATTRIBUTE NAME, which has no common stem — `data-environment-tab-button`,
     `data-system-tab`, `data-recipe-item-tab-button` — and is read by the smoke harness,
     the View Lab registry and ~25 mounted assertions;
   - the BUTTON `id` and `aria-controls` STEM, whose PANEL ids are rendered by
     `EnvironmentEditView.svelte`, `SystemEditView.svelte` and `RecipeItemEditor.svelte`.
     Changing a stem would either dangle every `aria-controls` or drag three more files
     into the change;
   - the per-site `aria-label` lang key.

  So each is a prop, and no converted site changes a rendered id, `aria-controls`,
  `data-*` attribute name or badge class.

  ── THE DANGER BADGE IS A CAPABILITY, not a fourth copy ─────────────────────────────────

  `RecipeItemEditorTabs` alone carried an `is-danger` button class with a scoped style
  block, a badge hook with a tone attribute, and a `badgeTone` mapping (`success` to the
  chip's `active`) its siblings lack. A primitive extracted from Environment and System
  alone would drop all three, so they live here: `danger` turns the button treatment on,
  `badgeAttribute` names the per-badge hook, and the tone mapping is unconditional —
  no shipped caller passes `success`, so making it universal changes no rendered output
  and removes the trap of two tone vocabularies.

  Props:
   - tabs: `{id, icon, labelKey, label}[]`, in render order. `labelKey` is looked up and
     `label` is the English fallback, matching the `text()` contract everywhere else.
   - activeTab / onSelect(tabId) / badges: as before. A badge is a plain value or
     `{label, tone}` where tone is one of neutral/success/warning/danger.
   - ariaLabelKey / ariaLabel: the strip's own accessible name.
   - idStem: builds `<stem>-tab-<id>` and `aria-controls="<stem>-panel-<id>"`.
   - hookAttribute: the per-button `data-*` name carrying the tab id.
   - badgeAttribute: the per-badge `data-*` name carrying the tab id; '' renders none.
   - containerClass / buttonClass / badgeClass: the site's existing classes, kept so no
     shipped rule in `styles/fabricate.css` stops matching.
   - danger: whether a danger badge also tints its button.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Chip from './Chip.svelte';

  let {
    tabs = [],
    activeTab = '',
    badges = {},
    onSelect = () => {},
    ariaLabelKey = '',
    ariaLabel = '',
    idStem = 'editor',
    hookAttribute = 'data-editor-tab-button',
    badgeAttribute = '',
    containerClass = 'manager-editor-tabs',
    buttonClass = 'manager-editor-tab-button',
    badgeClass = 'manager-editor-tab-badge',
    danger = false,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function badgeList(tab) {
    const value = badges?.[tab.id];
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return values
      .map((badge) => {
        if (badge && typeof badge === 'object') {
          return {
            label: badge.label ?? badge.value ?? '',
            tone: badge.tone || (tab.id === 'validation' ? 'danger' : 'neutral'),
          };
        }
        return {
          label: badge,
          tone: tab.id === 'validation' ? 'danger' : 'neutral',
        };
      })
      .filter((badge) => badge.label !== '' && badge.label !== 0);
  }

  // A badge tone name is this component's own vocabulary; `Chip` names the colour families
  // differently (`success` is `active` there), so translate rather than leak one spelling
  // into the other (issue 883).
  function badgeTone(tone) {
    if (tone === 'danger') return 'danger';
    if (tone === 'warning') return 'warning';
    if (tone === 'success') return 'active';
    return 'neutral';
  }

  function isDangerTab(tab) {
    return danger && badgeList(tab).some((badge) => badge.tone === 'danger');
  }

  function buttonAttributes(tab) {
    return { [hookAttribute]: tab.id };
  }

  function badgeAttributes(tab, badge) {
    if (!badgeAttribute) return {};
    return { [badgeAttribute]: tab.id, 'data-badge-tone': badge.tone };
  }

  function onKeydown(event, index) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + delta + tabs.length) % tabs.length;
    onSelect(tabs[nextIndex].id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }
</script>

<div class={containerClass} role="tablist" aria-label={text(ariaLabelKey, ariaLabel)}>
  {#each tabs as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`${idStem}-tab-${tab.id}`}
      class={`${buttonClass} ${activeTab === tab.id ? 'is-active' : ''} ${isDangerTab(tab) ? 'is-danger' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={`${idStem}-panel-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      {...buttonAttributes(tab)}
      onclick={() => onSelect(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{text(tab.labelKey, tab.label)}</span>
      {#each badgeList(tab) as badge, badgeIndex (`${tab.id}-${badgeIndex}`)}
        <Chip tone={badgeTone(badge.tone)} class={badgeClass} {...badgeAttributes(tab, badge)}
          >{badge.label}</Chip
        >
      {/each}
    </button>
  {/each}
</div>

<style>
  /* The validation tab turns danger when its badge is a failing count (design
     §7.5): the label and its underline follow the danger colour. Authored here rather
     than in `RecipeItemEditorTabs`, because the button this rule targets is rendered by
     THIS component — a scoped block left behind on the caller would match nothing and
     fail the unused-selector warning gate. */
  .manager-editor-tab-button.is-danger {
    color: var(--fab-danger-text);
  }

  .manager-editor-tab-button.is-danger.is-active {
    border-bottom-color: var(--fab-danger-border);
  }
</style>
