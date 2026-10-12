/**
 * The primitives published through `game.fabricate.api.ui`, in publication order: each entry is
 * `{ name, path, version, props: { <key>: { kind: 'data' | 'text', required? } }, rest }`, frozen.
 * An entry is appended, never interleaved; a breaking change to one bumps its own `version`
 * (issue 2426). A `text` key is a snippet the component draws bare; the caller passes a string.
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
  }),
]);
