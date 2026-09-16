<!--
  THE manager's editor tab strip: a `role="tablist"` of buttons, each optionally carrying one or more
  MARKS, with the ARIA tablist keyboard pattern. Nine hand-rolled strips converged here.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tabs` / `activeTab` / `onSelect(tabId)` | `{ id, icon, labelKey, label }[]` / string / function | `[]` / `''` / no-op | The tabs in render order, where `labelKey` is looked up and `label` is the English fallback; the current tab; and the selection callback. The strip holds no state. |
  | `badges` | per tab id: one mark, or an array of them | `{}` | A mark is a plain value, or `{ vehicle, label, tone, name, class, suppressZero }`. `tone` ∈ neutral/success/positive/warning/danger and applies to the CHIP; `name` is the accessible name, REQUIRED by any mark that renders no readable text; `class` is one modifier class appended to `badgeClass` on the chip only; `suppressZero` defaults true. A tab may carry more than one mark, because a section can be both authored and unready at once. |
  | `ariaLabelKey` / `ariaLabel` | strings | `''` | The strip's own accessible name. |
  | `idStem` / `buttonIdStem` / `panelIdStem` | strings | `'editor'` / `''` / `''` | `idStem` builds `<stem>-tab-<id>` and `aria-controls="<stem>-panel-<id>"`; the other two override either half of that pair for a site whose ids do not share the `-tab-`/`-panel-` shape. |
  | `activePanelOnly` | boolean | `false` | Emit `aria-controls` ONLY on the selected tab. Not cosmetic: a strip rendering one panel at a time otherwise points every unselected tab at an id not in the document, which assistive technology reports as a broken relationship rather than as "not currently shown". |
  | `hookAttribute` / `containerAttribute` / `badgeAttribute` / `countAttribute` / `dotAttribute` | `data-*` names | see source | The per-button, per-tablist and per-vehicle hooks carrying the tab id; `''` renders none. One per vehicle because the shipped hooks do not share a stem. |
  | `containerClass` / `buttonClass` / `badgeClass` / `danger` | class strings / boolean | the primitive's own family / `false` | The site's existing classes, kept so no shipped rule stops matching — the COUNT and DOT have no such prop, because their classes ARE the drawing — and whether a danger chip also tints its button. |

  Invariants:
  - THE DOM CONTRACT IS A PROP, because the converging sites do not share one: the hook attribute
    name has no common stem and is read by the smoke harness, the View Lab registry and ~25 mounted
    assertions; the button `id` and `aria-controls` stem has its PANEL ids rendered by the caller;
    and the `aria-label` lang key is per-site. No converted site changes a rendered id or class.
  - THE MARK FAMILY IS CLOSED, AND WHICH MARK A STRIP DRAWS IS DECIDED BY WHAT IT MEANS.
    `DOMAIN.md`'s Rail Marker Family names four marks that MUST NOT be substituted for one another:
    `count` is a RECORD COUNT, a bare mono numeral; `issue` is an ISSUE SUMMARY, the filled toned
    chip, amber because it asks for attention rather than because anything is wrong; `dot` is the
    filled dot, distinguished by SHAPE as well as colour and therefore REQUIRING a text accessible
    name, so a nameless dot is DROPPED; and the PREMIUM chip is scoped by canon to the manager rail.
    A mark naming no vehicle is the ISSUE chip, and an unrecognised name falls back to it.
  - A CALLER NAMES A VEHICLE AND THE PRIMITIVE OWNS THE DRAWING: no call site supplies markup, a
    class or a shape, and A MARK CARRIES NO `icon`. The pass mark is the issue chip's LABEL rather
    than a fourth vehicle, and `class` appends a token to a chip this primitive still draws.
  - `positive` IS `Chip`'s OWN SPELLING of the success family, passed through rather than folded
    into `success`. THE STRIP IS ROOTED AT `fabricate-tabs`, written ahead of whatever
    `containerClass` carries, per `openspec/specs/design-system/spec.md`.
-->
<script>
  import { localize } from '../util/foundryBridge.js';
  import Chip from './Chip.svelte';

  const DEFAULT_CLASSES = Object.freeze({
    container: 'manager-editor-tabs',
    button: 'manager-editor-tab-button',
    badge: 'manager-editor-tab-badge',
  });

  let {
    tabs = [],
    activeTab = '',
    badges = {},
    onSelect = () => {},
    ariaLabelKey = '',
    ariaLabel = '',
    idStem = 'editor',
    buttonIdStem = '',
    panelIdStem = '',
    activePanelOnly = false,
    hookAttribute = 'data-editor-tab-button',
    containerAttribute = '',
    badgeAttribute = '',
    countAttribute = '',
    dotAttribute = '',
    containerClass = DEFAULT_CLASSES.container,
    buttonClass = DEFAULT_CLASSES.button,
    badgeClass = DEFAULT_CLASSES.badge,
    danger = false,
  } = $props();

  const buttonStem = $derived(buttonIdStem || `${idStem}-tab`);
  const panelStem = $derived(panelIdStem || `${idStem}-panel`);

  const VEHICLES = new Set(['count', 'issue', 'dot']);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function normalizeMark(tab, mark) {
    const fallbackTone = tab.id === 'validation' ? 'danger' : 'neutral';
    if (mark && typeof mark === 'object') {
      const vehicle = VEHICLES.has(mark.vehicle) ? mark.vehicle : 'issue';
      return {
        vehicle,
        label: mark.label ?? mark.value ?? '',
        tone: mark.tone || fallbackTone,
        name: mark.name ?? '',
        class: mark.class ?? '',
        suppressZero: mark.suppressZero !== false,
      };
    }
    return {
      vehicle: 'issue',
      label: mark,
      tone: fallbackTone,
      name: '',
      class: '',
      suppressZero: true,
    };
  }

  function isDrawable(mark) {
    if (mark.vehicle === 'dot') return mark.name !== '';
    if (mark.label === '' || mark.label === null || mark.label === undefined) return false;
    return !(mark.label === 0 && mark.suppressZero);
  }

  function markList(tab) {
    const value = badges?.[tab.id];
    const values = Array.isArray(value)
      ? value
      : value === undefined || value === null
        ? []
        : [value];
    return values.map((mark) => normalizeMark(tab, mark)).filter(isDrawable);
  }

  function badgeTone(tone) {
    if (tone === 'danger') return 'danger';
    if (tone === 'warning') return 'warning';
    if (tone === 'success') return 'active';
    if (tone === 'positive') return 'positive';
    return 'neutral';
  }

  function isDangerTab(tab) {
    return (
      danger && markList(tab).some((mark) => mark.vehicle === 'issue' && mark.tone === 'danger')
    );
  }

  function containerAttributes() {
    if (!containerAttribute) return {};
    return { [containerAttribute]: '' };
  }

  function buttonAttributes(tab) {
    if (!hookAttribute) return {};
    return { [hookAttribute]: tab.id };
  }

  function markAttributes(tab, mark) {
    if (mark.vehicle === 'count') return countAttribute ? { [countAttribute]: tab.id } : {};
    if (mark.vehicle === 'dot') return dotAttribute ? { [dotAttribute]: tab.id } : {};
    const attributes = badgeAttribute
      ? { [badgeAttribute]: tab.id, 'data-badge-tone': mark.tone }
      : {};
    if (mark.name) attributes['aria-label'] = mark.name;
    return attributes;
  }

  function badgeClasses(mark) {
    return [badgeClass, mark.class].filter(Boolean).join(' ');
  }

  function targetIndex(key, index) {
    if (key === 'ArrowRight') return (index + 1) % tabs.length;
    if (key === 'ArrowLeft') return (index - 1 + tabs.length) % tabs.length;
    if (key === 'Home') return 0;
    if (key === 'End') return tabs.length - 1;
    return -1;
  }

  function onKeydown(event, index) {
    const nextIndex = targetIndex(event.key, index);
    if (nextIndex < 0) return;
    event.preventDefault();
    onSelect(tabs[nextIndex].id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }
</script>

<div
  class={`fabricate-tabs ${containerClass}`}
  role="tablist"
  aria-label={text(ariaLabelKey, ariaLabel)}
  {...containerAttributes()}
>
  {#each tabs as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`${buttonStem}-${tab.id}`}
      class={`${buttonClass} ${activeTab === tab.id ? 'is-active' : ''} ${isDangerTab(tab) ? 'is-danger' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={activePanelOnly && activeTab !== tab.id ? undefined : `${panelStem}-${tab.id}`}
      tabindex={activeTab === tab.id ? 0 : -1}
      data-keyboard-focus="true"
      {...buttonAttributes(tab)}
      onclick={() => onSelect(tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
    >
      <i class={tab.icon} aria-hidden="true"></i>
      <span>{text(tab.labelKey, tab.label)}</span>
      {#each markList(tab) as mark, markIndex (`${tab.id}-${markIndex}`)}
        {#if mark.vehicle === 'count'}
          <span class="manager-editor-tab-count" {...markAttributes(tab, mark)}>{mark.label}</span>
        {:else if mark.vehicle === 'dot'}
          <span
            class="manager-editor-tab-dot"
            role="img"
            aria-label={mark.name}
            {...markAttributes(tab, mark)}
          ></span>
        {:else}
          <Chip
            tone={badgeTone(mark.tone)}
            class={badgeClasses(mark)}
            {...markAttributes(tab, mark)}>{mark.label}</Chip
          >
        {/if}
      {/each}
    </button>
  {/each}
</div>

<style>
  :global(.manager-editor-tab-button.is-danger) {
    color: var(--fab-danger-text);
  }

  :global(.manager-editor-tab-button.is-danger.is-active) {
    border-bottom-color: var(--fab-danger-border);
  }
</style>
