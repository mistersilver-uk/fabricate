<!--
  The product's ONE horizontal fill bar: a rounded track with a value-width fill. It is a LEAF and
  renders no caption, percent readout, `role` or `aria-*`, because the accessible semantics differ
  per site and a leaf that guessed would duplicate or invent an announcement.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | 0–100 | `0` | Out-of-range and non-finite input is clamped, so a caller handing it a raw ratio cannot paint a 4000%-wide fill. |
  | `tone` | `'success'` \| `'warning'` \| `'danger'` \| `'info'` \| `'accent'` \| `'neutral'`, or a tag name: `'ember'` \| `'butter'` \| `'peach'` \| `'verdant'` \| `'mist'` \| `'azure'` \| `'lavender'` \| `'rose'` \| `'bone'` \| `'slate'` | `'success'` | A tag name paints the matching `--fab-tag-*` token, so a stack of more than six contributors keeps a hue each. An unknown tone, a token spelling or any other tag key falls back to `neutral` rather than rendering an unpainted fill. |
  | `color` | CSS colour | `''` | A colour the CALLER owns, applied inline and overriding `tone`, for a caller whose colour is authored DATA. A `style=` binding rather than a class, because a scoped `<style>` in the caller cannot reach a child component's element; a source colour literal would fail `tests/components/theme-colour-contract.test.js`, so a caller passes a token reference or runtime data, never a hex. |
  | `shares` | `{ weight, tone?, color? }[]` | `[]` | Two or more draw the fill as abutting shares, left to right in every writing direction, each `weight / Σweight` of it and painted as `tone` and `color`; fewer draw the single fill. A `weight` that is not a finite number above zero reads 0, a numeric string included, and shares that all read 0 draw nothing. A `null` entry reads as `{}`, and a `shares` that is not an array draws the single fill. No share takes a minimum width. Stacked, the track carries no `data-fill-bar-tone` and `tone`/`color` are not read. The published form is `{ weight, tone? }`; a member other than those is private. |
  | `density` / `class` | `'default'` \| `'compact'` \| `'thin'` / class string | `'default'` / `''` | An 8px, 6px or 4px track height, and an extra class appended to the primitive's own. `thin` also drops the track's border and paints it `--fab-bg-3`, so the fill is the whole 4px. |

  Rest spread:
  - `{...rest}` lands on the track root, written after `class`, and carries a caller's `data-*` hook.

  Invariants:
  - NO GRADIENT. `ui-visual-style/spec.md`'s semantic-slider geometry is deliberately NOT claimed:
    this is a value-width fill, never a full-track semantic scale.
  - Its scoped block reads theme-root tokens only, never an area-scoped `--fab-manager-*` property,
    per `openspec/specs/design-system/spec.md`.
-->
<script>
  let {
    value = 0,
    tone = 'success',
    color = '',
    shares = [],
    density = 'default',
    class: extraClass = '',
    ...rest
  } = $props();

  const TAGS = [
    'ember',
    'butter',
    'peach',
    'verdant',
    'mist',
    'azure',
    'lavender',
    'rose',
    'bone',
    'slate',
  ];
  const TONES = ['success', 'warning', 'danger', 'info', 'accent', 'neutral', ...TAGS];

  const pct = $derived.by(() => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return 0;
    return Math.min(100, Math.max(0, numeric));
  });
  const resolvedTone = $derived(TONES.includes(tone) ? tone : 'neutral');

  const parts = $derived((Array.isArray(shares) ? shares : []).map((share) => share ?? {}));
  const stacked = $derived(parts.length > 1);
  const weightOf = ({ weight }) => (Number.isFinite(weight) && weight > 0 ? weight : 0);
  const grows = $derived.by(() => {
    const total = parts.reduce((sum, share) => sum + weightOf(share), 0);
    return parts.map((share) => (total > 0 ? (weightOf(share) / total) * 100 : 0));
  });
  const shareTone = (value = 'success') => (TONES.includes(value) ? value : 'neutral');
</script>

<span
  class={['fab-fill-bar', extraClass]}
  class:is-sm={density === 'compact'}
  class:is-thin={density === 'thin'}
  data-fill-bar-tone={stacked ? undefined : resolvedTone}
  {...rest}
>
  {#if stacked}
    <span class="fab-fill-bar-fill is-stacked" style={`width: ${pct}%;`}>
      {#each parts as share, index (index)}
        <span
          class={`fab-fill-bar-share is-${shareTone(share.tone)}`}
          style={`flex: ${grows[index]} 0 0;${share.color ? ` background: ${share.color};` : ''}`}
        ></span>
      {/each}
    </span>
  {:else}
    <span
      class={`fab-fill-bar-fill is-${resolvedTone}`}
      style={color ? `width: ${pct}%; background: ${color};` : `width: ${pct}%;`}
    ></span>
  {/if}
</span>

<style>
  .fab-fill-bar {
    position: relative;
    display: block;
    box-sizing: border-box;
    flex: 1 1 auto;
    min-width: 0;
    height: 8px;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface-raised);
  }

  .fab-fill-bar.is-sm {
    height: 6px;
  }

  .fab-fill-bar.is-thin {
    height: 4px;
    border: 0;
    background: var(--fab-bg-3);
  }

  .fab-fill-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    border-radius: 999px;
    background: var(--fab-text-subtle);
  }

  .fab-fill-bar-fill.is-stacked {
    display: flex;
    overflow: hidden;
    direction: ltr;
    background: none;
  }

  .fab-fill-bar-fill.is-success,
  .fab-fill-bar-share.is-success {
    background: var(--fab-success);
  }

  .fab-fill-bar-fill.is-warning,
  .fab-fill-bar-share.is-warning {
    background: var(--fab-warning);
  }

  .fab-fill-bar-fill.is-danger,
  .fab-fill-bar-share.is-danger {
    background: var(--fab-danger);
  }

  .fab-fill-bar-fill.is-info,
  .fab-fill-bar-share.is-info {
    background: var(--fab-info);
  }

  .fab-fill-bar-fill.is-accent,
  .fab-fill-bar-share.is-accent {
    background: var(--fab-accent);
  }

  .fab-fill-bar-fill.is-neutral,
  .fab-fill-bar-share.is-neutral {
    background: var(--fab-text-subtle);
  }

  .fab-fill-bar-fill.is-ember,
  .fab-fill-bar-share.is-ember {
    background: var(--fab-tag-ember);
  }

  .fab-fill-bar-fill.is-butter,
  .fab-fill-bar-share.is-butter {
    background: var(--fab-tag-butter);
  }

  .fab-fill-bar-fill.is-peach,
  .fab-fill-bar-share.is-peach {
    background: var(--fab-tag-peach);
  }

  .fab-fill-bar-fill.is-verdant,
  .fab-fill-bar-share.is-verdant {
    background: var(--fab-tag-verdant);
  }

  .fab-fill-bar-fill.is-mist,
  .fab-fill-bar-share.is-mist {
    background: var(--fab-tag-mist);
  }

  .fab-fill-bar-fill.is-azure,
  .fab-fill-bar-share.is-azure {
    background: var(--fab-tag-azure);
  }

  .fab-fill-bar-fill.is-lavender,
  .fab-fill-bar-share.is-lavender {
    background: var(--fab-tag-lavender);
  }

  .fab-fill-bar-fill.is-rose,
  .fab-fill-bar-share.is-rose {
    background: var(--fab-tag-rose);
  }

  .fab-fill-bar-fill.is-bone,
  .fab-fill-bar-share.is-bone {
    background: var(--fab-tag-bone);
  }

  .fab-fill-bar-fill.is-slate,
  .fab-fill-bar-share.is-slate {
    background: var(--fab-tag-slate);
  }
</style>
