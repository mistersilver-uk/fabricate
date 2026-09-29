<!-- Svelte 5 runes mode -->
<!--
  A success-counting roll's dice in the Checks Studio simulator: one tile per active face, explosion
  dice included, each with its marks as a glyph and in its accessible name, so colour is never the
  only signal, and the legend under them. The count tiles, legend and hooks moved here from
  CheckOutcomePreview.svelte (issue 2080); the summed roll's first-face tile became the readout's
  medallion, so this draws count faces only. It is the seam #2006 T6 converts.
-->
<script>
  import Medallion from '../../../components/Medallion.svelte';
  import { localize } from '../../../util/foundryBridge.js';

  let {
    /** The count readout's marked faces: `{ index, face, marks, label }`. */
    faces = [],
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const MARK_GLYPHS = {
    qualified: 'fas fa-check',
    cancelled: 'fas fa-xmark',
    exploded: 'fas fa-rotate',
  };
  // A count face is toned by what it did: a cancel reads danger, a success or explosion success.
  function faceTone(marks) {
    if (!marks) return '';
    if (marks.includes('cancelled')) return 'danger';
    return marks.includes('qualified') || marks.includes('exploded') ? 'success' : '';
  }
</script>

<!-- The legend sits under the tiles it explains, as the player's result box draws it. -->
<span class="manager-checks-simulator-dice">
  <span class="manager-checks-simulator-faces">
    {#each faces as tile (tile.index)}
      <!-- One rolled face: the digit is the subject and the medallion its art, so the medallion
           renders no glyph; the face's marks sit under the digit. -->
      <span
        class={`manager-checks-simulator-face is-count is-${faceTone(tile.marks) || 'plain'}`}
        data-checks-simulator-face={tile.index}
        data-checks-simulator-face-marks={tile.marks.join(' ')}
        role="img"
        aria-label={tile.label}
      >
        <Medallion icon="" size={38} tone={faceTone(tile.marks)} />
        <small data-checks-simulator-face-value aria-hidden="true">
          <strong>{tile.face}</strong>
          <span class="manager-checks-simulator-marks">
            {#each tile.marks as mark (mark)}
              <i class={MARK_GLYPHS[mark]} aria-hidden="true"></i>
            {/each}
          </span>
        </small>
      </span>
    {/each}
  </span>
  <span class="manager-muted" data-checks-simulator-legend>
    {text(
      'FABRICATE.Admin.Manager.Checks.Simulator.CountLegend',
      '✓ qualified · ✕ cancelled · ↻ exploded'
    )}
  </span>
</span>

<style>
  .manager-checks-simulator-faces {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  .manager-checks-simulator-dice {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* A mark takes its tile's ink, so the tile's tone is the one colour a face carries. */
  .manager-checks-simulator-face small .manager-checks-simulator-marks {
    display: flex;
    gap: var(--fab-space-2xs);
    color: inherit;
    font-size: 9px;
  }

  .manager-checks-simulator-face {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
  }

  /* The digit is the SUBJECT of this tile, so the medallion renders no competing glyph: an icon
       and a numeral centred on one square overlap into an unreadable blob. */
  .manager-checks-simulator-face small {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    align-items: center;
    justify-content: center;
    font-family: var(--fab-font-mono);
    line-height: 1;
  }

  .manager-checks-simulator-face small strong {
    color: var(--fab-text);
    font-size: 1rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .manager-checks-simulator-face.is-count small {
    color: var(--fab-text-muted);
  }

  .manager-checks-simulator-face.is-success small {
    color: var(--fab-success-text);
  }

  .manager-checks-simulator-face.is-danger small {
    color: var(--fab-danger-text);
  }

  .manager-checks-simulator-face.is-count small strong {
    color: inherit;
    font-size: 14px;
  }
</style>
