<!--
  "This component's Progressive DC" (issue 676). `component.difficulty` is ONE component-level
  scalar three engines read, so the Component Rules editor renders this card in one of two places:
  closing the progressive salvage body, or on its own after the salvage card.

  Callbacks:
  - `onDifficultyChange(value)` — the staged DC, or `null` for blank, sub-1 or invalid input.
-->
<script>
  import Stepper from '../../../components/Stepper.svelte';

  let { text, difficulty = null, saving = false, onDifficultyChange = () => {} } = $props();

  // Blank when unset, else the staged number. Read off the prop: the draft lives in the root.
  const difficultyInputValue = $derived(
    difficulty === null || difficulty === undefined ? '' : difficulty
  );

  // Stage on input so the editor's dirty state and Save button track edits live. Blank, sub-1,
  // non-integer or invalid stages null; a valid value stages the truncated integer.
  function handleDifficultyInput(raw) {
    const trimmed = String(raw ?? '').trim();
    const parsed = Number(trimmed);
    onDifficultyChange(
      trimmed === '' || !Number.isFinite(parsed) || parsed < 1 ? null : Math.trunc(parsed)
    );
  }
</script>

<!-- `data-component-edit-section="difficulty"` is PRESERVED VERBATIM:
 `scripts/foundry-test-run.mjs` fills `[data-component-edit-section="difficulty"] input`
 and that step is not waivable. STAGED, not written on change, so it contributes to the
 dirty state and the exit guard; a SIBLING of `salvage`, never part of `updates.salvage`. -->
<section
  class="manager-component-panel manager-component-inline-panel"
  data-component-edit-section="difficulty"
>
  <div class="manager-task-card-heading">
    <div>
      <!-- Its OWN key: `Component.ProgressiveDifficulty` is a SHORT label shared with
       the browser badge and the evidence row, so it must not carry this sentence. -->
      <h3>
        {text(
          'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyCardTitle',
          'This component’s Progressive DC'
        )}
      </h3>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyHint',
          'Set once here — shown read-only wherever this component appears as a progressive result. Each salvage yield below carries its own DC, edited in its component.'
        )}
      </p>
    </div>
    <!-- `manager-task-card-heading-control` opts this wrapper OUT of the heading's
     `> div { flex: 1 1 200px }` rule, which would otherwise grow it to half the row. -->
    <div class="manager-component-inline-stepper manager-task-card-heading-control">
      <span class="manager-component-micro-label"
        >{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyMicro', 'DC')}</span
      >
      <Stepper
        value={difficultyInputValue === '' ? 0 : difficultyInputValue}
        min={0}
        max={35}
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyLabel',
          'Difficulty value'
        )}
        decrementLabel={text(
          'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyDecrement',
          'Decrease difficulty'
        )}
        incrementLabel={text(
          'FABRICATE.Admin.Manager.Component.ProgressiveDifficultyIncrement',
          'Increase difficulty'
        )}
        disabled={saving}
        inputProps={{ 'data-validation-target': 'component-progressive-dc' }}
        onChange={(next) => handleDifficultyInput(next)}
      />
    </div>
  </div>
</section>
