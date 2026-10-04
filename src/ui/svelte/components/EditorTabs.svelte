<!--
  THE manager's editor tab strip: a `role="tablist"` of buttons, each optionally carrying one or more
  MARKS, with the ARIA tablist keyboard pattern. Every converted hand-rolled strip renders it.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tabs` / `activeTab` / `onSelect(tabId)` | `{ id, icon, labelKey, label }[]` / string / function | `[]` / `''` / no-op | The tabs in render order, where `labelKey` is looked up and `label` is the English fallback, and a tab with no `icon` draws no glyph; the current tab; and the selection callback. The strip holds no selection state. |
  | tab `ariaLabelKey` / `ariaLabel` | key / English fallback | absent | The tab's accessible name, which MUST contain its visible label; absent writes no `aria-label`. |
  | tab `tooltipKey` / `tooltip` | key / English fallback | absent | The tab's description: a `role="tooltip"` sibling after the tablist, named by the tab's `aria-describedby` and placed above its tab, start-aligned to it, clamped inside the caller's nearest positioned ancestor. |
  | tab `tierGated` | boolean | `false` | Draws the premium padlock after the label; the tab stays focusable and selectable. |
  | `badges` | per tab id: one mark, or an array of them | `{}` | A mark is a plain value, or `{ vehicle, label, tone, name, class, suppressZero }`. `tone` ∈ neutral/success/positive/warning/danger and applies to the CHIP; `name` is the accessible name, REQUIRED by any mark that renders no readable text; `class` is one modifier class appended to `badgeClass` on the chip only; `suppressZero` defaults true. A tab may carry more than one mark, because a section can be both authored and unready at once. |
  | `ariaLabelKey` / `ariaLabel` | strings | `''` | The strip's own accessible name. |
  | `idStem` / `buttonIdStem` / `panelIdStem` | strings | `'editor'` / `''` / `''` | `idStem` builds `<stem>-tab-<id>` and `aria-controls="<stem>-panel-<id>"`; the other two override either half of that pair for a site whose ids do not share the `-tab-`/`-panel-` shape. |
  | `tooltipIdStem` / `tooltipDataAttr` | string / `data-*` name | `<idStem>-tooltip` / `''` | The description id `<stem>-<id>` and its per-tab hook. |
  | `activePanelOnly` | boolean | `false` | Emit `aria-controls` ONLY on the selected tab. Not cosmetic: a strip rendering one panel at a time otherwise points every unselected tab at an id not in the document, which assistive technology reports as a broken relationship rather than as "not currently shown". |
  | `tabDataAttr` / `badgeDataAttr` / `countDataAttr` / `dotDataAttr` | `data-*` names | see source | The per-button and per-vehicle hooks carrying the tab id; `''` renders none. One per vehicle because the shipped hooks do not share a stem. |
  | `containerClass` / `buttonClass` / `badgeClass` / `danger` | class strings / boolean | the primitive's own family / `false` | The site's existing classes, kept so no shipped rule stops matching — the COUNT and DOT have no such prop, because their classes ARE the drawing — and whether a danger chip also tints its button. |

  Rest spread:
  - `{...rest}` lands on the tablist root, written after `class`, and carries the per-tablist hook.
    The root's class prop is `containerClass`, so `class` is not a prop here.

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
  - The tab stop is `activeTab`, or the first tab when it names none; `aria-selected` stays bound to
    `activeTab`. The hovered tab's description shows, else the focused tab's, and Escape hides it
    until that tab is next hovered or focused — pinned by `tests/components/editor-tabs-capabilities.test.js`.
    A description stays shown while the pointer is over it, and a hover-shown one takes Escape even
    with focus outside the strip, stopping it at the window so the host stays open.
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
    tabDataAttr = 'data-editor-tab-button',
    tooltipIdStem = '',
    tooltipDataAttr = '',
    badgeDataAttr = '',
    countDataAttr = '',
    dotDataAttr = '',
    containerClass = DEFAULT_CLASSES.container,
    buttonClass = DEFAULT_CLASSES.button,
    badgeClass = DEFAULT_CLASSES.badge,
    danger = false,
    ...rest
  } = $props();

  const buttonStem = $derived(buttonIdStem || `${idStem}-tab`);
  const panelStem = $derived(panelIdStem || `${idStem}-panel`);
  const tooltipStem = $derived(tooltipIdStem || `${idStem}-tooltip`);
  const tabStop = $derived(
    tabs.some((tab) => tab.id === activeTab) ? activeTab : (tabs[0]?.id ?? null)
  );
  const describedTabs = $derived(tabs.filter(isDescribed));

  let hoveredTabId = $state(null);
  let focusedTabId = $state(null);
  let dismissedTabId = $state(null);
  const shownTooltipId = $derived.by(() => {
    const candidate = hoveredTabId ?? focusedTabId;
    return candidate === dismissedTabId ? null : candidate;
  });

  const VEHICLES = new Set(['count', 'issue', 'dot']);
  const HOVER_GRACE_MS = 150;
  const TOOLTIP_GAP_PX = 7;

  const buttonNodes = {};
  const tooltipNodes = {};
  let tablistNode = null;
  let hoverClear = null;
  let tooltipPlacement = $state({ id: null, style: undefined });

  $effect(() => {
    const id = shownTooltipId;
    tooltipPlacement = { id, style: id === null ? undefined : placement(id) };
  });
  $effect(() => () => clearTimeout(hoverClear));

  // Capturing at the document runs ahead of Foundry's window-level keybindings.
  $effect(() => {
    const host = tablistNode?.ownerDocument;
    host?.addEventListener('keydown', onDocumentKeydown, true);
    return () => host?.removeEventListener('keydown', onDocumentKeydown, true);
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function optionalText(key = '', fallback = '') {
    return text(key, fallback) || undefined;
  }

  function isDescribed(tab) {
    return Boolean(tab.tooltipKey || tab.tooltip);
  }

  function track(kind, tabId) {
    if (kind === 'hover') {
      clearTimeout(hoverClear);
      hoveredTabId = tabId;
    } else focusedTabId = tabId;
    if (dismissedTabId === tabId) dismissedTabId = null;
  }

  // A pointer leaving a tab or its description keeps it shown for the grace, so it can cross the gap.
  function untrack(kind, tabId) {
    if (kind === 'focus') {
      if (focusedTabId === tabId) focusedTabId = null;
      return;
    }
    clearTimeout(hoverClear);
    hoverClear = setTimeout(() => {
      if (hoveredTabId === tabId) hoveredTabId = null;
    }, HOVER_GRACE_MS);
  }

  // Unmeasurable (no shared positioned ancestor) leaves the sheet's end-aligned fallback in force.
  function placement(tabId) {
    const tabButton = buttonNodes[tabId];
    const tooltip = tooltipNodes[tabId];
    const anchor = tooltip?.offsetParent;
    if (!anchor || tabButton?.offsetParent !== anchor || !anchor.clientWidth) return undefined;
    const left = Math.max(
      0,
      Math.min(tabButton.offsetLeft, anchor.clientWidth - tooltip.offsetWidth)
    );
    const bottom = anchor.clientHeight - tabButton.offsetTop + TOOLTIP_GAP_PX;
    return `left: ${left}px; right: auto; bottom: ${bottom}px;`;
  }

  function onDocumentKeydown(event) {
    if (event.key !== 'Escape' || focusedTabId !== null || shownTooltipId === null) return;
    dismissedTabId = shownTooltipId;
    event.stopPropagation();
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

  function buttonAttributes(tab) {
    if (!tabDataAttr) return {};
    return { [tabDataAttr]: tab.id };
  }

  function markAttributes(tab, mark) {
    if (mark.vehicle === 'count') return countDataAttr ? { [countDataAttr]: tab.id } : {};
    if (mark.vehicle === 'dot') return dotDataAttr ? { [dotDataAttr]: tab.id } : {};
    const attributes = badgeDataAttr
      ? { [badgeDataAttr]: tab.id, 'data-badge-tone': mark.tone }
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

  function tooltipAttributes(tab) {
    return tooltipDataAttr ? { [tooltipDataAttr]: tab.id } : {};
  }

  function activate(event, tabId) {
    const tabButton = event.currentTarget;
    onSelect(tabId);
    tabButton.focus();
  }

  function onKeydown(event, index) {
    if (event.key === 'Escape') {
      if (shownTooltipId !== null) dismissedTabId = shownTooltipId;
      return;
    }
    const nextIndex = targetIndex(event.key, index);
    if (nextIndex < 0) return;
    event.preventDefault();
    onSelect(tabs[nextIndex].id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }
</script>

<div
  bind:this={tablistNode}
  class={`fabricate-tabs ${containerClass}`}
  role="tablist"
  aria-label={text(ariaLabelKey, ariaLabel)}
  {...rest}
>
  {#each tabs as tab, index (tab.id)}
    <button
      type="button"
      role="tab"
      id={`${buttonStem}-${tab.id}`}
      class={`${buttonClass} ${activeTab === tab.id ? 'is-active' : ''} ${isDangerTab(tab) ? 'is-danger' : ''}`}
      aria-selected={activeTab === tab.id}
      aria-controls={activePanelOnly && activeTab !== tab.id ? undefined : `${panelStem}-${tab.id}`}
      aria-label={optionalText(tab.ariaLabelKey, tab.ariaLabel)}
      aria-describedby={isDescribed(tab) ? `${tooltipStem}-${tab.id}` : undefined}
      tabindex={tabStop === tab.id ? 0 : -1}
      data-keyboard-focus="true"
      bind:this={buttonNodes[tab.id]}
      {...buttonAttributes(tab)}
      onclick={(event) => activate(event, tab.id)}
      onkeydown={(event) => onKeydown(event, index)}
      onmouseenter={() => track('hover', tab.id)}
      onmouseleave={() => untrack('hover', tab.id)}
      onfocus={() => track('focus', tab.id)}
      onblur={() => untrack('focus', tab.id)}
    >
      {#if tab.icon}<i class={tab.icon} aria-hidden="true"></i>{/if}
      <span>{text(tab.labelKey, tab.label)}</span>{#if tab.tierGated}<i
          class="fas fa-lock manager-editor-tab-lock"
          aria-hidden="true"
        ></i>{/if}
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
{#each describedTabs as tab (tab.id)}<span
    id={`${tooltipStem}-${tab.id}`}
    class="fabricate-tabs-tooltip"
    class:is-described={shownTooltipId === tab.id}
    style={tooltipPlacement.id === tab.id ? tooltipPlacement.style : undefined}
    role="tooltip"
    bind:this={tooltipNodes[tab.id]}
    onmouseenter={() => track('hover', tab.id)}
    onmouseleave={() => untrack('hover', tab.id)}
    {...tooltipAttributes(tab)}>{text(tab.tooltipKey, tab.tooltip)}</span
  >{/each}

<style>
  .manager-editor-tab-button.is-danger {
    color: var(--fab-danger-text);
  }

  .manager-editor-tab-button.is-danger.is-active {
    border-bottom-color: var(--fab-danger-border);
  }
</style>
