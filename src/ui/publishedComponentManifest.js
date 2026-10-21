/**
 * The primitives published through `game.fabricate.api.ui`, in publication order: each entry is a
 * frozen `{ name, path, version, props, rest, root, restOn?, overlays? }`, appended and never
 * interleaved, and a breaking change to one bumps its own `version` (issue 2426). A prop is
 * `{ kind, required?, requiredWhen?, element?, args? }`, its kind `'data' | 'text' | 'slot' |
 * 'callback' | 'aria'`:
 * `requiredWhen` names the `data` key while which it is required (issue 2452), a `text` key takes
 * a string, and a `slot` key is filled through `handle.slot`, in a `<div>` unless `element` says
 * `'span'`. `root` is the ancestor the target needs: `'any'`, `'fabricate'` or
 * `'manager'` (issue 2451). A `callback` key takes a function, called with its first `args`
 * arguments, none when unstated (issue 2452). An entry whose rest keys land on a control it draws
 * also states `restOn: 'control'`, which makes M13 refuse `RESERVED_ON_A_CONTROL` among its rest
 * keys; the `describe` result leaves `restOn` out. An `aria` key is an ARIA attribute of its own
 * name on such an entry: the component declares no prop for it, so it lands on that control with
 * the rest keys (issue 2452). `overlays: true` marks an entry that opens an overlay, which the seam
 * hosts by its mount's `overlayHost` chain; absent, it opens none (issue 2454).
 */
export const PUBLISHED_COMPONENT_MANIFEST = Object.freeze([
  Object.freeze({
    name: 'TierTrack',
    path: 'src/ui/svelte/components/TierTrack.svelte',
    version: 1,
    props: Object.freeze({
      tiers: Object.freeze({ kind: 'data', required: true }),
      currentIndex: Object.freeze({ kind: 'data' }),
      direction: Object.freeze({ kind: 'data' }),
      layout: Object.freeze({ kind: 'data' }),
      ariaLabel: Object.freeze({ kind: 'data', required: true }),
      currentLabel: Object.freeze({ kind: 'data', required: true }),
      reachedLabel: Object.freeze({ kind: 'data', required: true }),
      aheadLabel: Object.freeze({ kind: 'data', required: true }),
      hint: Object.freeze({ kind: 'data' }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'Avatar',
    path: 'src/ui/svelte/components/Avatar.svelte',
    version: 1,
    props: Object.freeze({
      art: Object.freeze({ kind: 'data' }),
      name: Object.freeze({ kind: 'data', required: true }),
      alt: Object.freeze({ kind: 'data' }),
      size: Object.freeze({ kind: 'data' }),
      shape: Object.freeze({ kind: 'data' }),
      tint: Object.freeze({ kind: 'data' }),
    }),
    rest: false,
    root: 'any',
  }),
  Object.freeze({
    name: 'Medallion',
    path: 'src/ui/svelte/components/Medallion.svelte',
    version: 1,
    props: Object.freeze({
      art: Object.freeze({ kind: 'data' }),
      icon: Object.freeze({ kind: 'data' }),
      size: Object.freeze({ kind: 'data', required: true }),
      alt: Object.freeze({ kind: 'data' }),
      tint: Object.freeze({ kind: 'data' }),
      glyph: Object.freeze({ kind: 'data' }),
      variant: Object.freeze({ kind: 'data' }),
      tone: Object.freeze({ kind: 'data' }),
      ink: Object.freeze({ kind: 'data' }),
    }),
    rest: false,
    root: 'any',
  }),
  Object.freeze({
    name: 'FillBar',
    path: 'src/ui/svelte/components/FillBar.svelte',
    version: 1,
    props: Object.freeze({
      value: Object.freeze({ kind: 'data' }),
      tone: Object.freeze({ kind: 'data' }),
      color: Object.freeze({ kind: 'data' }),
      density: Object.freeze({ kind: 'data' }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'Meter',
    path: 'src/ui/svelte/components/Meter.svelte',
    version: 1,
    props: Object.freeze({
      value: Object.freeze({ kind: 'data' }),
      max: Object.freeze({ kind: 'data' }),
      segments: Object.freeze({ kind: 'data' }),
      valueText: Object.freeze({ kind: 'data' }),
      label: Object.freeze({ kind: 'data', required: true }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'BandedBar',
    path: 'src/ui/svelte/components/BandedBar.svelte',
    version: 1,
    props: Object.freeze({
      rows: Object.freeze({ kind: 'data', required: true }),
      direction: Object.freeze({ kind: 'data' }),
      density: Object.freeze({ kind: 'data' }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'StatBox',
    path: 'src/ui/svelte/components/StatBox.svelte',
    version: 1,
    props: Object.freeze({
      value: Object.freeze({ kind: 'data', required: true }),
      label: Object.freeze({ kind: 'data', required: true }),
      icon: Object.freeze({ kind: 'data' }),
      tone: Object.freeze({ kind: 'data' }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'InfoStrip',
    path: 'src/ui/svelte/components/InfoStrip.svelte',
    version: 1,
    props: Object.freeze({
      label: Object.freeze({ kind: 'data', required: true }),
      facts: Object.freeze({ kind: 'data', required: true }),
      badge: Object.freeze({ kind: 'data' }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'Kicker',
    path: 'src/ui/svelte/components/Kicker.svelte',
    version: 1,
    props: Object.freeze({
      as: Object.freeze({ kind: 'data' }),
      tone: Object.freeze({ kind: 'data' }),
      children: Object.freeze({ kind: 'text', required: true }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'Chip',
    path: 'src/ui/svelte/components/Chip.svelte',
    version: 1,
    props: Object.freeze({
      tone: Object.freeze({ kind: 'data' }),
      density: Object.freeze({ kind: 'data' }),
      children: Object.freeze({ kind: 'text', required: true }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'Rail',
    path: 'src/ui/svelte/components/Rail.svelte',
    version: 1,
    props: Object.freeze({
      label: Object.freeze({ kind: 'data' }),
      children: Object.freeze({ kind: 'slot' }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'InspectorCard',
    path: 'src/ui/svelte/components/InspectorCard.svelte',
    version: 1,
    props: Object.freeze({
      children: Object.freeze({ kind: 'slot' }),
    }),
    rest: true,
    root: 'fabricate',
  }),
  Object.freeze({
    name: 'EmptyState',
    path: 'src/ui/svelte/components/EmptyState.svelte',
    version: 1,
    props: Object.freeze({
      icon: Object.freeze({ kind: 'data' }),
      title: Object.freeze({ kind: 'data' }),
      hint: Object.freeze({ kind: 'data' }),
      filtered: Object.freeze({ kind: 'data' }),
      children: Object.freeze({ kind: 'slot' }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'Notice',
    path: 'src/ui/svelte/components/Notice.svelte',
    version: 1,
    props: Object.freeze({
      tone: Object.freeze({ kind: 'data' }),
      title: Object.freeze({ kind: 'data', required: true }),
      detail: Object.freeze({ kind: 'data' }),
      icon: Object.freeze({ kind: 'data' }),
      action: Object.freeze({ kind: 'data' }),
      onAction: Object.freeze({ kind: 'callback' }),
      dismissable: Object.freeze({ kind: 'data' }),
      dismissLabel: Object.freeze({ kind: 'data', requiredWhen: 'dismissable' }),
      onDismiss: Object.freeze({ kind: 'callback', requiredWhen: 'dismissable' }),
    }),
    rest: true,
    root: 'any',
  }),
  Object.freeze({
    name: 'Button',
    path: 'src/ui/svelte/components/Button.svelte',
    version: 1,
    props: Object.freeze({
      role: Object.freeze({ kind: 'data' }),
      fullWidth: Object.freeze({ kind: 'data' }),
      disabled: Object.freeze({ kind: 'data' }),
      children: Object.freeze({ kind: 'text', required: true }),
      onclick: Object.freeze({ kind: 'callback', required: true }),
      'aria-expanded': Object.freeze({ kind: 'aria' }),
      'aria-describedby': Object.freeze({ kind: 'aria' }),
    }),
    rest: true,
    root: 'fabricate',
    restOn: 'control',
  }),
  Object.freeze({
    name: 'StatusToggle',
    path: 'src/ui/svelte/components/StatusToggle.svelte',
    version: 1,
    props: Object.freeze({
      on: Object.freeze({ kind: 'data', required: true }),
      ariaLabel: Object.freeze({ kind: 'data', required: true }),
      onclick: Object.freeze({ kind: 'callback', required: true }),
      'aria-labelledby': Object.freeze({ kind: 'aria' }),
      'aria-describedby': Object.freeze({ kind: 'aria' }),
    }),
    rest: true,
    root: 'fabricate',
    restOn: 'control',
  }),
  Object.freeze({
    name: 'Stepper',
    path: 'src/ui/svelte/components/Stepper.svelte',
    version: 1,
    props: Object.freeze({
      value: Object.freeze({ kind: 'data', required: true }),
      min: Object.freeze({ kind: 'data' }),
      max: Object.freeze({ kind: 'data' }),
      step: Object.freeze({ kind: 'data' }),
      ariaLabel: Object.freeze({ kind: 'data', required: true }),
      decrementLabel: Object.freeze({ kind: 'data', required: true }),
      incrementLabel: Object.freeze({ kind: 'data', required: true }),
      onChange: Object.freeze({ kind: 'callback', required: true, args: 1 }),
    }),
    rest: false,
    root: 'fabricate',
  }),
  Object.freeze({
    name: 'SearchField',
    path: 'src/ui/svelte/components/SearchField.svelte',
    version: 1,
    props: Object.freeze({
      value: Object.freeze({ kind: 'value', initial: '' }),
      placeholder: Object.freeze({ kind: 'data' }),
      ariaLabel: Object.freeze({ kind: 'data', required: true }),
    }),
    rest: true,
    root: 'fabricate',
  }),
]);
