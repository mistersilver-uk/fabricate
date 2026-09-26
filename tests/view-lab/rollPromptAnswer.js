/**
 * The lab answers Fabricate's roll prompt — its own modal, not a Foundry `DialogV2` — under the
 * same `dialog=` mode it answers a dialog with: `open` leaves it standing for a screenshot,
 * `enter` submits its form as the Enter key does (Roll), and any other value presses that action.
 */
export const ROLL_PROMPT_SELECTOR = '[data-roll-prompt]';

function press(prompt, answer) {
  if (answer === 'enter') {
    prompt.querySelector('form').requestSubmit();
    return;
  }
  const button = prompt.querySelector(`button[data-action="${answer}"]`);
  if (!button) {
    const offered = [...prompt.querySelectorAll('button[data-action]')].map((b) => b.dataset.action);
    throw new Error(
      `view lab: the roll prompt has no "${answer}" action; it offers: ${offered.join(', ')}`
    );
  }
  button.click();
}

/**
 * Watch the page for roll prompts and answer each one once, as a player would.
 *
 * @param {Document} doc The lab page.
 */
export function createLabRollPromptAnswerer(doc = globalThis.document) {
  let answer = 'enter';
  const answered = new WeakSet();
  // A Node suite installs the shim with no page to watch.
  if (!doc?.body || typeof MutationObserver !== 'function') {
    return { setAnswer: () => {}, openPrompts: () => [] };
  }
  const observer = new MutationObserver(() => {
    if (answer === 'open') return;
    for (const prompt of doc.querySelectorAll(ROLL_PROMPT_SELECTOR)) {
      if (answered.has(prompt)) continue;
      answered.add(prompt);
      press(prompt, answer);
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  return {
    setAnswer(requested) {
      answer = requested;
    },
    openPrompts: () => [...doc.querySelectorAll(ROLL_PROMPT_SELECTOR)],
  };
}
