/**
 * The primitives published through `game.fabricate.api.ui`, in publication order: each entry is a
 * frozen `{ name, path, version, props, rest, root }`, appended and never interleaved, and a
 * breaking change to one bumps its own `version` (issue 2426). A prop is
 * `{ kind: 'data' | 'text' | 'slot' | 'callback', required?, element?, args? }`: a `text` key
 * takes a string, and a `slot` key is filled through `handle.slot`, in a `<div>` unless `element`
 * says `'span'`. `root` is the ancestor the target needs: `'any'`, `'fabricate'` or `'manager'`
 * (issue 2451). A `callback` key takes a function, called with its first `args` arguments, none
 * when unstated (issue 2452). An entry whose rest keys land on a control it draws also states
 * `restOn: 'control'`, which reserves the rest names M13 refuses there and is not described.
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
    }),
    rest: true,
    root: 'any',
  }),
]);
