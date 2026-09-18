/** Shared assertions for the player views' not-yet-ready chrome (`apps/PlayerViewState.svelte`). */
import assert from 'node:assert/strict';

/**
 * Assert that a view root in its ERROR state draws the danger notice and not the empty panel.
 *
 * @param {Element|null} root The element carrying `data-<view>-state="error"`.
 * @param {string} [options.message] A localized-sentence fragment the notice must render.
 * @param {string} [options.view] The view's name, for assertion messages.
 */
export function assertViewErrorTreatment(root, { message = '', view = 'view' } = {}) {
  assert.ok(Boolean(root), `the ${view}'s error state renders a root`);

  const notice = root.querySelector('[data-notice-tone]');
  assert.ok(
    Boolean(notice),
    `the ${view}'s failed load is drawn as a NOTICE — state, per the library's routing rule — ` +
      'and not as the no-state panel the empty and no-actor branches draw'
  );
  assert.equal(
    notice.getAttribute('data-notice-tone'),
    'danger',
    'at the danger tone, which is what carries the failure in more than colour: the glyph and ' +
      'the title ink move with it'
  );
  assert.equal(
    notice.getAttribute('role'),
    'status',
    'with the live-region ROLE, because a load failure appears without a focus change and the ' +
      'callout this replaced emitted no role at all'
  );
  assert.equal(
    notice.getAttribute('aria-live'),
    'polite',
    'announced politely rather than as an alert: one failed view is not an interruption'
  );
  assert.ok(
    !root.querySelector('.manager-empty'),
    `the ${view}'s error state must NOT draw the empty panel as well — that is the treatment ` +
      'the empty and no-actor branches own, and drawing both says the view is two things'
  );
  if (message) {
    assert.ok(
      root.textContent.includes(message),
      `the ${view}'s error sentence is rendered, so the notice is not an empty box`
    );
  }
}
