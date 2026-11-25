/** A step's recorded failure reason as Journal text: the iterative code is localized, never shown. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { craftingFailureReason, stepFailureText } from '../src/ui/presenters/stepFailureText.js';

const localize = (key) => `<${key}>`;

describe('stepFailureText', () => {
  it('localizes the stable iterativeFailure code', () => {
    assert.equal(
      stepFailureText('iterativeFailure', localize),
      '<FABRICATE.Chat.IterativeFailure>'
    );
  });

  it('passes free text through trimmed, and answers null for none', () => {
    assert.equal(stepFailureText('  The check failed. ', localize), 'The check failed.');
    assert.equal(stepFailureText('', localize), null);
    assert.equal(stepFailureText(undefined, localize), null);
  });

  it('words the first failed step of a run', () => {
    const steps = [
      { status: 'succeeded', failureReason: 'stale' },
      { status: 'failed', failureReason: 'iterativeFailure' },
    ];
    assert.equal(craftingFailureReason(steps, localize), '<FABRICATE.Chat.IterativeFailure>');
    assert.equal(craftingFailureReason([{ status: 'succeeded' }], localize), null);
  });
});
