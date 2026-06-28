<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  // Controlled, STAGED input: the value lives in the component editor's draft
  // (held by the manager root) and is persisted with the rest of the editor on
  // Save — this card never writes to the store directly. `value` is the staged
  // difficulty (number or null); `onChange` reports edits back to the draft.
  let { value = null, saving = false, onChange = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Blank when unset; otherwise the staged number.
  const inputValue = $derived(value === null || value === undefined ? '' : value);

  // Stage on input so the editor's dirty state and Save button track edits live.
  // Blank / sub-1 / non-integer / invalid stages null (cleared); a valid value
  // stages the truncated integer. Final coercion also happens on Save.
  function handleInput(raw) {
    const trimmed = String(raw ?? '').trim();
    const parsed = Number(trimmed);
    onChange(
      trimmed === '' || !Number.isFinite(parsed) || parsed < 1 ? null : Math.trunc(parsed)
    );
  }
</script>

<section class="manager-inspector-card" data-component-edit-section="difficulty">
  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficulty', 'Progressive difficulty')}</h3>
  <label class="manager-field">
    <span>{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyLabel', 'Difficulty value')}</span>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyHint', 'Cost spent against the crafting roll in progressive mode. Whole number, 1 or greater; leave blank to clear. Saved with the editor.')}</p>
    <input
      type="number"
      min="1"
      step="1"
      class="manager-input"
      value={inputValue}
      placeholder={text('FABRICATE.Admin.Manager.Component.NoDifficulty', 'No difficulty')}
      aria-label={text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyLabel', 'Difficulty value')}
      disabled={saving}
      oninput={(event) => handleInput(event.currentTarget.value)}
    />
  </label>
</section>
