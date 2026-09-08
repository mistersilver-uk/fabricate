/**
 * Shared assertions for the player views' not-yet-ready chrome (`apps/PlayerViewState.svelte`).
 *
 * ── WHY THIS IS A HELPER AND NOT FIVE COPIES ──────────────────────────────────────────────────
 * The composition is rendered by five view roots, and each of the five owning suites asserted
 * only that its own `data-<view>-state` hook reached the DOM. That is a hook test, not a
 * treatment test: DELETING the composition's `{:else if branch.kind === 'error'}` arm, so a
 * failed load renders the neutral no-state panel the EMPTY branch draws, left all five suites
 * green — crafting 18, alchemy 6, gathering 30, journal 19, inventory 112 — while removing
 * `aria-busy` from the same file reds all five. The hook was covered and the treatment was not.
 *
 * The five clauses that close it are one clause five times over, so they live here rather than
 * as five near-identical blocks: SonarCloud's duplication gate reads new test code exactly like
 * new source, and a copied assertion block is its usual cause.
 *
 * ── WHAT THE ASSERTION IS ABOUT ───────────────────────────────────────────────────────────────
 * `library.html:1058` routes on meaning: a CALLOUT is documentation that is always true, a
 * NOTICE is state that just happened. A view that failed to load is state, so the error branch
 * draws a danger-toned `Notice` with the live-region role a failure appearing without a focus
 * change needs — and specifically NOT the `EmptyState` panel the empty and no-actor branches
 * draw, which is the confusion that made "Couldn't load your inventory." quieter on the screen
 * than "Select a character".
 */
import assert from 'node:assert/strict';

/**
 * Assert that a view root in its ERROR state draws the danger notice and not the empty panel.
 *
 * @param {Element|null} root The element carrying `data-<view>-state="error"`.
 * @param {object} [options]
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
