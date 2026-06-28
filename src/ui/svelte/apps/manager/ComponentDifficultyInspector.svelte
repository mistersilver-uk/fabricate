<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { component = null, onSetDifficulty = () => {} } = $props();

  // Local in-flight guard: disables the input while an async commit is
  // outstanding so a fast spinner/blur cannot fire overlapping commits. The
  // sibling source inspector takes no `saving` prop, so the guard lives here.
  let committing = $state(false);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Seed the input from the persisted value; blank means "no difficulty".
  const difficultyValue = $derived(
    component?.difficulty === null || component?.difficulty === undefined
      ? ''
      : component.difficulty
  );

  // Commit on `change` (blur / Enter / spinner), not per keystroke, to avoid a
  // store refresh() per character. Blank / sub-1 / non-integer / invalid clears
  // the value (commits null); a valid value commits the truncated integer.
  async function commitDifficulty(raw) {
    if (!component?.id || committing) return;
    const trimmed = String(raw ?? '').trim();
    const parsed = Number(trimmed);
    const next =
      trimmed === '' || !Number.isFinite(parsed) || parsed < 1 ? null : Math.trunc(parsed);
    committing = true;
    try {
      await onSetDifficulty(component.id, next);
    } finally {
      committing = false;
    }
  }
</script>

<section class="manager-inspector-card" data-component-edit-section="difficulty">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficulty', 'Progressive difficulty')}</h3>
  <label class="manager-field">
    <span>{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyLabel', 'Difficulty value')}</span>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyHint', 'Cost spent against the crafting roll in progressive mode. Whole number, 1 or greater; leave blank to clear.')}</p>
    <input
      type="number"
      min="1"
      step="1"
      class="manager-input"
      value={difficultyValue}
      placeholder={text('FABRICATE.Admin.Manager.Component.NoDifficulty', 'No difficulty')}
      aria-label={text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyLabel', 'Difficulty value')}
      disabled={committing}
      onchange={(event) => commitDifficulty(event.currentTarget.value)}
    />
  </label>
</section>
