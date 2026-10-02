/**
 * The Journal's prepared check prompt carrying additional dice (issue 2008), composed through the
 * real `promptJournalStageCheck` adapter, prompt and Modal host: the GM-described offer
 * reaches the control, the player's bought die is the decision the command sends, and a redacted
 * prompt with no reach never blocks or states a shortfall (R3).
 */
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { flushSync, tick } from 'svelte';

import { promptJournalStageCheck } from '../../src/bootstrap/journalOperations.js';
import { overrideRollPromptSurface } from '../../src/ui/svelte/apps/crafting/rollPrompt.js';
import { openRollPromptModal } from '../../src/ui/svelte/apps/crafting/rollPromptHost.js';
import {
  ROLL_PROMPT_COMPILED_MODULES,
  ROLL_PROMPT_PATH,
  ROLL_PROMPT_RAW_MODULES,
} from '../helpers/rollPromptHarnessModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-journal-check-prompt-',
  componentPath: ROLL_PROMPT_PATH,
  rawModules: ROLL_PROMPT_RAW_MODULES,
  compiledModules: ROLL_PROMPT_COMPILED_MODULES,
  rootClass: 'fabricate fabricate-app',
});

/** What the authority describes for an entitled simple count stage: two d20s, three needed. */
const DESCRIPTOR = Object.freeze({
  subject: 'Inscribe a Runeblade',
  actorName: 'Brenna',
  product: 'count',
  direction: 'under',
  comparison: 'meet',
  pool: 2,
  die: 20,
  threshold: 13,
  required: 3,
  zeroPoolFails: true,
  modifierDestination: 'pool',
  allowAdvantage: false,
  additionalDiceOffer: {
    available: 2,
    limit: 1,
    max: 1,
    resourceLabel: 'Momentum',
    unavailable: null,
    reach: { needed: 3, perDieMost: 1, explode: 'off', rescued: false },
  },
});

/** The same stage redacted for an unentitled initiator: wording keys only, and no reach. */
const REDACTED = Object.freeze({
  product: 'count',
  direction: 'under',
  modifierDestination: 'pool',
  allowAdvantage: false,
  additionalDiceOffer: { ...DESCRIPTOR.additionalDiceOffer, reach: null },
});

/** The prompt the adapter opened: the component is loaded up front, so it mounts in microtasks. */
async function openedPrompt() {
  let dialog = null;
  for (let attempt = 0; attempt < 50 && !dialog; attempt += 1) {
    await tick();
    dialog = document.querySelector('.manager-modal[data-roll-prompt="single"]');
  }
  assert.ok(Boolean(dialog), 'the Journal prompt opened');
  return dialog;
}

/**
 * Open `descriptor` through the Journal's adapter, answering through the real modal; `options` are
 * the ones `settlePromptedCheck` passes a reopened prompt.
 */
async function promptFor(descriptor, options = undefined) {
  document.body.replaceChildren();
  const component = await harness.loadRuneModule(ROLL_PROMPT_PATH);
  const loadComponent = async () => component;
  const restore = overrideRollPromptSurface((view) => openRollPromptModal(view, { loadComponent }));
  const answer = promptJournalStageCheck(descriptor, undefined, options);
  return { dialog: await openedPrompt(), answer, restore };
}

const text = (root, hook) => root.querySelector(`[${hook}]`)?.textContent.trim() ?? null;

describe('the Journal-prepared prompt offers additional dice (issue 2008)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('states why it reopened in a warning notice above the check, and only then', async () => {
    const first = await promptFor(DESCRIPTOR);
    try {
      assert.ok(
        !first.dialog.querySelector('[data-roll-prompt-notice]'),
        'a first prompt has none'
      );
    } finally {
      first.restore();
    }
    const { dialog, restore } = await promptFor(DESCRIPTOR, { changed: true });
    try {
      const notice = dialog.querySelector('[data-roll-prompt-notice]');
      assert.ok(Boolean(notice), 'the reopened prompt states the change');
      assert.ok(notice.classList.contains('fab-notice') && notice.classList.contains('is-warning'));
      assert.equal(notice.getAttribute('role'), 'status');
      assert.match(notice.textContent, /details changed while you were deciding/);
      const body = dialog.querySelector('.fabricate-roll-prompt');
      assert.equal(body.firstElementChild, notice, 'above everything the prompt asks');
    } finally {
      restore();
    }
  });

  it('states the offer, and answers the die the player buys as the decision', async () => {
    const { dialog, answer, restore } = await promptFor(DESCRIPTOR);
    try {
      assert.equal(
        text(dialog, 'data-roll-prompt-additional-dice-resource'),
        'Momentum 2 available'
      );
      assert.ok(dialog.querySelector('[data-roll-prompt-additional-dice-message]'), 'one short');
      const roll = dialog.querySelector('button[data-action="roll"]');
      assert.ok(!roll.hasAttribute('aria-disabled'), 'one bought die reaches, so Roll stays');
      dialog
        .querySelector(':scope [data-roll-prompt-additional-dice-stepper] [data-stepper-increment]')
        .click();
      flushSync();
      assert.equal(dialog.querySelector('input[data-roll-prompt-additional-dice]').value, '1');
      roll.click();
      const decided = await answer;
      assert.equal(decided.confirmed, true);
      assert.equal(decided.additionalDice, 1, 'the bought die rides the decision the GM evaluates');
    } finally {
      restore();
    }
  });

  // The GM read nothing to spend, and a rolled Tool bonus may lift a zero pool.
  it('keeps Roll enabled while a rolled Tool bonus could still lift a zero pool (R1)', async () => {
    const offer = { ...DESCRIPTOR.additionalDiceOffer, available: 0, limit: 0 };
    const zero = { ...DESCRIPTOR, pool: 0, required: 1, additionalDiceOffer: offer };
    const blocked = await promptFor(zero);
    const rollOf = (dialog) => dialog.querySelector('button[data-action="roll"]');
    try {
      assert.equal(rollOf(blocked.dialog).getAttribute('aria-disabled'), 'true', 'control');
    } finally {
      blocked.restore();
    }
    const { dialog, answer, restore } = await promptFor({ ...zero, pendingTools: ['1d4'] });
    try {
      assert.ok(!rollOf(dialog).hasAttribute('aria-disabled'), 'the Tool may lift the pool');
      assert.ok(!dialog.querySelector('[data-roll-prompt-block-note]'), 'nothing blocked');
      rollOf(dialog).click();
      assert.equal((await answer).confirmed, true);
    } finally {
      restore();
    }
  });

  it('never blocks a redacted prompt, nor states what it needs (R3)', async () => {
    const { dialog, answer, restore } = await promptFor(REDACTED);
    try {
      assert.ok(dialog.querySelector('[data-roll-prompt-additional-dice-group]'), 'the control');
      assert.ok(!dialog.querySelector('[data-roll-prompt-required]'), 'no needed count');
      assert.ok(
        !dialog.querySelector('[data-roll-prompt-additional-dice-message]'),
        'no shortfall'
      );
      assert.ok(!dialog.querySelector('[data-roll-prompt-block-note]'), 'nothing blocked');
      const roll = dialog.querySelector('button[data-action="roll"]');
      assert.ok(!roll.hasAttribute('aria-disabled'));
      roll.click();
      assert.deepEqual([(await answer).confirmed, (await answer).additionalDice], [true, 0]);
    } finally {
      restore();
    }
  });
});
