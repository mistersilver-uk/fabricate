<!--
  THE manager's editor tab strip: a `role="tablist"` of buttons, each optionally carrying one or
  more MARKS, with the ARIA tablist keyboard pattern. Nine hand-rolled strips converged here.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `tabs` | `{ id, icon, labelKey, label }[]` | `[]` | In render order. `labelKey` is looked up and `label` is the English fallback, matching the `text()` contract everywhere else. |
  | `activeTab` / `onSelect(tabId)` | string / function | `''` / no-op | The strip holds no state. |
  | `badges` | per tab id: one mark, or an array of them | `{}` | A mark is a plain value, or `{ vehicle, label, tone, name, class, suppressZero }`. `tone` ∈ neutral/success/positive/warning/danger and applies to the CHIP; `name` is the accessible name, REQUIRED by any mark that renders no readable text; `class` is one modifier class appended to `badgeClass` on the chip only; `suppressZero` defaults true, so a mark reading `0` is omitted rather than stated as zero. A tab may carry more than one mark, because a section can be both authored and unready at once. |
  | `ariaLabelKey` / `ariaLabel` | strings | `''` | The strip's own accessible name. |
  | `idStem` | string | `'editor'` | Builds `<stem>-tab-<id>` and `aria-controls="<stem>-panel-<id>"`. |
  | `buttonIdStem` / `panelIdStem` | strings | `''` | Override either half of that pair for a site whose ids do not share the `-tab-`/`-panel-` shape. |
  | `activePanelOnly` | boolean | `false` | Emit `aria-controls` ONLY on the selected tab. Not cosmetic: a strip rendering one panel at a time otherwise points every unselected tab at an id that is not in the document, which assistive technology reports as a broken relationship rather than as "not currently shown". |
  | `hookAttribute` / `containerAttribute` / `badgeAttribute` / `countAttribute` / `dotAttribute` | `data-*` names | see source | The per-button, per-tablist and per-vehicle hooks carrying the tab id; `''` renders none. One per vehicle because the shipped hooks do not share a stem. |
  | `containerClass` / `buttonClass` / `badgeClass` | class strings | the primitive's own family | The site's existing classes, kept so no shipped rule stops matching. The COUNT and DOT have no such prop: their classes ARE the drawing, and a drawing a caller can choose is the style divergence this capability exists to remove. |
  | `danger` | boolean | `false` | Whether a danger chip also tints its button. |

  Invariants:
  - THE DOM CONTRACT IS A PROP, because the converging sites do not share one: the HOOK ATTRIBUTE
    NAME has no common stem and is read by the smoke harness, the View Lab registry and ~25
    mounted assertions; the BUTTON `id` and `aria-controls` STEM has its PANEL ids rendered by the
    caller; and the `aria-label` lang key is per-site. No converted site changes a rendered id,
    `aria-controls`, `data-*` name or badge class.
  - THE MARK FAMILY IS CLOSED, AND WHICH MARK A STRIP DRAWS IS DECIDED BY WHAT IT MEANS.
    `DOMAIN.md`'s Rail Marker Family names four marks that MUST NOT be substituted for one
    another: `count` is a RECORD COUNT, a bare mono numeral; `issue` is an ISSUE SUMMARY, the
    filled toned chip, amber because it asks for attention rather than because anything is wrong;
    `dot` is the filled dot, distinguished by SHAPE as well as colour and therefore REQUIRING a
    text accessible name, so a nameless dot is DROPPED rather than drawn; and the PREMIUM chip is
    scoped by canon to the manager rail and deliberately not offered here. A mark naming no
    vehicle is the ISSUE chip, and an unrecognised name falls back to it.
  - A CALLER NAMES A VEHICLE AND THE PRIMITIVE OWNS THE DRAWING. There is no route by which a call
    site can supply markup, a class or a shape of its own, and A MARK CARRIES NO `icon`: a call
    site passing one IS a call site choosing a shape. The reference draws the tab badge as ONE
    pill in two states — a numeral or a tick CHARACTER in the same box — so the pass mark is the
    issue chip's LABEL rather than a fourth vehicle. `class` is not that route reopened: it
    appends a token to a chip this primitive still draws.
  - `positive` IS `Chip`'s OWN SPELLING of the success family, passed through rather than folded
    into `success`, because two converted callers render `is-positive` today and renaming a
    shipped class would be a markup change wearing a tidy-up's clothes.
  - THE STRIP IS ROOTED AT `fabricate-tabs`, written ahead of whatever `containerClass` carries,
    and every rule the strip's own family owns is anchored there rather than on
    `.fabricate-manager`. A caller's own overrides name the caller's container and are untouched.
-->
<script>
  import { localize } from '../util/foundryBridge.js';
  import Chip from './Chip.svelte';

  /*
    THE FAMILY THIS COMPONENT WRITES, HOISTED OUT OF THE PROP DEFAULTS: the area-scope gate reads a
    component's family out of its MARKUP and out of a frozen class map, and a `$props()` default is
    in neither — so as defaults, eleven of this family's thirteen selectors read CALLER-owned. A
    value a CALLER passes stays the caller's, and its rules stay application-rooted.
  */
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

  // A mark that renders no text is judged on what it DOES render: the dot on its name, everything
  // else on its label. The zero rule is the caller's to state, because the canonical text settles
  // it per surface rather than per vehicle.
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

  // A mark tone name is this component's own vocabulary and `Chip` names the colour families
  // differently, so translate rather than leak one spelling into the other.
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
    // A chip whose whole label is a single character renders no READABLE text, so without the name
    // a screen reader would hear `Validation` for a passing tab and `Validation 3` for a failing
    // one — the difference between the two states being announced and one being silent. It rides
    // the chip rather than the button so the tab's own label stays first.
    const attributes = badgeAttribute
      ? { [badgeAttribute]: tab.id, 'data-badge-tone': mark.tone }
      : {};
    if (mark.name) attributes['aria-label'] = mark.name;
    return attributes;
  }

  function badgeClasses(mark) {
    return [badgeClass, mark.class].filter(Boolean).join(' ');
  }

  // Arrow / Home / End, the four the ARIA tablist pattern asks a horizontal strip for. Home and
  // End are not a nicety on an ordered strip, and a strip that handled the arrows but swallowed
  // nothing else left them doing whatever the browser does inside a button row, which is nothing.
  // Stated once here, so there is no second keyboard vocabulary to get wrong.
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
  /* Authored here rather than on the caller, because the button this rule targets is rendered by
     THIS component — a scoped block left behind on the caller would match nothing and fail the
     unused-selector warning gate. `:global()` on both compounds is REQUIRED and is not a
     loosening: both classes reach the button through a prop and an expression rather than as
     literal attribute text, so the scoped form emits a hash the button never carries and the rule
     is dead at runtime while warning about nothing. Specificity is preserved exactly. */
  :global(.manager-editor-tab-button.is-danger) {
    color: var(--fab-danger-text);
  }

  :global(.manager-editor-tab-button.is-danger.is-active) {
    border-bottom-color: var(--fab-danger-border);
  }
</style>
