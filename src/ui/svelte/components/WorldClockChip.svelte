<!--
  World time, composed over Chip's clock presentation.

  ONE BASELINE, WHICH THREE SIBLINGS OF THE PILL COULD NOT HAVE. The glyph, the label and the
  value are three type sizes (9.92px, 9px, 10.5px) at `line-height: 1`, so the pill's
  `align-items: center` centred three boxes of three different heights and landed their
  BASELINES apart — measured in Chromium at 1240px: label 183.50, value 184.75, glyph centre
  half a pixel above both. That reads as "the world time text is not vertically centred", and
  no padding fixes it: the three boxes were already centred; their CONTENTS were not aligned
  to each other.

  So the three sit in one baseline-aligned row, and the pill centres that row as a single
  child. The row keeps `display: flex` rather than becoming inline text for the reason the
  pill uses it: a flex container drops whitespace-only text nodes, so `gap` states the 8px
  exactly while the markup's own whitespace still separates the words for anything reading
  the chip's text.
-->
<script>
  import Chip from './Chip.svelte';

  let { label = '', value = '', icon = 'fas fa-clock' } = $props();
</script>

<Chip class="fab-world-clock-chip" tone="info" presentation="clock" data-world-clock>
  <span class="fab-world-clock-line">
    <i class={icon} aria-hidden="true"></i>
    <span class="fab-world-clock-label">{label}</span>
    <span class="fab-world-clock-value">{value}</span>
  </span>
</Chip>

<style>
  .fab-world-clock-line {
    display: flex;
    /* The whole point of this component's geometry — see the header. */
    align-items: baseline;
    gap: var(--fab-space-2);
    white-space: nowrap;
  }

  /* The clock is a MARK beside the words rather than a letter among them, so it centres
     against the row instead of sitting on their baseline. It is also sized rather than left to
     inherit: a Font Awesome glyph's ink is not centred in its em box, and at the chip's
     inherited 0.62rem the circle's ink band measured two pixels above the words'. 11px is
     where the two meet. `Notice.svelte` records the same class of optical correction on its
     own leading glyph. */
  .fab-world-clock-line > i {
    align-self: center;
    color: var(--fab-info-text);
    font-size: 11px;
    line-height: 1;
  }

  .fab-world-clock-label {
    color: var(--fab-info-text);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .fab-world-clock-value {
    color: var(--fab-info-text);
    font-family: var(--fab-font-mono);
    font-size: 10.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
</style>
