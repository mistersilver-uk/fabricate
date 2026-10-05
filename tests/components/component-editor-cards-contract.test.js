/** Every mount of a Component Rules card supplies each prop the card declares (issue 1522). */
import { describe } from 'node:test';

import { defineStructureContract } from '../helpers/structureContract.js';

const MANAGER = 'src/ui/svelte/apps/manager';
const CARDS = `${MANAGER}/component`;
const VIEW = `${MANAGER}/ComponentEditView.svelte`;
const SALVAGE_CARD = `${CARDS}/ComponentSalvageCard.svelte`;
const STAGES = `${CARDS}/ComponentSalvageStages.svelte`;

describe('the component rules editor threads every card prop', () => {
  for (const [host, component] of [
    [VIEW, 'ComponentCategoryTagsCards'],
    [VIEW, 'ComponentEssencesCard'],
    [VIEW, 'ComponentSalvageCard'],
    [VIEW, 'ComponentDifficultyCard'],
    [VIEW, 'ComponentRulesValidationTab'],
    [SALVAGE_CARD, 'ComponentSalvageStages'],
  ]) {
    defineStructureContract(`${host} supplies every prop <${component}> declares`, host, {
      suppliesProps: [{ component, file: `${CARDS}/${component}.svelte`, exempt: [] }],
    });
  }

  // The DC card reaches the stage list as the view's snippet, so the list renders it rather than
  // mounting the card itself.
  defineStructureContract('and the stage list renders the view’s DC card snippet', STAGES, {
    calls: ['difficultyCard'],
    rendersNo: ['ComponentDifficultyCard'],
  });
});
