/**
 * What a stage card's heading says, and whether it has one at all.
 *
 * A single-step recipe has no step to number: the run header already names the recipe, and the
 * prototype gives such a stage NO step heading — only the step's own description sentence with
 * its state chip. Naming the step there also could not be done honestly, because
 * `CraftingRunManager` persists `Step {n}` as an unnamed step's `stepName` and that string is
 * indistinguishable from an authored one once it is in the run. So a single-step stage shows its
 * description or nothing; a multi-step stage is unchanged.
 */

/**
 * @param {object} options
 * @param {boolean} options.singleStage Whether the run has exactly one stage.
 * @param {object|null} options.stage The viewed StepModel.
 * @param {number} options.index Its zero-based position.
 * @param {(key: string, data?: object) => string} options.localize
 * @returns {string} The heading text, or `''` when the stage has no name of its own.
 */
export function stageHeadingName({ singleStage, stage, index, localize }) {
  const snapshot = stage?.presentationSnapshot;
  if (singleStage) return snapshot?.description || '';
  return (
    snapshot?.name ||
    stage?.stepName ||
    localize('FABRICATE.App.Journal.Stage.Number', { index: index + 1 })
  );
}
